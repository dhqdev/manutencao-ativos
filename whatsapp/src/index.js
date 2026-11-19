import { createHash, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { config, validarConfig } from "./config.js";
import { logger } from "./logger.js";
import { numeroValido } from "./numeros.js";
import {
  ErroHttp,
  conectar,
  desconectar,
  encerrarTodas,
  enviarTexto,
  estado,
  restaurarSessoes,
  resumo,
  verificarNumeros,
} from "./sessoes.js";

/**
 * API HTTP do WhatsApp. Só o app (Vercel) conversa com ela, sempre com
 * `Authorization: Bearer WHATSAPP_API_KEY`.
 *
 *   GET    /saude                        status do processo (sem chave, para health check)
 *   POST   /sessoes/:id/conectar         { telefone? } → QR (ou código de pareamento)
 *   GET    /sessoes/:id                  estado da sessão
 *   DELETE /sessoes/:id                  desconecta e apaga as credenciais
 *   POST   /sessoes/:id/mensagens        { numero, texto, digitando? }
 *   POST   /sessoes/:id/numeros          { numeros: [] } → quais têm WhatsApp
 */

validarConfig();

const LIMITE_CORPO = 256 * 1024;
const ROTA_SESSAO = /^\/sessoes\/([A-Za-z0-9_-]{1,64})(?:\/(conectar|mensagens|numeros))?\/?$/;

/** Compara os hashes: tempo constante e sem vazar o tamanho da chave. */
function autorizado(req) {
  const enviado = createHash("sha256").update(req.headers.authorization ?? "").digest();
  const esperado = createHash("sha256").update(`Bearer ${config.chaveApi}`).digest();
  return timingSafeEqual(enviado, esperado);
}

function responder(res, status, corpo) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(texto),
    "Cache-Control": "no-store",
  });
  res.end(texto);
}

async function lerCorpo(req) {
  let tamanho = 0;
  const partes = [];
  for await (const parte of req) {
    tamanho += parte.length;
    if (tamanho > LIMITE_CORPO) throw new ErroHttp(413, "Corpo da requisição muito grande.");
    partes.push(parte);
  }
  if (!partes.length) return {};
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf8"));
  } catch {
    throw new ErroHttp(400, "JSON inválido.");
  }
}

async function tratar(req, res) {
  const url = new URL(req.url ?? "/", "http://local");
  const metodo = req.method ?? "GET";

  if (url.pathname === "/" || url.pathname === "/saude") {
    return responder(res, 200, { ok: true, ...resumo() });
  }

  if (!autorizado(req)) return responder(res, 401, { erro: "Não autorizado." });

  const rota = url.pathname.match(ROTA_SESSAO);
  if (!rota) return responder(res, 404, { erro: "Rota não encontrada." });

  const [, id, acao] = rota;

  if (!acao && metodo === "GET") return responder(res, 200, await estado(id));

  if (!acao && metodo === "DELETE") {
    await desconectar(id);
    return responder(res, 200, { ok: true });
  }

  if (acao === "conectar" && metodo === "POST") {
    const { telefone } = await lerCorpo(req);
    if (telefone !== undefined && telefone !== null && telefone !== "" && !numeroValido(telefone)) {
      throw new ErroHttp(400, "Telefone inválido. Use DDI + DDD + número, ex.: 5511987654321.");
    }
    return responder(res, 200, await conectar(id, { telefone: telefone || null }));
  }

  if (acao === "mensagens" && metodo === "POST") {
    const { numero, texto, digitando } = await lerCorpo(req);
    if (!numeroValido(numero)) throw new ErroHttp(400, "Número inválido.");
    if (typeof texto !== "string" || !texto.trim()) throw new ErroHttp(400, "Informe o texto.");
    if (texto.length > 60_000) throw new ErroHttp(400, "Texto longo demais para o WhatsApp.");

    const enviada = await enviarTexto(id, numero, texto, {
      ...(typeof digitando === "boolean" ? { digitando } : {}),
    });
    return responder(res, 200, { ok: true, ...enviada });
  }

  if (acao === "numeros" && metodo === "POST") {
    const { numeros } = await lerCorpo(req);
    if (!Array.isArray(numeros) || numeros.length > 50 || !numeros.every(numeroValido)) {
      throw new ErroHttp(400, "Envie de 1 a 50 números válidos.");
    }
    return responder(res, 200, { numeros: await verificarNumeros(id, numeros) });
  }

  return responder(res, 405, { erro: "Método não permitido." });
}

const servidor = http.createServer((req, res) => {
  tratar(req, res).catch((err) => {
    const status = err instanceof ErroHttp ? err.status : 500;
    if (status >= 500) logger.error({ err, url: req.url }, "erro na requisição");
    if (!res.headersSent) {
      responder(res, status, { erro: status >= 500 ? `Falha no servidor de WhatsApp: ${err?.message ?? err}` : err.message });
    } else {
      res.end();
    }
  });
});

servidor.requestTimeout = 120_000;
servidor.headersTimeout = 30_000;

servidor.listen(config.porta, "0.0.0.0", () => {
  logger.info(
    {
      porta: config.porta,
      sempreOnline: config.sempreOnline,
      digitando: config.digitando,
      rejeitarChamadas: config.rejeitarChamadas,
    },
    "servidor de WhatsApp no ar",
  );

  restaurarComInsistencia();
});

/**
 * No boot do servidor (ou num deploy da stack inteira) este serviço pode subir
 * antes do banco e do PostgREST. Em vez de desistir, tenta de novo com espera
 * crescente até conseguir religar as sessões salvas.
 */
function restaurarComInsistencia(tentativa = 1) {
  restaurarSessoes()
    .then((n) => logger.info({ sessoes: n, tentativa }, "restaurando sessões salvas"))
    .catch((err) => {
      const espera = Math.min(60_000, 2000 * 2 ** Math.min(tentativa, 5));
      logger.warn(
        { err, tentativa },
        `banco indisponível ao restaurar sessões; tentando de novo em ${espera / 1000}s (confira POSTGREST_URL, JWT_SECRET e o migrador)`,
      );
      setTimeout(() => restaurarComInsistencia(tentativa + 1), espera);
    });
}

let desligando = false;
async function desligar(sinal) {
  if (desligando) return;
  desligando = true;
  logger.info({ sinal }, "desligando: fechando conexões sem deslogar");
  servidor.close();
  await Promise.race([encerrarTodas(), new Promise((r) => setTimeout(r, 8000))]);
  process.exit(0);
}

process.on("SIGTERM", () => void desligar("SIGTERM"));
process.on("SIGINT", () => void desligar("SIGINT"));

// O Baileys às vezes deixa promessas rejeitadas soltas. Registrar e seguir:
// derrubar o processo desconectaria todas as empresas por causa de uma só.
process.on("unhandledRejection", (err) => logger.error({ err }, "promessa rejeitada sem tratamento"));
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "exceção não tratada; reiniciando o processo");
  process.exit(1);
});
