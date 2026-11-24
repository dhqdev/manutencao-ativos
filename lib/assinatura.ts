/**
 * Assinatura mensal das empresas (db/sql/74-assinaturas.sql). Tipos e textos
 * puros: valem no servidor e na tela (teste em testes/unidade/pix.test.mjs).
 */

export type EstadoAssinatura = "sem_cobranca" | "isenta" | "em_dia" | "vencendo" | "tolerancia" | "bloqueada";

/** O que `assinatura_situacao()` devolve. */
export type SituacaoAssinatura = {
  estado: EstadoAssinatura;
  vencimento: string | null;
  dias: number | null;
  tolerancia: number;
  bloqueia_em: string | null;
  /** Valor do período do plano (mensal × meses). */
  valor: number;
  valor_mensal?: number;
  /** Plano: de quantos em quantos meses paga (1, 3, 6 ou 12). */
  ciclo_meses?: number;
  /** Dia fixo do mês em que vence (null = segue a data). */
  dia_vencimento?: number | null;
  pendente: boolean;
  /** O superadmin bloqueou à mão (vale por cima do vencimento). */
  bloqueio_manual?: boolean;
  bloqueio_motivo?: string | null;
};

export type SituacaoPagamento = "pendente" | "aprovado" | "recusado";

export type PagamentoAssinatura = {
  id: string;
  org_id: string;
  valor: number;
  comprovante: string;
  nome_arquivo: string;
  observacao: string | null;
  situacao: SituacaoPagamento;
  enviado_em: string;
  avaliado_em: string | null;
  motivo: string | null;
  vencimento_anterior: string | null;
  vencimento_novo: string | null;
  whatsapp_em?: string | null;
  whatsapp_erro?: string | null;
  /** O comprovante já liberou o mês ao chegar (falta o superadmin conferir). */
  liberado_em?: string | null;
};

export const ESTADOS_ASSINATURA: Record<EstadoAssinatura, { label: string; classe: string }> = {
  sem_cobranca: { label: "Sem cobrança", classe: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  isenta: { label: "Isenta", classe: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  em_dia: { label: "Em dia", classe: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  vencendo: { label: "Vence em breve", classe: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  tolerancia: { label: "Vencida", classe: "bg-orange-50 text-orange-700 ring-orange-600/20" },
  bloqueada: { label: "Bloqueada", classe: "bg-red-50 text-red-700 ring-red-600/20" },
};

/**
 * Comprovante sem aprovação (pedido do dono em 24/11/2026): já nasce
 * "aprovado" e vale na hora. "pendente" só quando a empresa está bloqueada à
 * mão; "recusado" quando o superadmin marca como falso.
 */
export const SITUACOES_PAGAMENTO: Record<SituacaoPagamento, { label: string; classe: string }> = {
  // Rótulos do console. Para a empresa a tela de Assinatura usa os de PARA_EMPRESA.
  pendente: { label: "Esperando você", classe: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  aprovado: { label: "Liberado", classe: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  recusado: { label: "Recusado", classe: "bg-red-50 text-red-700 ring-red-600/20" },
};

/** Como a empresa vê cada comprovante na tela de Assinatura. */
export const PARA_EMPRESA: Record<SituacaoPagamento, string> = {
  pendente: "Em análise",
  aprovado: "Pago",
  recusado: "Recusado",
};

/** Planos (db/sql/74-assinaturas.sql, assinaturas.ciclo_meses). O Pix cobra o valor mensal × meses. */
export const CICLOS = { 1: "Mensal", 3: "Trimestral", 6: "Semestral", 12: "Anual" } as const;
export type Ciclo = keyof typeof CICLOS;
export const LISTA_CICLOS = [1, 3, 6, 12] as const satisfies readonly Ciclo[];
export const ehCiclo = (n: unknown): n is Ciclo => (LISTA_CICLOS as readonly unknown[]).includes(n);

/**
 * O primeiro "dia `dia`" a partir de `iso` (dia 31 em fevereiro vira o último
 * dia). Espelha `assinatura_no_dia()` do banco: a tela mostra a data que vai
 * ser gravada quando o superadmin escolhe o dia do vencimento.
 */
export function dataNoDia(iso: string, dia: number | null) {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [a, m, d] = iso.split("-").map(Number);
  const noMes = (ano: number, mes: number) => {
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    return new Date(Date.UTC(ano, mes - 1, Math.min(dia, ultimo))).toISOString().slice(0, 10);
  };
  const atual = noMes(a, m);
  if (Number(atual.slice(8)) >= d) return atual;
  return m === 12 ? noMes(a + 1, 1) : noMes(a, m + 1);
}

/**
 * Data que a tela do superadmin propõe ao escolher "vence todo dia N" (ou uma
 * data com o dia já fixo): o dia N do MESMO mês da data (31 em fevereiro vira
 * o último dia). Se isso já passou, o próximo dia N a partir de hoje — hoje
 * 24/11 com vencimento 24/12 e dia 5 dá 05/12, não 05/01. Vencimento que já
 * estava atrasado fica no mês dele: trocar o dia não dá dias de graça.
 * Sem data, o próximo dia N a partir de hoje.
 */
export function vencimentoNoDia(iso: string, dia: number | null, hojeIso: string) {
  if (!dia) return iso;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return dataNoDia(hojeIso, dia);
  const noMes = dataNoDia(`${iso.slice(0, 7)}-01`, dia);
  if (noMes >= hojeIso || iso < hojeIso) return noMes;
  return dataNoDia(hojeIso, dia);
}

/** "Mensal, vence todo dia 5" / "Trimestral". */
export function descreverPlano(ciclo: number | null | undefined, dia: number | null | undefined) {
  const nome = ehCiclo(ciclo) ? CICLOS[ciclo] : CICLOS[1];
  return dia ? `${nome}, vence todo dia ${dia}` : nome;
}

/** Chaves em sistema_credenciais (seção Assinaturas do console). */
export const CFG = {
  chave: "pix_chave",
  nome: "pix_nome",
  cidade: "pix_cidade",
  valor: "assinatura_valor",
  tolerancia: "assinatura_tolerancia",
  diasTeste: "assinatura_dias_teste",
  whatsapp: "assinatura_whatsapp",
} as const;

export const TOLERANCIA_PADRAO = 3;
export const DIAS_TESTE_PADRAO = 7;

/** Bloqueia a empresa? (o "Entrar como" do superadmin nunca é barrado). */
export function assinaturaBloqueia(s: SituacaoAssinatura | null | undefined) {
  return s?.estado === "bloqueada";
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Frase da faixa do topo; null = nada a avisar. */
export function avisoAssinatura(s: SituacaoAssinatura | null | undefined): string | null {
  if (s?.bloqueio_manual) {
    return `Acesso bloqueado pelo administrador do sistema${s.bloqueio_motivo ? `: ${s.bloqueio_motivo}` : ""}.`;
  }
  if (!s || s.dias === null) return null;
  const analise = s.pendente ? " Seu comprovante está em análise." : "";
  switch (s.estado) {
    case "vencendo":
      return s.dias === 0
        ? `A assinatura vence hoje.${analise}`
        : `A assinatura vence em ${plural(s.dias, "dia", "dias")}.${analise}`;
    case "tolerancia": {
      const faltam = s.tolerancia + s.dias + 1;
      return `A assinatura venceu há ${plural(-s.dias, "dia", "dias")}. O acesso é bloqueado em ${plural(faltam, "dia", "dias")} se o pagamento não for confirmado.${analise}`;
    }
    case "bloqueada":
      return `Acesso bloqueado: a assinatura venceu há ${plural(-s.dias, "dia", "dias")}.${analise}`;
    default:
      return null;
  }
}

/** "R$ 99,90" → 99.9. Aceita vírgula decimal; null = inválido. */
export function lerValorReais(entrada: string | null | undefined) {
  const t = String(entrada ?? "").replace(/[R$\s]/g, "");
  if (!t) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  const v = Number(normal);
  return Number.isFinite(v) && v <= 1_000_000 ? v : null;
}
