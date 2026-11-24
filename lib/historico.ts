import type { TipoManutencao } from "@/lib/types";

/**
 * Filtros do histórico de manutenções, guardados na URL (`/manutencoes?...`):
 * recarregar, voltar e compartilhar o link mantêm a mesma lista. Tudo que vem
 * da URL passa por aqui antes de ir ao banco (id e data em formato válido,
 * tipo e ordem de listas fechadas), senão o Postgres devolveria erro em inglês.
 */

export const POR_PAGINA = 50;
/** Teto da exportação para CSV (o mesmo de historico_manutencoes no banco). */
export const LIMITE_EXPORTACAO = 5000;

export const TIPOS_VALIDOS: TipoManutencao[] = ["preventiva", "corretiva", "preditiva", "inspecao", "melhoria"];
export const ORDENS = ["data", "valor", "ativo", "tipo"] as const;
export type OrdemHistorico = (typeof ORDENS)[number];

export type FiltrosHistorico = {
  busca: string;
  tipo: TipoManutencao | null;
  ativo: string | null;
  categoria: string | null;
  de: string | null;
  ate: string | null;
  ordem: OrdemHistorico;
  desc: boolean;
  pagina: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

type Entrada = Record<string, string | string[] | undefined> | URLSearchParams;

function ler(e: Entrada, chave: string): string {
  const v = e instanceof URLSearchParams ? e.get(chave) : e[chave];
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}

function dataValida(v: string): string | null {
  if (!DATA.test(v)) return null;
  const [a, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? v : null;
}

export function lerFiltros(e: Entrada): FiltrosHistorico {
  const tipo = ler(e, "tipo");
  const ordem = ler(e, "ordem");
  const ativo = ler(e, "ativo");
  const categoria = ler(e, "categoria");
  const pagina = Number.parseInt(ler(e, "pagina"), 10);
  return {
    busca: ler(e, "q").slice(0, 120),
    tipo: (TIPOS_VALIDOS as string[]).includes(tipo) ? (tipo as TipoManutencao) : null,
    ativo: UUID.test(ativo) ? ativo.toLowerCase() : null,
    categoria: UUID.test(categoria) ? categoria.toLowerCase() : null,
    de: dataValida(ler(e, "de")),
    ate: dataValida(ler(e, "ate")),
    ordem: (ORDENS as readonly string[]).includes(ordem) ? (ordem as OrdemHistorico) : "data",
    // Padrão: mais recentes primeiro. "asc" na URL inverte.
    desc: ler(e, "dir") !== "asc",
    pagina: Number.isFinite(pagina) && pagina > 0 ? Math.min(pagina, 10000) : 1,
  };
}

/** Monta a query string só com o que foge do padrão (URL curta e legível). */
export function paraQuery(f: Partial<FiltrosHistorico>, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams(extra);
  if (f.busca) p.set("q", f.busca);
  if (f.tipo) p.set("tipo", f.tipo);
  if (f.ativo) p.set("ativo", f.ativo);
  if (f.categoria) p.set("categoria", f.categoria);
  if (f.de) p.set("de", f.de);
  if (f.ate) p.set("ate", f.ate);
  if (f.ordem && f.ordem !== "data") p.set("ordem", f.ordem);
  if (f.desc === false) p.set("dir", "asc");
  if (f.pagina && f.pagina > 1) p.set("pagina", String(f.pagina));
  return p.toString();
}

export function temFiltro(f: FiltrosHistorico) {
  return Boolean(f.busca || f.tipo || f.ativo || f.categoria || f.de || f.ate);
}

/** Parâmetros da função historico_manutencoes (45-desempenho.sql). */
export function parametrosRpc(orgId: string, f: FiltrosHistorico, limite: number, inicio: number) {
  return {
    p_org: orgId,
    p_busca: f.busca || null,
    p_tipo: f.tipo,
    p_ativo: f.ativo,
    p_categoria: f.categoria,
    p_de: f.de,
    p_ate: f.ate,
    p_ordem: f.ordem,
    p_desc: f.desc,
    p_limite: limite,
    p_inicio: inicio,
  };
}
