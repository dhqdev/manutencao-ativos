import { PainelEquipe, type Membro } from "@/components/configuracoes/equipe";
import { Cabecalho } from "@/components/ui";
import { urlSite } from "@/lib/auth/config";
import { createClient } from "@/lib/db/server";
import { podeGerenciar } from "@/lib/permissoes";
import { getContexto } from "@/lib/session";
import type { PapelMembro } from "@/lib/types";

export const metadata = { title: "Equipe · Gestão de Manutenção" };

type LinhaMembro = {
  user_id: string;
  papel: PapelMembro;
  created_at: string;
  profiles: { nome: string | null; email: string | null; cargo: string | null; telefone: string | null } | null;
};

type Acesso = { user_id: string; ultimo_acesso: string | null; sessoes_ativas: number };

export default async function EquipePage() {
  const { orgId, userId, papel, organizacao } = await getContexto();
  const db = await createClient();

  const [{ data: membros }, { data: acessos }] = await Promise.all([
    db
      .from("org_membros")
      .select("user_id, papel, created_at, profiles(nome, email, cargo, telefone)")
      .eq("org_id", orgId)
      .order("created_at"),
    // Último acesso e sessões abertas moram no schema auth (db/sql/60-equipe.sql).
    db.rpc("equipe_acessos", { p_org: orgId }),
  ]);

  const porUsuario = new Map(((acessos ?? []) as Acesso[]).map((a) => [a.user_id, a]));

  const equipe: Membro[] = ((membros ?? []) as unknown as LinhaMembro[]).map((m) => ({
    user_id: m.user_id,
    papel: m.papel,
    created_at: m.created_at,
    nome: m.profiles?.nome ?? null,
    email: m.profiles?.email ?? null,
    cargo: m.profiles?.cargo ?? null,
    telefone: m.profiles?.telefone ?? null,
    ultimo_acesso: porUsuario.get(m.user_id)?.ultimo_acesso ?? null,
    sessoes_ativas: porUsuario.get(m.user_id)?.sessoes_ativas ?? 0,
  }));

  return (
    <>
      <Cabecalho
        titulo="Equipe"
        descricao={`Quem acessa os dados de ${organizacao.nome}, com que papel e quando entrou pela última vez.`}
      />
      <PainelEquipe
        membros={equipe}
        userId={userId}
        podeGerenciar={podeGerenciar(papel)}
        urlSistema={urlSite()}
        agora={Date.now()}
      />
    </>
  );
}
