import { segredoSessao, siteEmHttps } from "./config";
import { assinarJwt, verificarJwt } from "./jwt";

/**
 * O cookie de sessão: um JWT (SESSAO_SECRET) com o id da sessão do banco.
 * Funções puras — usadas pelo proxy.ts (sem banco) e por lib/auth/sessao.ts.
 */

export const COOKIE_SESSAO = "sessao";
export const DURACAO_COOKIE_SEGUNDOS = 60 * 24 * 60 * 60; // 60 dias (o banco expira em 30 sem uso)

/**
 * "Entrar como" (console do superadmin): enquanto ele está na conta de outra
 * pessoa, o cookie de sessão dele fica guardado aqui, intacto, para o botão
 * "Voltar ao console" devolvê-lo. Só vale se o banco ainda o reconhecer como
 * superadmin (lib/auth/entrar-como.ts).
 */
export const COOKIE_SESSAO_ADMIN = "sessao_admin";

/** `como`: sessão aberta pelo superadmin; curta, o proxy não a renova. */
export type DadosCookie = { sid: string; sub: string; email: string; como?: true };

export function assinarCookieSessao(dados: DadosCookie, validadeSegundos = DURACAO_COOKIE_SEGUNDOS) {
  return assinarJwt(dados, segredoSessao(), validadeSegundos);
}

export function lerCookieSessao(token: string | undefined | null) {
  const dados = verificarJwt<DadosCookie>(token, segredoSessao());
  return dados?.sid && dados.sub ? dados : null;
}

/**
 * Link de "Esqueci minha senha": além da sessão, o /auth/confirmar grava este
 * cookie curto amarrado a ela. Só com ele a tela /nova-senha troca a senha sem
 * pedir a atual — uma sessão qualquer (celular esquecido aberto) não basta.
 */
export const COOKIE_RECUPERACAO = "recuperacao";
export const DURACAO_RECUPERACAO_SEGUNDOS = 30 * 60;

export function assinarCookieRecuperacao(sid: string) {
  return assinarJwt({ sid, rec: true }, segredoSessao(), DURACAO_RECUPERACAO_SEGUNDOS);
}

/** Id da sessão aberta pelo link de recuperação, ou null. */
export function lerCookieRecuperacao(token: string | undefined | null) {
  const dados = verificarJwt<{ sid?: string; rec?: boolean }>(token, segredoSessao());
  return dados?.rec === true && dados.sid ? dados.sid : null;
}

export function opcoesCookieSessao(maxAge = DURACAO_COOKIE_SEGUNDOS) {
  return {
    httpOnly: true,
    secure: siteEmHttps(),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
