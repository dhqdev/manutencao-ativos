import { NextResponse, type NextRequest } from "next/server";
import { urlSite } from "@/lib/auth/config";
import { COOKIE_SESSAO, lerCookieSessao } from "@/lib/auth/sessao";
import { createAdminClient } from "@/lib/db/admin";

export const dynamic = "force-dynamic";

/**
 * Sai: apaga a sessão no banco e o cookie. Também é para onde as telas
 * mandam quem chega com um cookie que não vale mais (sessão expirada ou
 * derrubada) — assim o cookie velho some e não há vai-e-volta com o /login.
 */
async function encerrar(request: NextRequest) {
  const dados = lerCookieSessao(request.cookies.get(COOKIE_SESSAO)?.value);
  if (dados) {
    try {
      await createAdminClient().rpc("auth_encerrar_sessao", { p_sessao: dados.sid });
    } catch {
      // banco fora do ar: o cookie sai do mesmo jeito
    }
  }

  const resposta = NextResponse.redirect(new URL("/login", urlSite() || request.nextUrl.origin), {
    status: 303,
  });
  resposta.cookies.delete(COOKIE_SESSAO);
  return resposta;
}

export const GET = encerrar;
export const POST = encerrar;
