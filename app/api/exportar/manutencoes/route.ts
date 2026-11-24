import { createClient } from "@/lib/db/server";
import { csvManutencoes } from "@/lib/exportar";
import { nomeCsv } from "@/lib/csv";
import { hoje } from "@/lib/format";
import { LIMITE_EXPORTACAO, lerFiltros } from "@/lib/historico";
import { buscarHistorico } from "@/lib/historico-servidor";
import { getContexto } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Planilha (CSV) do histórico de manutenções com os mesmos filtros da tela
 * (`/manutencoes?...`). Só leitura: o RLS e o org_id da empresa aberta
 * limitam as linhas, como na tela. Sem sessão, getContexto() leva ao login.
 */
export async function GET(request: Request) {
  const { orgId } = await getContexto();
  const filtros = lerFiltros(new URL(request.url).searchParams);
  const db = await createClient();
  const { linhas } = await buscarHistorico(db, orgId, filtros, LIMITE_EXPORTACAO, 0);

  return new Response(csvManutencoes(linhas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeCsv("manutencoes", hoje())}"`,
      "Cache-Control": "no-store",
    },
  });
}
