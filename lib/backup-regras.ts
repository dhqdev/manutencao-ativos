/**
 * Regras das credenciais do Backblaze B2 digitadas no console do superadmin.
 * Ficam fora de lib/backup.ts (server-only) para os testes de unidade.
 *
 * Tudo que entra aqui vai parar como valor de variável do rclone no serviço
 * backup: por isso nada de espaço, quebra de linha ou ".." — um bucket ou
 * pasta estranhos não podem apontar o envio para fora do lugar combinado.
 */

/** Chaves gravadas em sistema_credenciais pelo cartão do Backblaze. */
export const CHAVES_B2 = [
  "b2_key_id",
  "b2_app_key",
  "b2_bucket",
  "b2_pasta",
  "b2_dias",
  "b2_senha_criptografia",
] as const;
export type ChaveB2 = (typeof CHAVES_B2)[number];

export const PASTA_PADRAO = "manutencao";
export const DIAS_PADRAO = 30;

/** keyID da Application Key: letras e números (12 da chave mestra, 25 das outras). */
export function validarKeyId(v: string) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(v)) throw new Error("keyID inválido: copie o keyID da Application Key, sem espaços.");
  return v;
}

/** applicationKey: base64 sem espaço (31 caracteres hoje; aceitamos folga). */
export function validarAppKey(v: string) {
  if (!/^[A-Za-z0-9+/=_-]{20,100}$/.test(v)) {
    throw new Error("applicationKey inválida: cole a chave inteira, como apareceu na criação, sem espaços.");
  }
  return v;
}

/** Nome do bucket pelas regras do B2: 6 a 63 letras, números e hífen; não começa com "b2-". */
export function validarBucket(v: string) {
  if (!/^[A-Za-z0-9-]{6,63}$/.test(v) || /^b2-/i.test(v)) {
    throw new Error("Nome do bucket inválido: 6 a 63 letras, números ou hífen (e não pode começar com b2-).");
  }
  return v;
}

/** Pasta dentro do bucket: trechos de letras, números, "-", "_" e "." separados por "/". */
export function normalizarPasta(v: string | null) {
  const p = (v ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!p) return PASTA_PADRAO;
  const trechos = p.split("/");
  if (p.length > 100 || trechos.some((t) => !/^[A-Za-z0-9._-]+$/.test(t) || t === "." || t === "..")) {
    throw new Error("Pasta inválida: use letras, números, hífen e sublinhado (ex.: manutencao ou backups/manutencao).");
  }
  return p;
}

/** Dias que os dumps do banco ficam no B2. */
export function validarDias(v: number | null) {
  if (v === null) return DIAS_PADRAO;
  if (!Number.isInteger(v) || v < 1 || v > 3650) throw new Error("Os dias de retenção vão de 1 a 3650.");
  return v;
}

/** Senha de criptografia do rclone: opcional, mas curta demais não protege nada. */
export function validarSenhaCripto(v: string) {
  if (v.length < 12 || v.length > 200 || /[\r\n]/.test(v)) {
    throw new Error("A senha de criptografia precisa ter de 12 a 200 caracteres.");
  }
  return v;
}

/** "…a1B2": o fim do segredo, para o superadmin reconhecer qual chave está salva. */
export function finalDoSegredo(v: string | null | undefined) {
  return v ? `…${v.slice(-4)}` : null;
}
