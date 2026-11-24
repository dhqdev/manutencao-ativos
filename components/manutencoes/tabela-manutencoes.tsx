"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  ChevronDown,
  ExternalLink,
  FileText,
  Image as ImagemIcone,
  ShieldCheck,
  User,
} from "lucide-react";
import { BotaoExcluir } from "@/components/confirmar";
import { DialogoManutencao } from "@/components/manutencoes/dialogo-manutencao";
import { Badge, cn } from "@/components/ui";
import { excluirManutencao } from "@/lib/actions/manutencoes";
import { TIPOS_MANUTENCAO, dataBR, hoje, moeda, numero } from "@/lib/format";
import type { OrdemHistorico } from "@/lib/historico";
import type { Manutencao, PlanoManutencao, TipoManutencao } from "@/lib/types";

export type AnexoComUrl = {
  id: string;
  manutencao_id: string;
  nome: string;
  tipo_mime: string | null;
  url: string | null;
};

export type ItemManutencao = Manutencao & {
  ativo_nome?: string;
  ativo_identificacao?: string | null;
  categoria_nome?: string;
  categoria_cor?: string;
};

export const COR_TIPO: Record<TipoManutencao, string> = {
  preventiva: "bg-marca-50 text-marca-700 ring-marca-600/20",
  corretiva: "bg-orange-50 text-orange-700 ring-orange-600/20",
  preditiva: "bg-violet-50 text-violet-700 ring-violet-600/20",
  inspecao: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
  melhoria: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

type Ordem = { campo: OrdemHistorico; desc: boolean };

/**
 * Histórico em tabela densa (computador) e em cartões compactos (celular).
 * A ordenação é de quem usa: no histórico geral vai para a URL e o banco
 * ordena; no detalhe do ativo a lista é pequena e ordena na própria tela.
 */
export function TabelaManutencoes({
  manutencoes,
  anexos,
  orgId,
  ativos,
  planos,
  mostrarAtivo = false,
  ordem,
  aoOrdenar,
  total,
}: {
  manutencoes: ItemManutencao[];
  anexos: AnexoComUrl[];
  orgId: string;
  ativos: { id: string; nome: string; identificacao: string | null }[];
  planos: Pick<PlanoManutencao, "id" | "tipo" | "ativo_id">[];
  mostrarAtivo?: boolean;
  ordem: Ordem;
  aoOrdenar: (campo: OrdemHistorico) => void;
  /** Soma e quantidade de todas as linhas do filtro (o rodapé), não só das visíveis. */
  total: { quantidade: number; valor: number };
}) {
  const [expandido, setExpandido] = useState<string | null>(null);

  const porManutencao = useMemo(() => {
    const m = new Map<string, AnexoComUrl[]>();
    for (const a of anexos) {
      const lista = m.get(a.manutencao_id) ?? [];
      lista.push(a);
      m.set(a.manutencao_id, lista);
    }
    return m;
  }, [anexos]);

  const alternar = (id: string) => setExpandido((atual) => (atual === id ? null : id));
  const colunas = mostrarAtivo ? 8 : 7;

  return (
    <div className="card overflow-hidden">
      {/* -------- Computador: tabela -------- */}
      <div className="hidden max-h-[calc(100dvh-13rem)] overflow-auto md:block">
        <table className="tabela-erp w-full text-sm">
          <thead>
            <tr>
              <Cabeca campo="data" ordem={ordem} aoOrdenar={aoOrdenar} className="w-28">
                Data
              </Cabeca>
              {mostrarAtivo && (
                <Cabeca campo="ativo" ordem={ordem} aoOrdenar={aoOrdenar}>
                  Ativo
                </Cabeca>
              )}
              <Cabeca campo="tipo" ordem={ordem} aoOrdenar={aoOrdenar} className="w-32">
                Tipo
              </Cabeca>
              <th>Descrição</th>
              <th className="hidden lg:table-cell">Prestador / responsável</th>
              <th className="hidden xl:table-cell">NF / OS</th>
              <Cabeca campo="valor" ordem={ordem} aoOrdenar={aoOrdenar} className="w-32 text-right" alinhar="direita">
                Valor
              </Cabeca>
              <th className="w-32 text-right">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {manutencoes.map((m) => {
              const anexosDaLinha = porManutencao.get(m.id) ?? [];
              const aberto = expandido === m.id;
              const garantiaAtiva = Boolean(m.garantia_ate && m.garantia_ate >= hoje());
              return (
                <Fragment key={m.id}>
                  <tr className={cn(aberto && "linha-aberta")}>
                    <td className="whitespace-nowrap tabular-nums text-slate-700">{dataBR(m.data_manutencao)}</td>
                    {mostrarAtivo && (
                      <td className="max-w-[14rem]">
                        <Link
                          href={`/ativos/${m.ativo_id}`}
                          className="flex items-center gap-2 truncate font-medium text-slate-800 hover:text-marca-700"
                        >
                          {m.categoria_cor && (
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: m.categoria_cor }} aria-hidden />
                          )}
                          <span className="truncate">{m.ativo_nome}</span>
                        </Link>
                      </td>
                    )}
                    <td>
                      <Badge className={COR_TIPO[m.tipo]}>{TIPOS_MANUTENCAO[m.tipo]}</Badge>
                    </td>
                    <td className="max-w-[22rem]">
                      <button
                        type="button"
                        onClick={() => alternar(m.id)}
                        className="flex w-full min-w-0 items-center gap-1.5 text-left"
                        aria-expanded={aberto}
                      >
                        <span className="truncate text-slate-900">{m.descricao}</span>
                        {garantiaAtiva && (
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Em garantia" />
                        )}
                        {anexosDaLinha.length > 0 && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-slate-400">
                            <ImagemIcone className="h-3.5 w-3.5" />
                            {anexosDaLinha.length}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="hidden max-w-[14rem] truncate text-slate-600 lg:table-cell">
                      {[m.empresa, m.responsavel].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="hidden whitespace-nowrap text-slate-600 xl:table-cell">{m.nota_fiscal || "—"}</td>
                    <td className="whitespace-nowrap text-right font-medium tabular-nums text-slate-900">{moeda(m.valor)}</td>
                    <td>
                      <Acoes
                        m={m}
                        orgId={orgId}
                        ativos={ativos}
                        planos={planos}
                        aberto={aberto}
                        aoAlternar={() => alternar(m.id)}
                      />
                    </td>
                  </tr>
                  {aberto && (
                    <tr className="linha-detalhe">
                      <td colSpan={colunas} className="p-0">
                        <Detalhes m={m} anexos={anexosDaLinha} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={colunas - 2} className="text-slate-600">
                {numero(total.quantidade)} manutenç{total.quantidade === 1 ? "ão" : "ões"}
                {total.quantidade > manutencoes.length && ` · mostrando ${numero(manutencoes.length)}`}
              </td>
              <td className="whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">{moeda(total.valor)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* -------- Celular: cartões compactos -------- */}
      <div className="md:hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-[13px]">
          <span className="text-slate-600">
            {numero(total.quantidade)} manutenç{total.quantidade === 1 ? "ão" : "ões"}
          </span>
          <span className="font-semibold tabular-nums text-slate-900">{moeda(total.valor)}</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {manutencoes.map((m) => {
            const anexosDaLinha = porManutencao.get(m.id) ?? [];
            const aberto = expandido === m.id;
            return (
              <li key={m.id}>
                <div className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="tabular-nums">{dataBR(m.data_manutencao)}</span>
                      <Badge className={COR_TIPO[m.tipo]}>{TIPOS_MANUTENCAO[m.tipo]}</Badge>
                      {anexosDaLinha.length > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <ImagemIcone className="h-3 w-3" />
                          {anexosDaLinha.length}
                        </span>
                      )}
                    </div>
                    <button type="button" onClick={() => alternar(m.id)} className="mt-1 block w-full text-left" aria-expanded={aberto}>
                      <span className="line-clamp-2 text-sm font-medium text-slate-900">{m.descricao}</span>
                    </button>
                    {mostrarAtivo && m.ativo_nome && (
                      <Link href={`/ativos/${m.ativo_id}`} className="mt-0.5 block truncate text-xs font-medium text-marca-600">
                        {m.ativo_nome}
                      </Link>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className="text-sm font-semibold tabular-nums text-slate-900">{moeda(m.valor)}</span>
                    <Acoes m={m} orgId={orgId} ativos={ativos} planos={planos} aberto={aberto} aoAlternar={() => alternar(m.id)} />
                  </div>
                </div>
                {aberto && <Detalhes m={m} anexos={anexosDaLinha} />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Cabeca({
  campo,
  ordem,
  aoOrdenar,
  className,
  alinhar,
  children,
}: {
  campo: OrdemHistorico;
  ordem: Ordem;
  aoOrdenar: (campo: OrdemHistorico) => void;
  className?: string;
  alinhar?: "direita";
  children: React.ReactNode;
}) {
  const atual = ordem.campo === campo;
  const Icone = !atual ? ArrowUpDown : ordem.desc ? ArrowDown : ArrowUp;
  return (
    <th className={className} aria-sort={atual ? (ordem.desc ? "descending" : "ascending") : undefined}>
      <button
        type="button"
        onClick={() => aoOrdenar(campo)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-slate-900",
          alinhar === "direita" && "flex-row-reverse",
          atual && "text-slate-900",
        )}
      >
        {children}
        <Icone className={cn("h-3.5 w-3.5", !atual && "opacity-40")} />
      </button>
    </th>
  );
}

function Acoes({
  m,
  orgId,
  ativos,
  planos,
  aberto,
  aoAlternar,
}: {
  m: ItemManutencao;
  orgId: string;
  ativos: { id: string; nome: string; identificacao: string | null }[];
  planos: Pick<PlanoManutencao, "id" | "tipo" | "ativo_id">[];
  aberto: boolean;
  aoAlternar: () => void;
}) {
  return (
    <div className="flex items-center justify-end">
      <DialogoManutencao orgId={orgId} ativos={ativos} planos={planos} manutencao={m} />
      <BotaoExcluir
        compacto
        acao={excluirManutencao.bind(null, m.id)}
        titulo="Excluir manutenção"
        mensagem="Este registro e seus anexos serão removidos permanentemente."
      />
      <button
        type="button"
        onClick={aoAlternar}
        aria-label={aberto ? "Recolher detalhes" : "Ver detalhes"}
        aria-expanded={aberto}
        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} />
      </button>
    </div>
  );
}

function Detalhes({ m, anexos }: { m: ItemManutencao; anexos: AnexoComUrl[] }) {
  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Detalhe rotulo="Peças / materiais" valor={m.pecas} />
        <Detalhe rotulo="Nota fiscal / OS" valor={m.nota_fiscal} />
        <Detalhe
          rotulo="Garantia"
          valor={m.garantia_dias > 0 ? `${m.garantia_dias} dias — até ${dataBR(m.garantia_ate)}` : "Sem garantia"}
        />
        <Detalhe
          rotulo="Horímetro"
          valor={m.horimetro !== null && m.horimetro !== undefined ? `${numero(m.horimetro)} h/km` : null}
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 sm:col-span-2">
          {m.responsavel && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {m.responsavel}
            </span>
          )}
          {m.empresa && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {m.empresa}
            </span>
          )}
        </div>
        <Detalhe rotulo="Observações" valor={m.observacoes} className="sm:col-span-2" />
      </dl>

      {anexos.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Anexos</p>
          <div className="flex flex-wrap gap-2">
            {anexos.map((a) => {
              const ehImagem = a.tipo_mime?.startsWith("image/");
              return (
                <a
                  key={a.id}
                  href={a.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="group/anexo relative overflow-hidden rounded-lg border border-slate-200 bg-superficie transition-shadow hover:shadow-md"
                >
                  {ehImagem && a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt={a.nome} className="h-20 w-28 object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-20 w-28 flex-col items-center justify-center gap-1 px-2 text-center">
                      <FileText className="h-6 w-6 text-slate-400" />
                      <span className="line-clamp-2 text-[11px] text-slate-600">{a.nome}</span>
                    </span>
                  )}
                  <span className="absolute right-1 top-1 rounded bg-black/60 p-1 opacity-0 transition-opacity group-hover/anexo:opacity-100">
                    <ExternalLink className="h-3 w-3 text-white" />
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Detalhe({ rotulo, valor, className }: { rotulo: string; valor: string | null | undefined; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{valor || "—"}</dd>
    </div>
  );
}
