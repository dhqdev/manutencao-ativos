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

const LIMITE_POR_EMAIL = 8;
const LIMITE_POR_IP = 30;

export function chavesTentativa(email: string, ip: string | null) {
  return { email: `email:${email.trim().toLowerCase()}`, ip: ip ? `ip:${ip}` : null };
}

export async function bloqueadoPorTentativas(chaves: { email: string; ip: string | null }) {
  const admin = createAdminClient();
  const [porEmail, porIp] = await Promise.all([
    admin.rpc("auth_falhas_recentes", { p_chave: chaves.email, p_minutos: 15 }),
    chaves.ip
      ? admin.rpc("auth_falhas_recentes", { p_chave: chaves.ip, p_minutos: 15 })
      : Promise.resolve({ data: 0 }),
  ]);
  return Number(porEmail.data ?? 0) >= LIMITE_POR_EMAIL || Number(porIp.data ?? 0) >= LIMITE_POR_IP;
}

export async function registrarTentativa(chaves: { email: string; ip: string | null }, sucesso: boolean) {
  const admin = createAdminClient();
  await Promise.all([
    admin.rpc("auth_registrar_tentativa", { p_chave: chaves.email, p_sucesso: sucesso }),
    chaves.ip ? admin.rpc("auth_registrar_tentativa", { p_chave: chaves.ip, p_sucesso: sucesso }) : null,
  ]);
}

// --- Links de recuperação -----------------------------------------------------

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function criarTokenRecuperacao(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const { error } = await createAdminClient().rpc("auth_criar_token", {
    p_user: userId,
    p_hash: hashToken(token),
    p_tipo: "recuperacao",
    p_minutos: 30,
  });
  if (error) throw new Error(error.message);
  return token;
}

export async function consumirTokenRecuperacao(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const { data } = await createAdminClient().rpc("auth_consumir_token", {
    p_hash: hashToken(token),
    p_tipo: "recuperacao",
  });
  return data ? String(data) : null;
}
