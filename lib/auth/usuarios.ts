import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/db/admin";
import { gerarHash } from "./senhas";

/**
 * Operações de conta feitas pelo servidor (funções auth_* do banco, só para
 * o service_role). Quem chama já conferiu a permissão.
 */

export type UsuarioAdmin = {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  superadmin?: boolean;
  bloqueado?: boolean;
  /** O link de um e-mail nosso já chegou à pessoa (bancos antigos: ausente). */
  email_confirmado?: boolean;
};

export type ResultadoCriacao =
  | { ok: true; id: string }
  | { ok: false; jaExiste: boolean; erro: string };

export async function criarUsuario(entrada: {
  email: string;
  senha: string;
  meta?: Record<string, unknown>;
  appMeta?: Record<string, unknown>;
}): Promise<ResultadoCriacao> {
  // O e-mail nasce não confirmado (ver auth_criar_usuario em db/sql/20-auth.sql).
  const { data, error } = await createAdminClient().rpc("auth_criar_usuario", {
    p_email: entrada.email,
    p_hash: await gerarHash(entrada.senha),
    p_meta: entrada.meta ?? {},
    p_app_meta: entrada.appMeta ?? {},
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, jaExiste: true, erro: "Este e-mail já está cadastrado." };
    }
    return { ok: false, jaExiste: false, erro: error.message };
  }
  return { ok: true, id: String(data) };
}

export async function usuarioPorEmail(email: string) {
  const { data } = await createAdminClient().rpc("auth_usuario_por_email", { p_email: email });
  return (data as { id: string; email: string; hash: string | null; bloqueado?: boolean; superadmin?: boolean } | null) ?? null;
}

export async function usuarioPorId(id: string) {
  const { data } = await createAdminClient().rpc("auth_usuario_por_id", { p_id: id });
  return (data as UsuarioAdmin | null) ?? null;
}

/** Troca a senha e derruba as demais sessões (mantém `manterSessao`, se informada). */
export async function definirSenha(id: string, senha: string, manterSessao?: string | null) {
  const { error } = await createAdminClient().rpc("auth_definir_senha", {
    p_id: id,
    p_hash: await gerarHash(senha),
    p_manter: manterSessao ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function excluirUsuario(id: string) {
  const { error } = await createAdminClient().rpc("auth_excluir_usuario", { p_id: id });
  if (error) throw new Error(error.message);
}

export async function encerrarSessoesDoUsuario(id: string) {
  await createAdminClient().rpc("auth_encerrar_sessoes", { p_user: id });
}

// --- Limite de tentativas ------------------------------------------------------

/**
 * Cada tentativa conta em várias chaves, cada uma com seu limite (em 15 min):
 *
 *   e-mail + IP   8   quem chuta a senha de uma conta, do mesmo lugar
 *   IP           30   quem chuta várias contas do mesmo lugar
 *   e-mail       50   ataque espalhado por muitos IPs contra uma conta
 *
 * Antes o limite por e-mail era 8, de qualquer IP: qualquer pessoa trancava a
 * conta de outra só errando a senha dela oito vezes. Agora isso só tranca o
 * IP de quem errou; a conta só fecha para todos diante de um ataque grande.
 */
export type ChaveTentativa = { chave: string; limite: number };

export function chavesTentativa(email: string, ip: string | null): ChaveTentativa[] {
  const e = email.trim().toLowerCase();
  if (!ip) return [{ chave: `email:${e}`, limite: 8 }];
  return [
    { chave: `email-ip:${e}|${ip}`, limite: 8 },
    { chave: `ip:${ip}`, limite: 30 },
    { chave: `email:${e}`, limite: 50 },
  ];
}

export async function bloqueadoPorTentativas(chaves: ChaveTentativa[]) {
  const admin = createAdminClient();
  const contagens = await Promise.all(
    chaves.map((c) => admin.rpc("auth_falhas_recentes", { p_chave: c.chave, p_minutos: 15 })),
  );
  return contagens.some((r, i) => Number(r.data ?? 0) >= chaves[i].limite);
}

export async function registrarTentativa(chaves: ChaveTentativa[], sucesso: boolean) {
  const admin = createAdminClient();
  await Promise.all(
    chaves.map((c) => admin.rpc("auth_registrar_tentativa", { p_chave: c.chave, p_sucesso: sucesso })),
  );
}

// --- Links por e-mail (recuperação de senha e confirmação do e-mail) -------------

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type TipoToken = "recuperacao" | "confirmacao";

/** Recuperação vale 30 minutos; confirmação, 3 dias (a pessoa pode ler depois). */
const MINUTOS_TOKEN: Record<TipoToken, number> = { recuperacao: 30, confirmacao: 3 * 24 * 60 };

export async function criarToken(userId: string, tipo: TipoToken) {
  const token = randomBytes(32).toString("base64url");
  const { error } = await createAdminClient().rpc("auth_criar_token", {
    p_user: userId,
    p_hash: hashToken(token),
    p_tipo: tipo,
    p_minutos: MINUTOS_TOKEN[tipo],
  });
  if (error) throw new Error(error.message);
  return token;
}

export async function consumirToken(token: string, tipo: TipoToken) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const { data } = await createAdminClient().rpc("auth_consumir_token", {
    p_hash: hashToken(token),
    p_tipo: tipo,
  });
  return data ? String(data) : null;
}

/** O link chegou: o e-mail é da pessoa. */
export async function confirmarEmail(userId: string) {
  const { error } = await createAdminClient().rpc("auth_confirmar_email", { p_user: userId });
  if (error) throw new Error(error.message);
}
