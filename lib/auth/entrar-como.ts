import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { urlSite } from "./config";
import { COOKIE_SESSAO, COOKIE_SESSAO_ADMIN, lerCookieSessao, opcoesCookieSessao } from "./sessao-cookie";

/**
 * "Entrar como": o superadmin abre o sistema na conta de outra pessoa, sem a
 * senha dela, a partir do console (adminEntrarComo em lib/actions/admin.ts).
 *
 * - A sessão da pessoa é curta (MINUTOS_ENTRAR_COMO), não se renova e fica
 *   registrada em sistema_entradas_como (db/sql/72-entrar-como.sql).
 * - O cookie do superadmin fica guardado em COOKIE_SESSAO_ADMIN; "Voltar ao
 *   console", "Sair" ou o fim do tempo passam por voltarAoConsole(), que fecha
 *   a sessão emprestada e devolve o cookie dele.
 */

export const MINUTOS_ENTRAR_COMO = 60;

function ir(request: NextRequest, caminho: string) {
  return NextResponse.redirect(new URL(caminho, urlSite() || request.nextUrl.origin), { status: 303 });
}

/**
 * Fecha o "Entrar como" e devolve o superadmin ao /admin. Sem o cookie
 * guardado, devolve null (não havia "Entrar como"): quem chamou segue o
 * caminho normal. Se a sessão guardada não vale mais (expirou, perdeu o
 * posto), limpa tudo e manda para o login.
 */
export async function voltarAoConsole(request: NextRequest): Promise<NextResponse | null> {
  const guardado = request.cookies.get(COOKIE_SESSAO_ADMIN)?.value;
  if (!guardado) return null;

  const admin = createAdminClient();
  const emprestada = lerCookieSessao(request.cookies.get(COOKIE_SESSAO)?.value);
  if (emprestada?.como) {
    try {
      await admin.rpc("auth_sair_entrada_como", { p_sessao: emprestada.sid });
    } catch {
      // banco fora do ar: a sessão curta expira sozinha
    }
  }

  const dados = lerCookieSessao(guardado);
  let superadmin = false;
  if (dados && !dados.como) {
    const { data } = await admin.rpc("auth_validar_sessao", { p_sessao: dados.sid });
    superadmin = (data as { superadmin?: boolean } | null)?.superadmin === true;
  }

  const resposta = ir(request, superadmin ? "/admin" : "/login");
  resposta.cookies.delete(COOKIE_SESSAO_ADMIN);
  if (superadmin) resposta.cookies.set(COOKIE_SESSAO, guardado, opcoesCookieSessao());
  else resposta.cookies.delete(COOKIE_SESSAO);
  return resposta;
}
