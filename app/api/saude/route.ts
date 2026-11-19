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
    if (error) return NextResponse.json({ ok: false, banco: error.message }, { status: 503 });
    return NextResponse.json({ ok: true, banco: "ok" });
  } catch (e) {
    return NextResponse.json({ ok: false, banco: e instanceof Error ? e.message : "erro" }, { status: 503 });
  }
}
