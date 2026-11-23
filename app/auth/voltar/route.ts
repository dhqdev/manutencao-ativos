import { NextResponse, type NextRequest } from "next/server";
import { urlSite } from "@/lib/auth/config";
import { pedidoDeOutroSite, voltarAoConsole } from "@/lib/auth/entrar-como";

export const dynamic = "force-dynamic";

/**
 * "Voltar ao console": fecha a sessão do "Entrar como" e devolve o
 * superadmin ao /admin (lib/auth/entrar-como.ts). Sem "Entrar como" aberto,
 * só leva para o início.
 */
async function voltar(request: NextRequest) {
  const inicio = () => NextResponse.redirect(new URL("/dashboard", urlSite() || request.nextUrl.origin), { status: 303 });
  if (pedidoDeOutroSite(request)) return inicio();
  return (
    (await voltarAoConsole(request)) ?? inicio()
  );
}

export const GET = voltar;
export const POST = voltar;
