import { PainelEquipe, type AcessoSuporte, type ConviteEquipe, type Membro } from "@/components/configuracoes/equipe";
import { Cabecalho } from "@/components/ui";
import { urlSite } from "@/lib/auth/config";
import { createClient } from "@/lib/db/server";
import { podeGerenciar } from "@/lib/permissoes";
import { getContexto } from "@/lib/session";
import type { PapelMembro } from "@/lib/types";

export const metadata = { title: "Equipe · Gestão de Manutenção" };

type Perfil = {
  id: string;
  nome: string | null;
  email: string | null;
  cargo: string | null;
  telefone: string | null;
};

type Acesso = { user_id: string; ultimo_acesso: string | null; sessoes_ativas: number; conta_da_empresa: boolean };

export default async function EquipePage() {
  const { orgId, userId, papel, organizacao } = await getContexto();
  const db = await createClient();

  // org_membros aponta para auth.users (fora da API), não para profiles: o
  // PostgREST não consegue embutir o perfil. Por isso os perfis vêm à parte
  // (o RLS de profiles já limita a quem divide empresa com o usuário).
  const gestor = podeGerenciar(papel);
  const [{ data: membros }, { data: perfis }, { data: acessos }, { data: convites }, { data: suporte }] = await Promise.all([
    db.from("org_membros").select("user_id, papel, created_at").eq("org_id", orgId).order("created_at"),
    db.from("profiles").select("id, nome, email, cargo, telefone"),
    // Último acesso e sessões abertas moram no schema auth (db/sql/60-equipe.sql).
    db.rpc("equipe_acessos", { p_org: orgId }),
    // Quem já tinha conta e ainda não aceitou (db/sql/73-convites.sql).
    gestor ? db.rpc("convites_da_empresa", { p_org: orgId }) : Promise.resolve({ data: [] }),
    // Quando o suporte (superadmin) entrou na conta de alguém daqui, e por quê.
    gestor ? db.rpc("entradas_como_da_empresa", { p_org: orgId }) : Promise.resolve({ data: [] }),
  ]);

  const porUsuario = new Map(((acessos ?? []) as Acesso[]).map((a) => [a.user_id, a]));
  const perfilDe = new Map(((perfis ?? []) as Perfil[]).map((p) => [p.id, p]));

  const equipe: Membro[] = (membros ?? []).map((m) => ({
    user_id: m.user_id,
    papel: m.papel as PapelMembro,
    created_at: m.created_at,
    nome: perfilDe.get(m.user_id)?.nome ?? null,
    email: perfilDe.get(m.user_id)?.email ?? null,
    cargo: perfilDe.get(m.user_id)?.cargo ?? null,
    telefone: perfilDe.get(m.user_id)?.telefone ?? null,
    ultimo_acesso: porUsuario.get(m.user_id)?.ultimo_acesso ?? null,
    sessoes_ativas: porUsuario.get(m.user_id)?.sessoes_ativas ?? 0,
    conta_da_empresa: porUsuario.get(m.user_id)?.conta_da_empresa ?? false,
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
        convites={(convites as ConviteEquipe[] | null) ?? []}
        acessosSuporte={(suporte as AcessoSuporte[] | null) ?? []}
        podeGerenciar={gestor}
        urlSistema={urlSite()}
        agora={Date.now()}
      />
    </>
  );
}
