"use server";

import { revalidatePath } from "next/cache";
import { SEM_PERMISSAO } from "@/lib/permissoes";
import { getContexto } from "@/lib/session";
import { createClient } from "@/lib/db/server";
import { obterSessao } from "@/lib/auth/sessao";
import { senhaValida } from "@/lib/auth/senhas";
import { definirSenha } from "@/lib/auth/usuarios";
import {
  erroBanco,
  exigirId,
  mensagemErro,
  texto,
  textoObrigatorio,
  type Resultado,
} from "@/lib/form";

export async function salvarEmpresa(fd: FormData): Promise<Resultado> {
  try {
    const { orgId } = await getContexto();
    const db = await createClient();

    const { data: alterada, error } = await db
      .from("organizacoes")
      .update({
        nome: textoObrigatorio(fd, "nome", "o nome da empresa"),
        cnpj: texto(fd, "cnpj"),
        telefone: texto(fd, "telefone"),
        endereco: texto(fd, "endereco"),
      })
      .eq("id", orgId)
      .select("id");

    if (error) return erroBanco(error);
    if (!alterada?.length) return { ok: false, erro: SEM_PERMISSAO };

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export async function salvarPerfil(fd: FormData): Promise<Resultado> {
  try {
    const { userId } = await getContexto();
    const db = await createClient();

    const { error } = await db
      .from("profiles")
      .update({
        nome: textoObrigatorio(fd, "nome", "seu nome"),
        telefone: texto(fd, "telefone"),
        cargo: texto(fd, "cargo"),
      })
      .eq("id", userId);

    if (error) return erroBanco(error);

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

/** Troca a empresa ativa (para quem participa de mais de uma). */
export async function trocarEmpresa(fd: FormData): Promise<Resultado> {
  try {
    const { userId } = await getContexto();
    const db = await createClient();
    const orgId = exigirId(textoObrigatorio(fd, "org_id", "a empresa"), "a empresa");

    const { data: membro } = await db
      .from("org_membros")
      .select("org_id")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (!membro) return { ok: false, erro: "Você não faz parte desta empresa." };

    const { error } = await db.from("profiles").update({ org_atual: orgId }).eq("id", userId);
    if (error) return erroBanco(error);

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export async function alterarSenha(fd: FormData): Promise<Resultado> {
  try {
    const senha = String(fd.get("senha") ?? "");
    const confirmacao = String(fd.get("confirmacao") ?? "");

    if (!senhaValida(senha)) return { ok: false, erro: "A senha deve ter entre 6 e 72 caracteres." };
    if (senha !== confirmacao) return { ok: false, erro: "As senhas não conferem." };

    const sessao = await obterSessao();
    if (!sessao) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };

    // Mantém esta sessão e derruba as outras (outros aparelhos saem).
    await definirSenha(sessao.userId, senha, sessao.sessaoId);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}
