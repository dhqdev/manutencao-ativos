import { EventEmitter } from "node:events";
export const DisconnectReason = { connectionClosed: 428, connectionLost: 408, connectionReplaced: 440, timedOut: 408, loggedOut: 401, badSession: 500, restartRequired: 515, multideviceMismatch: 411, forbidden: 403, unavailableService: 503 };
export const BufferJSON = {
  replacer: (k, v) => (Buffer.isBuffer(v) || v instanceof Uint8Array || v?.type === "Buffer") ? { type: "Buffer", data: Buffer.from(v?.data || v).toString("base64") } : v,
  reviver: (_, v) => (typeof v === "object" && v && v.type === "Buffer" && typeof v.data === "string") ? Buffer.from(v.data, "base64") : v,
};
export const initAuthCreds = () => ({ noiseKey: Buffer.from("ruido"), registered: false });
export const proto = { Message: { AppStateSyncKeyData: { fromObject: (x) => x } } };
export const fetchLatestBaileysVersion = async () => ({ version: [2, 3000, 1], isLatest: true });
export const isJidBroadcast = (j) => j?.endsWith("@broadcast");
export const isJidNewsletter = (j) => j?.endsWith("@newsletter");
export const jidDecode = (j) => { if (!j) return undefined; const [u, s] = j.split("@"); return { user: u.split(":")[0], server: s }; };
export const makeCacheableSignalKeyStore = (s) => s;
const boom = (codigo) => Object.assign(new Error("x"), { output: { statusCode: codigo } });
globalThis.__sockets = [];
globalThis.__registro = [];
// Números que "existem" no WhatsApp (o 5511987654321 está registrado SEM o 9)
const existentes = new Set(["551187654321", "5521999990000"]);
export function makeWASocket(cfg) {
  const ev = new EventEmitter();
  const creds = cfg.auth.creds;
  let fechado = false;
  const sock = {
    ev, cfg, authState: { creds, keys: cfg.auth.keys },
    get user() { return creds.me; },
    async requestPairingCode(tel) { __registro.push(["pairing", tel]); creds.me = { id: tel + "@s.whatsapp.net", name: "~" }; ev.emit("creds.update", creds); return "ABCD1234"; },
    async sendPresenceUpdate(tipo, jid) { __registro.push(["presence", tipo, jid ?? null]); },
    async presenceSubscribe(jid) { __registro.push(["subscribe", jid]); },
    async onWhatsApp(...ns) { __registro.push(["onWhatsApp", ...ns]); return ns.filter((n) => existentes.has(n)).map((n) => ({ jid: n + "@s.whatsapp.net", exists: true })); },
    async sendMessage(jid, conteudo) { __registro.push(["send", jid, conteudo.text ?? (conteudo.image ? "imagem:" : "documento:") + (conteudo.caption ?? "") + ":" + (conteudo.fileName ?? "") + ":" + (conteudo.image ?? conteudo.document)?.length]); return { key: { id: "MSG" + __registro.length } }; },
    async logout() { __registro.push(["logout"]); sock.fechar(401); },
    async end() { sock.fechar(428); },
    async rejectCall() {},
    fechar(codigo) { if (fechado) return; fechado = true; setImmediate(() => ev.emit("connection.update", { connection: "close", lastDisconnect: { error: boom(codigo) } })); },
    // simula o celular lendo o QR: credenciais pareadas + pedido de restart (515)
    async simularLeitura() { creds.me = { id: "5511999998888:7@s.whatsapp.net", name: "Oficina Teste" }; creds.account = { details: Buffer.from([1]) }; ev.emit("creds.update", { me: creds.me }); await new Promise(r => setTimeout(r, 50)); sock.fechar(515); },
  };
  __sockets.push(sock);
  setTimeout(() => {
    if (fechado) return;
    if (creds.me?.id) ev.emit("connection.update", { connection: "open" });
    else { ev.emit("connection.update", { qr: "QR-1" }); }
  }, 30);
  return sock;
}
export default makeWASocket;
