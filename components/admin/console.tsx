"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, type LucideIcon, ShieldCheck, Users } from "lucide-react";
import { Logo } from "@/components/marca";
import { cn } from "@/components/ui";
import { AlternarTema } from "@/components/tema/alternar-tema";
import { iniciais } from "@/lib/format";

type Item = { href: string; rotulo: string; Icone: LucideIcon; exato?: boolean };

/**
 * O console tem uma tela só (gerência dos usuários). Seção nova entra aqui e
 * ganha a própria página em app/admin/<seção>/page.tsx; com mais de uma, a
 * barra inferior aparece no celular.
 */
const SECOES: Item[] = [{ href: "/admin", rotulo: "Gerência", Icone: Users, exato: true }];

/**
 * Casca do console do superadmin. Separada da navegação do sistema das
 * empresas de propósito: o superadmin só gerencia os usuários, não trabalha
 * dentro de nenhuma empresa.
 */
export function ConsoleAdmin({
  nome,
  email,
  children,
}: {
  nome: string;
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const ativo = (i: Item) => (i.exato ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/"));

  return (
    <div className="min-h-dvh lg:flex">
      {/* ---------------- Lateral (desktop) ---------------- */}
      <aside className="tema-original no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-slate-900 lg:flex">
        <Link href="/admin" className="flex items-center gap-3 px-5 py-5">
          <Logo />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-tight tracking-tight text-white">Manutenção</p>
            <p className="flex items-center gap-1 truncate text-xs leading-tight text-amber-300">
              <ShieldCheck className="h-3 w-3" /> Console do superadmin
            </p>
          </div>
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2" aria-label="Console">
          {SECOES.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={ativo(i) ? "page" : undefined}
              className={cn(
                "pressionavel group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                ativo(i) ? "bg-white/10 font-medium text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
              )}
            >
              {ativo(i) && (
                <span className="pop-in absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-amber-400" />
              )}
              <i.Icone
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors",
                  ativo(i) ? "text-amber-400" : "text-slate-500 group-hover:text-slate-300",
                )}
              />
              {i.rotulo}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-xs font-semibold text-amber-200 ring-1 ring-amber-300/30">
              {iniciais(nome)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight text-white">{nome}</p>
              <p className="truncate text-xs leading-tight text-slate-400">{email}</p>
            </div>
            <AlternarTema className="text-slate-400 hover:bg-white/10 hover:text-white" />
            <Link
              href="/auth/sair"
              prefetch={false}
              title="Sair"
              aria-label="Sair"
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:ml-64">
        {/* ---------------- Topo (celular) ---------------- */}
        <header className="no-print area-segura-superior sticky top-0 z-20 border-b border-slate-200 bg-superficie/95 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2.5 px-4 py-2">
            <Logo tamanho="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-slate-900">Console do superadmin</p>
              <p className="truncate text-[11px] leading-tight text-slate-500">{email}</p>
            </div>
            <AlternarTema className="text-slate-500 active:bg-slate-100" />
            <Link
              href="/auth/sair"
              prefetch={false}
              aria-label="Sair"
              className="rounded-lg p-2 text-slate-500 transition-colors active:bg-slate-100"
            >
              <LogOut className="h-5 w-5" />
            </Link>
          </div>
        </header>

        <main
          className={cn(
            "min-w-0 flex-1 px-4 pt-4 sm:p-6 lg:p-8 lg:pb-8",
            SECOES.length > 1
              ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(6rem+env(safe-area-inset-bottom))]"
              : "pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
          )}
        >
          <div key={pathname} className="entrada-pagina mx-auto w-full max-w-6xl">
            {children}
          </div>
        </main>
      </div>

      {/* ---------------- Barra inferior (celular) ---------------- */}
      {SECOES.length > 1 && (
      <nav
        className="no-print area-segura-inferior fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-superficie/95 backdrop-blur lg:hidden"
        aria-label="Console (celular)"
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${SECOES.length}, minmax(0, 1fr))` }}>
          {SECOES.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "pressionavel flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10.5px] font-medium",
                ativo(i) ? "text-slate-900" : "text-slate-500 active:text-slate-900",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                  ativo(i) && "bg-slate-100",
                )}
              >
                <i.Icone className={cn("h-5 w-5", ativo(i) && "stroke-[2.3]")} />
              </span>
              {i.rotulo}
            </Link>
          ))}
        </div>
      </nav>
      )}
    </div>
  );
}
