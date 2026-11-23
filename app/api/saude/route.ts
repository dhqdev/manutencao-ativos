import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";

export const dynamic = "force-dynamic";

/**
 * Saúde do app (healthcheck do Docker e verificação do deploy).
 * `?banco=1` confere também o caminho até o banco (app → PostgREST → Postgres).
 */
export async function GET(request: Request) {
  const conferirBanco = new URL(request.url).searchParams.get("banco") === "1";
  if (!conferirBanco) return NextResponse.json({ ok: true });

  try {
    const { error } = await createAdminClient().from("organizacoes").select("id", { head: true, count: "exact" });
    // O detalhe vai para o log, não para a resposta: a rota é pública e a
    // mensagem do banco contava nomes de serviço, papéis e tabelas.
    if (error) {
      console.error("[saude] banco", error.message);
      return NextResponse.json({ ok: false, banco: "erro" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, banco: "ok" });
  } catch (e) {
    console.error("[saude] banco", e);
    return NextResponse.json({ ok: false, banco: "erro" }, { status: 503 });
  }
}
