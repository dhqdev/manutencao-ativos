"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { MINUTOS_ENTRAR_COMO } from "@/lib/auth/entrar-como";
import {
  COOKIE_SESSAO,
  COOKIE_SESSAO_ADMIN,
  assinarCookieSessao,
  ipDoCliente,
  obterSessao,
  opcoesCookieSessao,
} from "@/lib/auth/sessao";
import { gerarSenhaLegivel, problemaNaSenha } from "@/lib/auth/senhas";
import {
  criarUsuario as criarLogin,
  definirSenha,
  encerrarSessoesDoUsuario,
  usuarioPorId,
} from "@/lib/auth/usuarios";
import { createAdminClient, recarregarEsquema } from "@/lib/db/admin";
import { removerArquivos } from "@/lib/arquivos";
import { desconectar } from "@/lib/whatsapp";
import { BANCO_DESATUALIZADO, esquemaDesatualizado, exigirId, mensagemErro, texto, textoObrigatorio, type Resultado } from "@/lib/form";
import type { PapelMembro } from "@/lib/types";

/**
 * Ações do console do superadmin (/admin). Mexem em QUALQUER empresa e usuário,
 * por isso cada uma confere primeiro, na sessão validada no banco, se quem
 * pediu é o superadmin — só então a chave de serviço entra em cena.
 */

const PAPEIS: PapelMembro[] = ["proprietario", "gestor", "tecnico", "leitor"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CredenciaisAdmin =
  | { ok: true; nome: string; email: string; senha: string | null; aviso?: string }
  | { ok: false; erro: string };

type Limpeza = { arquivos?: string[]; instancias?: string[] };

async function exigirSuperadmin() {
  const sessao = await obterSessao();
  if (!sessao?.superadmin) throw new Error("Só o superadmin pode fazer isso.");
  return { sessao, admin: createAdminClient() };
}

function papelValido(valor: unknown): PapelMembro {
  if (!PAPEIS.includes(valor as PapelMembro)) throw new Error("Papel inválido.");
  return valor as PapelMembro;
}

function falha(e: unknown): { ok: false; erro: string } {
  return { ok: false, erro: mensagemErro(e) };
}

function pronto(): Resultado {
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Arquivos e WhatsApp de empresas apagadas: o banco não alcança o disco. */
async function limpar(retorno: Limpeza | null) {
  await removerArquivos(retorno?.arquivos ?? []);
  for (const instancia of retorno?.instancias ?? []) {
    await desconectar(instancia).catch((e) => console.error("[admin] desconectar", instancia, e));
  }
}

// --- Usuários -------------------------------------------------------------------

/**
 * Cria um login. Destino:
 *   empresa = "nova"   -> ganha uma empresa própria (nome em `empresa_nome`);
 *   empresa = <id>     -> entra na empresa escolhida com o papel escolhido.
 * Sem senha informada, gera uma legível. Ela volta só para a tela.
 */
export async function adminCriarUsuario(fd: FormData): Promise<CredenciaisAdmin> {
  try {
    const { admin } = await exigirSuperadmin();

    const nome = textoObrigatorio(fd, "nome", "o nome");
    const email = textoObrigatorio(fd, "email", "o e-mail").toLowerCase();
    const senha = texto(fd, "senha") ?? gerarSenhaLegivel();
    const empresa = texto(fd, "empresa") ?? "nova";

    if (!EMAIL.test(email)) return { ok: false, erro: "E-mail inválido." };
    const fraca = problemaNaSenha(senha, email);
    if (fraca) return { ok: false, erro: fraca };

    if (empresa === "nova") {
      const empresaNome = texto(fd, "empresa_nome") ?? nome;
      const criado = await criarLogin({ email, senha, meta: { nome, empresa: empresaNome } });
      if (!criado.ok) return { ok: false, erro: criado.erro };
    } else {
      const papel = papelValido(texto(fd, "papel") ?? "tecnico");
      // O convite não aceita proprietário: entra como gestor e é promovido logo em seguida.
      const criado = await criarLogin({
        email,
        senha,
        meta: { nome },
        appMeta: { convite_org: empresa, convite_papel: papel === "proprietario" ? "gestor" : papel },
      });
      if (!criado.ok) return { ok: false, erro: criado.erro };
      if (papel === "proprietario") {
        const { error } = await admin.rpc("admin_definir_membro", {
          p_org: empresa,
          p_user: criado.id,
          p_papel: "proprietario",
        });
        if (error) return { ok: false, erro: `Login criado, mas não virou proprietário: ${error.message}` };
      }
    }

    revalidatePath("/admin", "layout");
    return { ok: true, nome, email, senha };
  } catch (e) {
    return falha(e);
  }
}

export async function adminEditarUsuario(fd: FormData): Promise<Resultado> {
  try {
    const { admin } = await exigirSuperadmin();
    const { error } = await admin.rpc("admin_atualizar_usuario", {
      p_id: textoObrigatorio(fd, "id", "o usuário"),
      p_email: textoObrigatorio(fd, "email", "o e-mail"),
      p_nome: texto(fd, "nome") ?? "",
    });
    if (error) {
      return { ok: false, erro: error.code === "23505" ? "Já existe outro usuário com este e-mail." : error.message };
    }
    return pronto();
  } catch (e) {
    return falha(e);
  }
}

/** Senha nova (a informada ou uma gerada). Derruba as sessões abertas da pessoa. */
export async function adminRedefinirSenha(userId: string, senhaInformada?: string): Promise<CredenciaisAdmin> {
  try {
    const { sessao, admin } = await exigirSuperadmin();
    const alvo = await usuarioPorId(userId);
    if (!alvo) return { ok: false, erro: "Usuário não encontrado." };
    if (alvo.superadmin) {
      return { ok: false, erro: "A senha do superadmin vem da stack (SUPERADMIN_SENHA)." };
    }

    const senha = senhaInformada?.trim() || gerarSenhaLegivel();
    const fraca = problemaNaSenha(senha, alvo.email);
    if (fraca) return { ok: false, erro: fraca };

    await definirSenha(userId, senha, userId === sessao.userId ? sessao.sessaoId : null);
    const { data: perfil } = await admin.from("profiles").select("nome").eq("id", userId).maybeSingle();
    return { ok: true, nome: perfil?.nome ?? "", email: alvo.email, senha };
  } catch (e) {
    return falha(e);
  }
}

export async function adminBloquearUsuario(userId: string, bloquear: boolean): Promise<Resultado> {
  try {
    const { sessao, admin } = await exigirSuperadmin();
    if (userId === sessao.userId) return { ok: false, erro: "Você não pode bloquear a si mesmo." };
    const { error } = await admin.rpc("admin_bloquear_usuario", { p_id: userId, p_bloqueado: bloquear });
    if (error) return { ok: false, erro: error.message };
    return pronto();
  } catch (e) {
    return falha(e);
  }
}

export async function adminEncerrarSessoes(userId: string): Promise<Resultado> {
  try {
    const { sessao } = await exigirSuperadmin();
    if (userId === sessao.userId) return { ok: false, erro: "Para sair, use o botão Sair." };
    await encerrarSessoesDoUsuario(userId);
    return pronto();
  } catch (e) {
    return falha(e);
  }
}

export async function adminExcluirUsuario(userId: string): Promise<Resultado> {
  try {
    const { sessao, admin } = await exigirSuperadmin();
    if (userId === sessao.userId) return { ok: false, erro: "Você não pode excluir a si mesmo." };
    const { data, error } = await admin.rpc("admin_excluir_usuario", { p_id: userId });
    if (error) return { ok: false, erro: error.message };
    await limpar(data as Limpeza);
    return pronto();
  } catch (e) {
    return falha(e);
  }
}

/**
 * "Entrar como": abre o sistema na conta da pessoa, sem a senha dela. O banco
 * (auth_entrar_como) confere as regras de novo, cria uma sessão marcada
 * com quem a abriu e grava o registro. O cookie do superadmin fica guardado
 * para "Voltar ao console" (lib/auth/entrar-como.ts).
 *
 * Termina com redirect (fora do try): trocar o cookie numa action faz o Next
 * redesenhar a tela atual, e o /admin com o cookie da pessoa daria 404.
 */
export async function adminEntrarComo(userId: string, motivoInformado: string): Promise<Resultado> {
  try {
    const { sessao, admin } = await exigirSuperadmin();
    exigirId(userId, "o usuário");
    // O motivo fica no registro e a empresa o vê na tela Equipe.
    const motivo = String(motivoInformado ?? "").trim().slice(0, 300);
    if (motivo.length < 5) return { ok: false, erro: "Diga por que vai entrar na conta (ex.: chamado 123)." };
    if (sessao.entradaComo) return { ok: false, erro: "Volte ao console antes de entrar em outra conta." };
    if (userId === sessao.userId) return { ok: false, erro: "Esta já é a sua conta." };

    const alvo = await usuarioPorId(userId);
    if (!alvo) return { ok: false, erro: "Usuário não encontrado." };

    const jar = await cookies();
    const meuCookie = jar.get(COOKIE_SESSAO)?.value;
    if (!meuCookie) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };

    const h = await headers();
    const entrar = () =>
      admin.rpc("auth_entrar_como", {
        p_admin: sessao.userId,
        p_user: userId,
        p_minutos: MINUTOS_ENTRAR_COMO,
        p_ip: ipDoCliente(h),
        p_agente: h.get("user-agent"),
        p_motivo: motivo,
      });
    let { data: sid, error } = await entrar();
    // Banco já atualizado, PostgREST com o cache velho: pede para reler e tenta de novo.
    if (esquemaDesatualizado(error) && (await recarregarEsquema())) ({ data: sid, error } = await entrar());
    // As recusas da função (bloqueado, sem empresa...) já vêm em português.
    if (esquemaDesatualizado(error)) return { ok: false, erro: BANCO_DESATUALIZADO };
    if (error || !sid) return { ok: false, erro: error?.message ?? "Não foi possível entrar na conta." };

    const validade = MINUTOS_ENTRAR_COMO * 60;
    jar.set(COOKIE_SESSAO_ADMIN, meuCookie, opcoesCookieSessao());
    jar.set(
      COOKIE_SESSAO,
      assinarCookieSessao({ sid: String(sid), sub: userId, email: alvo.email, como: true }, validade),
      opcoesCookieSessao(validade),
    );
  } catch (e) {
    return falha(e);
  }
  redirect("/dashboard");
}

export type EntradaComoRegistro = {
  inicio: string;
  fim: string | null;
  expira_em: string;
  superadmin_email: string;
  motivo: string | null;
  ip: string | null;
  acoes: number;
};

/** Últimas vezes que o console entrou na conta da pessoa (gaveta de detalhes). */
export async function adminEntradasComo(
  userId: string,
): Promise<{ ok: true; entradas: EntradaComoRegistro[] } | { ok: false; erro: string }> {
  try {
    const { admin } = await exigirSuperadmin();
    exigirId(userId, "o usuário");
    const { data, error } = await admin.rpc("admin_entradas_como", { p_user: userId });
    if (error) return { ok: false, erro: error.message };
    return { ok: true, entradas: (data as EntradaComoRegistro[] | null) ?? [] };
  } catch (e) {
    return falha(e);
  }
}

// --- Empresas de um usuário (gaveta de detalhes) ----------------------------------

/** O superadmin só administra: não entra na equipe de nenhuma empresa. */
const SUPERADMIN_FORA = "O superadmin só administra o sistema; ele não entra na equipe das empresas.";

/** Põe o usuário numa empresa (ou troca o papel, se já estiver nela). */
export async function adminVincularEmpresa(fd: FormData): Promise<Resultado> {
  try {
    const { admin } = await exigirSuperadmin();
    const userId = textoObrigatorio(fd, "user_id", "o usuário");
    const orgId = textoObrigatorio(fd, "org_id", "a empresa");
    const papel = papelValido(texto(fd, "papel") ?? "tecnico");

    const alvo = await usuarioPorId(userId);
    if (!alvo) return { ok: false, erro: "Usuário não encontrado." };
    if (alvo.superadmin) return { ok: false, erro: SUPERADMIN_FORA };

    const { error } = await admin.rpc("admin_definir_membro", { p_org: orgId, p_user: userId, p_papel: papel });
    if (error) return { ok: false, erro: error.message };
    return pronto();
  } catch (e) {
    return falha(e);
  }
}

export async function adminAlterarPapel(orgId: string, userId: string, papel: PapelMembro): Promise<Resultado> {
  try {
    const { admin } = await exigirSuperadmin();
    const { error } = await admin.rpc("admin_definir_membro", {
      p_org: orgId,
      p_user: userId,
      p_papel: papelValido(papel),
    });
    if (error) return { ok: false, erro: error.message };
    return pronto();
  } catch (e) {
    return falha(e);
  }
}

/** Tira o usuário da empresa. Se era o proprietário, a próxima pessoa assume. */
export async function adminRemoverMembro(orgId: string, userId: string): Promise<Resultado> {
  try {
    const { admin } = await exigirSuperadmin();
    const { error } = await admin.rpc("admin_remover_membro", { p_org: orgId, p_user: userId });
    if (error) return { ok: false, erro: error.message };
    return pronto();
  } catch (e) {
    return falha(e);
  }
}
