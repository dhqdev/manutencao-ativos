import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { limparOrfaos } from "@/lib/orfaos";

export const dynamic = "force-dynamic";

function confere(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Limpeza diária de arquivos órfãos (lib/orfaos.ts), chamada pelo serviço
 * cron com `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function POST(request: NextRequest) {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo || /^TROQUE/.test(segredo)) {
    return NextResponse.json({ erro: "CRON_SECRET não configurada." }, { status: 503 });
  }
  if (!confere(request.headers.get("authorization") ?? "", `Bearer ${segredo}`)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await limparOrfaos()) });
  } catch (e) {
    console.error("[orfaos]", e);
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
