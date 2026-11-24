"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Download, Search } from "lucide-react";
import {
  TabelaManutencoes,
  type AnexoComUrl,
  type ItemManutencao,
} from "@/components/manutencoes/tabela-manutencoes";
import { Botao } from "@/components/ui";
import { baixarCsv, nomeCsv } from "@/lib/csv";
import { csvManutencoes } from "@/lib/exportar";
import { TIPOS_MANUTENCAO, hoje } from "@/lib/format";
import type { OrdemHistorico } from "@/lib/historico";
import type { PlanoManutencao, TipoManutencao } from "@/lib/types";

export type { AnexoComUrl, ItemManutencao };

/**
 * Histórico de UM ativo (lista pequena): busca, filtro e ordenação na própria
 * tela. O histórico geral (/manutencoes) usa HistoricoManutencoes, que pagina
 * e filtra no banco.
 */
export function ListaManutencoes({
  manutencoes,
  anexos,
  orgId,
  ativos,
  planos,
  mostrarAtivo = false,
  comBusca = true,
}: {
  manutencoes: ItemManutencao[];
  anexos: AnexoComUrl[];
  orgId: string;
  ativos: { id: string; nome: string; identificacao: string | null }[];
  planos: Pick<PlanoManutencao, "id" | "tipo" | "ativo_id">[];
  mostrarAtivo?: boolean;
  comBusca?: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"todos" | TipoManutencao>("todos");
  const [ordem, setOrdem] = useState<{ campo: OrdemHistorico; desc: boolean }>({ campo: "data", desc: true });

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = manutencoes.filter((m) => {
      if (tipo !== "todos" && m.tipo !== tipo) return false;
      if (!t) return true;
      return [m.descricao, m.pecas, m.responsavel, m.empresa, m.ativo_nome, m.nota_fiscal]
        .filter(Boolean)
        .some((c) => String(c).toLowerCase().includes(t));
    });
    const chave = (m: ItemManutencao): string | number =>
      ordem.campo === "valor"
        ? Number(m.valor ?? 0)
        : ordem.campo === "ativo"
          ? (m.ativo_nome ?? "")
          : ordem.campo === "tipo"
            ? m.tipo
            : m.data_manutencao;
    return lista.sort((a, b) => {
      const x = chave(a);
      const y = chave(b);
      const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
      return ordem.desc ? -d : d;
    });
  }, [manutencoes, busca, tipo, ordem]);

  const total = filtradas.reduce((s, m) => s + Number(m.valor ?? 0), 0);

  return (
    <div className="space-y-3">
      {comBusca && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por serviço, peça, responsável ou prestador..."
              className="campo pl-9"
              data-busca
            />
          </div>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className="campo sm:w-48">
            <option value="todos">Todos os tipos</option>
            {(Object.keys(TIPOS_MANUTENCAO) as TipoManutencao[]).map((t) => (
              <option key={t} value={t}>
                {TIPOS_MANUTENCAO[t]}
              </option>
            ))}
          </select>
          <Botao
            variante="secundario"
            disabled={filtradas.length === 0}
            onClick={() => baixarCsv(nomeCsv("manutencoes", hoje()), csvManutencoes(filtradas))}
            title="Baixar a lista filtrada em planilha (CSV)"
          >
            <Download className="h-4 w-4" />
            Exportar
          </Botao>
        </div>
      )}

      {filtradas.length === 0 ? (
        <p className="card px-6 py-10 text-center text-sm text-slate-500">Nenhuma manutenção registrada.</p>
      ) : (
        <TabelaManutencoes
          manutencoes={filtradas}
          anexos={anexos}
          orgId={orgId}
          ativos={ativos}
          planos={planos}
          mostrarAtivo={mostrarAtivo}
          ordem={ordem}
          aoOrdenar={(campo) =>
            setOrdem((o) => (o.campo === campo ? { campo, desc: !o.desc } : { campo, desc: campo === "data" || campo === "valor" }))
          }
          total={{ quantidade: filtradas.length, valor: total }}
        />
      )}
    </div>
  );
}

export const IconeVazioManutencao = ClipboardList;
