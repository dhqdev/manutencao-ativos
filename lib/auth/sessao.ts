import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { createAdminClient } from "@/lib/db/admin";
import {
  COOKIE_SESSAO,
  assinarCookieSessao,
  lerCookieSessao,
  opcoesCookieSessao,
} from "./sessao-cookie";

export {
  COOKIE_SESSAO,
  DURACAO_COOKIE_SEGUNDOS,
  assinarCookieSessao,
  lerCookieSessao,
  opcoesCookieSessao,
} from "./sessao-cookie";
export type { DadosCookie } from "./sessao-cookie";

/**
 * Sessões do navegador.
 *
 * O cookie (httpOnly) guarda um JWT assinado com SESSAO_SECRET contendo o id
 * da sessão. A sessão de verdade vive no banco (auth.sessoes): sair, trocar
 * a senha ou ser removido da equipe apaga a linha e o cookie para de valer na
 * hora, mesmo que ainda não tenha expirado.
 *
 * O proxy.ts só confere a assinatura (rápido, sem banco) para decidir
 * redirecionamentos; toda tela e ação confere a sessão no banco aqui.
 */

export type Sessao = { sessaoId: string; userId: string; email: string };

/** Sessão válida da requisição atual (uma consulta ao banco por requisição). */
export const obterSessao = cache(async (): Promise<Sessao | null> => {
  const dados = lerCookieSessao((await cookies()).get(COOKIE_SESSAO)?.value);
  if (!dados) return null;

  const { data, error } = await createAdminClient().rpc("auth_validar_sessao", { p_sessao: dados.sid });
  if (error || !data) return null;

  const sessao = data as { user_id: string; email: string };
  return { sessaoId: dados.sid, userId: sessao.user_id, email: sessao.email };
});

/** IP real do cliente. O Traefik substitui o X-Forwarded-For vindo de fora. */
export function ipDoCliente(h: Headers) {
  const encaminhado = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return encaminhado || h.get("x-real-ip") || null;
}

/** Cria a sessão no banco e devolve o valor do cookie. */
export async function criarSessao(usuario: { id: string; email: string }) {
  const h = await headers();
  const { data: sid, error } = await createAdminClient().rpc("auth_criar_sessao", {
    p_user: usuario.id,
    p_ip: ipDoCliente(h),
    p_agente: h.get("user-agent"),
  });
  if (error || !sid) throw new Error("Não foi possível iniciar a sessão. Tente de novo.");

  return assinarCookieSessao({ sid: String(sid), sub: usuario.id, email: usuario.email });
}

/** Para server actions: cria a sessão e grava o cookie. */
export async function iniciarSessao(usuario: { id: string; email: string }) {
  const valor = await criarSessao(usuario);
  (await cookies()).set(COOKIE_SESSAO, valor, opcoesCookieSessao());
}

/** Apaga a sessão do banco (se houver) e o cookie. */
export async function encerrarSessaoAtual() {
  const jar = await cookies();
  const dados = lerCookieSessao(jar.get(COOKIE_SESSAO)?.value);
  if (dados) {
    await createAdminClient().rpc("auth_encerrar_sessao", { p_sessao: dados.sid });
  }
  jar.delete(COOKIE_SESSAO);
}
