import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth/sessao";
import { createAdminClient } from "@/lib/db/admin";
import type { EmpresaAdmin, ResumoAdmin, UsuarioAdmin } from "@/components/admin/tipos";

/**
 * Console do superadmin (/admin). Layout e páginas rodam em paralelo no Next,
 * então CADA página confere o posto antes de usar a chave de serviço — não
 * basta o layout barrar. Quem não é superadmin recebe 404 (nem fica sabendo
 * que a tela existe).
 */
export const exigirSuperadminTela = cache(async () => {
  const sessao = await obterSessao();
  if (!sessao) redirect("/auth/sair");
  if (!sessao.superadmin) notFound();
  return sessao;
});

type Dados<T> = { dados: T; erro: null } | { dados: null; erro: string };

async function rpc<T>(nome: string, vazio: T): Promise<Dados<T>> {
  await exigirSuperadminTela();
  const { data, error } = await createAdminClient().rpc(nome);
  if (error) return { dados: null, erro: error.message };
  return { dados: (data ?? vazio) as T, erro: null };
}

export const carregarResumo = cache(() => rpc<ResumoAdmin>("admin_resumo", {} as ResumoAdmin));
export const carregarUsuarios = cache(() => rpc<UsuarioAdmin[]>("admin_usuarios", []));
export const carregarEmpresas = cache(() => rpc<EmpresaAdmin[]>("admin_empresas", []));

/** Nome para o rodapé do menu do console. */
export const nomeDoSuperadmin = cache(async () => {
  const sessao = await exigirSuperadminTela();
  const { data } = await createAdminClient().from("profiles").select("nome").eq("id", sessao.userId).maybeSingle();
  return { nome: data?.nome ?? "Superadmin", email: sessao.email, userId: sessao.userId };
});
