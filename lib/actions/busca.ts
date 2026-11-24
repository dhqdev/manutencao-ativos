"use server";

import { createClient } from "@/lib/db/server";
import { mensagemErro } from "@/lib/form";
import { getContexto } from "@/lib/session";

export type ResultadoBusca = {
  ativos: { id: string; nome: string; identificacao: string | null; categoria: string }[];
  manutencoes: { id: string; ativo_id: string; descricao: string; data_manutencao: string; ativo_nome: string }[];
  planos: { id: string; ativo_id: string; tipo: string; situacao: string; ativo_nome: string }[];
  pneus: { id: string; numero_fogo: string; marca: string; modelo: string | null; status: string }[];
};

const VAZIO: ResultadoBusca = { ativos: [], manutencoes: [], planos: [], pneus: [] };

/**
 * Busca global (Ctrl+K). Só leitura, na empresa aberta, com o JWT de quem
 * pediu: o RLS decide o que aparece (busca_global em 45-desempenho.sql).
 */
export async function buscarNoSistema(
  termo: string,
): Promise<{ ok: true; resultado: ResultadoBusca } | { ok: false; erro: string }> {
  try {
    const t = String(termo ?? "").trim().slice(0, 80);
    if (t.length < 2) return { ok: true, resultado: VAZIO };
    const { orgId } = await getContexto();
    const db = await createClient();
    const { data, error } = await db.rpc("busca_global", { p_org: orgId, p_termo: t });
    if (error) return { ok: true, resultado: VAZIO }; // banco sem a função ainda: só os atalhos
    return { ok: true, resultado: { ...VAZIO, ...(data as Partial<ResultadoBusca>) } };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}
