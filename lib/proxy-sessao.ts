import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_SESSAO,
  COOKIE_SESSAO_ADMIN,
  DURACAO_COOKIE_SEGUNDOS,
  assinarCookieSessao,
  lerCookieSessao,
  opcoesCookieSessao,
} from "@/lib/auth/sessao-cookie";

/** Telas acessíveis sem sessão. */
const ROTAS_PUBLICAS = ["/login", "/cadastro", "/recuperar-senha", "/auth", "/offline"];

/**
 * Rotas de API cuidam da própria autenticação (a rotina diária usa
 * CRON_SECRET, os arquivos usam link assinado). Elas NÃO podem cair no
 * redirecionamento para /login.
 */
const PREFIXO_API = "/api/";

/** Renova o cookie quando falta menos que isto para ele expirar. */
const RENOVAR_COM_SEGUNDOS = DURACAO_COOKIE_SEGUNDOS / 2;

function politicaDeSeguranca(nonce: string) {
  const dev = process.env.NODE_ENV === "development";

  return [
    "default-src 'self'",
    // 'strict-dynamic': o navegador só confia nos scripts carregados a partir
    // dos scripts com nonce. Bloqueia injeção mesmo se algum HTML for adulterado.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Atributos style inline (cores das categorias, barras dos gráficos) não
    // aceitam nonce. Em style-src, 'unsafe-inline' não permite executar código.
    "style-src 'self' 'unsafe-inline'",
    // Fotos e anexos são servidos pelo próprio app (/api/arquivos).
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'self'",
    "worker-src 'self' blob:",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function aplicarCabecalhos(resposta: NextResponse, csp: string) {
  resposta.headers.set("Content-Security-Policy", csp);
  resposta.headers.set("X-Content-Type-Options", "nosniff");
  resposta.headers.set("X-Frame-Options", "DENY");
  resposta.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  resposta.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  resposta.headers.set("X-DNS-Prefetch-Control", "off");
  resposta.headers.set("Cross-Origin-Opener-Policy", "same-origin");

  if (process.env.NODE_ENV === "production") {
    resposta.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return resposta;
}

/**
 * Decide redirecionamentos olhando só a assinatura do cookie (sem banco, para
 * ser rápido). Quem confere a sessão no banco são as telas (getContexto): se
 * ela tiver sido derrubada, a tela manda para /auth/sair, que limpa o cookie.
 */
export async function proxySessao(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = politicaDeSeguranca(nonce);

  const cabecalhos = new Headers(request.headers);
  cabecalhos.set("x-nonce", nonce);
  cabecalhos.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: cabecalhos } });

  // Rotas de API: só os cabeçalhos. Quem autentica é o próprio handler.
  if (pathname.startsWith(PREFIXO_API)) {
    return aplicarCabecalhos(response, csp);
  }

  const bruto = request.cookies.get(COOKIE_SESSAO)?.value;
  const sessao = lerCookieSessao(bruto);
  const ehPublica = ROTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(r + "/"));

  // Acabou o tempo do "Entrar como" (o cookie curto venceu): devolve o
  // superadmin ao console em vez de mandá-lo para o login.
  if (!sessao && !ehPublica && request.cookies.has(COOKIE_SESSAO_ADMIN)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/voltar";
    url.search = "";
    return aplicarCabecalhos(NextResponse.redirect(url), csp);
  }

  if (!sessao && !ehPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("redirect", pathname);
    const redirecionamento = NextResponse.redirect(url);
    if (bruto) redirecionamento.cookies.delete(COOKIE_SESSAO);
    return aplicarCabecalhos(redirecionamento, csp);
  }

  if (sessao && (pathname === "/login" || pathname === "/cadastro")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return aplicarCabecalhos(NextResponse.redirect(url), csp);
  }

  // Sessão ativa perto de expirar o cookie: renova (o banco renova a dele
  // a cada uso, em auth_validar_sessao).
  // A do "Entrar como" não: ela é curta de propósito.
  if (sessao && !sessao.como && sessao.exp - Math.floor(Date.now() / 1000) < RENOVAR_COM_SEGUNDOS) {
    response.cookies.set(
      COOKIE_SESSAO,
      assinarCookieSessao({ sid: sessao.sid, sub: sessao.sub, email: sessao.email }),
      opcoesCookieSessao(),
    );
  }

  return aplicarCabecalhos(response, csp);
}
