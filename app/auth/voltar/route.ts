import { NextResponse, type NextRequest } from "next/server";
import { urlSite } from "@/lib/auth/config";
import { voltarAoConsole } from "@/lib/auth/entrar-como";

export const dynamic = "force-dynamic";

/**
 * "Voltar ao console": fecha a sessão do "Entrar como" e devolve o
 * superadmin ao /admin (lib/auth/entrar-como.ts). Sem "Entrar como" aberto,
 * só leva para o início.
 */
async function voltar(request: NextRequest) {
  return (
    (await voltarAoConsole(request)) ??
    NextResponse.redirect(new URL("/dashboard", urlSite() || request.nextUrl.origin), { status: 303 })
  );
}

export const GET = voltar;
export const POST = voltar;
