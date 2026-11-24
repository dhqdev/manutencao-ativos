"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Download, FilterX, LoaderCircle, Search } from "lucide-react";
import {
  TabelaManutencoes,
  type AnexoComUrl,
  type ItemManutencao,
} from "@/components/manutencoes/tabela-manutencoes";
import { cn } from "@/components/ui";
import { TIPOS_MANUTENCAO, numero } from "@/lib/format";
import { POR_PAGINA, paraQuery, temFiltro, type FiltrosHistorico, type OrdemHistorico } from "@/lib/historico";
import type { PlanoManutencao, TipoManutencao } from "@/lib/types";

type Opcao = { id: string; nome: string; identificacao?: string | null };

/**
 * Histórico geral de manutenções. Filtros, ordem e página ficam na URL e o
 * banco faz o trabalho (historico_manutencoes): a tela recebe só a página
 * atual, com o total e a soma de tudo que o filtro pegou.
 */
export function HistoricoManutencoes({
  filtros,
  manutencoes,
  total,
  valorTotal,
  simplificado,
  anexos,
  orgId,
  ativos,
  categorias,
  planos,
}: {
  filtros: FiltrosHistorico;
  manutencoes: ItemManutencao[];
  total: number;
  valorTotal: number;
  simplificado: boolean;
  anexos: AnexoComUrl[];
  orgId: string;
  ativos: Opcao[];
  categorias: Opcao[];
  planos: Pick<PlanoManutencao, "id" | "tipo" | "ativo_id">[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [carregando, iniciar] = useTransition();
  const [busca, setBusca] = useState(filtros.busca);
  const ultimaBusca = useRef(filtros.busca);

  // Voltar/avançar no navegador muda a URL: a caixa de busca acompanha.
  useEffect(() => {
    if (filtros.busca !== ultimaBusca.current) {
      ultimaBusca.current = filtros.busca;
      setBusca(filtros.busca);
    }
  }, [filtros.busca]);

  function ir(novo: Partial<FiltrosHistorico>) {
    const f = { ...filtros, pagina: 1, ...novo };
    const q = paraQuery(f, { filtro: "historico" });
    iniciar(() => router.replace(`${pathname}?${q}`, { scroll: false }));
  }

  // Busca com espera curta: não vai ao banco a cada letra.
  useEffect(() => {
    if (busca.trim() === filtros.busca) return;
    const t = setTimeout(() => {
      ultimaBusca.current = busca.trim();
      ir({ busca: busca.trim() });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(filtros.pagina, paginas);
  const algumFiltro = temFiltro(filtros);
  const exportar = `/api/exportar/manutencoes?${paraQuery({ ...filtros, pagina: 1 })}`;

  function ordenar(campo: OrdemHistorico) {
    ir(
      filtros.ordem === campo
        ? { ordem: campo, desc: !filtros.desc }
        : { ordem: campo, desc: campo === "data" || campo === "valor" },
    );
  }

  return (
    <div className="space-y-3">
      <div id="filtros" className="card scroll-mt-20 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,2fr)_repeat(3,minmax(8rem,1fr))_repeat(2,9.5rem)]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={simplificado ? "Busca indisponível até atualizar o banco" : "Buscar serviço, peça, prestador, NF..."}
              disabled={simplificado}
              className="campo campo-compacto pl-9"
              aria-label="Buscar no histórico"
              data-busca
            />
          </div>
          <select
            value={filtros.tipo ?? ""}
            onChange={(e) => ir({ tipo: (e.target.value || null) as TipoManutencao | null })}
            className="campo campo-compacto"
            aria-label="Tipo"
          >
            <option value="">Todos os tipos</option>
            {(Object.keys(TIPOS_MANUTENCAO) as TipoManutencao[]).map((t) => (
              <option key={t} value={t}>
                {TIPOS_MANUTENCAO[t]}
              </option>
            ))}
          </select>
          <select
            value={filtros.categoria ?? ""}
            onChange={(e) => ir({ categoria: e.target.value || null })}
            className="campo campo-compacto"
            aria-label="Categoria"
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <select
            value={filtros.ativo ?? ""}
            onChange={(e) => ir({ ativo: e.target.value || null })}
            className="campo campo-compacto"
            aria-label="Ativo"
          >
            <option value="">Todos os ativos</option>
            {ativos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
                {a.identificacao ? ` · ${a.identificacao}` : ""}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filtros.de ?? ""}
            onChange={(e) => ir({ de: e.target.value || null })}
            className="campo campo-compacto"
            aria-label="Data inicial"
            title="Data inicial"
          />
          <input
            type="date"
            value={filtros.ate ?? ""}
            onChange={(e) => ir({ ate: e.target.value || null })}
            className="campo campo-compacto"
            aria-label="Data final"
            title="Data final"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <div className="flex items-center gap-2 text-slate-500">
            {carregando && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            <span>
              {numero(total)} resultado{total === 1 ? "" : "s"}
              {algumFiltro ? " com os filtros" : ""}
            </span>
            {algumFiltro && (
              <button
                type="button"
                onClick={() => {
                  ultimaBusca.current = "";
                  setBusca("");
                  ir({ busca: "", tipo: null, ativo: null, categoria: null, de: null, ate: null });
                }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-marca-600 hover:bg-marca-50"
              >
                <FilterX className="h-3.5 w-3.5" />
                Limpar filtros
              </button>
            )}
          </div>
          <a
            href={exportar}
            download
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-superficie px-3 font-medium text-slate-700 hover:bg-slate-50",
              total === 0 && "pointer-events-none opacity-50",
            )}
            title="Baixar todas as linhas do filtro em planilha (CSV, abre no Excel)"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </a>
        </div>
      </div>

      {manutencoes.length === 0 ? (
        <p className="card px-6 py-10 text-center text-sm text-slate-500">
          {algumFiltro ? "Nenhuma manutenção encontrada com esses filtros." : "Nenhuma manutenção registrada."}
        </p>
      ) : (
        <div className={cn("transition-opacity", carregando && "opacity-60")}>
          <TabelaManutencoes
            manutencoes={manutencoes}
            anexos={anexos}
            orgId={orgId}
            ativos={ativos.map((a) => ({ id: a.id, nome: a.nome, identificacao: a.identificacao ?? null }))}
            planos={planos}
            mostrarAtivo
            ordem={{ campo: filtros.ordem, desc: filtros.desc }}
            aoOrdenar={ordenar}
            total={{ quantidade: total, valor: valorTotal }}
          />
        </div>
      )}

      {paginas > 1 && (
        <nav className="flex items-center justify-between gap-2 text-[13px]" aria-label="Páginas do histórico">
          <span className="text-slate-500">
            Página {numero(pagina)} de {numero(paginas)}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={pagina <= 1 || carregando}
              onClick={() => ir({ pagina: pagina - 1 })}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-superficie px-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>
            <button
              type="button"
              disabled={pagina >= paginas || carregando}
              onClick={() => ir({ pagina: pagina + 1 })}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-superficie px-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
