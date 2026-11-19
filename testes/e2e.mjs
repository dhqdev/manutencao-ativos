// Teste ponta a ponta num Chromium de verdade, contra a stack no ar.
//   BASE_URL=https://manutencao.localhost node e2e.mjs
// Em caso de falha, salva print e HTML em testes/resultados/.
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "https://manutencao.localhost";
const sufixo = Date.now();
const GESTOR = { email: `gestor-${sufixo}@teste.com.br`, senha: "Senha-E2E-2026" };
const TECNICO = { email: `tecnico-${sufixo}@teste.com.br`, senha: "Tecnico-E2E-2026" };
const INTRUSO = { email: `intruso-${sufixo}@teste.com.br`, senha: "Intruso-2026" };
// Mesmos valores de testes/gerar-env-teste.sh (o migrador cria esse login).
const SUPERADMIN = {
  email: process.env.SUPERADMIN_EMAIL ?? "superadmin@teste.com.br",
  senha: process.env.SUPERADMIN_SENHA ?? "Superadmin-E2E-2026",
};

// PNG 1x1 e um PDF mínimo, gerados aqui (sem arquivos de apoio).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

await mkdir("resultados", { recursive: true });
const navegador = await chromium.launch();
const contexto = await navegador.newContext({ ignoreHTTPSErrors: true, baseURL: BASE, locale: "pt-BR" });
const page = await contexto.newPage();
page.setDefaultTimeout(30_000);

const errosDoNavegador = [];
page.on("pageerror", (e) => errosDoNavegador.push(e.message));
page.on("console", (m) => m.type() === "error" && errosDoNavegador.push(m.text()));

let n = 0;
async function passo(nome, fn) {
  n++;
  process.stdout.write(`${String(n).padStart(2)}. ${nome} ... `);
  try {
    await fn();
    console.log("ok");
  } catch (e) {
    console.log("FALHOU");
    const base = `resultados/${String(n).padStart(2, "0")}`;
    await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
    await writeFile(`${base}.html`, await page.content().catch(() => "")).catch(() => {});
    console.error(`\nURL: ${page.url()}\n`, e);
    // O que a tela mostrava: campos inválidos, mensagens de erro e o diálogo aberto.
    const tela = await page
      .evaluate(() => ({
        invalidos: [...document.querySelectorAll(":invalid")]
          .filter((c) => c.name)
          .map((c) => `${c.name}: ${c.validationMessage}`),
        erros: [...document.querySelectorAll(".text-red-700, [role=alert]")].map((el) => el.textContent?.trim()),
        dialogo: document.querySelector("[role=dialog]")?.textContent?.replace(/\s+/g, " ").slice(0, 1500) ?? null,
      }))
      .catch(() => null);
    console.error("Tela no momento da falha:", JSON.stringify(tela, null, 2));
    if (errosDoNavegador.length) console.error("Erros no navegador:\n", errosDoNavegador.join("\n"));
    await navegador.close();
    process.exit(1);
  }
}

function verdade(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

const respostaDeArquivo = (metodo) =>
  page.waitForResponse((r) => r.url().includes("/api/arquivos/") && r.request().method() === metodo);

/** Em /manutencoes, o histórico fica na segunda aba (a primeira é a das periódicas). */
async function abrirHistorico() {
  await page.getByRole("button", { name: /Histórico realizado/ }).first().click();
}

async function entrar(conta, destino = "**/dashboard") {
  await page.goto("/login");
  await page.fill("#email", conta.email);
  await page.fill("#senha", conta.senha);
  await page.click('button[type="submit"]');
  await page.waitForURL(destino);
}

await passo("cadastro de uma empresa nova cai no painel", async () => {
  await page.goto("/cadastro");
  await page.fill("#nome", "Gestor E2E");
  await page.fill("#empresa", "Oficina E2E");
  await page.fill("#email", GESTOR.email);
  await page.fill("#senha", GESTOR.senha);
  await page.fill("#confirmacao", GESTOR.senha);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
  await page.getByText("Oficina E2E").first().waitFor();
});

await passo("cookie de sessão é httpOnly e Secure", async () => {
  const cookie = (await contexto.cookies()).find((c) => c.name === "sessao");
  verdade(cookie, "sem cookie de sessão");
  verdade(cookie.httpOnly && cookie.secure, `cookie inseguro: ${JSON.stringify(cookie)}`);
});

await passo("menu lateral recolhe, mostra a dica e lembra depois de recarregar", async () => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Recolher menu" }).click();
  const menu = page.getByRole("complementary", { name: "Menu lateral" });
  await menu.locator('a[href="/ativos"]').hover();
  await menu.getByText("Ativos", { exact: true }).last().waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Expandir menu" }).click();
  await page.getByRole("button", { name: "Recolher menu" }).waitFor();
});

await passo("as 6 categorias padrão existem", async () => {
  await page.goto("/ativos");
  const total = await page.locator('a[href^="/ativos/categoria/"]').count();
  verdade(total >= 6, `só ${total} links de categoria`);
});

await passo("cadastra um ativo com foto (upload para /api/arquivos)", async () => {
  await page.locator('a[href^="/ativos/categoria/"]').first().click();
  await page.waitForURL("**/ativos/categoria/**");
  await page.getByRole("button", { name: "Novo ativo" }).first().click();
  const dialogo = page.getByRole("dialog");
  await dialogo.locator('input[name="nome"]').fill("Trator E2E");
  await dialogo.locator('input[type="file"]').setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: PNG });
  const envio = respostaDeArquivo("PUT");
  await dialogo.getByRole("button", { name: "Cadastrar ativo" }).click();
  verdade((await envio).status() === 201, `upload da foto: ${(await envio).status()}`);
  await dialogo.waitFor({ state: "detached" });
  await page.getByText("Trator E2E").first().waitFor();
});

await passo("a foto do ativo abre (link assinado)", async () => {
  await page.getByText("Trator E2E").first().click();
  await page.waitForURL(/\/ativos\/[0-9a-f-]{36}$/);
  // A miniatura da lista já usou o mesmo link (validade arredondada para a
  // hora cheia): a foto pode vir do cache, sem nova requisição. Por isso
  // confere a imagem na tela e baixa o link à parte.
  // A foto fica na aba "Dados do ativo" (não é a aba aberta por padrão).
  await page.getByRole("button", { name: /Dados do ativo/ }).first().click();
  const foto = page.locator('img[alt="Foto de Trator E2E"]');
  await foto.waitFor();
  await page.waitForFunction(() => {
    const i = document.querySelector('img[alt="Foto de Trator E2E"]');
    return i && i.complete && i.naturalWidth > 0;
  });
  const r = await page.request.get(await foto.getAttribute("src"));
  verdade(r.status() === 200, `foto: ${r.status()}`);
  verdade(r.headers()["content-type"] === "image/png", `tipo: ${r.headers()["content-type"]}`);
});

await passo("registra manutenção com anexo PDF", async () => {
  await page.goto("/manutencoes");
  await page.getByRole("button", { name: "Registrar manutenção" }).first().click();
  const dialogo = page.getByRole("dialog");
  const seletor = dialogo.locator('select[name="ativo_id"]');
  const valor = await seletor.evaluate((s) => [...s.options].find((o) => o.text.includes("Trator E2E"))?.value);
  verdade(valor, "o ativo não aparece na lista");
  await seletor.selectOption(valor);
  await dialogo.locator('textarea[name="descricao"], input[name="descricao"]').fill("Troca de óleo E2E");
  await dialogo.locator('input[type="file"]').setInputFiles({ name: "nota.pdf", mimeType: "application/pdf", buffer: PDF });
  // O anexo escolhido precisa aparecer na lista antes de salvar.
  await dialogo.getByText("nota.pdf").waitFor();
  const envio = respostaDeArquivo("PUT");
  await dialogo.locator('button[type="submit"]').click();
  verdade((await envio).status() === 201, `upload do anexo: ${(await envio).status()}`);
  await dialogo.waitFor({ state: "detached" });
  await abrirHistorico();
  await page.getByText("Troca de óleo E2E").first().waitFor();
});

await passo("o anexo baixa como PDF", async () => {
  await page.goto("/manutencoes");
  await abrirHistorico();
  // Os anexos aparecem ao expandir a manutenção.
  await page.getByRole("button", { name: "Ver detalhes" }).first().click();
  const link = page.locator('a[href*="/api/arquivos/"]').first();
  await link.waitFor({ state: "attached" });
  const r = await page.request.get(await link.getAttribute("href"));
  verdade(r.status() === 200, `anexo: ${r.status()}`);
  verdade(r.headers()["content-type"] === "application/pdf", `tipo: ${r.headers()["content-type"]}`);
});

await passo("relatórios abrem", async () => {
  await page.goto("/relatorios");
  await page.getByRole("heading", { name: /Relatórios/ }).first().waitFor();
});

await passo("calendário e estoque abrem", async () => {
  for (const rota of ["/calendario", "/estoque", "/dashboard"]) {
    const r = await page.goto(rota);
    verdade(r.status() === 200, `${rota}: ${r.status()}`);
  }
});

await passo("gestor cria acesso para um técnico", async () => {
  await page.goto("/configuracoes");
  const form = page.locator("form").filter({ has: page.locator('input[placeholder="Nome da pessoa"]') });
  await form.locator('input[name="nome"]').fill("Técnico E2E");
  await form.locator('input[name="email"]').fill(TECNICO.email);
  await form.locator('input[name="senha"]').fill(TECNICO.senha);
  await form.getByRole("button", { name: "Criar acesso" }).click();
  await page.getByText("Acesso pronto").waitFor();
});

await passo("sair encerra a sessão", async () => {
  await page.goto("/auth/sair");
  await page.waitForURL("**/login");
  const r = await page.goto("/dashboard");
  verdade(page.url().includes("/login"), `continuou logado: ${page.url()} (${r?.status()})`);
});

await passo("senha errada é recusada", async () => {
  await page.goto("/login");
  await page.fill("#email", TECNICO.email);
  await page.fill("#senha", "senha-errada");
  await page.click('button[type="submit"]');
  await page.getByText("E-mail ou senha incorretos.").waitFor();
});

await passo("técnico entra e vê a manutenção da empresa", async () => {
  await entrar(TECNICO);
  await page.getByText("Oficina E2E").first().waitFor();
  await page.goto("/manutencoes");
  await abrirHistorico();
  await page.getByText("Troca de óleo E2E").first().waitFor();
});

await passo("outra empresa não enxerga os dados da primeira", async () => {
  await page.goto("/auth/sair");
  await page.goto("/cadastro");
  await page.fill("#nome", "Intruso");
  await page.fill("#empresa", "Empresa Intrusa");
  await page.fill("#email", INTRUSO.email);
  await page.fill("#senha", INTRUSO.senha);
  await page.fill("#confirmacao", INTRUSO.senha);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
  await page.goto("/manutencoes");
  verdade((await page.getByText("Troca de óleo E2E").count()) === 0, "vazou manutenção de outra empresa!");
});

await passo("usuário comum não vê o console do superadmin", async () => {
  verdade((await page.locator('a[href^="/admin"]').count()) === 0, "link do console apareceu para usuário comum");
  // A tela é transmitida aos poucos (loading.tsx): o status HTTP já saiu 200
  // quando a página chama notFound(). Confere o conteúdo, não o status.
  await page.goto("/admin");
  await page.getByText("Página não encontrada").first().waitFor();
  verdade((await page.getByText("Console do superadmin").count()) === 0, "usuário comum abriu o console!");
  verdade((await page.getByText(GESTOR.email).count()) === 0, "console vazou a lista de usuários!");
});

await passo("superadmin (da stack) entra direto na gerência de usuários, sem acesso ao sistema", async () => {
  await page.goto("/auth/sair");
  await entrar(SUPERADMIN, "**/admin");
  await page.getByRole("heading", { name: "Usuários", exact: true }).waitFor();
  await page.locator(`li[data-usuario="${GESTOR.email}"]`).waitFor();
  // O sistema das empresas devolve o superadmin ao console.
  await page.goto("/dashboard");
  await page.waitForURL("**/admin");
  verdade((await page.locator('a[href="/dashboard"]').count()) === 0, "console mostrou o menu do sistema");
});

await passo("console: bloco da versão do sistema com o atualizador", async () => {
  await page.getByRole("heading", { name: "Versão do sistema" }).waitFor();
  const versao = (await page.locator("[data-versao-atual]").textContent())?.trim();
  verdade(/^v\d{4}\.\d{2}\.\d{2}-\d+$/.test(versao ?? ""), `versão no ar fora do padrão: ${versao}`);
  // O serviço atualizador da stack manda sinal de vida: sem ele aparece o aviso.
  verdade((await page.getByText("não está rodando na stack").count()) === 0, "painel diz que o atualizador não está na stack");
});

await passo("console: detalhe do usuário troca o papel na empresa", async () => {
  await page.locator(`li[data-usuario="${TECNICO.email}"] button`).click();
  const detalhe = page.locator(`[data-detalhe="${TECNICO.email}"]`);
  const papel = detalhe.getByLabel("Papel em Oficina E2E");
  await papel.selectOption("leitor");
  await page.waitForLoadState("networkidle");
  // Depois do refresh o valor vem do banco: se a troca não gravou, volta a Técnico.
  await page.reload();
  await page.locator(`li[data-usuario="${TECNICO.email}"] button`).click();
  verdade((await papel.inputValue()) === "leitor", "papel não mudou para Leitor");
  await papel.selectOption("tecnico");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Escape");
});

await passo("superadmin bloqueia um usuário e ele não entra mais", async () => {
  await page.goto("/admin");
  await page.locator(`li[data-usuario="${INTRUSO.email}"] button`).click();
  const detalhe = page.locator(`[data-detalhe="${INTRUSO.email}"]`);
  await detalhe.getByRole("button", { name: "Bloquear", exact: true }).click();
  await detalhe.getByRole("button", { name: "Desbloquear", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.locator(`li[data-usuario="${INTRUSO.email}"]`).getByText("Bloqueado").first().waitFor();
  await page.goto("/auth/sair");
  await page.goto("/login");
  await page.fill("#email", INTRUSO.email);
  await page.fill("#senha", INTRUSO.senha);
  await page.click('button[type="submit"]');
  await page.getByText(/acesso foi bloqueado/).waitFor();
});

await passo("muitas tentativas de login bloqueiam", async () => {
  await page.goto("/auth/sair");
  for (let i = 0; i < 9; i++) {
    await page.goto("/login");
    await page.fill("#email", GESTOR.email);
    await page.fill("#senha", `errada-${i}`);
    await page.click('button[type="submit"]');
    await page.locator("text=/incorretos|Muitas tentativas/").first().waitFor();
  }
  await page.getByText(/Muitas tentativas/).first().waitFor();
});

const graves = errosDoNavegador.filter((e) => !/favicon|Failed to load resource: the server responded with a status of 4/.test(e));
if (graves.length) console.log("\nAvisos do navegador:\n" + graves.join("\n"));

await navegador.close();
console.log(`\n${n} passos ok.`);
