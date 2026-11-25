import { EventEmitter } from "node:events";
export const DisconnectReason = { connectionClosed: 428, connectionLost: 408, connectionReplaced: 440, timedOut: 408, loggedOut: 401, badSession: 500, restartRequired: 515, multideviceMismatch: 411, forbidden: 403, unavailableService: 503 };
export const BufferJSON = {
  replacer: (k, v) => (Buffer.isBuffer(v) || v instanceof Uint8Array || v?.type === "Buffer") ? { type: "Buffer", data: Buffer.from(v?.data || v).toString("base64") } : v,
  reviver: (_, v) => (typeof v === "object" && v && v.type === "Buffer" && typeof v.data === "string") ? Buffer.from(v.data, "base64") : v,
};
export const initAuthCreds = () => ({ noiseKey: Buffer.from("ruido"), registered: false });
// "protobuf" falso: JSON. Basta para conferir que a mensagem guardada volta igual.
export const proto = {
  Message: {
    AppStateSyncKeyData: { fromObject: (x) => x },
    encode: (m) => ({ finish: () => Buffer.from(JSON.stringify(m)) }),
    decode: (b) => JSON.parse(Buffer.from(b).toString()),
  },
};
export const fetchLatestBaileysVersion = async () => ({ version: [2, 3000, 1], isLatest: true });
export const fetchLatestWaWebVersion = async () => ({ version: [2, 3000, 2], isLatest: true });
export const isJidBroadcast = (j) => j?.endsWith("@broadcast");
export const isJidNewsletter = (j) => j?.endsWith("@newsletter");
export const jidDecode = (j) => { if (!j) return undefined; const [u, s] = j.split("@"); return { user: u.split(":")[0], server: s }; };
export const makeCacheableSignalKeyStore = (s) => s;
const boom = (codigo, data) => Object.assign(new Error(codigo === 428 ? "Connection Closed" : "x"), { output: { statusCode: codigo }, data });
globalThis.__sockets = [];
globalThis.__registro = [];
// Defeitos sob encomenda (cada número = quantas vezes acontece):
//   travarAbertura  socket que nunca abre (fica "conectando")
//   falharEnvios    sendMessage com "Connection Closed"
//   travarEnvios    sendMessage que nunca responde
//   endMudo         end() que não avisa o fechamento
globalThis.__comportamento = { travarAbertura: 0, falharEnvios: 0, travarEnvios: 0, endMudo: 0 };
// Números que "existem" no WhatsApp (o 5511987654321 está registrado SEM o 9)
const existentes = new Set(["551187654321", "5521999990000"]);
export function makeWASocket(cfg) {
  const ev = new EventEmitter();
  const creds = cfg.auth.creds;
  const ws = { isOpen: false };
  let fechado = false;
  const sock = {
    ev, cfg, ws, authState: { creds, keys: cfg.auth.keys },
    get user() { return creds.me; },
    async requestPairingCode(tel) { __registro.push(["pairing", tel]); creds.me = { id: tel + "@s.whatsapp.net", name: "~" }; ev.emit("creds.update", creds); return "ABCD1234"; },
    async sendPresenceUpdate(tipo, jid) { __registro.push(["presence", tipo, jid ?? null]); },
    async presenceSubscribe(jid) { __registro.push(["subscribe", jid]); },
    async onWhatsApp(...ns) { __registro.push(["onWhatsApp", ...ns]); return ns.filter((n) => existentes.has(n)).map((n) => ({ jid: n + "@s.whatsapp.net", exists: true })); },
    async sendMessage(jid, conteudo) {
      if (__comportamento.travarEnvios > 0) { __comportamento.travarEnvios--; __registro.push(["travou", jid]); return new Promise(() => {}); }
      if (__comportamento.falharEnvios > 0) { __comportamento.falharEnvios--; __registro.push(["falhou", jid]); throw boom(428); }
      __registro.push(["send", jid, conteudo.text ?? (conteudo.image ? "imagem:" : "documento:") + (conteudo.caption ?? "") + ":" + (conteudo.fileName ?? "") + ":" + (conteudo.image ?? conteudo.document)?.length]);
      const id = "MSG" + __registro.length;
      const message = conteudo.text ? { conversation: conteudo.text } : { arquivo: conteudo.fileName ?? "imagem" };
      return { key: { id, remoteJid: jid, fromMe: true }, message };
    },
    async logout() { __registro.push(["logout"]); sock.fechar(401); },
    async end(err) {
      if (__comportamento.endMudo > 0) { __comportamento.endMudo--; __registro.push(["endMudo"]); return; }
      sock.fechar(err?.output?.statusCode ?? 428);
    },
    async rejectCall() {},
    fechar(codigo, data) { if (fechado) return; fechado = true; ws.isOpen = false; setImmediate(() => ev.emit("connection.update", { connection: "close", lastDisconnect: { error: boom(codigo, data) } })); },
    // o websocket morre sem avisar ninguém (cabo puxado, NAT que esqueceu a conexão)
    morrerCalado() { ws.isOpen = false; },
    // simula o celular lendo o QR: credenciais pareadas + pedido de restart (515)
    async simularLeitura() { creds.me = { id: "5511999998888:7@s.whatsapp.net", name: "Oficina Teste" }; creds.account = { details: Buffer.from([1]) }; ev.emit("creds.update", { me: creds.me }); await new Promise(r => setTimeout(r, 50)); sock.fechar(515); },
  };
  __sockets.push(sock);
  setTimeout(() => {
    if (fechado) return;
    if (__comportamento.travarAbertura > 0) { __comportamento.travarAbertura--; __registro.push(["travouAbertura"]); return; }
    ws.isOpen = true;
    if (creds.me?.id) ev.emit("connection.update", { connection: "open" });
    else { ev.emit("connection.update", { qr: "QR-1" }); }
  }, 30);
  return sock;
}
export default makeWASocket;
