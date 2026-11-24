"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  CalendarDays,
  Download,
  Gauge,
  Kanban,
  List,
  Pause,
  Play,
  Repeat,
  Search,
  User,
  Wallet,
} from "lucide-react";
import { BotaoExcluir } from "@/components/confirmar";
import { DialogoPlano } from "@/components/planos/dialogo-plano";
import { DialogoManutencao } from "@/components/manutencoes/dialogo-manutencao";
import { Badge, Botao, cn } from "@/components/ui";
import { alternarPlano, excluirPlano } from "@/lib/actions/planos";
import {
  SITUACAO_PLANO,
  dataBR,
  descreverPeriodicidade,
  descreverPrazo,
  hoje,
  moeda,
  numero,
} from "@/lib/format";
import { baixarCsv, nomeCsv } from "@/lib/csv";
import { csvPlanos } from "@/lib/exportar";
import { salvarVistaPlanos, type VistaPlanos } from "@/lib/vista-planos";
import type { PlanoStatus, SituacaoPlano } from "@/lib/types";

export function ListaPlanos({
  planos,
  orgId,
  ativos,
  mostrarAtivo = false,
  comFiltros = true,
  filtroInicial = "todos",
  vistaInicial = "quadro",
}: {
  planos: PlanoStatus[];
  orgId: string;
  ativos: { id: string; nome: string; identificacao: string | null }[];
  mostrarAtivo?: boolean;
  comFiltros?: boolean;
  filtroInicial?: "todos" | SituacaoPlano | "alertas";
  /** Quadro (kanban por situação) ou lista; vem do cookie (lib/vista-planos.ts). */
  vistaInicial?: VistaPlanos;
}) {
  const [busca, setBusca] = useState("");
  const [vista, setVista] = useState<VistaPlanos>(vistaInicial);
  const [situacao, setSituacao] = useState<"todos" | SituacaoPlano | "alertas">(filtroInicial);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const ordem: Record<SituacaoPlano, number> = { atrasada: 0, proxima: 1, em_dia: 2, inativo: 3 };

    return planos
      .filter((p) => {
        if (situacao === "alertas" && p.situacao !== "atrasada" && p.situacao !== "proxima") return false;
        if (situacao !== "todos" && situacao !== "alertas" && p.situacao !== situacao) return false;
        if (!t) return true;
        return [p.tipo, p.ativo_nome, p.responsavel, p.categoria_nome]
          .filter(Boolean)
          .some((c) => String(c).toLowerCase().includes(t));
      })
      .sort((a, b) => {
        const d = ordem[a.situacao] - ordem[b.situacao];
        if (d !== 0) return d;
        return (a.proxima_data ?? "9999").localeCompare(b.proxima_data ?? "9999");
      });
  }, [planos, busca, situacao]);

  return (
    <div className="space-y-4">
      {comFiltros && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por tipo, ativo ou responsável..."
              className="campo pl-9"
              data-busca
            />
          </div>
          <select
            value={situacao}
            onChange={(e) => setSituacao(e.target.value as typeof situacao)}
            className="campo sm:w-56"
          >
            <option value="todos">Todas as situações</option>
            <option value="alertas">Somente alertas</option>
            <option value="atrasada">Atrasadas</option>
            <option value="proxima">Vencendo em breve</option>
            <option value="em_dia">Em dia</option>
            <option value="inativo">Pausadas</option>
          </select>
          <div className="flex gap-2">
          <div className="inline-flex shrink-0 rounded-lg border border-slate-300 bg-superficie p-0.5" role="radiogroup" aria-label="Vista">
            {(
              [
                { id: "quadro", rotulo: "Quadro", Icone: Kanban },
                { id: "lista", rotulo: "Lista", Icone: List },
              ] as const
            ).map(({ id, rotulo, Icone }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={vista === id}
                onClick={() => {
                  setVista(id);
                  salvarVistaPlanos(id);
                }}
                title={id === "quadro" ? "Cards por situação" : "Tabela"}
                className={cn(
                  "inline-flex h-[2.125rem] items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                  vista === id ? "bg-slate-900 text-slate-50" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <Icone className="h-4 w-4" />
                {rotulo}
              </button>
            ))}
          </div>
          <Botao
            className="flex-1 justify-center sm:flex-none"
            variante="secundario"
            disabled={filtrados.length === 0}
            onClick={() => baixarCsv(nomeCsv("preventivas", hoje()), csvPlanos(filtrados))}
            title="Baixar a lista filtrada em planilha (CSV)"
          >
            <Download className="h-4 w-4" />
            Exportar
          </Botao>
          </div>
        </div>
      )}

      {filtrados.length === 0 ? (
        <p className="card px-6 py-10 text-center text-sm text-slate-500">
          Nenhuma manutenção periódica encontrada.
        </p>
      ) : vista === "quadro" ? (
        <QuadroPlanos planos={filtrados} orgId={orgId} ativos={ativos} mostrarAtivo={mostrarAtivo} />
      ) : (
        <>
          <TabelaPlanos planos={filtrados} orgId={orgId} ativos={ativos} mostrarAtivo={mostrarAtivo} />
          <ul className="grid gap-2.5 md:hidden">
            {filtrados.map((p) => (
              <CartaoPlano key={p.id} plano={p} orgId={orgId} ativos={ativos} mostrarAtivo={mostrarAtivo} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function CartaoPlano({
  plano: p,
  orgId,
  ativos,
  mostrarAtivo,
}: {
  plano: PlanoStatus;
  orgId: string;
  ativos: { id: string; nome: string; identificacao: string | null }[];
  mostrarAtivo: boolean;
}) {
  const [alternando, iniciar] = useTransition();
  const s = SITUACAO_PLANO[p.situacao];
  const porHoras = p.periodicidade_unidade === "horas";

  const borda =
    p.situacao === "atrasada"
      ? "border-l-4 border-l-red-500"
      : p.situacao === "proxima"
        ? "border-l-4 border-l-amber-500"
        : p.situacao === "inativo"
          ? "border-l-4 border-l-slate-300"
          : "border-l-4 border-l-emerald-500";

  return (
    <li className={cn("card p-3.5 sm:p-4", borda, p.situacao === "inativo" && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={s.classe}>{s.label}</Badge>
            {mostrarAtivo && (
              <Link
                href={`/ativos/${p.ativo_id}`}
                className="truncate text-xs font-medium text-marca-600 hover:text-marca-700"
              >
                {p.ativo_nome}
              </Link>
            )}
          </div>

          <h3 className="mt-1.5 font-semibold text-slate-900">{p.tipo}</h3>

          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
            <Repeat className="h-3.5 w-3.5" />
            {descreverPeriodicidade(p.periodicidade_valor, p.periodicidade_unidade)}
          </p>
        </div>

        <div className="flex shrink-0 items-center">
          <button
            type="button"
            disabled={alternando}
            onClick={() => iniciar(async () => void (await alternarPlano(p.id, !p.ativo)))}
            title={p.ativo ? "Pausar plano" : "Reativar plano"}
            aria-label={p.ativo ? "Pausar plano" : "Reativar plano"}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            {p.ativo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <DialogoPlano ativos={ativos} plano={p} />
          <BotaoExcluir
            compacto
            acao={excluirPlano.bind(null, p.id)}
            titulo="Excluir plano preventivo"
            mensagem={`O plano "${p.tipo}" deixará de gerar alertas. O histórico de manutenções não é afetado.`}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:mt-4">
        <div>
          <p className="text-xs text-slate-500">
            {porHoras ? "Próxima no horímetro" : "Próxima manutenção"}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 font-medium text-slate-900">
            {porHoras ? <Gauge className="h-4 w-4 text-slate-400" /> : <CalendarDays className="h-4 w-4 text-slate-400" />}
            {porHoras ? `${numero(p.proximo_horimetro)} h/km` : dataBR(p.proxima_data)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">{porHoras ? "Faltam" : "Prazo"}</p>
          <p
            className={cn(
              "mt-0.5 font-medium",
              p.situacao === "atrasada"
                ? "text-red-600"
                : p.situacao === "proxima"
                  ? "text-amber-600"
                  : "text-slate-900",
            )}
          >
            {porHoras
              ? p.horas_restantes !== null && p.horas_restantes !== undefined
                ? `${numero(p.horas_restantes)} h`
                : "—"
              : descreverPrazo(p.dias_restantes)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {p.responsavel && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {p.responsavel}
            </span>
          )}
          {p.custo_estimado ? (
            <span className="inline-flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5" />
              {moeda(p.custo_estimado)} estimado
            </span>
          ) : null}
          {p.ultima_data && <span>Última: {dataBR(p.ultima_data)}</span>}
        </div>

        <DialogoManutencao
          orgId={orgId}
          ativos={ativos}
          ativoPadrao={p.ativo_id}
          planos={[{ id: p.id, tipo: p.tipo, ativo_id: p.ativo_id }]}
          planoPadrao={p.id}
          rotulo="Dar baixa"
          variante="secundario"
          tamanho="sm"
        />
      </div>
    </li>
  );
}

const COLUNAS: { id: SituacaoPlano; titulo: string; vazio: string }[] = [
  { id: "atrasada", titulo: "Atrasadas", vazio: "Nada atrasado." },
  { id: "proxima", titulo: "Vencendo em breve", vazio: "Nada vencendo agora." },
  { id: "em_dia", titulo: "Em dia", vazio: "Nenhuma em dia." },
  { id: "inativo", titulo: "Pausadas", vazio: "Nenhuma pausada." },
];

/**
 * Quadro estilo kanban: uma coluna por situação, com os cards. No computador
 * as colunas ficam lado a lado (e o quadro rola para o lado se não couberem);
 * no celular ficam empilhadas. Pausadas só aparece quando existe alguma, e uma
 * coluna que o filtro de situação esconde não aparece.
 */
function QuadroPlanos({
  planos,
  orgId,
  ativos,
  mostrarAtivo,
}: {
  planos: PlanoStatus[];
  orgId: string;
  ativos: { id: string; nome: string; identificacao: string | null }[];
  mostrarAtivo: boolean;
}) {
  const porSituacao = new Map<SituacaoPlano, PlanoStatus[]>();
  for (const p of planos) porSituacao.set(p.situacao, [...(porSituacao.get(p.situacao) ?? []), p]);

  // Com filtro de uma situação só, mostra só aquela coluna (larga).
  const situacoes = new Set(planos.map((p) => p.situacao));
  const unica = situacoes.size === 1 ? [...situacoes][0] : null;
  const colunas = COLUNAS.filter((c) =>
    unica ? c.id === unica : c.id !== "inativo" || porSituacao.has("inativo"),
  );

  return (
    // Colunas dividem a largura; sem espaço para todas (tablet, menu aberto),
    // o quadro rola para o lado. No celular, uma embaixo da outra (Atrasadas
    // primeiro), com largura total: arrastar escondia cards de quem não sabia.
    <div className="flex flex-col gap-3 sm:flex-row sm:snap-x sm:snap-mandatory sm:items-start sm:overflow-x-auto sm:pb-2 sm:[scrollbar-width:thin] lg:snap-none">
      {colunas.map((c) => {
        const itens = porSituacao.get(c.id) ?? [];
        const s = SITUACAO_PLANO[c.id];
        return (
          <section
            key={c.id}
            aria-label={c.titulo}
            className={cn(
              "flex w-full flex-col rounded-xl border border-slate-200 bg-slate-100/60 sm:w-[20rem] sm:shrink-0 sm:snap-start lg:w-auto lg:min-w-[19rem] lg:flex-1 lg:shrink",
              unica && "sm:w-full",
            )}
          >
            <header className="flex items-center gap-2 px-3 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.ponto }} aria-hidden />
              <h3 className="text-[13px] font-semibold text-slate-800">{c.titulo}</h3>
              <span className="ml-auto rounded-full bg-superficie px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                {itens.length}
              </span>
            </header>
            {itens.length === 0 ? (
              <p className="mx-2 mb-2 rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-[13px] text-slate-500">
                {c.vazio}
              </p>
            ) : (
              <ul className={cn("grid gap-2.5 px-2 pb-2", unica && "md:grid-cols-2 xl:grid-cols-3")}>
                {itens.map((p) => (
                  <CartaoPlano key={p.id} plano={p} orgId={orgId} ativos={ativos} mostrarAtivo={mostrarAtivo} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Computador: uma linha por plano, colunas fixas, ações no fim. */
function TabelaPlanos({
  planos,
  orgId,
  ativos,
  mostrarAtivo,
}: {
  planos: PlanoStatus[];
  orgId: string;
  ativos: { id: string; nome: string; identificacao: string | null }[];
  mostrarAtivo: boolean;
}) {
  return (
    <div className="card hidden max-h-[calc(100dvh-13rem)] overflow-auto md:block">
      <table className="tabela-erp w-full text-sm">
        <thead>
          <tr>
            <th className="w-32">Situação</th>
            <th>Plano</th>
            {mostrarAtivo && <th>Ativo</th>}
            <th className="hidden lg:table-cell">Periodicidade</th>
            <th className="w-32">Próxima</th>
            <th className="w-32">Prazo</th>
            <th className="hidden xl:table-cell">Responsável</th>
            <th className="w-56 text-right">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {planos.map((p) => (
            <LinhaPlano key={p.id} p={p} orgId={orgId} ativos={ativos} mostrarAtivo={mostrarAtivo} />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={mostrarAtivo ? 8 : 7} className="text-slate-600">
              {planos.length} plano{planos.length === 1 ? "" : "s"}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function LinhaPlano({
  p,
  orgId,
  ativos,
  mostrarAtivo,
}: {
  p: PlanoStatus;
  orgId: string;
  ativos: { id: string; nome: string; identificacao: string | null }[];
  mostrarAtivo: boolean;
}) {
  const [alternando, iniciar] = useTransition();
  const s = SITUACAO_PLANO[p.situacao];
  const porHoras = p.periodicidade_unidade === "horas";
  return (
    <tr className={cn(p.situacao === "inativo" && "opacity-60")}>
      <td>
        <Badge className={s.classe}>{s.label}</Badge>
      </td>
      <td className="max-w-[16rem] truncate font-medium text-slate-900">{p.tipo}</td>
      {mostrarAtivo && (
        <td className="max-w-[14rem] truncate">
          <Link href={`/ativos/${p.ativo_id}`} className="text-slate-700 hover:text-marca-700">
            {p.ativo_nome}
          </Link>
        </td>
      )}
      <td className="hidden whitespace-nowrap text-slate-600 lg:table-cell">
        {descreverPeriodicidade(p.periodicidade_valor, p.periodicidade_unidade)}
      </td>
      <td className="whitespace-nowrap tabular-nums text-slate-700">
        {porHoras ? `${numero(p.proximo_horimetro)} h/km` : dataBR(p.proxima_data)}
      </td>
      <td
        className={cn(
          "whitespace-nowrap font-medium",
          p.situacao === "atrasada" ? "text-red-600" : p.situacao === "proxima" ? "text-amber-600" : "text-slate-600",
        )}
      >
        {porHoras
          ? p.horas_restantes !== null && p.horas_restantes !== undefined
            ? `${numero(p.horas_restantes)} h`
            : "—"
          : descreverPrazo(p.dias_restantes)}
      </td>
      <td className="hidden max-w-[10rem] truncate text-slate-600 xl:table-cell">{p.responsavel || "—"}</td>
      <td>
        <div className="flex items-center justify-end gap-0.5">
          <DialogoManutencao
            orgId={orgId}
            ativos={ativos}
            ativoPadrao={p.ativo_id}
            planos={[{ id: p.id, tipo: p.tipo, ativo_id: p.ativo_id }]}
            planoPadrao={p.id}
            rotulo="Dar baixa"
            variante="secundario"
            tamanho="sm"
          />
          <button
            type="button"
            disabled={alternando}
            onClick={() => iniciar(async () => void (await alternarPlano(p.id, !p.ativo)))}
            title={p.ativo ? "Pausar plano" : "Reativar plano"}
            aria-label={p.ativo ? "Pausar plano" : "Reativar plano"}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            {p.ativo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <DialogoPlano ativos={ativos} plano={p} />
          <BotaoExcluir
            compacto
            acao={excluirPlano.bind(null, p.id)}
            titulo="Excluir plano preventivo"
            mensagem={`O plano "${p.tipo}" deixará de gerar alertas. O histórico de manutenções não é afetado.`}
          />
        </div>
      </td>
    </tr>
  );
}
