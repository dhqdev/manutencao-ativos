import { createHmac } from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

// ---- PostgREST falso (o mínimo que o serviço usa) ----
const JWT_SECRET = "segredo-jwt-de-teste-com-mais-de-32-caracteres";
function tokenDeServidorValido(cabecalho) {
  const token = (cabecalho ?? "").replace(/^Bearer /, "");
  const [h, c, a] = token.split(".");
  if (!h || !c || !a) return false;
  if (createHmac("sha256", JWT_SECRET).update(`${h}.${c}`).digest("base64url") !== a) return false;
  const dados = JSON.parse(Buffer.from(c, "base64url").toString());
  return dados.role === "whatsapp_servico" && dados.exp > Date.now() / 1000;
}
// Faz também o papel do app: emite o token do banco para quem tem a chave.
function tokenDoApp() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const agora = Math.floor(Date.now() / 1000);
  const c = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "whatsapp_servico", iat: agora, exp: agora + 300 })}`;
  return `${c}.${createHmac("sha256", JWT_SECRET).update(c).digest("base64url")}`;
}
const banco = new Map(); // "sessao|chave" -> valor
const patches = [];
const listaIn = (s) => [...decodeURIComponent(s).slice(4, -1).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
const db = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  let corpo = ""; for await (const p of req) corpo += p;
  if (u.pathname === "/api/whatsapp/token") {
    if (req.method !== "POST" || req.headers.authorization !== `Bearer ${CHAVE}`) { res.writeHead(401); return res.end("{}"); }
    res.writeHead(200); return res.end(JSON.stringify({ token: tokenDoApp(), validade: 300 }));
  }
  const auth = tokenDeServidorValido(req.headers.authorization);
  if (!auth) { res.writeHead(401); return res.end("{}"); }
  const p = Object.fromEntries(u.searchParams);
  const filtroSessao = p.sessao?.startsWith("eq.") ? p.sessao.slice(3) : null;
  const filtroChave = p.chave?.startsWith("eq.") ? [p.chave.slice(3)] : p.chave?.startsWith("in.") ? listaIn(encodeURIComponent(p.chave)) : null;
  const casa = (k) => { const [s, c] = k.split("|"); return (!filtroSessao || s === filtroSessao) && (!filtroChave || filtroChave.includes(c)); };
  if (u.pathname === "/whatsapp_sessoes") {
    if (req.method === "GET") { const linhas = [...banco].filter(([k]) => casa(k)).map(([k, v]) => ({ sessao: k.split("|")[0], chave: k.split("|")[1], valor: v })); res.writeHead(200); return res.end(JSON.stringify(linhas)); }
    if (req.method === "POST") { assert.equal(p.on_conflict, "sessao,chave"); for (const l of JSON.parse(corpo)) banco.set(`${l.sessao}|${l.chave}`, l.valor); res.writeHead(201); return res.end(); }
    if (req.method === "DELETE") { for (const k of [...banco.keys()]) if (casa(k)) banco.delete(k); res.writeHead(204); return res.end(); }
  }
  if (u.pathname === "/whatsapp_conexoes" && req.method === "PATCH") { patches.push({ instancia: p.instancia.replace(/^eq\./, ""), ...JSON.parse(corpo) }); res.writeHead(204); return res.end(); }
  res.writeHead(404); res.end("{}");
});
await new Promise((r) => db.listen(0, "127.0.0.1", r));
const URL_DB = `http://127.0.0.1:${db.address().port}`;

const CHAVE = "chave-de-teste-com-mais-de-24-caracteres";
Object.assign(process.env, { PORT: "39111", WHATSAPP_API_KEY: CHAVE, POSTGREST_URL: URL_DB, APP_URL: URL_DB, WHATSAPP_INTERVALO_ENVIO_MS: "10" });
await import("../src/index.js");
await new Promise((r) => setTimeout(r, 200));

const api = async (metodo, caminho, corpo, chave = CHAVE) => {
  const r = await fetch(`http://127.0.0.1:39111${caminho}`, { method: metodo, headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, json: await r.json() };
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

try {
// 1. saúde e autenticação
assert.equal((await api("GET", "/saude")).status, 200);
assert.equal((await api("GET", "/sessoes/manut_a", null, "errada")).status, 401);
assert.equal((await api("GET", "/sessoes/../x")).status, 404);
console.log("✓ saúde e chave");

// 2. estado de sessão inexistente
assert.equal((await api("GET", "/sessoes/manut_a")).json.status, "desconectado");

// 3. conectar → QR
let r = await api("POST", "/sessoes/manut_a/conectar", {});
assert.equal(r.status, 200); assert.equal(r.json.status, "conectando"); assert.match(r.json.qr, /^data:image\/png;base64,/);
assert.equal(__sockets.length, 1);
// conectar de novo não abre segundo socket
await Promise.all([api("POST", "/sessoes/manut_a/conectar", {}), api("POST", "/sessoes/manut_a/conectar", {})]);
assert.equal(__sockets.length, 1);
console.log("✓ QR aparece e não duplica socket");

// 4. código de pareamento pelo número
r = await api("POST", "/sessoes/manut_a/conectar", { telefone: "(11) 99999-8888" });
assert.equal(r.json.codigoPareamento, "ABCD-1234");
assert.deepEqual(__registro.find((x) => x[0] === "pairing"), ["pairing", "11999998888"]);
assert.equal((await api("POST", "/sessoes/manut_a/conectar", { telefone: "123" })).status, 400);
console.log("✓ código de pareamento");

// 5. celular lê o QR → 515 → reconecta → aberto
await __sockets[0].simularLeitura();
await esperar(300);
r = await api("GET", "/sessoes/manut_a");
assert.equal(r.json.status, "conectado"); assert.equal(r.json.numero, "5511999998888"); assert.equal(r.json.nomePerfil, "Oficina Teste"); assert.equal(r.json.qr, null);
assert.equal(__sockets.length, 2);
assert.ok(banco.get("manut_a|creds").includes("5511999998888"), "creds salvas no banco");
assert.deepEqual(patches.at(-1), { instancia: "manut_a", status: "conectado", numero: "5511999998888", nome_perfil: "Oficina Teste" });
assert.equal(__sockets[1].cfg.markOnlineOnConnect, true);
assert.equal(__sockets[1].cfg.syncFullHistory, false);
assert.deepEqual(__sockets[1].cfg.browser, ["Gestão de Manutenção", "Chrome", "22.04.4"]);
console.log("✓ leitura do QR, reconexão 515, credenciais e status no banco");

// 6. chaves de sinal: set/get com ids cheios de caracteres especiais
const keys = __sockets[1].authState.keys;
await keys.set({ session: { "5511999@s.whatsapp.net.0": Buffer.from([1, 2, 3]), 'a"b,c': Buffer.from([9]) }, "pre-key": { "1": { public: Buffer.from([4]) } } });
const lidas = await keys.get("session", ["5511999@s.whatsapp.net.0", 'a"b,c', "nao-existe"]);
assert.deepEqual([...lidas["5511999@s.whatsapp.net.0"]], [1, 2, 3]); assert.deepEqual([...lidas['a"b,c']], [9]); assert.equal(lidas["nao-existe"], undefined);
await keys.set({ session: { 'a"b,c': null } });
assert.equal((await keys.get("session", ['a"b,c']))['a"b,c'], undefined);
console.log("✓ chaves de criptografia no banco (gravar, ler, apagar)");

// 7. envio com digitando + nono dígito
__registro.length = 0;
r = await api("POST", "/sessoes/manut_a/mensagens", { numero: "5511987654321", texto: "Olá" });
assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.jid, "551187654321@s.whatsapp.net");
const tipos = __registro.map((x) => x[0] + (x[1] && x[0] === "presence" ? ":" + x[1] : ""));
assert.deepEqual(tipos, ["onWhatsApp", "subscribe", "presence:composing", "presence:paused", "send"]);
assert.deepEqual(__registro[0], ["onWhatsApp", "5511987654321", "551187654321"]);
r = await api("POST", "/sessoes/manut_a/mensagens", { numero: "5531900000000", texto: "x" });
assert.equal(r.status, 422);
r = await api("POST", "/sessoes/manut_a/mensagens", { numero: "5521999990000", texto: "sem digitar", digitando: false });
assert.equal(r.status, 200); assert.ok(!__registro.slice(-3).some((x) => x[1] === "composing"));
r = await api("POST", "/sessoes/manut_b/mensagens", { numero: "5521999990000", texto: "x" });
assert.equal(r.status, 409);
r = await api("POST", "/sessoes/manut_a/numeros", { numeros: ["5511987654321", "5531900000000"] });
assert.deepEqual(r.json.numeros.map((n) => n.existe), [true, false]);
console.log("✓ envio com digitando, nono dígito, número sem WhatsApp, sessão desconectada");

// 7b. arquivo: imagem com legenda e PDF como documento
const b64 = Buffer.from("conteudo-do-comprovante").toString("base64");
r = await api("POST", "/sessoes/manut_a/arquivos", { numero: "5521999990000", nome: "pix.png", tipo: "image/png", base64: b64, legenda: "Comprovante" });
assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(__registro.at(-1)[2], "imagem:Comprovante::23");
r = await api("POST", "/sessoes/manut_a/arquivos", { numero: "5521999990000", nome: "pix.pdf", tipo: "application/pdf", base64: b64 });
assert.equal(r.status, 200); assert.equal(__registro.at(-1)[2], "documento::pix.pdf:23");
r = await api("POST", "/sessoes/manut_a/arquivos", { numero: "5521999990000", nome: "x.exe", tipo: "application/x-msdownload", base64: b64 });
assert.equal(r.status, 415);
r = await api("POST", "/sessoes/manut_b/arquivos", { numero: "5521999990000", nome: "pix.png", tipo: "image/png", base64: b64 });
assert.equal(r.status, 409);
console.log("✓ envio de arquivo (imagem, PDF, tipo recusado, sessão desconectada)");

// 8. queda de rede → reconecta sozinho
__sockets.at(-1).fechar(408);
await esperar(3600);
assert.equal((await api("GET", "/sessoes/manut_a")).json.status, "conectado");
console.log("✓ reconexão automática após queda");

// 9. reinício do processo → sessão volta do banco
const filho = spawn(
  process.execPath,
  ["--import", new URL("./registrar.mjs", import.meta.url).href, new URL("../src/index.js", import.meta.url).pathname],
  { env: { ...process.env, PORT: "39112" }, stdio: "inherit" },
);
await esperar(900);
const r2 = await (await fetch("http://127.0.0.1:39112/sessoes/manut_a", { headers: { Authorization: `Bearer ${CHAVE}` } })).json();
filho.kill("SIGTERM");
assert.equal(r2.status, "conectado");
await esperar(200);
assert.ok(banco.has("manut_a|creds"), "SIGTERM não pode apagar as credenciais");
console.log("✓ reinício restaura a sessão; SIGTERM não desloga");

// 10. aparelho removido pelo celular (401) → limpa tudo
__sockets.at(-1).fechar(401);
await esperar(150);
r = await api("GET", "/sessoes/manut_a");
assert.equal(r.json.status, "desconectado"); assert.match(r.json.erro, /desconectado pelo celular/);
assert.ok(!banco.has("manut_a|creds")); assert.equal(patches.at(-1).status, "desconectado");
console.log("✓ logout pelo celular limpa credenciais e avisa o app");

// 11. QR que ninguém lê expira e para
r = await api("POST", "/sessoes/manut_c/conectar", {});
assert.equal(r.json.status, "conectando");
__sockets.at(-1).fechar(408);
await esperar(100);
r = await api("GET", "/sessoes/manut_c");
assert.equal(r.json.status, "desconectado"); assert.equal(r.json.expirado, true);
const antes = __sockets.length; await esperar(2500); assert.equal(__sockets.length, antes, "não pode ficar gerando QR para sempre");
console.log("✓ QR expirado para de girar");

// 11b. código pedido + queda de rede antes de digitar → recomeça limpo (QR e código novos)
__registro.length = 0;
r = await api("POST", "/sessoes/manut_e/conectar", { telefone: "5511912345678" });
assert.equal(r.json.codigoPareamento, "ABCD-1234");
const qtd = __sockets.length;
__sockets.at(-1).fechar(428);
await esperar(3600);
assert.equal(__sockets.length, qtd + 1, "deve reconectar uma vez");
assert.notEqual(__sockets.at(-1).authState.creds, __sockets.at(-2).authState.creds, "não pode reaproveitar as credenciais parciais do código");
r = await api("GET", "/sessoes/manut_e");
assert.equal(r.json.status, "conectando"); assert.equal(r.json.codigoPareamento, "ABCD-1234");
assert.equal(__registro.filter((x) => x[0] === "pairing").length, 2, "pede código novo no socket novo");
// e o resto de pareamento parcial não é tratado como sessão pareada
await __sockets.at(-1).end();
await api("DELETE", "/sessoes/manut_e");
console.log("✓ pareamento por código interrompido recomeça limpo");

// 12. desconectar pelo app → logout + apaga
await api("POST", "/sessoes/manut_d/conectar", {});
await __sockets.at(-1).simularLeitura(); await esperar(300);
assert.equal((await api("GET", "/sessoes/manut_d")).json.status, "conectado");
__registro.length = 0;
r = await api("DELETE", "/sessoes/manut_d");
assert.equal(r.status, 200); assert.ok(__registro.some((x) => x[0] === "logout")); assert.ok(![...banco.keys()].some((k) => k.startsWith("manut_d|")));
assert.equal((await api("GET", "/sessoes/manut_d")).json.status, "desconectado");
console.log("✓ desconectar pelo app");

console.log("\nTODOS OS TESTES PASSARAM");
process.exit(0);
} catch (e) { console.error("FALHOU:", e); process.exit(1); }
