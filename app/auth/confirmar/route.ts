import { NextResponse, type NextRequest } from "next/server";
import { urlSite } from "@/lib/auth/config";
import {
  COOKIE_RECUPERACAO,
  COOKIE_SESSAO,
  DURACAO_RECUPERACAO_SEGUNDOS,
  assinarCookieRecuperacao,
  criarSessao,
  lerCookieSessao,
  opcoesCookieSessao,
} from "@/lib/auth/sessao";
import { confirmarEmail, consumirToken, usuarioPorId } from "@/lib/auth/usuarios";

export const dynamic = "force-dynamic";

/**
 * Links dos e-mails. Cada um vale uma vez:
 *
 *   recuperacao (30 min)  abre uma sessão e leva para a tela de nova senha
 *   confirmacao (3 dias)  marca o e-mail como confirmado e leva ao sistema
 *
 * Os dois provam que a pessoa lê aquela caixa de e-mail, então os dois
 * confirmam o endereço.
 */
export async function GET(request: NextRequest) {
  const base = urlSite() || request.nextUrl.origin;
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const tipo = request.nextUrl.searchParams.get("tipo");

  if ((tipo === "recuperacao" || tipo === "confirmacao") && token) {
    try {
      const userId = await consumirToken(token, tipo);
      const usuario = userId ? await usuarioPorId(userId) : null;

      if (usuario && !usuario.bloqueado) {
        await confirmarEmail(usuario.id);

        if (tipo === "confirmacao") {
          // Não abre sessão: link de confirmação não é login.
          return NextResponse.redirect(new URL("/dashboard?email=confirmado", base));
        }

        const resposta = NextResponse.redirect(new URL("/nova-senha", base));
        const cookie = await criarSessao(usuario);
        resposta.cookies.set(COOKIE_SESSAO, cookie, opcoesCookieSessao());
        // Só esta sessão, e só por 30 minutos, troca a senha sem pedir a atual.
        resposta.cookies.set(
          COOKIE_RECUPERACAO,
          assinarCookieRecuperacao(lerCookieSessao(cookie)!.sid),
          opcoesCookieSessao(DURACAO_RECUPERACAO_SEGUNDOS),
        );
        return resposta;
      }
    } catch (e) {
      console.error("[auth] link do e-mail", e);
    }
  }

  return NextResponse.redirect(new URL("/login?erro=link_invalido", base));
}
