import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * JWT HS256 com o crypto do Node — sem dependência externa.
 *
 * Usado para dois tokens diferentes, cada um com o seu segredo:
 *   - o cookie de sessão do navegador (SESSAO_SECRET);
 *   - o token curto que o servidor manda ao PostgREST (JWT_SECRET).
 * Assim, mesmo que um vaze, não serve para o papel do outro.
 *
 * Roda no proxy.ts também: no Next 16 o proxy usa o runtime Node.
 */

const CABECALHO = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

function assinatura(conteudo: string, segredo: string) {
  return createHmac("sha256", segredo).update(conteudo).digest("base64url");
}

export function assinarJwt(dados: Record<string, unknown>, segredo: string, validadeSegundos: number) {
  const agora = Math.floor(Date.now() / 1000);
  const corpo = Buffer.from(
    JSON.stringify({ ...dados, iat: agora, exp: agora + validadeSegundos }),
  ).toString("base64url");
  const conteudo = `${CABECALHO}.${corpo}`;
  return `${conteudo}.${assinatura(conteudo, segredo)}`;
}

export type ConteudoJwt = Record<string, unknown> & { iat: number; exp: number };

/** Devolve o conteúdo se a assinatura e a validade conferem; senão, null. */
export function verificarJwt<T extends Record<string, unknown>>(
  token: string | undefined | null,
  segredo: string,
): (T & ConteudoJwt) | null {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3 || partes[0] !== CABECALHO) return null;

  const esperada = Buffer.from(assinatura(`${partes[0]}.${partes[1]}`, segredo));
  const recebida = Buffer.from(partes[2]);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;

  try {
    const dados = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8")) as T & ConteudoJwt;
    if (typeof dados.exp !== "number" || dados.exp <= Math.floor(Date.now() / 1000)) return null;
    return dados;
  } catch {
    return null;
  }
}
