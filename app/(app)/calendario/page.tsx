import { Calendario, type EventoCalendario } from "@/components/calendario/calendario";
import { Cabecalho } from "@/components/ui";
import { getContexto } from "@/lib/session";
import { createClient } from "@/lib/db/server";
import { primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/format";
import type { ManutencaoCompleta, PlanoStatus } from "@/lib/types";

export const metadata = { title: "Calendário · Gestão de Manutenção" };

export default async function CalendarioPage() {
  const { orgId } = await getContexto();
  const db = await createClient();

  // Janela de 12 meses para trás e 12 para frente.
  const de = primeiroDiaDoMes(-12);
  const ate = ultimoDiaDoMes(12);

  const [{ data: realizadas }, { data: planos }, { data: categorias }] = await Promise.all([
    db
      .from("vw_manutencoes_completo")
      .select("*")
      .eq("org_id", orgId)
      .gte("data_manutencao", de)
      .lte("data_manutencao", ate),
    db.from("vw_planos_status").select("*").eq("org_id", orgId).eq("ativo", true),
    db.from("categorias").select("id, nome, cor").eq("org_id", orgId).order("ordem").order("nome"),
  ]);

  const eventos: EventoCalendario[] = [];

  for (const m of (realizadas ?? []) as ManutencaoCompleta[]) {
    eventos.push({
      id: `m-${m.id}`,
      tipo: "realizada",
      data: m.data_manutencao,
      titulo: m.descricao,
      ativoId: m.ativo_id,
      ativoNome: m.ativo_nome,
      categoriaId: m.categoria_id,
      categoriaNome: m.categoria_nome,
      categoriaCor: m.categoria_cor,
      valor: Number(m.valor ?? 0),
    });
  }

  for (const p of (planos ?? []) as PlanoStatus[]) {
    // Planos por horímetro não têm data fixa — aparecem só na aba Manutenções.
    if (!p.proxima_data) continue;

    eventos.push({
      id: `p-${p.id}`,
      tipo: p.situacao === "atrasada" ? "atrasada" : "programada",
      data: p.proxima_data,
      titulo: p.tipo,
      ativoId: p.ativo_id,
      ativoNome: p.ativo_nome,
      categoriaId: p.categoria_id,
      categoriaNome: p.categoria_nome,
      categoriaCor: p.categoria_cor,
      valor: p.custo_estimado !== null ? Number(p.custo_estimado) : null,
    });
  }

  const proximas = eventos.filter((e) => e.tipo === "programada").length;
  const atrasadas = eventos.filter((e) => e.tipo === "atrasada").length;

  return (
    <>
      <Cabecalho
        titulo="Calendário de manutenção"
        descricao={`${proximas} programada(s) e ${atrasadas} atrasada(s). Use os filtros para ver por categoria ou situação.`}
      />
      <Calendario eventos={eventos} categorias={categorias ?? []} />
    </>
  );
}
