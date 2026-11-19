import { createHmac } from "node:crypto";
import { BufferJSON, initAuthCreds, proto } from "baileys";
import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Credenciais do WhatsApp guardadas no banco (tabela whatsapp_sessoes).
 *
 * Por que não em arquivo: em Railway, Render, Fly e afins o disco é apagado a
 * cada deploy, e o número teria de ler o QR de novo toda vez. No banco, o
 * processo pode reiniciar à vontade que as sessões voltam sozinhas.
 *
 * Fala com o PostgREST da stack (rede interna) como service_role, com um JWT
 * assinado aqui mesmo. A tabela não tem nenhuma policy: só o servidor a enxerga.
 */

const TABELA = "whatsapp_sessoes";
const LOTE_LEITURA = 40;
const LOTE_GRAVACAO = 200;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const q = encodeURIComponent;

/** Lista no formato do filtro `in.(...)`, com aspas para aguentar `:`, `.`, `@`. */
function listaFiltro(valores) {
  const itens = valores.map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `(${itens.join(",")})`;
}

// --- Token de servidor (JWT HS256, 5 min) --------------------------------------
let token = null;
let tokenAte = 0;

function tokenServidor() {
  const agora = Math.floor(Date.now() / 1000);
  if (token && tokenAte - agora > 60) return token;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const conteudo = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "service_role", iat: agora, exp: agora + 300 })}`;
  token = `${conteudo}.${createHmac("sha256", config.jwtSecret).update(conteudo).digest("base64url")}`;
  tokenAte = agora + 300;
  return token;
}

async function rest(caminho, { method = "GET", body, prefer } = {}) {
  const url = `${config.restUrl}/${caminho}`;
  let ultimoErro;

  for (let tentativa = 0; tentativa < 4; tentativa++) {
    try {
      const resposta = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${tokenServidor()}`,
          "Content-Type": "application/json",
          ...(prefer ? { Prefer: prefer } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });

      const texto = await resposta.text();
      if (resposta.ok) return texto ? JSON.parse(texto) : null;

      const erro = new Error(`Banco (PostgREST) ${resposta.status} em ${method} ${caminho.split("?")[0]}: ${texto.slice(0, 300)}`);
      // Erro do pedido (4xx): repetir não resolve. Só 408/429/5xx valem nova tentativa.
      if (resposta.status < 500 && resposta.status !== 408 && resposta.status !== 429) {
        erro.definitivo = true;
        throw erro;
      }
      ultimoErro = erro;
    } catch (e) {
      if (e?.definitivo) throw e;
      ultimoErro = e;
    }

    await esperar(400 * 2 ** tentativa);
  }

  throw ultimoErro;
}

async function ler(sessao, chaves) {
  const resultado = {};

  for (let i = 0; i < chaves.length; i += LOTE_LEITURA) {
    const lote = chaves.slice(i, i + LOTE_LEITURA);
    const linhas = await rest(
      `${TABELA}?select=chave,valor&sessao=eq.${q(sessao)}&chave=in.${q(listaFiltro(lote))}`,
    );
    for (const linha of linhas ?? []) resultado[linha.chave] = linha.valor;
  }

  return resultado;
}

async function gravar(linhas) {
  for (let i = 0; i < linhas.length; i += LOTE_GRAVACAO) {
    await rest(`${TABELA}?on_conflict=sessao,chave`, {
      method: "POST",
      body: linhas.slice(i, i + LOTE_GRAVACAO),
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
}

async function apagar(sessao, chaves) {
  for (let i = 0; i < chaves.length; i += LOTE_LEITURA) {
    const lote = chaves.slice(i, i + LOTE_LEITURA);
    await rest(`${TABELA}?sessao=eq.${q(sessao)}&chave=in.${q(listaFiltro(lote))}`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
  }
}

const serializar = (valor) => JSON.stringify(valor, BufferJSON.replacer);
const desserializar = (texto) => JSON.parse(texto, BufferJSON.reviver);

/**
 * O celular já confirmou o aparelho? `me` sozinho não basta: o Baileys
 * preenche `me` assim que um código de pareamento é PEDIDO, antes de alguém
 * digitá-lo. `account` só existe depois do pareamento de verdade.
 */
export function estaPareada(creds) {
  return Boolean(creds?.me?.id && creds?.account);
}

/**
 * Mesmo contrato do `useMultiFileAuthState` do Baileys, mas no banco.
 *
 * Leituras e gravações de uma sessão passam por uma fila única: com o banco
 * do outro lado da rede, duas gravações da mesma chave poderiam chegar fora de
 * ordem e corromper a criptografia da conversa.
 */
export async function carregarAutenticacao(sessao) {
  let fila = Promise.resolve();
  const exclusivo = (fn) => {
    const resultado = fila.then(fn, fn);
    fila = resultado.catch(() => {});
    return resultado;
  };

  const inicial = await ler(sessao, ["creds"]);
  const salvas = inicial.creds ? desserializar(inicial.creds) : null;
  // Credenciais de um pareamento que não terminou não servem para nada (e as
  // de um código pedido e não digitado até atrapalham): começa limpo.
  const creds = estaPareada(salvas) ? salvas : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: (tipo, ids) =>
          exclusivo(async () => {
            const brutos = await ler(
              sessao,
              ids.map((id) => `${tipo}-${id}`),
            );

            const dados = {};
            for (const id of ids) {
              const bruto = brutos[`${tipo}-${id}`];
              if (!bruto) continue;
              let valor = desserializar(bruto);
              if (tipo === "app-state-sync-key" && valor) {
                valor = proto.Message.AppStateSyncKeyData.fromObject(valor);
              }
              dados[id] = valor;
            }
            return dados;
          }),

        set: (dados) =>
          exclusivo(async () => {
            const novas = [];
            const removidas = [];

            for (const tipo in dados) {
              for (const id in dados[tipo]) {
                const valor = dados[tipo][id];
                const chave = `${tipo}-${id}`;
                if (valor) novas.push({ sessao, chave, valor: serializar(valor) });
                else removidas.push(chave);
              }
            }

            if (novas.length) await gravar(novas);
            if (removidas.length) await apagar(sessao, removidas);
          }),
      },
    },

    salvarCreds: () =>
      exclusivo(() => gravar([{ sessao, chave: "creds", valor: serializar(creds) }])),
  };
}

/** Sessões que já leram o QR (podem reconectar sozinhas) e restos de pareamento abandonado. */
export async function listarSessoes() {
  const linhas = await rest(`${TABELA}?select=sessao,valor&chave=eq.creds`);
  const pareadas = [];
  const abandonadas = [];

  for (const linha of linhas ?? []) {
    try {
      const creds = desserializar(linha.valor);
      (estaPareada(creds) ? pareadas : abandonadas).push(linha.sessao);
    } catch {
      abandonadas.push(linha.sessao);
    }
  }

  return { pareadas, abandonadas };
}

export async function sessaoPareada(sessao) {
  const { creds } = await ler(sessao, ["creds"]);
  if (!creds) return false;
  try {
    return estaPareada(desserializar(creds));
  } catch {
    return false;
  }
}

export async function apagarSessao(sessao) {
  await rest(`${TABELA}?sessao=eq.${q(sessao)}`, { method: "DELETE", prefer: "return=minimal" });
}

/**
 * Mantém a tela do app em dia mesmo quando ninguém está olhando: se o número
 * for desconectado pelo celular, a linha da empresa já fica "desconectado".
 * Falha aqui não pode derrubar a sessão — só registra.
 */
export async function atualizarConexao(instancia, campos) {
  try {
    await rest(`whatsapp_conexoes?instancia=eq.${q(instancia)}`, {
      method: "PATCH",
      body: campos,
      prefer: "return=minimal",
    });
  } catch (err) {
    logger.warn({ err, instancia }, "não consegui atualizar whatsapp_conexoes");
  }
}
