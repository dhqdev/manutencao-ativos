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
 * Fala com o PostgREST da stack (rede interna) com o papel whatsapp_servico,
 * que só enxerga whatsapp_sessoes e whatsapp_conexoes. O token vem do app
 * (POST /api/whatsapp/token com a WHATSAPP_API_KEY); o JWT_SECRET não fica aqui.
 *
 * Além das credenciais ("creds") e das chaves de criptografia ("<tipo>-<id>"),
 * a tabela guarda as mensagens enviadas nos últimos dias ("msg-<id>"): quando
 * o celular de quem recebeu não consegue abrir uma mensagem, ele pede para
 * reenviar, e sem o conteúdo guardado a pessoa fica para sempre em
 * "Aguardando mensagem" (ver `buscarEnviada` em sessoes.js).
 */

const TABELA = "whatsapp_sessoes";
const LOTE_LEITURA = 40;
const LOTE_GRAVACAO = 200;
const PREFIXO_MENSAGEM = "msg-";

/**
 * Leitura desiste rápido (quem pediu está esperando). Gravação insiste: chave
 * de criptografia que não chega ao banco volta velha no próximo reinício e
 * corrompe a conversa — vale esperar o banco ou o app voltarem de um restart.
 */
const TENTATIVAS_LEITURA = 4;
const TENTATIVAS_GRAVACAO = 8;

/** Esperas do acesso ao banco. Exportado só para os testes encurtarem. */
export const temposBanco = {
  /** Primeira espera entre tentativas; dobra a cada uma, até `esperaMax`. */
  esperaBase: 400,
  esperaMax: 5_000,
  /** Credenciais que não gravaram: nova tentativa sozinha, dobrando até o teto. */
  credsDeNovo: 5_000,
  credsDeNovoMax: 60_000,
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const q = encodeURIComponent;

/** Lista no formato do filtro `in.(...)`, com aspas para aguentar `:`, `.`, `@`. */
function listaFiltro(valores) {
  const itens = valores.map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `(${itens.join(",")})`;
}

// --- Token do banco (papel whatsapp_servico, 5 min, emitido pelo app) ------------
let token = null;
let tokenAte = 0;

async function tokenServidor() {
  const agora = Math.floor(Date.now() / 1000);
  if (token && tokenAte - agora > 60) return token;
  try {
    const resposta = await fetch(`${config.appUrl}/api/whatsapp/token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.chaveApi}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resposta.ok) {
      throw new Error(`App recusou o token do banco (${resposta.status}): confira APP_URL e WHATSAPP_API_KEY.`);
    }
    const dados = await resposta.json();
    token = dados.token;
    tokenAte = agora + Number(dados.validade ?? 300);
    return token;
  } catch (err) {
    if (!config.jwtSecretLegado) throw err;
    logger.warn({ err }, "app não deu o token do banco; usando o JWT_SECRET legado (tire-o da stack)");
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const conteudo = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "whatsapp_servico", iat: agora, exp: agora + 300 })}`;
    token = `${conteudo}.${createHmac("sha256", config.jwtSecretLegado).update(conteudo).digest("base64url")}`;
    tokenAte = agora + 300;
    return token;
  }
}

async function rest(caminho, { method = "GET", body, prefer, tentativas = TENTATIVAS_LEITURA } = {}) {
  const url = `${config.restUrl}/${caminho}`;
  let ultimoErro;
  let tokenRenovado = false;

  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    try {
      const resposta = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${await tokenServidor()}`,
          "Content-Type": "application/json",
          ...(prefer ? { Prefer: prefer } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });

      const texto = await resposta.text();
      if (resposta.ok) return texto ? JSON.parse(texto) : null;

      // Token recusado com minutos de validade pela frente (JWT_SECRET trocado
      // na stack, PostgREST reiniciado com outra chave): sem isto, toda
      // gravação até ele vencer se perdia. Pede outro ao app, uma vez, na hora.
      if (resposta.status === 401 && !tokenRenovado) {
        tokenRenovado = true;
        token = null;
        tentativa--;
        continue;
      }

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

    if (tentativa < tentativas - 1) {
      await esperar(Math.min(temposBanco.esperaMax, temposBanco.esperaBase * 2 ** tentativa));
    }
  }

  throw ultimoErro;
}

// --- Fila por sessão ---------------------------------------------------------------
/**
 * Tudo que lê ou grava uma sessão passa por aqui, um de cada vez e na ordem.
 * A fila é do módulo (não de cada objeto de credenciais) por dois motivos:
 * duas gravações da mesma chave chegando fora de ordem corrompem a
 * criptografia da conversa; e a limpeza de um aparelho removido não pode ser
 * atropelada por uma gravação atrasada do socket velho, nem apagar o que um
 * pareamento novo acabou de gravar.
 */
const filas = new Map();

function naFila(sessao, tarefa) {
  const anterior = filas.get(sessao) ?? Promise.resolve();
  const resultado = anterior.then(tarefa);
  const fim = resultado.then(
    () => {},
    () => {},
  );
  filas.set(sessao, fim);
  fim.then(() => {
    if (filas.get(sessao) === fim) filas.delete(sessao);
  });
  return resultado;
}

/** Desligamento: espera as gravações que já estão na fila (até `ms`). */
export async function aguardarGravacoes(ms) {
  let timer;
  await Promise.race([
    Promise.all([...filas.values()]),
    new Promise((r) => {
      timer = setTimeout(r, ms);
    }),
  ]);
  clearTimeout(timer);
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
      tentativas: TENTATIVAS_GRAVACAO,
    });
  }
}

async function apagar(sessao, chaves) {
  for (let i = 0; i < chaves.length; i += LOTE_LEITURA) {
    const lote = chaves.slice(i, i + LOTE_LEITURA);
    await rest(`${TABELA}?sessao=eq.${q(sessao)}&chave=in.${q(listaFiltro(lote))}`, {
      method: "DELETE",
      prefer: "return=minimal",
      tentativas: TENTATIVAS_GRAVACAO,
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
 * Mesmo contrato do `useMultiFileAuthState` do Baileys, mas no banco, mais:
 *
 * - `fechar()`: o socket deste objeto morreu e outro objeto vai reler o
 *   banco. Nada novo entra na fila; o que já estava nela grava normalmente.
 * - `descartar()`: as credenciais vão ser apagadas (aparelho removido,
 *   pareamento abandonado). Nem o que já está na fila grava mais.
 */
export async function carregarAutenticacao(sessao) {
  const inicial = await naFila(sessao, () => ler(sessao, ["creds"]));
  const salvas = inicial.creds ? desserializar(inicial.creds) : null;
  // Credenciais de um pareamento que não terminou não servem para nada (e as
  // de um código pedido e não digitado até atrapalham): começa limpo.
  const creds = estaPareada(salvas) ? salvas : initAuthCreds();

  let fechada = false;
  let descartada = false;
  let credsNaFila = null;
  let credsSujas = false;
  let timerCreds = null;
  let esperaCreds = temposBanco.credsDeNovo;

  /**
   * Grava as credenciais atuais. Várias atualizações seguidas viram uma
   * gravação só (ela serializa o objeto na hora em que sai da fila). Se o
   * banco não aceitar, tenta de novo sozinho até conseguir: credenciais
   * velhas no banco fazem o número voltar quebrado no próximo reinício.
   */
  function salvarCreds() {
    if (descartada) return Promise.resolve();
    if (credsNaFila) return credsNaFila;
    clearTimeout(timerCreds);
    timerCreds = null;

    const gravacao = naFila(sessao, async () => {
      credsNaFila = null; // daqui em diante, atualização nova pede outra gravação
      if (descartada) return;
      await gravar([{ sessao, chave: "creds", valor: serializar(creds) }]);
      credsSujas = false;
      esperaCreds = temposBanco.credsDeNovo;
    });
    credsNaFila = gravacao;

    gravacao.catch((err) => {
      credsSujas = true;
      if (descartada || fechada || timerCreds) return;
      logger.warn({ err, sessao, emMs: esperaCreds }, "credenciais não gravaram no banco; tento de novo sozinho");
      timerCreds = setTimeout(() => {
        timerCreds = null;
        salvarCreds().catch(() => {});
      }, esperaCreds);
      esperaCreds = Math.min(temposBanco.credsDeNovoMax, esperaCreds * 2);
    });
    return gravacao;
  }

  return {
    state: {
      creds,
      keys: {
        get: (tipo, ids) =>
          naFila(sessao, async () => {
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

        set: (dados) => {
          if (fechada || descartada) return Promise.resolve();
          return naFila(sessao, async () => {
            if (descartada) return;
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
          });
        },
      },
    },

    salvarCreds: () => (fechada ? Promise.resolve() : salvarCreds()),

    fechar() {
      if (fechada || descartada) return;
      clearTimeout(timerCreds);
      timerCreds = null;
      // Última chance para credenciais que ainda não chegaram ao banco: entra
      // na fila antes da releitura do objeto novo.
      if (credsSujas) salvarCreds().catch(() => {});
      fechada = true;
    },

    descartar() {
      fechada = true;
      descartada = true;
      clearTimeout(timerCreds);
      timerCreds = null;
    },
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
  await naFila(sessao, () =>
    rest(`${TABELA}?sessao=eq.${q(sessao)}`, {
      method: "DELETE",
      prefer: "return=minimal",
      tentativas: TENTATIVAS_GRAVACAO,
    }),
  );
}

// --- Mensagens enviadas (para reenviar quando o destinatário pedir) -----------------

/** Guarda o conteúdo (protobuf) de uma mensagem enviada. */
export async function guardarMensagem(sessao, id, mensagem) {
  const valor = JSON.stringify({
    em: Date.now(),
    dados: Buffer.from(proto.Message.encode(mensagem).finish()).toString("base64"),
  });
  return naFila(sessao, () => gravar([{ sessao, chave: `${PREFIXO_MENSAGEM}${id}`, valor }]));
}

export async function lerMensagem(sessao, id) {
  const chave = `${PREFIXO_MENSAGEM}${id}`;
  const { [chave]: bruto } = await ler(sessao, [chave]);
  if (!bruto) return undefined;
  try {
    return proto.Message.decode(Buffer.from(JSON.parse(bruto).dados, "base64"));
  } catch {
    return undefined;
  }
}

/** Apaga as mensagens guardadas há mais de `dias`. Devolve quantas saíram. */
export async function podarMensagens(sessao, dias) {
  const linhas = await rest(
    `${TABELA}?select=chave,valor&sessao=eq.${q(sessao)}&chave=like.${q(`${PREFIXO_MENSAGEM}*`)}`,
  );
  const limite = Date.now() - dias * 24 * 60 * 60_000;
  const velhas = [];
  for (const linha of linhas ?? []) {
    let em = 0;
    try {
      em = Number(JSON.parse(linha.valor).em) || 0;
    } catch {
      // valor estranho: sai junto
    }
    if (em < limite) velhas.push(linha.chave);
  }
  if (velhas.length) await naFila(sessao, () => apagar(sessao, velhas));
  return velhas.length;
}

/**
 * Mantém a tela do app em dia mesmo quando ninguém está olhando: se o número
 * for desconectado pelo celular, a linha da empresa já fica "desconectado".
 * Falha aqui não pode derrubar a sessão — só registra e devolve false (quem
 * chamou tenta de novo depois).
 */
export async function atualizarConexao(instancia, campos) {
  try {
    await rest(`whatsapp_conexoes?instancia=eq.${q(instancia)}`, {
      method: "PATCH",
      body: campos,
      prefer: "return=minimal",
    });
    return true;
  } catch (err) {
    logger.warn({ err, instancia }, "não consegui atualizar whatsapp_conexoes");
    return false;
  }
}
