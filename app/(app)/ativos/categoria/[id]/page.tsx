import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import { DialogoAtivo } from "@/components/ativos/dialogo-ativo";
import { ListaAtivos, type AtivoResumo } from "@/components/ativos/lista-ativos";
import { Cabecalho, EstadoVazio } from "@/components/ui";
import { urlsDasFotos } from "@/lib/fotos";
import { IconeCategoria } from "@/lib/icones";
import { podeGerenciar } from "@/lib/permissoes";
import { getContexto } from "@/lib/session";
import { createClient, type Db } from "@/lib/db/server";
import type { Ativo, Categoria } from "@/lib/types";

export default async function CategoriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId, papel } = await getContexto();
  const gestor = podeGerenciar(papel);
  const db = await createClient();

  // Tudo em paralelo: a categoria de outra empresa (ou inexistente) volta vazia
  // pelo RLS e pelo filtro de org_id, e aí as outras respostas são descartadas.
  const [{ data: categoria }, { data: ativos }, { data: categorias }, resumo] = await Promise.all([
    db.from("categorias").select("*").eq("id", id).eq("org_id", orgId).maybeSingle(),
    db.from("ativos").select("*").eq("categoria_id", id).eq("org_id", orgId).order("nome"),
    db.from("categorias").select("id, nome").eq("org_id", orgId).order("ordem").order("nome"),
    resumoDosAtivos(db, id),
  ]);

  if (!categoria) notFound();

  const fotos = await urlsDasFotos((ativos ?? []).map((a) => a.foto_url));

  const lista: AtivoResumo[] = ((ativos ?? []) as Ativo[]).map((a) => {
    const r = resumo.get(a.id);
    return {
      ...a,
      total_manutencoes: r?.total ?? 0,
      custo_total: r?.custo ?? 0,
      ultima_manutencao: r?.ultima ?? null,
      alertas: r?.alertas ?? 0,
      foto_assinada: a.foto_url ? (fotos.get(a.foto_url) ?? null) : null,
    };
  });

  const cat = categoria as Categoria;

  return (
    <>
      <Link
        href="/ativos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Todas as categorias
      </Link>

      <Cabecalho
        titulo={cat.nome}
        descricao={cat.descricao ?? `${lista.length} ativo(s) nesta categoria`}
        acoes={gestor ? <DialogoAtivo categorias={categorias ?? []} categoriaPadrao={cat.id} /> : undefined}
      />

      <div className="mb-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-superficie p-4">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ backgroundColor: cat.cor }}
        >
          <IconeCategoria nome={cat.icone} className="h-5 w-5" />
        </span>
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">Ativos</p>
            <p className="text-lg font-semibold text-slate-900">{lista.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Manutenções</p>
            <p className="text-lg font-semibold text-slate-900">
              {lista.reduce((s, a) => s + a.total_manutencoes, 0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Alertas abertos</p>
            <p className="text-lg font-semibold text-slate-900">
              {lista.reduce((s, a) => s + a.alertas, 0)}
            </p>
          </div>
        </div>
      </div>

      {lista.length === 0 ? (
        <EstadoVazio
          icone={<Package className="h-6 w-6" />}
          titulo="Nenhum ativo nesta categoria"
          descricao="Cadastre o primeiro equipamento para começar a registrar manutenções."
          acao={gestor ? <DialogoAtivo categorias={categorias ?? []} categoriaPadrao={cat.id} /> : undefined}
        />
      ) : (
        <ListaAtivos ativos={lista} />
      )}
    </>
  );
}

type Resumo = { total: number; custo: number; ultima: string | null; alertas: number };

/**
 * Totais por ativo somados no banco (resumo_ativos_categoria, 45-desempenho.sql).
 * Banco sem a função ainda: soma aqui, como antes.
 */
async function resumoDosAtivos(db: Db, categoriaId: string) {
  const resumo = new Map<string, Resumo>();
  const { data, error } = await db.rpc("resumo_ativos_categoria", { p_categoria: categoriaId });
  if (!error && data) {
    for (const r of data as { ativo_id: string; total: number; custo: number; ultima: string | null; alertas: number }[]) {
      resumo.set(r.ativo_id, {
        total: Number(r.total),
        custo: Number(r.custo),
        ultima: r.ultima,
        alertas: Number(r.alertas),
      });
    }
    return resumo;
  }

  const { data: ativos } = await db.from("ativos").select("id").eq("categoria_id", categoriaId);
  const ids = (ativos ?? []).map((a) => a.id);
  if (!ids.length) return resumo;
  const [{ data: manutencoes }, { data: planos }] = await Promise.all([
    db.from("manutencoes").select("ativo_id, valor, data_manutencao").in("ativo_id", ids),
    db.from("vw_planos_status").select("ativo_id, situacao").in("ativo_id", ids),
  ]);
  const de = (id: string) => resumo.get(id) ?? { total: 0, custo: 0, ultima: null, alertas: 0 };
  for (const m of manutencoes ?? []) {
    const r = de(m.ativo_id);
    r.total += 1;
    r.custo += Number(m.valor ?? 0);
    if (!r.ultima || m.data_manutencao > r.ultima) r.ultima = m.data_manutencao;
    resumo.set(m.ativo_id, r);
  }
  for (const p of planos ?? []) {
    if (p.situacao !== "proxima" && p.situacao !== "atrasada") continue;
    const r = de(p.ativo_id);
    r.alertas += 1;
    resumo.set(p.ativo_id, r);
  }
  return resumo;
}
