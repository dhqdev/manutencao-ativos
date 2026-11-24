import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidNewsletter,
  jidDecode,
  makeCacheableSignalKeyStore,
  makeWASocket,
} from "baileys";
import QRCode from "qrcode";
import {
  apagarSessao,
  atualizarConexao,
  carregarAutenticacao,
  estaPareada,
  listarSessoes,
  sessaoPareada,
} from "./armazenamento.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { soDigitos, variantes } from "./numeros.js";

/**
 * Uma sessão por empresa, todas no mesmo processo.
 *
 * IMPORTANTE: rode UM processo só. Dois processos com as mesmas credenciais
 * derrubam um ao outro (o WhatsApp responde "connectionReplaced").
 */

const sessoes = new Map();

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pareamento sem leitura em até 3 minutos é abandonado (o QR para de girar). */
const LIMITE_PAREAMENTO_MS = 3 * 60_000;
const INTERVALO_ONLINE_MS = 4 * 60_000;
const VALIDADE_JID_MS = 12 * 60 * 60_000;

export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

// --- Versão do WhatsApp Web ---------------------------------------------------
// O WhatsApp recusa clientes muito antigos. Buscamos a versão atual (com
// fallback para a embutida no Baileys) e guardamos por algumas horas.
let versao = null;
let versaoEm = 0;

async function versaoWhatsapp() {
  if (versao && Date.now() - versaoEm < 6 * 60 * 60_000) return versao;
  try {
    const r = await Promise.race([fetchLatestBaileysVersion(), esperar(8000).then(() => null)]);
    if (r?.version) {
      versao = r.version;
      versaoEm = Date.now();
    }
  } catch (err) {
    logger.warn({ err }, "não consegui buscar a versão atual do WhatsApp Web; usando a embutida");
  }
  return versao;
}

/** "ABCD1234" → "ABCD-1234", como o celular mostra. */
function formatarCodigo(codigo) {
  const c = String(codigo ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** Tempo de "digitando...": proporcional ao texto, entre 1,2 s e 4,5 s. */
function tempoDigitando(texto) {
  return Math.min(4500, Math.max(1200, String(texto).length * 25));
}

class Sessao {
  constructor(id) {
    this.id = id;
    this.sock = null;
    this.status = "desconectado";
    this.qr = null;
    this.codigoPareamento = null;
    this.telefonePareamento = null;
    this.erro = null;
    this.expirado = false;
    this.numero = null;
    this.nomePerfil = null;

    this.encerrada = false;
    this.tentativas = 0;
    this.inicioPareamento = null;
    this.timerReconexao = null;
    this.timerOnline = null;
    this.iniciando = null;
    /** Credenciais em memória, reaproveitadas entre reconexões (ver abrirSocket). */
    this.auth = null;

    this.filaEnvio = Promise.resolve();
    this.ultimoEnvio = 0;
    this.jids = new Map();
    this.ouvintes = new Set();

    this.log = logger.child({ sessao: id });
    this.logBaileys = logger.child({ sessao: id, modulo: "baileys" }, { level: config.nivelLogBaileys });
  }

  retrato() {
    return {
      status: this.status,
      qr: this.qr,
      codigoPareamento: this.codigoPareamento,
      numero: this.numero,
      nomePerfil: this.nomePerfil,
      expirado: this.expirado,
      erro: this.erro,
    };
  }

  /** Acorda quem está esperando o QR aparecer (POST /conectar). */
  avisar() {
    for (const acordar of this.ouvintes) acordar();
    this.ouvintes.clear();
  }

  aguardarMudanca(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.ouvintes.delete(acordar);
        resolve();
      }, Math.max(ms, 0));
      const acordar = () => {
        clearTimeout(timer);
        resolve();
      };
      this.ouvintes.add(acordar);
    });
  }

  ativa() {
    return Boolean(this.sock || this.timerReconexao || this.iniciando);
  }

  /** Nunca abre dois sockets para a mesma sessão, mesmo com pedidos simultâneos. */
  iniciar() {
    if (!this.iniciando) {
      this.iniciando = this.abrirSocket().finally(() => {
        this.iniciando = null;
      });
    }
    return this.iniciando;
  }

  async abrirSocket() {
    clearTimeout(this.timerReconexao);
    this.timerReconexao = null;
    this.encerrada = false;

    // Carrega do banco só na primeira vez. Nas reconexões usa o objeto em
    // memória: logo depois de ler o QR, o WhatsApp pede para reiniciar (515)
    // antes de a gravação das credenciais novas terminar no banco — reler dali
    // traria as antigas e o pareamento se perderia.
    if (!this.auth) this.auth = await carregarAutenticacao(this.id);
    const { state, salvarCreds } = this.auth;
    const pareada = estaPareada(state.creds);

    if (!pareada && !this.inicioPareamento) this.inicioPareamento = Date.now();
    this.status = "conectando";

    const versaoAtual = await versaoWhatsapp();

    const sock = makeWASocket({
      ...(versaoAtual ? { version: versaoAtual } : {}),
      logger: this.logBaileys,
      browser: [config.nomeAparelho, "Chrome", "22.04.4"],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logBaileys),
      },
      markOnlineOnConnect: config.sempreOnline,
      // Este servidor só envia avisos: não precisa baixar o histórico de
      // conversas (economiza memória, banda e gravações no banco).
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      shouldIgnoreJid: (jid) => Boolean(isJidBroadcast(jid) || isJidNewsletter(jid)),
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 30_000,
      keepAliveIntervalMs: 25_000,
      getMessage: async () => undefined,
    });

    this.sock = sock;

    sock.ev.on("creds.update", () => {
      salvarCreds().catch((err) => this.log.error({ err }, "falha ao salvar credenciais"));
    });

    sock.ev.on("connection.update", (atualizacao) => {
      this.aoAtualizar(sock, atualizacao).catch((err) =>
        this.log.error({ err }, "erro ao tratar mudança de conexão"),
      );
    });

    if (config.rejeitarChamadas) {
      sock.ev.on("call", (chamadas) => {
        for (const chamada of chamadas) {
          if (chamada.status !== "offer") continue;
          sock.rejectCall(chamada.id, chamada.from).catch((err) =>
            this.log.debug({ err }, "não consegui recusar a ligação"),
          );
        }
      });
    }
  }

  async pedirCodigo(sock) {
    if (!this.telefonePareamento || this.codigoPareamento || estaPareada(sock.authState.creds)) return;
    try {
      this.codigoPareamento = formatarCodigo(await sock.requestPairingCode(this.telefonePareamento));
      this.erro = null;
    } catch (err) {
      this.log.warn({ err }, "falha ao gerar código de pareamento");
      this.erro = "Não foi possível gerar o código. Confira o número (com DDD) e tente de novo.";
    }
  }

  async aoAtualizar(sock, { connection, lastDisconnect, qr }) {
    if (sock !== this.sock) return; // evento atrasado de um socket antigo

    if (qr) {
      this.status = "conectando";
      this.expirado = false;
      this.qr = await QRCode.toDataURL(qr, { margin: 1, width: 320, errorCorrectionLevel: "M" });
      await this.pedirCodigo(sock);
      this.avisar();
    }

    if (connection === "open") {
      this.status = "conectado";
      this.qr = null;
      this.codigoPareamento = null;
      this.telefonePareamento = null;
      this.erro = null;
      this.expirado = false;
      this.inicioPareamento = null;
      this.tentativas = 0;

      const eu = sock.user;
      this.numero = jidDecode(eu?.id)?.user ?? null;
      this.nomePerfil = eu?.name ?? eu?.verifiedName ?? eu?.notify ?? null;

      this.log.info({ numero: this.numero }, "WhatsApp conectado");
      this.ligarSempreOnline(sock);
      this.avisar();

      await atualizarConexao(this.id, {
        status: "conectado",
        numero: this.numero,
        ...(this.nomePerfil ? { nome_perfil: this.nomePerfil } : {}),
      });
    }

    if (connection === "close") await this.aoFechar(sock, lastDisconnect);
  }

  async aoFechar(sock, lastDisconnect) {
    this.desligarSempreOnline();
    this.sock = null;
    this.qr = null;
    this.codigoPareamento = null;

    if (this.encerrada) return;

    const codigo = lastDisconnect?.error?.output?.statusCode;
    const pareada = estaPareada(sock.authState.creds);
    this.log.info({ codigo, pareada }, "conexão fechada");

    // Aparelho removido pelo celular, ou número bloqueado: as credenciais não
    // servem mais. Apaga tudo e avisa o app.
    if (codigo === DisconnectReason.loggedOut || codigo === DisconnectReason.forbidden) {
      this.auth = null;
      await this.finalizar("O WhatsApp foi desconectado pelo celular. Leia o QR de novo.");
      await apagarSessao(this.id).catch((err) => this.log.error({ err }, "falha ao apagar sessão"));
      await atualizarConexao(this.id, { status: "desconectado" });
      return;
    }

    // Outro processo abriu esta mesma sessão (deploy sobreposto, réplica a
    // mais). Reconectar aqui faria os dois se derrubarem para sempre.
    if (codigo === DisconnectReason.connectionReplaced) {
      this.log.warn("sessão aberta em outro processo; este não vai reconectar");
      this.auth = null;
      await this.finalizar(null);
      return;
    }

    if (!pareada) {
      // Pareamento incompleto não se aproveita: um código pedido e não digitado
      // deixa `me` preenchido, e reconectar com isso falharia. Recomeça do zero.
      // Sem await: nada pode ficar "no meio do caminho" enquanto o banco
      // responde (um clique em Conectar ali abriria um segundo socket). A
      // leitura já descarta credenciais incompletas, então a ordem não importa.
      this.auth = null;
      apagarSessao(this.id).catch(() => {});

      // QR na tela que ninguém leu: para de gerar código novo.
      const passouDoLimite = Date.now() - (this.inicioPareamento ?? 0) > LIMITE_PAREAMENTO_MS;
      if (codigo === DisconnectReason.timedOut || passouDoLimite) {
        this.expirado = true;
        await this.finalizar(null);
        return;
      }
    }

    // 515 (restartRequired) chega logo depois de ler o QR: reconecta na hora.
    const atraso =
      codigo === DisconnectReason.restartRequired
        ? 0
        : Math.min(60_000, 2000 * 2 ** this.tentativas) + Math.floor(Math.random() * 1000);

    this.status = "conectando";
    this.avisar();
    this.agendarReconexao(atraso);
  }

  agendarReconexao(atraso) {
    clearTimeout(this.timerReconexao);
    this.tentativas++;
    this.timerReconexao = setTimeout(() => {
      this.timerReconexao = null;
      this.iniciar().catch((err) => {
        this.log.error({ err }, "falha ao reconectar");
        this.agendarReconexao(Math.min(60_000, 2000 * 2 ** this.tentativas));
      });
    }, atraso);
  }

  async finalizar(erro) {
    clearTimeout(this.timerReconexao);
    this.timerReconexao = null;
    this.desligarSempreOnline();
    this.status = "desconectado";
    this.qr = null;
    this.codigoPareamento = null;
    this.telefonePareamento = null;
    this.inicioPareamento = null;
    this.erro = erro;
    this.avisar();
  }

  ligarSempreOnline(sock) {
    this.desligarSempreOnline();
    if (!config.sempreOnline) return;

    const marcar = () =>
      sock.sendPresenceUpdate("available").catch((err) =>
        this.log.debug({ err }, "falha ao marcar online"),
      );
    this.timerOnline = setInterval(marcar, INTERVALO_ONLINE_MS);
  }

  desligarSempreOnline() {
    clearInterval(this.timerOnline);
    this.timerOnline = null;
  }

  /** Envios da mesma sessão saem um de cada vez, com uma pausa entre eles. */
  enfileirar(tarefa) {
    const resultado = this.filaEnvio.then(async () => {
      const espera = this.ultimoEnvio + config.intervaloEnvioMs - Date.now();
      if (espera > 0) await esperar(espera);
      try {
        return await tarefa();
      } finally {
        this.ultimoEnvio = Date.now();
      }
    });
    this.filaEnvio = resultado.catch(() => {});
    return resultado;
  }

  /** Descobre o JID real do número (com ou sem o nono dígito). null = não tem WhatsApp. */
  async resolverJid(numero) {
    const digitos = soDigitos(numero);
    const guardado = this.jids.get(digitos);
    if (guardado && Date.now() - guardado.em < VALIDADE_JID_MS) return guardado.jid;

    let jid = null;
    try {
      const resposta = await this.sock.onWhatsApp(...variantes(digitos));
      if (Array.isArray(resposta)) {
        jid = resposta.find((r) => r.exists)?.jid ?? null;
      } else {
        // Consulta sem resposta: não dá para afirmar que não existe. Tenta direto.
        jid = `${digitos}@s.whatsapp.net`;
      }
    } catch (err) {
      this.log.warn({ err }, "falha ao consultar número; tentando envio direto");
      jid = `${digitos}@s.whatsapp.net`;
    }

    if (jid) this.jids.set(digitos, { jid, em: Date.now() });
    return jid;
  }

  async simularDigitacao(jid, texto) {
    const sock = this.sock;
    try {
      if (!config.sempreOnline) await sock.sendPresenceUpdate("available");
      await sock.presenceSubscribe(jid);
      await sock.sendPresenceUpdate("composing", jid);
      await esperar(tempoDigitando(texto));
      await sock.sendPresenceUpdate("paused", jid);
    } catch (err) {
      // "Digitando" é enfeite: se falhar, a mensagem sai do mesmo jeito.
      this.log.debug({ err }, "falha ao mostrar digitando");
    }
  }
}

function exigirConectada(id) {
  const s = sessoes.get(id);
  if (!s || s.status !== "conectado" || !s.sock) {
    throw new ErroHttp(409, "O WhatsApp desta empresa não está conectado.");
  }
  return s;
}

// --- API usada pelo servidor HTTP ---------------------------------------------

/**
 * Abre (ou reaproveita) a sessão e espera até 12 s pelo QR, pelo código de
 * pareamento ou pela conexão já aberta.
 */
export async function conectar(id, { telefone } = {}) {
  let s = sessoes.get(id);
  if (s?.status === "conectado") return s.retrato();

  if (!s) {
    s = new Sessao(id);
    sessoes.set(id, s);
  }

  const digitos = telefone ? soDigitos(telefone) : null;
  if (digitos && s.telefonePareamento !== digitos) {
    s.telefonePareamento = digitos;
    s.codigoPareamento = null;
    s.erro = null;
    if (s.sock && s.qr) await s.pedirCodigo(s.sock);
  }

  if (!s.ativa()) {
    s.expirado = false;
    s.erro = null;
    s.inicioPareamento = null;
    s.tentativas = 0;
    await s.iniciar();
  }

  const limite = Date.now() + 12_000;
  const pronto = () =>
    s.status !== "conectando" ||
    (s.telefonePareamento ? Boolean(s.codigoPareamento || s.erro) : Boolean(s.qr));

  while (!pronto() && Date.now() < limite) await s.aguardarMudanca(limite - Date.now());

  return s.retrato();
}

export async function estado(id) {
  const s = sessoes.get(id);
  if (s) return s.retrato();

  // Não está na memória, mas tem credenciais salvas: sobe a sessão agora.
  if (await sessaoPareada(id)) {
    // Outro pedido pode ter criado a sessão enquanto o banco respondia.
    const criadaNoMeioTempo = sessoes.get(id);
    if (criadaNoMeioTempo) return criadaNoMeioTempo.retrato();

    const nova = new Sessao(id);
    sessoes.set(id, nova);
    nova.iniciar().catch((err) => {
      nova.log.error({ err }, "falha ao restaurar sessão");
      nova.agendarReconexao(5000);
    });
    return nova.retrato();
  }

  return new Sessao(id).retrato();
}

/** Desconecta de verdade: remove o aparelho do celular e apaga as credenciais. */
export async function desconectar(id) {
  const s = sessoes.get(id);
  sessoes.delete(id);

  if (s) {
    s.encerrada = true;
    await s.finalizar(null);
    const sock = s.sock;
    s.sock = null;
    if (sock) {
      try {
        await Promise.race([sock.logout(), esperar(8000)]);
      } catch {
        try {
          await sock.end(undefined);
        } catch {
          // já estava fechado
        }
      }
    }
  }

  await apagarSessao(id);
}

export async function enviarTexto(id, numero, texto, { digitando = config.digitando } = {}) {
  const s = exigirConectada(id);

  return s.enfileirar(async () => {
    if (!s.sock) throw new ErroHttp(409, "O WhatsApp desta empresa não está conectado.");

    const jid = await s.resolverJid(numero);
    if (!jid) throw new ErroHttp(422, `O número ${numero} não tem WhatsApp.`);

    if (digitando) await s.simularDigitacao(jid, texto);

    const enviada = await s.sock.sendMessage(jid, { text: texto });
    return { id: enviada?.key?.id ?? null, jid };
  });
}

/**
 * Envia imagem (com legenda) ou documento PDF. Usado para o comprovante de
 * pagamento da assinatura chegar no WhatsApp do dono do sistema.
 */
export async function enviarArquivo(id, numero, { nome, tipo, conteudo, legenda = "" }) {
  const s = exigirConectada(id);

  return s.enfileirar(async () => {
    if (!s.sock) throw new ErroHttp(409, "O WhatsApp desta empresa não está conectado.");

    const jid = await s.resolverJid(numero);
    if (!jid) throw new ErroHttp(422, `O número ${numero} não tem WhatsApp.`);

    const mensagem = tipo.startsWith("image/")
      ? { image: conteudo, mimetype: tipo, caption: legenda || undefined }
      : { document: conteudo, mimetype: tipo, fileName: nome, caption: legenda || undefined };
    const enviada = await s.sock.sendMessage(jid, mensagem);
    return { id: enviada?.key?.id ?? null, jid };
  });
}

export async function verificarNumeros(id, numeros) {
  const s = exigirConectada(id);
  const resultado = [];
  for (const numero of numeros) {
    const jid = await s.resolverJid(numero);
    resultado.push({ numero, existe: Boolean(jid), jid });
  }
  return resultado;
}

export function resumo() {
  let conectadas = 0;
  for (const s of sessoes.values()) if (s.status === "conectado") conectadas++;
  return { sessoes: sessoes.size, conectadas };
}

/** Na partida: religa todas as sessões que já tinham lido o QR. */
export async function restaurarSessoes() {
  const { pareadas, abandonadas } = await listarSessoes();

  for (const id of abandonadas) {
    await apagarSessao(id).catch((err) => logger.warn({ err, sessao: id }, "falha ao limpar pareamento abandonado"));
  }

  // Escalonado: dezenas de conexões no mesmo segundo chamam atenção do WhatsApp.
  pareadas.forEach((id, i) => {
    setTimeout(() => {
      if (sessoes.has(id)) return;
      const s = new Sessao(id);
      sessoes.set(id, s);
      s.iniciar().catch((err) => {
        s.log.error({ err }, "falha ao restaurar sessão");
        s.agendarReconexao(5000);
      });
    }, i * 1500);
  });

  return pareadas.length;
}

/** Desligamento do processo (deploy): fecha sem deslogar, para voltar sozinho depois. */
export async function encerrarTodas() {
  await Promise.all(
    [...sessoes.values()].map(async (s) => {
      s.encerrada = true;
      clearTimeout(s.timerReconexao);
      s.desligarSempreOnline();
      try {
        await s.sock?.end(undefined);
      } catch {
        // ignorado
      }
    }),
  );
}
