import { NextResponse, type NextRequest } from "next/server";
import { urlSite } from "@/lib/auth/config";
import { COOKIE_SESSAO, criarSessao, opcoesCookieSessao } from "@/lib/auth/sessao";
import { consumirTokenRecuperacao, usuarioPorId } from "@/lib/auth/usuarios";

export const dynamic = "force-dynamic";

/**
 * Link do e-mail de recuperação de senha. Vale uma vez e por 30 minutos:
 * abre uma sessão e leva para a tela de nova senha.
 */
export async function GET(request: NextRequest) {
  const base = urlSite() || request.nextUrl.origin;
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const tipo = request.nextUrl.searchParams.get("tipo");

  if (tipo === "recuperacao" && token) {
    try {
      const userId = await consumirTokenRecuperacao(token);
      const usuario = userId ? await usuarioPorId(userId) : null;

      if (usuario) {
        const resposta = NextResponse.redirect(new URL("/nova-senha", base));
        resposta.cookies.set(COOKIE_SESSAO, await criarSessao(usuario), opcoesCookieSessao());
        return resposta;
      }
    } catch (e) {
      console.error("[auth] link de recuperação", e);
    }
  }

  return NextResponse.redirect(new URL("/login?erro=link_invalido", base));
}
