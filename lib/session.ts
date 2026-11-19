import { redirect } from "next/navigation";
import { cache } from "react";
import { obterSessao } from "@/lib/auth/sessao";
import { createClient } from "@/lib/db/server";
import type { Organizacao, PapelMembro, Profile } from "@/lib/types";

export type Contexto = {
  userId: string;
  email: string;
  profile: Profile;
  orgId: string;
  organizacao: Organizacao;
  papel: PapelMembro;
  /** Todas as empresas de que o usuário participa (para o seletor de empresa). */
  empresas: { id: string; nome: string }[];
  /** Manutenções vencendo ou atrasadas — mostrado no menu lateral. */
  alertas: number;
  /** Administra o sistema inteiro (painel /admin). Vem da stack: SUPERADMIN_EMAIL. */
  superadmin: boolean;
};

type RespostaContexto = {
  perfil: Profile | null;
  org_id: string;
  papel: PapelMembro;
  organizacao: Organizacao;
  empresas: { id: string; nome: string }[];
  alertas: number;
};

/**
 * Carrega usuário + empresa atual. Redireciona para /login se não houver sessão.
 *
 * Desempenho: uma consulta valida a sessão e todo o resto vem de UMA chamada
 * ao banco (contexto_usuario). Antes eram 5 consultas em sequência.
 *
 * `cache` garante que layout e página compartilhem o mesmo resultado.
 */
export const getContexto = cache(async (): Promise<Contexto> => {
  // Sessão conferida no banco. Sem sessão válida (cookie ausente, expirado ou
  // derrubado), /auth/sair limpa o cookie e leva ao login.
  const sessao = await obterSessao();
  if (!sessao) redirect("/auth/sair");

  const { userId, email } = sessao;
  const db = await createClient();

  const { data, error } = await db.rpc("contexto_usuario");

  // Sem empresa: conta criada antes do SQL rodar. Monta o espaço de trabalho.
  if (!error && !data) {
    const { data: novaOrg, error: erroCriacao } = await db.rpc("criar_workspace", {
      p_nome: "Minha Empresa",
    });
    if (erroCriacao || !novaOrg) redirect("/erro-configuracao");

    const { data: segundaTentativa } = await db.rpc("contexto_usuario");
    if (!segundaTentativa) redirect("/erro-configuracao");
    return montar(segundaTentativa as RespostaContexto, userId, email, sessao.superadmin);
  }

  // Banco ainda sem a função (migração de desempenho não rodada): usa o caminho
  // antigo, mais lento, em vez de derrubar o app.
  if (error) {
    if (funcaoAusente(error)) return caminhoAntigo(userId, email, sessao.superadmin);
    redirect("/erro-configuracao");
  }

  if (!data) redirect("/erro-configuracao");

  return montar(data as RespostaContexto, userId, email, sessao.superadmin);
});

function funcaoAusente(erro: { code?: string; message?: string }) {
  return (
    erro.code === "PGRST202" ||
    erro.code === "42883" ||
    /contexto_usuario/i.test(erro.message ?? "")
  );
}

/** Caminho antigo (5 consultas). Só roda se `contexto_usuario()` não existir. */
async function caminhoAntigo(userId: string, email: string, superadmin: boolean): Promise<Contexto> {
  console.warn(
    "[gestao-manutencao] Função contexto_usuario() ausente no banco. " +
      "Rode o migrador (db/sql) para acelerar a navegação.",
  );

  const db = await createClient();

  const [{ data: profile }, { data: membros }] = await Promise.all([
    db.from("profiles").select("*").eq("id", userId).maybeSingle(),
    db
      .from("org_membros")
      .select("org_id, papel")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  const membro = membros?.find((m) => m.org_id === profile?.org_atual) ?? membros?.[0] ?? null;
  if (!membro) redirect("/erro-configuracao");

  const ids = (membros ?? []).map((m) => m.org_id);

  const [{ data: organizacao }, { data: todas }, { count }] = await Promise.all([
    db.from("organizacoes").select("*").eq("id", membro.org_id).maybeSingle(),
    db.from("organizacoes").select("id, nome").in("id", ids).order("nome"),
    db
      .from("vw_planos_status")
      .select("id", { count: "exact", head: true })
      .eq("org_id", membro.org_id)
      .in("situacao", ["proxima", "atrasada"]),
  ]);

  if (!organizacao) redirect("/erro-configuracao");

  return montar(
    {
      perfil: (profile ?? null) as Profile | null,
      org_id: membro.org_id,
      papel: membro.papel as PapelMembro,
      organizacao: organizacao as Organizacao,
      empresas: todas ?? [],
      alertas: count ?? 0,
    },
    userId,
    email,
    superadmin,
  );
}

function montar(dados: RespostaContexto, userId: string, email: string, superadmin: boolean): Contexto {
  return {
    userId,
    email: dados.perfil?.email ?? email,
    profile:
      dados.perfil ??
      ({
        id: userId,
        nome: null,
        email,
        telefone: null,
        cargo: null,
        avatar_url: null,
        org_atual: dados.org_id,
      } as Profile),
    orgId: dados.org_id,
    organizacao: dados.organizacao,
    papel: dados.papel,
    empresas: dados.empresas ?? [],
    alertas: Number(dados.alertas ?? 0),
    superadmin,
  };
}
