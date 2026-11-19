"use client";

import { useMemo, useState } from "react";
import { Building2, Database, HardDrive, MessageCircle } from "lucide-react";
import { Badge, cn } from "@/components/ui";
import { Busca, normalizar } from "./comum";
import { tamanho, type EmpresaAdmin, type UsoEmpresa } from "./tipos";

const ORDENS = { uso: "Mais espaço", nome: "Nome", ativos: "Mais ativos" } as const;
type Ordem = keyof typeof ORDENS;

/**
 * Clientes (empresas) com o espaço que cada um ocupa — banco e arquivos — e a
 * situação do WhatsApp.
 */
export function UsoClientes({ empresas, uso }: { empresas: EmpresaAdmin[]; uso: Record<string, UsoEmpresa> }) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("uso");

  const total = (id: string) => (uso[id]?.bytesBanco ?? 0) + (uso[id]?.bytesArquivos ?? 0);
  const somaGeral = empresas.reduce((s, e) => s + total(e.id), 0);
  const somaArquivos = empresas.reduce((s, e) => s + (uso[e.id]?.bytesArquivos ?? 0), 0);
  const somaBanco = empresas.reduce((s, e) => s + (uso[e.id]?.bytesBanco ?? 0), 0);
  const conectados = empresas.filter((e) => e.whatsapp === "conectado").length;
  const maior = Math.max(1, ...empresas.map((e) => total(e.id)));

  const lista = useMemo(() => {
    const q = normalizar(busca.trim());
    return empresas
      .filter((e) => !q || normalizar([e.nome, e.cnpj, ...e.membros.map((m) => m.email)].join(" ")).includes(q))
      .sort((a, b) => {
        if (ordem === "nome") return normalizar(a.nome).localeCompare(normalizar(b.nome));
        if (ordem === "ativos") return Number(b.ativos) - Number(a.ativos);
        return total(b.id) - total(a.id);
      });
  }, [busca, ordem, empresas, uso]);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Resumo Icone={Building2} cor="text-slate-600 bg-slate-100" valor={String(empresas.length)} rotulo="Clientes" />
        <Resumo Icone={HardDrive} cor="text-marca-700 bg-marca-50" valor={tamanho(somaGeral)} rotulo="Espaço usado no total" />
        <Resumo
          Icone={Database}
          cor="text-violet-700 bg-violet-50"
          valor={tamanho(somaArquivos)}
          rotulo={`em fotos e anexos · ${tamanho(somaBanco)} no banco`}
        />
        <Resumo
          Icone={MessageCircle}
          cor="text-emerald-700 bg-emerald-50"
          valor={`${conectados} de ${empresas.length}`}
          rotulo="com WhatsApp conectado"
        />
      </div>

      <section className="card overflow-hidden">
        <header className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar cliente por nome, CNPJ ou e-mail" />
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
            <div className="hidden grid-cols-[minmax(0,2fr)_7rem_minmax(0,1.6fr)_9rem] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid">
              <span>Cliente</span>
              <span>Cadastros</span>
              <span>Espaço usado</span>
              <span>WhatsApp</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {lista.map((e) => {
                const u = uso[e.id];
                const dono = e.membros.find((m) => m.papel === "proprietario");
                const t = total(e.id);
                return (
                  <li
                    key={e.id}
                    data-cliente={e.nome}
                    className="grid gap-x-4 gap-y-2 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,2fr)_7rem_minmax(0,1.6fr)_9rem] lg:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{e.nome}</p>
                      <p className="truncate text-xs text-slate-500">
                        {dono ? dono.nome ?? dono.email : "sem proprietário"} · {e.membros.length} pessoa(s)
                      </p>
                    </div>
                    <p className="text-xs text-slate-600">
                      {Number(e.ativos)} ativo(s)
                      <br className="hidden lg:block" />
                      <span className="lg:hidden"> · </span>
                      {Number(e.manutencoes)} manutenção(ões)
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
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
      <p className="mt-2 text-xs text-slate-500">
        Espaço no banco é estimado pelo tamanho das linhas de cada empresa; arquivos são as fotos e anexos no disco do
        servidor.
      </p>
    </>
  );
}

function Resumo({
  Icone,
  cor,
  valor,
  rotulo,
}: {
  Icone: typeof Building2;
  cor: string;
  valor: string;
  rotulo: string;
}) {
  return (
    <div className="card flex items-center gap-3 p-3.5 sm:p-4">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", cor)}>
        <Icone className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xl font-semibold leading-none tabular-nums text-slate-900">{valor}</span>
        <span className="mt-1 block truncate text-xs text-slate-500">{rotulo}</span>
      </span>
    </div>
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
