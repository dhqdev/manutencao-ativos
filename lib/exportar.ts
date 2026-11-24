import { paraCsv } from "@/lib/csv";
import { SITUACAO_PLANO, TIPOS_MANUTENCAO, dataBR, descreverPeriodicidade } from "@/lib/format";
import type { Manutencao, PlanoStatus } from "@/lib/types";

/** Colunas das planilhas exportadas pelas listas (a tela e /api/exportar usam as mesmas). */

type LinhaManutencao = Manutencao & { ativo_nome?: string | null; categoria_nome?: string | null };

export function csvManutencoes(lista: LinhaManutencao[]): string {
  return paraCsv(
    [
      "Data",
      "Ativo",
      "Categoria",
      "Tipo",
      "Descrição",
      "Peças / materiais",
      "Responsável",
      "Prestador",
      "Nota fiscal / OS",
      "Horímetro",
      "Garantia até",
      "Valor (R$)",
      "Observações",
    ],
    lista.map((m) => [
      dataBR(m.data_manutencao),
      m.ativo_nome ?? "",
      m.categoria_nome ?? "",
      TIPOS_MANUTENCAO[m.tipo] ?? m.tipo,
      m.descricao,
      m.pecas,
      m.responsavel,
      m.empresa,
      m.nota_fiscal,
      m.horimetro === null || m.horimetro === undefined ? null : Number(m.horimetro),
      m.garantia_ate ? dataBR(m.garantia_ate) : null,
      Number(m.valor ?? 0),
      m.observacoes,
    ]),
  );
}

export function csvPlanos(lista: PlanoStatus[]): string {
  return paraCsv(
    ["Situação", "Plano", "Ativo", "Categoria", "Periodicidade", "Próxima data", "Próximo horímetro", "Última", "Responsável", "Custo estimado (R$)"],
    lista.map((p) => [
      SITUACAO_PLANO[p.situacao]?.label ?? p.situacao,
      p.tipo,
      p.ativo_nome,
      p.categoria_nome,
      descreverPeriodicidade(p.periodicidade_valor, p.periodicidade_unidade),
      p.proxima_data ? dataBR(p.proxima_data) : null,
      p.proximo_horimetro === null || p.proximo_horimetro === undefined ? null : Number(p.proximo_horimetro),
      p.ultima_data ? dataBR(p.ultima_data) : null,
      p.responsavel,
      p.custo_estimado ? Number(p.custo_estimado) : null,
    ]),
  );
}
