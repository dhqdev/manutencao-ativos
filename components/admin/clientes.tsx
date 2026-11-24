"use client";

import { useMemo, useState } from "react";
import { Building2, Database, HardDrive, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui";
import type { EmpresaAssinatura } from "@/lib/admin-console";
import { ESTADOS_ASSINATURA } from "@/lib/assinatura";
import { dataBR, dataHoraBR } from "@/lib/format";
import { Busca, Indicador, normalizar } from "./comum";
import { tamanho, tempoRelativo, type EmpresaAdmin, type UsoEmpresa } from "./tipos";

const ORDENS = { uso: "Mais espaço", acesso: "Último acesso", nome: "Nome", ativos: "Mais ativos" } as const;
type Ordem = keyof typeof ORDENS;

const COLUNAS = "lg:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_8rem_minmax(0,1.5fr)_8.5rem_8rem]";

/**
 * Clientes (empresas) com o espaço que cada um ocupa — banco e arquivos —, o
 * último acesso da equipe, o WhatsApp e a situação da assinatura.
 */
export function UsoClientes({
  empresas,
  uso,
  assinaturas,
  agora,
}: {
  empresas: EmpresaAdmin[];
  uso: Record<string, UsoEmpresa>;
  assinaturas: Record<string, EmpresaAssinatura>;
  /** Instante do servidor ("há 2 h" igual no servidor e no navegador). */
  agora: number;
}) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("uso");

  const total = (id: string) => (uso[id]?.bytesBanco ?? 0) + (uso[id]?.bytesArquivos ?? 0);
  const somaGeral = empresas.reduce((s, e) => s + total(e.id), 0);
  const somaArquivos = empresas.reduce((s, e) => s + (uso[e.id]?.bytesArquivos ?? 0), 0);
  const qtdArquivos = empresas.reduce((s, e) => s + (uso[e.id]?.arquivos ?? 0), 0);
  const somaBanco = empresas.reduce((s, e) => s + (uso[e.id]?.bytesBanco ?? 0), 0);
  const conectados = empresas.filter((e) => e.whatsapp === "conectado").length;
  const pessoas = new Set(empresas.flatMap((e) => e.membros.map((m) => m.user_id))).size;
  const maior = Math.max(1, ...empresas.map((e) => total(e.id)));

  const lista = useMemo(() => {
    const q = normalizar(busca.trim());
    return empresas
      .filter((e) => !q || normalizar([e.nome, e.cnpj, ...e.membros.map((m) => `${m.nome ?? ""} ${m.email}`)].join(" ")).includes(q))
      .sort((a, b) => {
        if (ordem === "nome") return normalizar(a.nome).localeCompare(normalizar(b.nome));
        if (ordem === "ativos") return Number(b.ativos) - Number(a.ativos);
        if (ordem === "acesso") return (b.ultimo_acesso ?? "").localeCompare(a.ultimo_acesso ?? "");
        return total(b.id) - total(a.id);
      });
  }, [busca, ordem, empresas, uso]);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Indicador Icone={Building2} valor={empresas.length} rotulo="Clientes" detalhe={`${pessoas} pessoa(s) nas equipes`} />
        <Indicador
          Icone={HardDrive}
          tom="azul"
          valor={tamanho(somaGeral)}
          rotulo="Espaço usado no total"
          detalhe="banco + fotos e anexos"
        />
        <Indicador
          Icone={Database}
          tom="violeta"
          valor={tamanho(somaArquivos)}
          rotulo={`${qtdArquivos} foto(s) e anexo(s)`}
          detalhe={`mais ${tamanho(somaBanco)} no banco`}
        />
        <Indicador
          Icone={MessageCircle}
          tom="verde"
          valor={`${conectados} de ${empresas.length}`}
          rotulo="Com WhatsApp conectado"
          detalhe="avisos de manutenção"
        />
      </div>

      <section className="card overflow-hidden">
        <header className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar cliente por nome, CNPJ, pessoa ou e-mail" />
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as Ordem)}
            className="campo sm:w-44"
            aria-label="Ordenar clientes por"
          >
            {(Object.keys(ORDENS) as Ordem[]).map((o) => (
              <option key={o} value={o}>
                {ORDENS[o]}
              </option>
            ))}
          </select>
        </header>

        {lista.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhum cliente encontrado.</p>
        ) : (
          <>
            <div
              className={`hidden gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid ${COLUNAS}`}
            >
              <span>Cliente</span>
              <span>Cadastros</span>
              <span>Último acesso</span>
              <span>Espaço usado</span>
              <span>WhatsApp</span>
              <span>Assinatura</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {lista.map((e) => {
                const u = uso[e.id];
                const dono = e.membros.find((m) => m.papel === "proprietario");
                const t = total(e.id);
                const a = assinaturas[e.id];
                const est = a ? ESTADOS_ASSINATURA[a.situacao?.estado ?? "sem_cobranca"] : null;
                return (
                  <li
                    key={e.id}
                    data-cliente={e.nome}
                    className={`grid gap-x-4 gap-y-2 px-4 py-3 sm:px-5 lg:items-center ${COLUNAS}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{e.nome}</p>
                      <p className="truncate text-xs text-slate-500">
                        {dono ? dono.nome ?? dono.email : "sem proprietário"} · {e.membros.length}{" "}
                        {e.membros.length === 1 ? "pessoa" : "pessoas"}
                        {e.cnpj ? ` · ${e.cnpj}` : ""}
                      </p>
                    </div>
                    <p className="text-xs text-slate-600">
                      <span className="font-medium tabular-nums text-slate-900">{Number(e.ativos)}</span>{" "}
                      {Number(e.ativos) === 1 ? "ativo" : "ativos"} ·{" "}
                      <span className="font-medium tabular-nums text-slate-900">{Number(e.manutencoes)}</span>{" "}
                      {Number(e.manutencoes) === 1 ? "manutenção" : "manutenções"}
                      {e.ultima_atividade && (
                        <span className="block text-[11px] text-slate-500">última lançada {dataBR(e.ultima_atividade)}</span>
                      )}
                    </p>
                    <p
                      className="text-xs text-slate-600"
                      title={e.ultimo_acesso ? dataHoraBR(e.ultimo_acesso) : undefined}
                    >
                      <span className="lg:hidden">Último acesso: </span>
                      {tempoRelativo(e.ultimo_acesso ?? null, agora)}
                    </p>
                    <div className="min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold tabular-nums text-slate-900" data-uso-total>
                          {tamanho(t)}
                        </span>
                        <span className="truncate text-[11px] text-slate-500">
                          {u ? `${u.arquivos} arquivo(s) ${tamanho(u.bytesArquivos)} · banco ${tamanho(u.bytesBanco)}` : "—"}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                        <div className="h-full rounded-full bg-marca-500" style={{ width: `${Math.max(2, (t / maior) * 100)}%` }} />
                      </div>
                    </div>
                    <StatusWhatsapp status={e.whatsapp} numero={e.whatsapp_numero} />
                    <div className="min-w-0">
                      {est ? (
                        <>
                          <Badge className={est.classe}>{a?.bloqueio_manual ? "Bloqueada por você" : est.label}</Badge>
                          {a?.situacao?.vencimento && a.situacao.estado !== "sem_cobranca" && a.situacao.estado !== "isenta" && (
                            <p className="mt-0.5 text-[11px] text-slate-500">vence {dataBR(a.situacao.vencimento)}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
      <p className="mt-2 text-xs text-slate-500">
        Espaço no banco é estimado pelo tamanho das linhas de cada empresa; arquivos são as fotos e anexos no disco do
        servidor. Último acesso é o de qualquer pessoa da equipe.
      </p>
    </>
  );
}

function StatusWhatsapp({ status, numero }: { status: string | null; numero: string | null }) {
  if (status === "conectado") {
    return (
      <div className="min-w-0" data-whatsapp="conectado">
        <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Conectado
        </Badge>
        {numero && <p className="mt-0.5 truncate text-[11px] text-slate-500">+{numero}</p>}
      </div>
    );
  }
  if (status === "conectando") {
    return <Badge className="bg-amber-50 text-amber-800 ring-amber-600/20">Conectando…</Badge>;
  }
  return (
    <span data-whatsapp="desligado">
      <Badge className="bg-slate-100 text-slate-600 ring-slate-500/20">Não conectado</Badge>
    </span>
  );
}
