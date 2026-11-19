import type {
  CondicaoPneu,
  SituacaoPlano,
  StatusAtivo,
  StatusPneu,
  TipoManutencao,
  TipoMovPneu,
  UnidadePeriodicidade,
} from "./types";

export const moeda = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

export const numero = (v: number | null | undefined, casas = 0) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(
    Number(v ?? 0),
  );

/** Converte "2026-08-07" em Date local (sem o deslocamento de fuso do ISO). */
export function paraData(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d);
}

export function dataBR(iso: string | null | undefined) {
  const d = paraData(iso);
  return d ? d.toLocaleDateString("pt-BR") : "—";
}

/**
 * Data e hora sempre no fuso de Brasília. Sem o fuso fixo, o servidor e o
 * navegador formatavam horários diferentes quando os fusos não batiam, e o
 * React acusava erro de hidratação (#418) na tela.
 */
export function dataHoraBR(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

const FUSO = "America/Sao_Paulo";

/**
 * Data de hoje em Brasília (AAAA-MM-DD). `toISOString` usa UTC — depois das 21h
 * já seria amanhã — e o container roda em UTC; o fuso fixo resolve os dois.
 * Também evita erro de hidratação: servidor e navegador chegam ao mesmo dia.
 */
export const hoje = (agora = new Date()) => agora.toLocaleDateString("sv-SE", { timeZone: FUSO });

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Ano e mês (1–12) de Brasília, deslocados `meses` a partir do mês atual. */
export function mesBR(meses = 0, agora = new Date()) {
  const [a, m] = hoje(agora).split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + meses, 1));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

/** Primeiro dia do mês (de Brasília) como AAAA-MM-DD. `meses` desloca: -1 = mês passado. */
export function primeiroDiaDoMes(meses = 0, agora = new Date()) {
  const { ano, mes } = mesBR(meses, agora);
  return `${ano}-${doisDigitos(mes)}-01`;
}

export function ultimoDiaDoMes(meses = 0, agora = new Date()) {
  const { ano, mes } = mesBR(meses, agora);
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(new Date(Date.UTC(ano, mes, 0)).getUTCDate())}`;
}

/** Soma dias a uma data AAAA-MM-DD sem passar pelo fuso local. */
export function somarDias(iso: string, dias: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

/** Soma meses sem estourar para o mês seguinte (31/01 + 1 mês = 28/02). */
export function somarMeses(iso: string, meses: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, 1));
  dt.setUTCMonth(dt.getUTCMonth() + meses);
  const ultimoDia = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, ultimoDia));
  return dt.toISOString().slice(0, 10);
}

export const isoLocal = (d: Date) => d.toLocaleDateString("sv-SE");

export const TIPOS_MANUTENCAO: Record<TipoManutencao, string> = {
  preventiva: "Preventiva",
  corretiva: "Corretiva",
  preditiva: "Preditiva",
  inspecao: "Inspeção",
  melhoria: "Melhoria",
};

export const STATUS_ATIVO: Record<StatusAtivo, { label: string; classe: string }> = {
  ativo: { label: "Em operação", classe: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  manutencao: { label: "Em manutenção", classe: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  inativo: { label: "Parado", classe: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  baixado: { label: "Baixado", classe: "bg-red-50 text-red-700 ring-red-600/20" },
};

export const SITUACAO_PLANO: Record<SituacaoPlano, { label: string; classe: string; ponto: string }> = {
  em_dia: { label: "Em dia", classe: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", ponto: "#059669" },
  proxima: { label: "Vence em breve", classe: "bg-amber-50 text-amber-700 ring-amber-600/20", ponto: "#d97706" },
  atrasada: { label: "Atrasada", classe: "bg-red-50 text-red-700 ring-red-600/20", ponto: "#dc2626" },
  inativo: { label: "Pausada", classe: "bg-slate-100 text-slate-600 ring-slate-500/20", ponto: "#64748b" },
};

export const UNIDADES: Record<UnidadePeriodicidade, string> = {
  dias: "dia(s)",
  meses: "mês(es)",
  horas: "hora(s) de uso",
};

export function descreverPeriodicidade(valor: number, unidade: UnidadePeriodicidade) {
  return `A cada ${numero(valor)} ${UNIDADES[unidade]}`;
}

export function descreverPrazo(dias: number | null) {
  if (dias === null || dias === undefined) return "—";
  if (dias === 0) return "Vence hoje";
  if (dias < 0) return `${Math.abs(dias)} dia(s) em atraso`;
  return `Em ${dias} dia(s)`;
}

export function iniciais(nome: string | null | undefined) {
  if (!nome) return "?";
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export const STATUS_PNEU: Record<StatusPneu, { label: string; classe: string; cor: string }> = {
  estoque: { label: "Em estoque", classe: "bg-marca-50 text-marca-700 ring-marca-600/20", cor: "#2563eb" },
  em_uso: { label: "Em uso", classe: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", cor: "#059669" },
  recapagem: { label: "Na recapagem", classe: "bg-amber-50 text-amber-700 ring-amber-600/20", cor: "#d97706" },
  descartado: { label: "Descartado", classe: "bg-slate-100 text-slate-500 ring-slate-500/20", cor: "#64748b" },
};

export const CONDICAO_PNEU: Record<CondicaoPneu, string> = {
  novo: "Novo",
  recapado: "Recapado",
  usado: "Usado",
};

export const TIPOS_MOV_PNEU: Record<TipoMovPneu, string> = {
  entrada: "Entrada no estoque",
  instalacao: "Montagem no veículo",
  remocao: "Remoção do veículo",
  recapagem: "Envio para recapagem",
  retorno: "Retorno da recapagem",
  inspecao: "Inspeção / medição de sulco",
  descarte: "Descarte",
};

/** Abaixo disto o pneu merece atenção. O mínimo legal no Brasil é 1,6 mm. */
export const SULCO_ALERTA_MM = 3;
