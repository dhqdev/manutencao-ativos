import "server-only";
import type { Db } from "@/lib/db/server";
import { parametrosRpc, type FiltrosHistorico } from "@/lib/historico";
import type { ManutencaoCompleta } from "@/lib/types";

export type PaginaHistorico = {
  total: number;
  valorTotal: number;
  linhas: ManutencaoCompleta[];
  /** Banco sem historico_manutencoes (imagem nova antes do migrador): lista simplificada. */
  simplificado: boolean;
};

/**
 * Uma página do histórico filtrado, com o total e a soma de TODAS as linhas
 * do filtro (não só da página), numa ida ao banco.
 */
export async function buscarHistorico(
  db: Db,
  orgId: string,
  f: FiltrosHistorico,
  limite: number,
  inicio: number,
): Promise<PaginaHistorico> {
  const { data, error } = await db.rpc("historico_manutencoes", parametrosRpc(orgId, f, limite, inicio));
  if (!error && data) {
    const r = data as { total: number; valor_total: number; linhas: ManutencaoCompleta[] };
    return {
      total: Number(r.total ?? 0),
      valorTotal: Number(r.valor_total ?? 0),
      linhas: r.linhas ?? [],
      simplificado: false,
    };
  }

  // Caminho antigo: filtros exatos pelo PostgREST, sem a busca em texto.
  let q = db
    .from("vw_manutencoes_completo")
    .select("*", { count: "exact" })
    .eq("org_id", orgId);
  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.ativo) q = q.eq("ativo_id", f.ativo);
  if (f.categoria) q = q.eq("categoria_id", f.categoria);
  if (f.de) q = q.gte("data_manutencao", f.de);
  if (f.ate) q = q.lte("data_manutencao", f.ate);
  const coluna = { data: "data_manutencao", valor: "valor", ativo: "ativo_nome", tipo: "tipo" }[f.ordem];
  const { data: linhas, count } = await q
    .order(coluna, { ascending: !f.desc })
    .range(inicio, inicio + limite - 1);
  const lista = (linhas ?? []) as ManutencaoCompleta[];
  return {
    total: count ?? lista.length,
    valorTotal: lista.reduce((s, m) => s + Number(m.valor ?? 0), 0),
    linhas: lista,
    simplificado: true,
  };
}
