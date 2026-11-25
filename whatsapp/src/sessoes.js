import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  isJidBroadcast,
  isJidNewsletter,
  jidDecode,
  makeCacheableSignalKeyStore,
  makeWASocket,
} from "baileys";
import QRCode from "qrcode";
import {
  aguardarGravacoes,
  apagarSessao,
  atualizarConexao,
  carregarAutenticacao,
  estaPareada,
  guardarMensagem,
  lerMensagem,
  listarSessoes,
  podarMensagens,
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
 *
 * Regra da casa: sessão pareada não fica parada. Só três coisas desligam uma
 * sessão de vez: o celular remover o aparelho (401/403), alguém clicar em
 * Desconectar, ou o processo estar desligando. Todo o resto (queda de rede,
 * WhatsApp reiniciando a conexão, socket travado, banco fora do ar, outra
 * conexão com as mesmas credenciais) volta sozinho — e o vigia confere isso
 * a cada 30 s, para nenhum caso esquecido deixar a empresa sem aviso.
 */

const sessoes = new Map();
let desligando = false;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tempos do serviço. Exportado só para os testes encurtarem. */
export const tempos = {
  /** Pareamento sem leitura é abandonado (o QR para de girar). */
  pareamento: 3 * 60_000,
  /** Renova o "online" (só com WHATSAPP_SEMPRE_ONLINE). */
  online: 4 * 60_000,
  validadeJid: 12 * 60 * 60_000,
  /** Espera antes de reconectar depois de uma queda; dobra a cada tentativa. */
  reconexao: 2_000,
  reconexaoMax: 60_000,
  /** De quanto em quanto tempo o vigia confere as sessões. */
  vigia: 30_000,
  /** Sessão pareada em "conectando" há mais que isso está travada: recomeça. */
  conectandoMax: 3 * 60_000,
  /** Socket fechado por nós que não avisou o fechamento: tratamos como fechado. */
  fechamentoSemAviso: 10_000,
  /** Primeira espera depois de "connectionReplaced"; dobra a cada vez. */
  substituida: 2 * 60_000,
  substituidaMax: 30 * 60_000,
  /** Conexão aberta há esse tempo zera a contagem de "connectionReplaced". */
  estavel: 60 * 60_000,
  /** Prazo total de um envio (o app desiste em 60 s / 90 s) e de cada tentativa. */
  prazoTexto: 55_000,
  prazoArquivo: 85_000,
  tentativaTexto: 40_000,
  tentativaArquivo: 70_000,
  /** Sobra mínima de prazo para valer uma (nova) tentativa de envio. */
  sobraTentativa: 10_000,
  /** Envio que pegou a conexão caindo espera ela voltar até isso. */
  esperaReconexao: 20_000,
  /** Versão do WhatsApp Web: quanto vale a buscada e quanto esperar depois de falhar. */
  versaoValida: 6 * 60 * 60_000,
  versaoFalhou: 10 * 60_000,
  /** Mensagens enviadas ficam guardadas (para reenvio) por estes dias. */
  diasMensagens: 7,
};

const MAX_ENVIADAS_MEMORIA = 300;

export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

// --- Versão do WhatsApp Web ---------------------------------------------------
// O WhatsApp recusa clientes muito antigos (o login falha com 405). Buscamos a
// versão atual — no Baileys e, se ele não responder, no próprio WhatsApp Web —
// e guardamos por algumas horas. Sem nenhuma, vale a última que deu certo (ou
// a embutida no Baileys).
let versao = null;
let versaoEm = 0;
let versaoFalhouEm = 0;
let preferirWeb = false;
let buscandoVersao = null;

async function versaoWhatsapp() {
  if (versao && Date.now() - versaoEm < tempos.versaoValida) return versao;
  if (Date.now() - versaoFalhouEm < tempos.versaoFalhou) return versao;
  buscandoVersao ??= buscarVersao().finally(() => {
    buscandoVersao = null;
  });
  return buscandoVersao;
}

async function buscarVersao() {
  const fontes = preferirWeb
    ? [fetchLatestWaWebVersion, fetchLatestBaileysVersion]
    : [fetchLatestBaileysVersion, fetchLatestWaWebVersion];

  for (const buscar of fontes) {
    try {
      const r = await Promise.race([buscar(), esperar(8000).then(() => null)]);
      // isLatest false = a busca falhou e a função devolveu a versão embutida.
      if (r?.isLatest && Array.isArray(r.version)) {
        versao = r.version;
        versaoEm = Date.now();
        return versao;
      }
    } catch (err) {
      logger.debug({ err }, "falha ao buscar a versão do WhatsApp Web");
    }
  }

  versaoFalhouEm = Date.now();
  logger.warn("não consegui buscar a versão atual do WhatsApp Web; usando a última conhecida");
  return versao;
}

/** Login recusado por versão (405): busca de novo, começando pela outra fonte. */
function versaoRecusada() {
  versaoEm = 0;
  versaoFalhouEm = 0;
  preferirWeb = !preferirWeb;
}

// --- Utilidades ---------------------------------------------------------------

/** "ABCD1234" → "ABCD-1234", como o celular mostra. */
function formatarCodigo(codigo) {
  const c = String(codigo ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** Tempo de "digitando...": proporcional ao texto, entre 1,2 s e 4,5 s. */
function tempoDigitando(texto) {
  return Math.min(4500, Math.max(1200, String(texto).length * 25));
}

/**
 * Cache em memória com validade, no formato que o Baileys aceita
 * (get/set/del/flushAll). Mora na Sessao, não no socket: sobrevive às
 * reconexões.
 */
class CacheSimples {
  constructor(validadeMs, maximo = 2000) {
    this.validadeMs = validadeMs;
    this.maximo = maximo;
    this.itens = new Map();
  }

  get(chave) {
    const item = this.itens.get(chave);
    if (!item) return undefined;
    if (item.ate < Date.now()) {
      this.itens.delete(chave);
      return undefined;
    }
    return item.valor;
  }

  set(chave, valor) {
    this.itens.delete(chave);
    if (this.itens.size >= this.maximo) this.itens.delete(this.itens.keys().next().value);
    this.itens.set(chave, { valor, ate: Date.now() + this.validadeMs });
  }

  del(chave) {
    this.itens.delete(chave);
  }

  flushAll() {
    this.itens.clear();
  }
}

/** Erro de conexão caída ou travada — não um problema da mensagem em si. */
function erroDeConexao(err) {
  if (err?.tempoEsgotado) return true;
  const codigo = err?.output?.statusCode;
  if (
    codigo === DisconnectReason.connectionClosed ||
    codigo === DisconnectReason.connectionLost ||
    codigo === DisconnectReason.restartRequired ||
    codigo === DisconnectReason.unavailableService
  ) {
    return true;
  }
  return /connection (closed|lost|terminated)|timed out/i.test(String(err?.message ?? ""));
}

/** A promessa, mas desistindo em `ms` (o Baileys às vezes nunca responde). */
function comPrazo(promessa, ms) {
  let timer;
  const estouro = new Promise((_, rejeitar) => {
    timer = setTimeout(
      () => rejeitar(Object.assign(new Error("O WhatsApp não respondeu a tempo."), { tempoEsgotado: true })),
      Math.max(ms, 0),
    );
  });
  return Promise.race([promessa, estouro]).finally(() => clearTimeout(timer));
}

/** Fechamento pedido por nós: chega em aoFechar como uma queda comum. */
function erroDeFechamento(motivo) {
  return Object.assign(new Error(motivo), { output: { statusCode: DisconnectReason.connectionClosed } });
}

/** Aparelho removido às vezes chega como "conflict" (440) do tipo device_removed. */
function aparelhoRemovido(erro) {
  return erro?.data?.attrs?.type === "device_removed";
}

// --- Sessão -------------------------------------------------------------------

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
    this.substituicoes = 0;
    this.inicioPareamento = null;
    this.timerReconexao = null;
    this.timerOnline = null;
    this.iniciando = null;
    /** Desde quando está "conectando" (ou desde quando o socket atual existe). */
    this.desde = Date.now();
    this.abertaDesde = 0;
    /** Credenciais em memória, reaproveitadas entre reconexões (ver abrirSocket). */
    this.auth = null;
    /** Estado que não chegou em whatsapp_conexoes; o vigia tenta de novo. */
    this.bancoPendente = null;
    this.limpezaEm = 0;

    this.filaEnvio = Promise.resolve();
    this.ultimoEnvio = 0;
    this.jids = new Map();
    this.ouvintes = new Set();
    /** Mensagens enviadas, para reenviar quando o destinatário pedir. */
    this.enviadas = new CacheSimples(24 * 60 * 60_000, MAX_ENVIADAS_MEMORIA);
    /** Contagem de pedidos de reenvio que nós fizemos (Baileys). */
    this.retentativas = new CacheSimples(60 * 60_000);

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

  /** Acorda quem está esperando uma mudança (QR na tela, envio esperando reconectar). */
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

  pareada() {
    return estaPareada(this.auth?.state.creds);
  }

  /** Nunca abre dois sockets para a mesma sessão, mesmo com pedidos simultâneos. */
  iniciar() {
    if (desligando) return Promise.resolve();
    if (!this.iniciando) {
      // "Conectando" já antes de o banco responder: quem pergunta nesse meio
      // tempo (a rotina diária) não pode ler "desconectado" e marcar a empresa
      // como desconectada.
      this.status = "conectando";
      this.desde = Date.now();
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
    const auth = this.auth;

    const versaoAtual = await versaoWhatsapp();

    // Desconectado (ou o processo desligando) enquanto o banco respondia: não
    // abre nada. Um socket sem dono ficaria conectado e gravando no banco.
    if (this.encerrada || desligando || auth !== this.auth) return;

    if (!estaPareada(auth.state.creds) && !this.inicioPareamento) this.inicioPareamento = Date.now();
    this.status = "conectando";

    // Nunca dois sockets da mesma sessão: o segundo derrubaria o primeiro (440).
    const velho = this.sock;
    this.sock = null;
    if (velho) Promise.resolve().then(() => velho.end(undefined)).catch(() => {});

    const sock = makeWASocket({
      ...(versaoAtual ? { version: versaoAtual } : {}),
      logger: this.logBaileys,
      browser: [config.nomeAparelho, "Chrome", "22.04.4"],
      auth: {
        creds: auth.state.creds,
        keys: makeCacheableSignalKeyStore(auth.state.keys, this.logBaileys),
      },
      markOnlineOnConnect: config.sempreOnline,
      // Histórico completo, não: o servidor só envia avisos. Mas a
      // sincronização inicial (recente) fica ligada, como no padrão do
      // Baileys: é dela que vêm os pares LID ↔ número e os tokens de contato
      // que o WhatsApp exige para entregar. Desligar tudo (como era) faz o
      // próprio Baileys avisar "instabilidade e erros de sessão".
      syncFullHistory: false,
      shouldIgnoreJid: (jid) => Boolean(isJidBroadcast(jid) || isJidNewsletter(jid)),
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 30_000,
      keepAliveIntervalMs: 25_000,
      // Quando o celular de quem recebeu não consegue abrir uma mensagem nossa
      // (trocou de aparelho, conectou o WhatsApp Web, sessão desencontrada),
      // ele pede para reenviar. Sem o conteúdo, a pessoa fica para sempre em
      // "Aguardando mensagem" — o resumo "não chega".
      getMessage: (chave) => this.buscarEnviada(chave),
      // Fora do socket: a contagem sobrevive à reconexão (sem isso, um pedido
      // de reenvio repetido a cada queda vira laço).
      msgRetryCounterCache: this.retentativas,
    });

    this.sock = sock;
    this.desde = Date.now();

    // Falha ao gravar é registrada e repetida pelo próprio armazenamento.
    sock.ev.on("creds.update", () => {
      auth.salvarCreds().catch(() => {});
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
      this.abertaDesde = Date.now();

      const eu = sock.user;
      this.numero = jidDecode(eu?.id)?.user ?? null;
      this.nomePerfil = eu?.name ?? eu?.verifiedName ?? eu?.notify ?? null;

      this.log.info({ numero: this.numero }, "WhatsApp conectado");
      this.ligarSempreOnline(sock);
      this.avisar();

      await this.gravarNoBanco({
        status: "conectado",
        numero: this.numero,
        ...(this.nomePerfil ? { nome_perfil: this.nomePerfil } : {}),
      });
      this.limparMensagensAntigas();
    }

    if (connection === "close") await this.aoFechar(sock, lastDisconnect);
  }

  async aoFechar(sock, lastDisconnect) {
    this.desligarSempreOnline();
    this.sock = null;
    this.qr = null;
    this.codigoPareamento = null;

    if (this.encerrada || desligando) return;

    const erro = lastDisconnect?.error;
    const codigo = erro?.output?.statusCode;
    const pareada = estaPareada(sock.authState?.creds);
    this.log.info({ codigo, motivo: erro?.message, pareada }, "conexão fechada");

    // Aparelho removido pelo celular, ou número bloqueado: as credenciais não
    // servem mais. Apaga tudo e avisa o app.
    if (codigo === DisconnectReason.loggedOut || codigo === DisconnectReason.forbidden || aparelhoRemovido(erro)) {
      const auth = this.auth;
      this.auth = null;
      auth?.descartar();
      await this.finalizar("O WhatsApp foi desconectado pelo celular. Leia o QR de novo.");
      await apagarSessao(this.id).catch((err) => this.log.error({ err }, "falha ao apagar sessão"));
      await this.gravarNoBanco({ status: "desconectado" });
      return;
    }

    // Outra conexão abriu com as mesmas credenciais (deploy sobreposto, réplica
    // a mais, cópia do serviço noutro lugar). Reconectar na hora faria as duas
    // se derrubarem sem parar; desistir de vez deixava a empresa sem WhatsApp
    // depois que a outra sumia. Espera (cada vez mais) e tenta retomar,
    // relendo as credenciais do banco.
    if (codigo === DisconnectReason.connectionReplaced) {
      const espera = Math.min(tempos.substituidaMax, tempos.substituida * 2 ** this.substituicoes);
      this.substituicoes++;
      this.log.warn(
        { esperaS: Math.round(espera / 1000) },
        "sessão aberta em outra conexão (outra cópia do serviço?); tento retomar depois",
      );
      this.auth?.fechar();
      this.auth = null;
      this.status = "conectando";
      this.desde = Date.now();
      this.avisar();
      this.agendarReconexao(espera);
      return;
    }

    if (codigo === 405) versaoRecusada();

    if (!pareada) {
      // Pareamento incompleto não se aproveita: um código pedido e não digitado
      // deixa `me` preenchido, e reconectar com isso falharia. Recomeça do zero.
      // Sem await: a fila por sessão do armazenamento garante que a limpeza
      // acontece antes da leitura da próxima tentativa (e depois de qualquer
      // gravação atrasada deste socket, que o descarte já anulou).
      const auth = this.auth;
      this.auth = null;
      auth?.descartar();
      apagarSessao(this.id).catch(() => {});

      // QR na tela que ninguém leu: para de gerar código novo.
      const passouDoLimite = Date.now() - (this.inicioPareamento ?? 0) > tempos.pareamento;
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
        : Math.min(tempos.reconexaoMax, tempos.reconexao * 2 ** this.tentativas) +
          Math.floor((Math.random() * tempos.reconexao) / 2);

    this.status = "conectando";
    this.desde = Date.now();
    this.avisar();
    this.agendarReconexao(atraso);
  }

  agendarReconexao(atraso) {
    if (desligando || this.encerrada) return;
    clearTimeout(this.timerReconexao);
    this.tentativas++;
    this.timerReconexao = setTimeout(() => {
      this.timerReconexao = null;
      this.iniciar().catch((err) => {
        this.log.error({ err }, "falha ao reconectar");
        this.agendarReconexao(Math.min(tempos.reconexaoMax, tempos.reconexao * 2 ** this.tentativas));
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

  /**
   * Fecha um socket que parece travado (envio sem resposta, websocket morto
   * sem aviso, "conectando" eterno). O fechamento chega em aoFechar como uma
   * queda comum e a sessão reconecta sozinha.
   */
  derrubar(sock, motivo) {
    if (!sock || sock !== this.sock) return;
    this.log.warn({ motivo }, "conexão travada; reconectando");
    this.status = "conectando";
    this.desde = Date.now();
    this.avisar();
    Promise.resolve()
      .then(() => sock.end(erroDeFechamento(motivo)))
      .catch(() => {});

    // Se nem o fechamento avisar (socket já morto por dentro), fecha por nossa conta.
    setTimeout(() => {
      if (this.sock !== sock || this.encerrada) return;
      this.log.warn("o socket não avisou o fechamento; seguindo sem ele");
      this.aoFechar(sock, { error: erroDeFechamento(motivo) }).catch((err) =>
        this.log.error({ err }, "erro ao tratar fechamento"),
      );
    }, tempos.fechamentoSemAviso);
  }

  /**
   * Chamado pelo vigia. Pega os casos em que a sessão ficaria parada sem
   * ninguém perceber — a empresa só descobriria quando o resumo não chegasse.
   */
  conferir() {
    if (this.encerrada || desligando) return;
    const sock = this.sock;

    // "Conectado", mas o websocket já fechou e o aviso se perdeu.
    if (sock && this.status === "conectado" && sock.ws?.isOpen === false) {
      this.derrubar(sock, "websocket fechado sem aviso");
      return;
    }

    // Pareada e presa em "conectando" (login que nunca termina).
    if (sock && this.status === "conectando" && this.pareada() && Date.now() - this.desde > tempos.conectandoMax) {
      this.derrubar(sock, "presa em conectando");
      return;
    }

    // Pareada sem socket e sem reconexão marcada: religa.
    if (this.pareada() && !this.ativa()) {
      this.log.warn("sessão pareada parada, sem reconexão marcada; religando");
      this.agendarReconexao(0);
      return;
    }

    if (this.status === "conectado" && this.substituicoes && Date.now() - this.abertaDesde > tempos.estavel) {
      this.substituicoes = 0;
    }

    if (this.bancoPendente && this.bancoPendente.status === this.status) {
      this.gravarNoBanco(this.bancoPendente).catch(() => {});
    }
  }

  /**
   * Grava o estado em whatsapp_conexoes. A rotina diária só manda resumo para
   * quem está "conectado" lá: se o banco falhar bem nessa hora, o vigia tenta
   * de novo (antes, a empresa podia ficar marcada como desconectada à toa).
   */
  async gravarNoBanco(campos) {
    this.bancoPendente = campos;
    if (await atualizarConexao(this.id, campos)) {
      if (this.bancoPendente === campos) this.bancoPendente = null;
    }
  }

  limparMensagensAntigas() {
    if (Date.now() - this.limpezaEm < 24 * 60 * 60_000) return;
    this.limpezaEm = Date.now();
    podarMensagens(this.id, tempos.diasMensagens).catch((err) =>
      this.log.debug({ err }, "falha ao apagar mensagens antigas"),
    );
  }

  ligarSempreOnline(sock) {
    this.desligarSempreOnline();
    if (!config.sempreOnline) return;

    const marcar = () =>
      sock.sendPresenceUpdate("available").catch((err) =>
        this.log.debug({ err }, "falha ao marcar online"),
      );
    this.timerOnline = setInterval(marcar, tempos.online);
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

  /**
   * Espera a sessão estar conectada num socket diferente de `evitar` (o que
   * acabou de falhar). Devolve o socket. Sem volta prevista (desconectada pelo
   * celular, QR que ninguém leu), nem espera.
   */
  async aguardarConexao(ms, evitar = null) {
    const limite = Date.now() + Math.max(ms, 0);
    for (;;) {
      if (this.status === "conectado" && this.sock && this.sock !== evitar) return this.sock;
      if (this.encerrada || !this.pareada() || !this.ativa() || Date.now() >= limite) {
        throw new ErroHttp(409, "O WhatsApp desta empresa não está conectado.");
      }
      await this.aguardarMudanca(limite - Date.now());
    }
  }

  /**
   * Envia pela fila. Se a conexão cair (ou travar) no meio, derruba o socket,
   * espera reconectar e tenta mais uma vez — dentro do prazo que o app espera.
   * O erro de conexão do Baileys acontece antes de a mensagem sair (socket
   * fechado, consulta sem resposta), então a segunda tentativa não duplica.
   */
  enviar(numero, conteudo, { digitando = false, texto = "", prazoMs, tentativaMs }) {
    const limite = Date.now() + prazoMs;

    return this.enfileirar(async () => {
      let evitar = null;
      for (let tentativa = 1; ; tentativa++) {
        // Fila longa demais: o app já desistiu (ou vai desistir) de esperar.
        if (limite - Date.now() < tempos.sobraTentativa) {
          throw new ErroHttp(503, "O WhatsApp está demorando para responder. Tente de novo em instantes.");
        }

        const sock = await this.aguardarConexao(Math.min(tempos.esperaReconexao, limite - Date.now() - tempos.sobraTentativa), evitar);
        const prazoTentativa = Math.min(tentativaMs, limite - Date.now());
        try {
          return await comPrazo(this.enviarAgora(sock, numero, conteudo, { digitando, texto }), prazoTentativa);
        } catch (err) {
          if (!erroDeConexao(err)) throw err;
          // Estourou só porque o prazo total estava no fim: não prova que a
          // conexão travou, então não derruba nada.
          if (err.tempoEsgotado && prazoTentativa < tentativaMs) {
            throw new ErroHttp(504, "O WhatsApp não respondeu a tempo. Tente de novo em instantes.");
          }
          this.derrubar(sock, `envio falhou: ${err?.message ?? err}`);
          evitar = sock;
          if (tentativa >= 2) {
            throw new ErroHttp(503, "A conexão com o WhatsApp caiu durante o envio. Tente de novo em instantes.");
          }
          this.log.warn({ err }, "envio pegou a conexão caindo; tento de novo depois de reconectar");
        }
      }
    });
  }

  async enviarAgora(sock, numero, conteudo, { digitando, texto }) {
    const jid = await this.resolverJid(sock, numero);
    if (!jid) throw new ErroHttp(422, `O número ${numero} não tem WhatsApp.`);

    if (digitando) await this.simularDigitacao(sock, jid, texto);

    const enviada = await sock.sendMessage(jid, conteudo);

    // Sem "sempre online", sai do online logo depois do envio: enquanto o
    // número parece online num aparelho conectado, o celular dele não toca
    // notificação das mensagens que recebe.
    if (digitando && !config.sempreOnline) {
      sock.sendPresenceUpdate("unavailable").catch((err) => this.log.debug({ err }, "falha ao sair do online"));
    }

    this.guardarEnviada(enviada);
    return { id: enviada?.key?.id ?? null, jid };
  }

  guardarEnviada(enviada) {
    const id = enviada?.key?.id;
    const mensagem = enviada?.message;
    if (!id || !mensagem) return;
    this.enviadas.set(id, mensagem);
    guardarMensagem(this.id, id, mensagem).catch((err) =>
      this.log.warn({ err, id }, "não consegui guardar a mensagem enviada (para reenvio)"),
    );
  }

  /** `getMessage` do Baileys: o conteúdo de uma mensagem nossa que o destinatário pediu de novo. */
  async buscarEnviada(chave) {
    const id = chave?.id;
    if (!id) return undefined;
    const local = this.enviadas.get(id);
    if (local) return local;
    try {
      const doBanco = await lerMensagem(this.id, id);
      if (doBanco) this.log.info({ id }, "reenviando mensagem que o destinatário não conseguiu abrir");
      return doBanco;
    } catch (err) {
      this.log.warn({ err, id }, "não consegui ler a mensagem guardada para reenvio");
      return undefined;
    }
  }

  /** Descobre o JID real do número (com ou sem o nono dígito). null = não tem WhatsApp. */
  async resolverJid(sock, numero) {
    const digitos = soDigitos(numero);
    const guardado = this.jids.get(digitos);
    if (guardado && Date.now() - guardado.em < tempos.validadeJid) return guardado.jid;

    let jid = null;
    try {
      const resposta = await sock.onWhatsApp(...variantes(digitos));
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

  async simularDigitacao(sock, jid, texto) {
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

// --- Vigia ----------------------------------------------------------------------
let timerVigia = null;

function ligarVigia() {
  if (timerVigia || desligando) return;
  timerVigia = setInterval(() => {
    for (const s of sessoes.values()) {
      try {
        s.conferir();
      } catch (err) {
        s.log.warn({ err }, "falha ao conferir a sessão");
      }
    }
  }, tempos.vigia);
  timerVigia.unref?.();
}

function novaSessao(id) {
  const s = new Sessao(id);
  sessoes.set(id, s);
  ligarVigia();
  return s;
}

/**
 * Sessão que pode enviar agora — ou daqui a pouco: "conectando" com volta
 * prevista (queda de rede, WhatsApp reiniciando) espera alguns segundos em
 * vez de recusar de cara.
 */
function sessaoParaEnvio(id) {
  const s = sessoes.get(id);
  if (s && !s.encerrada && (s.status === "conectado" || (s.pareada() && s.ativa()))) return s;
  throw new ErroHttp(409, "O WhatsApp desta empresa não está conectado.");
}

// --- API usada pelo servidor HTTP ---------------------------------------------

/**
 * Abre (ou reaproveita) a sessão e espera até 12 s pelo QR, pelo código de
 * pareamento ou pela conexão já aberta.
 */
export async function conectar(id, { telefone } = {}) {
  let s = sessoes.get(id);
  if (s?.status === "conectado") return s.retrato();

  if (!s) s = novaSessao(id);

  const digitos = telefone ? soDigitos(telefone) : null;
  if (digitos && s.telefonePareamento !== digitos) {
    s.telefonePareamento = digitos;
    s.codigoPareamento = null;
    s.erro = null;
    if (s.sock && s.qr) await s.pedirCodigo(s.sock);
  }

  // Esperando a hora de reconectar (depois de uma queda ou de outra conexão
  // tomar o lugar): quem clicou em Conectar quer agora.
  const esperandoReconexao = Boolean(s.timerReconexao && !s.sock && !s.iniciando);
  if (!s.ativa() || esperandoReconexao) {
    const eraPareada = esperandoReconexao || s.pareada();
    clearTimeout(s.timerReconexao);
    s.timerReconexao = null;
    s.expirado = false;
    s.erro = null;
    s.inicioPareamento = null;
    s.tentativas = 0;
    s.substituicoes = 0;
    try {
      await s.iniciar();
    } catch (err) {
      // Banco fora do ar: sessão que já existia continua tentando sozinha;
      // pareamento novo volta para "desconectado" (a tela mostra o erro).
      if (eraPareada) s.agendarReconexao(5000);
      else s.status = "desconectado";
      throw err;
    }
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

    const nova = novaSessao(id);
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
    // Gravação atrasada do socket velho não pode recriar o que vai ser apagado.
    s.auth?.descartar();
    s.auth = null;
  }

  await apagarSessao(id);
}

export async function enviarTexto(id, numero, texto, { digitando = config.digitando } = {}) {
  const s = sessaoParaEnvio(id);
  return s.enviar(numero, { text: texto }, {
    digitando,
    texto,
    prazoMs: tempos.prazoTexto,
    tentativaMs: tempos.tentativaTexto,
  });
}

/**
 * Envia imagem (com legenda) ou documento PDF. Usado para o comprovante de
 * pagamento da assinatura chegar no WhatsApp do dono do sistema.
 */
export async function enviarArquivo(id, numero, { nome, tipo, conteudo, legenda = "" }) {
  const s = sessaoParaEnvio(id);
  const mensagem = tipo.startsWith("image/")
    ? { image: conteudo, mimetype: tipo, caption: legenda || undefined }
    : { document: conteudo, mimetype: tipo, fileName: nome, caption: legenda || undefined };
  return s.enviar(numero, mensagem, {
    prazoMs: tempos.prazoArquivo,
    tentativaMs: tempos.tentativaArquivo,
  });
}

export async function verificarNumeros(id, numeros) {
  const s = sessaoParaEnvio(id);
  const sock = await s.aguardarConexao(tempos.esperaReconexao);
  const resultado = [];
  for (const numero of numeros) {
    const jid = await s.resolverJid(sock, numero);
    resultado.push({ numero, existe: Boolean(jid), jid });
  }
  return resultado;
}

export function resumo() {
  let conectadas = 0;
  let conectando = 0;
  for (const s of sessoes.values()) {
    if (s.status === "conectado") conectadas++;
    else if (s.status === "conectando") conectando++;
  }
  return { sessoes: sessoes.size, conectadas, conectando };
}

/** Na partida: religa todas as sessões que já tinham lido o QR. */
export async function restaurarSessoes() {
  ligarVigia();
  const { pareadas, abandonadas } = await listarSessoes();

  for (const id of abandonadas) {
    // Pareamento acontecendo agora (QR na tela) também aparece aqui: não mexe.
    if (sessoes.has(id)) continue;
    await apagarSessao(id).catch((err) => logger.warn({ err, sessao: id }, "falha ao limpar pareamento abandonado"));
  }

  // Escalonado: dezenas de conexões no mesmo segundo chamam atenção do WhatsApp.
  pareadas.forEach((id, i) => {
    setTimeout(() => {
      if (desligando || sessoes.has(id)) return;
      const s = novaSessao(id);
      s.iniciar().catch((err) => {
        s.log.error({ err }, "falha ao restaurar sessão");
        s.agendarReconexao(5000);
      });
    }, i * 1500);
  });

  return pareadas.length;
}

/**
 * Desligamento do processo (deploy): fecha sem deslogar, para voltar sozinho
 * depois, e deixa terminar as gravações que já estavam na fila (chave de
 * criptografia perdida aqui quebraria a conversa depois do reinício).
 */
export async function encerrarTodas() {
  desligando = true;
  clearInterval(timerVigia);
  timerVigia = null;

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

  await aguardarGravacoes(5000);
}
