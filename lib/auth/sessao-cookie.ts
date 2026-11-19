import { segredoSessao, siteEmHttps } from "./config";
import { assinarJwt, verificarJwt } from "./jwt";

/**
 * O cookie de sessão: um JWT (SESSAO_SECRET) com o id da sessão do banco.
 * Funções puras — usadas pelo proxy.ts (sem banco) e por lib/auth/sessao.ts.
 */

export const COOKIE_SESSAO = "sessao";
export const DURACAO_COOKIE_SEGUNDOS = 60 * 24 * 60 * 60; // 60 dias (o banco expira em 30 sem uso)

export type DadosCookie = { sid: string; sub: string; email: string };

export function assinarCookieSessao(dados: DadosCookie) {
  return assinarJwt(dados, segredoSessao(), DURACAO_COOKIE_SEGUNDOS);
}

export function lerCookieSessao(token: string | undefined | null) {
  const dados = verificarJwt<DadosCookie>(token, segredoSessao());
  return dados?.sid && dados.sub ? dados : null;
}

export function opcoesCookieSessao() {
  return {
    httpOnly: true,
    secure: siteEmHttps(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: DURACAO_COOKIE_SEGUNDOS,
  };
}
