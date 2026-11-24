import { SULCO_ALERTA_MM, dataBR, moeda, numero } from "@/lib/format";
import type { ManutencaoCompleta, MovPneuRelatorio, PlanoStatus, PneusDoRelatorio } from "@/lib/types";

// Cálculos e textos do relatório, sem o jsPDF: a tela importa daqui e só baixa
// a biblioteca de PDF (cerca de 150 KB) quando a pessoa pede o arquivo.


export type DadosRelatorio = {
  empresa: string;
  periodoDe: string;
  periodoAte: string;
  filtros: string[];
  manutencoes: ManutencaoCompleta[];
  proximas: PlanoStatus[];
  pneus?: PneusDoRelatorio | null;
};

export type TotaisPneus = {
  compras: number;
  recapagens: number;
  total: number;
  porTipo: { tipo: MovPneuRelatorio["tipo"]; quantidade: number }[];
};

/** Gasto com pneus no período: compras (entradas) e recapagens. */
export function calcularTotaisPneus(movs: MovPneuRelatorio[]): TotaisPneus {
  let compras = 0;
  let recapagens = 0;
  const contagem = new Map<MovPneuRelatorio["tipo"], number>();

  for (const m of movs) {
    const valor = Number(m.valor ?? 0);
    if (m.tipo === "entrada") compras += valor;
    else if (m.tipo === "recapagem" || m.tipo === "retorno") recapagens += valor;
    contagem.set(m.tipo, (contagem.get(m.tipo) ?? 0) + 1);
  }

  return {
    compras,
    recapagens,
    total: compras + recapagens,
    porTipo: [...contagem.entries()].map(([tipo, quantidade]) => ({ tipo, quantidade })),
  };
}

/** Pneus têm algo para mostrar no relatório? */
export function temPneus(p: PneusDoRelatorio | null | undefined): p is PneusDoRelatorio {
  return Boolean(p && (p.movimentacoes.length || p.emEstoque || p.emUso || p.recapagem || p.sulcoBaixo.length));
}

export type Totais = {
  custoTotal: number;
  quantidade: number;
  ticketMedio: number;
  porCategoria: { nome: string; valor: number; quantidade: number }[];
  porAtivo: { nome: string; identificacao: string | null; valor: number; quantidade: number }[];
};

export function calcularTotais(manutencoes: ManutencaoCompleta[]): Totais {
  const custoTotal = manutencoes.reduce((s, m) => s + Number(m.valor ?? 0), 0);

  const catMap = new Map<string, { nome: string; valor: number; quantidade: number }>();
  const ativoMap = new Map<
    string,
    { nome: string; identificacao: string | null; valor: number; quantidade: number }
  >();

  for (const m of manutencoes) {
    const c = catMap.get(m.categoria_id) ?? { nome: m.categoria_nome, valor: 0, quantidade: 0 };
    c.valor += Number(m.valor ?? 0);
    c.quantidade += 1;
    catMap.set(m.categoria_id, c);

    const a = ativoMap.get(m.ativo_id) ?? {
      nome: m.ativo_nome,
      identificacao: m.ativo_identificacao,
      valor: 0,
      quantidade: 0,
    };
    a.valor += Number(m.valor ?? 0);
    a.quantidade += 1;
    ativoMap.set(m.ativo_id, a);
  }

  return {
    custoTotal,
    quantidade: manutencoes.length,
    ticketMedio: manutencoes.length ? custoTotal / manutencoes.length : 0,
    porCategoria: [...catMap.values()].sort((x, y) => y.valor - x.valor),
    porAtivo: [...ativoMap.values()].sort((x, y) => y.valor - x.valor),
  };
}

/** Resumo em texto, usado na mensagem do WhatsApp. */
export function resumoTexto(dados: DadosRelatorio): string {
  const t = calcularTotais(dados.manutencoes);

  const linhas = [
    `*Relatório de Manutenções — ${dados.empresa}*`,
    `Período: ${dataBR(dados.periodoDe)} a ${dataBR(dados.periodoAte)}`,
    "",
    `• Manutenções realizadas: ${numero(t.quantidade)}`,
    `• Custo total: ${moeda(t.custoTotal)}`,
    `• Custo médio por serviço: ${moeda(t.ticketMedio)}`,
  ];

  if (t.porCategoria.length) {
    linhas.push("", "*Custos por categoria*");
    for (const c of t.porCategoria.slice(0, 8)) {
      linhas.push(`• ${c.nome}: ${moeda(c.valor)} (${c.quantidade}x)`);
    }
  }

  if (t.porAtivo.length) {
    linhas.push("", "*Maiores custos por ativo*");
    for (const a of t.porAtivo.slice(0, 5)) {
      linhas.push(`• ${a.nome}: ${moeda(a.valor)} (${a.quantidade}x)`);
    }
  }

  const atrasadas = dados.proximas.filter((p) => p.situacao === "atrasada");
  const emBreve = dados.proximas.filter((p) => p.situacao === "proxima");

  if (dados.proximas.length) {
    linhas.push("", "*Próximas manutenções*");
    if (atrasadas.length) linhas.push(`⚠️ ${atrasadas.length} atrasada(s)`);
    if (emBreve.length) linhas.push(`🔔 ${emBreve.length} vencendo em breve`);
    for (const p of dados.proximas.slice(0, 6)) {
      const quando =
        p.periodicidade_unidade === "horas"
          ? `${numero(p.proximo_horimetro)} h/km`
          : dataBR(p.proxima_data);
      linhas.push(`• ${p.ativo_nome} — ${p.tipo}: ${quando}`);
    }
  }

  if (temPneus(dados.pneus)) {
    const tp = calcularTotaisPneus(dados.pneus.movimentacoes);
    linhas.push("", "*Pneus*");
    if (tp.total) linhas.push(`• Gasto no período: ${moeda(tp.total)}`);
    linhas.push(
      `• Em estoque: ${dados.pneus.emEstoque} · em uso: ${dados.pneus.emUso} · na recapagem: ${dados.pneus.recapagem}`,
    );
    if (dados.pneus.sulcoBaixo.length) {
      linhas.push(`⚠️ ${dados.pneus.sulcoBaixo.length} com sulco baixo (até ${SULCO_ALERTA_MM} mm)`);
    }
  }

  return linhas.join("\n");
}

export function nomeArquivo(dados: DadosRelatorio) {
  const limpo = dados.empresa
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `relatorio-manutencoes-${limpo || "empresa"}-${dados.periodoDe}-a-${dados.periodoAte}.pdf`;
}
