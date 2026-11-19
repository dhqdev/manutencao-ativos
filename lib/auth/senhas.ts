import "server-only";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Senhas com bcrypt — o mesmo formato ($2a$…) que o Supabase usava. Por isso
 * quem vier da base antiga continua entrando com a senha de sempre.
 */

const CUSTO = 10;

export function gerarHash(senha: string) {
  return bcrypt.hash(senha, CUSTO);
}

let hashFalso: string | null = null;

/**
 * Confere a senha. Sem hash (e-mail inexistente), compara com um hash falso
 * mesmo assim: a resposta leva o mesmo tempo e não denuncia quais e-mails
 * têm conta.
 */
export async function conferirSenha(senha: string, hash: string | null | undefined) {
  if (!hash) {
    hashFalso ??= await bcrypt.hash("senha-que-ninguem-tem", CUSTO);
    await bcrypt.compare(senha, hashFalso);
    return false;
  }
  try {
    return await bcrypt.compare(senha, hash);
  } catch {
    return false;
  }
}

export function senhaValida(senha: string) {
  return senha.length >= 6 && senha.length <= 72; // bcrypt ignora além de 72 bytes
}

/** Senha legível para ditar ou mandar no WhatsApp: sem 0/O, 1/l/I. */
export function gerarSenhaLegivel(tamanho = 10) {
  const letras = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let senha = "";
  for (let i = 0; i < tamanho; i++) senha += letras[randomInt(letras.length)];
  return senha;
}
