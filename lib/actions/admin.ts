"use server";

import { revalidatePath } from "next/cache";
import { obterSessao } from "@/lib/auth/sessao";
import { gerarSenhaLegivel, senhaValida } from "@/lib/auth/senhas";
import {
  criarUsuario as criarLogin,
  definirSenha,
  encerrarSessoesDoUsuario,
  usuarioPorId,
} from "@/lib/auth/usuarios";
import { createAdminClient } from "@/lib/db/admin";
import { removerArquivos } from "@/lib/arquivos";
import { desconectar } from "@/lib/whatsapp";
import { mensagemErro, texto, textoObrigatorio, type Resultado } from "@/lib/form";
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
    if (!senhaValida(senha)) return { ok: false, erro: "A senha deve ter entre 6 e 72 caracteres." };

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
    if (!senhaValida(senha)) return { ok: false, erro: "A senha deve ter entre 6 e 72 caracteres." };

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
