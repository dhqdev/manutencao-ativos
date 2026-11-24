"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChartColumn,
  CircleDot,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Package,
  Search,
  Settings,
  Sparkles,
  LayoutGrid,
  TriangleAlert,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Assinatura, Logo } from "@/components/marca";
import { CartaoNatal, Gorro, NeveMenu, PiscaPisca, Treno } from "@/components/natal/decoracao";
import { cn } from "@/components/ui";
import { AlternarTema } from "@/components/tema/alternar-tema";
import { BarraAcoesCelular } from "@/components/shell/barra-acoes-celular";
import { BuscaGlobal, abrirBuscaGlobal } from "@/components/shell/busca-global";
import { podeRegistrar } from "@/lib/permissoes";
import { iniciais } from "@/lib/format";
import { salvarMenuRecolhido } from "@/lib/menu-lateral";
import type { PapelMembro } from "@/lib/types";

type Grupo = "Operação" | "Análise" | "Administração";
type Item = { href: string; rotulo: string; Icone: LucideIcon; grupo: Grupo };

/** A ordem vale também para o celular: os 4 primeiros vão na barra inferior. */
const MENU: Item[] = [
  { href: "/dashboard", rotulo: "Dashboard", Icone: LayoutDashboard, grupo: "Operação" },
  { href: "/ativos", rotulo: "Ativos", Icone: Package, grupo: "Operação" },
  { href: "/manutencoes", rotulo: "Manutenções", Icone: ClipboardList, grupo: "Operação" },
  { href: "/calendario", rotulo: "Calendário", Icone: CalendarDays, grupo: "Operação" },
  { href: "/estoque", rotulo: "Estoque", Icone: CircleDot, grupo: "Operação" },
  { href: "/relatorios", rotulo: "Relatórios", Icone: ChartColumn, grupo: "Análise" },
  { href: "/assistente", rotulo: "Assistente", Icone: Sparkles, grupo: "Análise" },
  { href: "/equipe", rotulo: "Equipe", Icone: Users, grupo: "Administração" },
  { href: "/configuracoes", rotulo: "Configurações", Icone: Settings, grupo: "Administração" },
  { href: "/assinatura", rotulo: "Assinatura", Icone: Wallet, grupo: "Administração" },
];

const GRUPOS: Grupo[] = ["Operação", "Análise", "Administração"];

const NOME_PAPEL: Record<PapelMembro, string> = {
  proprietario: "Proprietário",
  gestor: "Gestor",
  tecnico: "Técnico",
  leitor: "Leitor",
};

/** Na barra inferior cabem 4 com conforto; o resto vai para o menu suspenso. */
const NA_BARRA = MENU.slice(0, 4);

export function Navegacao({
  nomeUsuario,
  emailUsuario,
  nomeEmpresa,
  papel,
  alertas,
  recolhidoInicial,
  natal,
  children,
}: {
  nomeUsuario: string;
  emailUsuario: string;
  nomeEmpresa: string;
  papel: PapelMembro;
  alertas: number;
  recolhidoInicial: boolean;
  /** Decoração de Natal ligada (lib/natal.ts) e dias até o dia 25. */
  natal: { ligado: boolean; dias: number | null };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const menu = MENU;
  const NO_MENU = menu.slice(4);
  const [menuAberto, setMenuAberto] = useState(false);

  const [recolhido, setRecolhido] = useState(recolhidoInicial);

  useEffect(() => setMenuAberto(false), [pathname]);

  const alternarMenu = useCallback(() => {
    setRecolhido((atual) => {
      salvarMenuRecolhido(!atual);
      return !atual;
    });
  }, []);

  // Ctrl+B / ⌘+B recolhe e expande, como nos editores. Fora de campos de texto,
  // para não brigar com o atalho de negrito de quem estiver digitando.
  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "b" || e.altKey || e.shiftKey)
        return;
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      alternarMenu();
    };
    document.addEventListener("keydown", atalho);
    return () => document.removeEventListener("keydown", atalho);
  }, [alternarMenu]);

  useEffect(() => {
    if (!menuAberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuAberto(false);
    document.addEventListener("keydown", esc);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = anterior;
    };
  }, [menuAberto]);

  const ativo = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const algumNoMenu = NO_MENU.some((i) => ativo(i.href));

  return (
    <div className="min-h-dvh lg:flex">
      {/* ---------------- Sidebar (desktop) ---------------- */}
      <aside
        className={cn(
          "tema-original no-print fixed inset-y-0 left-0 z-30 hidden flex-col bg-slate-900 transition-[width] duration-200 ease-out lg:flex",
          recolhido ? "w-[4.5rem]" : "w-64",
        )}
        aria-label="Menu lateral"
      >
        {natal.ligado && (
          <>
            <NeveMenu />
            <PiscaPisca className="top-0" quantidade={recolhido ? 3 : 9} />
          </>
        )}
        <div
          className={cn("relative flex items-center py-5", recolhido ? "justify-center px-3" : "gap-3 px-5")}
        >
          <Link
            href="/dashboard"
            className="group relative flex min-w-0 flex-1 items-center gap-3"
            aria-label={recolhido ? `${nomeEmpresa} · Dashboard` : undefined}
          >
            <span className="relative">
              <Logo />
              {natal.ligado && <Gorro className="absolute -right-2 -top-3 h-6 w-6 rotate-[18deg]" />}
            </span>
            {recolhido ? (
              <Dica>{nomeEmpresa}</Dica>
            ) : (
              <Assinatura empresa={nomeEmpresa} tom="claro" />
            )}
          </Link>
        </div>

        {/* Botão na borda: sempre no mesmo lugar, aberto ou recolhido. */}
        <button
          type="button"
          onClick={alternarMenu}
          aria-expanded={!recolhido}
          aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
          title={`${recolhido ? "Expandir" : "Recolher"} menu (Ctrl+B)`}
          className="pressionavel absolute -right-3 top-[1.85rem] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-slate-800 text-slate-300 shadow-md transition-colors hover:bg-slate-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-400"
        >
          <ChevronLeft
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200",
              recolhido && "rotate-180",
            )}
          />
        </button>

        {/* Busca global: o mesmo que Ctrl+K. */}
        <div className={cn("relative pb-2", recolhido ? "px-3" : "px-3")}>
          <button
            type="button"
            onClick={abrirBuscaGlobal}
            className={cn(
              "group relative flex w-full items-center rounded-lg bg-white/5 text-sm text-slate-400 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10 hover:text-slate-200",
              recolhido ? "justify-center py-2" : "gap-2.5 px-3 py-2",
            )}
            aria-label="Buscar (Ctrl+K)"
          >
            <Search className="h-4 w-4 shrink-0" />
            {recolhido ? (
              <Dica>Buscar · Ctrl+K</Dica>
            ) : (
              <>
                <span className="flex-1 text-left">Buscar...</span>
                <kbd className="rounded border border-white/15 px-1.5 py-px font-sans text-[10.5px] text-slate-400">Ctrl K</kbd>
              </>
            )}
          </button>
        </div>

        <nav
          className={cn(
            "relative flex flex-1 flex-col px-3 py-2",
            // A dica sai para fora do menu; com rolagem ela seria cortada.
            recolhido ? "overflow-visible" : "overflow-y-auto",
          )}
        >
          {GRUPOS.map((grupo, g) => (
            <div key={grupo} className={cn("flex flex-col gap-0.5", g > 0 && "mt-4")}>
              {recolhido ? (
                g > 0 && <span className="mx-auto mb-2 h-px w-6 bg-white/10" aria-hidden />
              ) : (
                <p className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {grupo}
                </p>
              )}
              {menu
                .filter((i) => i.grupo === grupo)
                .map((item) => (
                  <ItemMenu
                    key={item.href}
                    item={item}
                    ativo={ativo(item.href)}
                    recolhido={recolhido}
                    alertas={item.href === "/manutencoes" ? alertas : 0}
                  />
                ))}
            </div>
          ))}

          {alertas > 0 && !recolhido && (
            <Link
              href="/manutencoes?filtro=alertas"
              className="pressionavel group mt-6 flex items-start gap-2.5 rounded-xl bg-amber-500/10 px-3 py-2.5 ring-1 ring-amber-400/20 transition-colors hover:bg-amber-500/15"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span className="min-w-0 text-xs">
                <span className="block font-semibold text-amber-200">
                  {alertas} {alertas === 1 ? "manutenção pede" : "manutenções pedem"} atenção
                </span>
                <span className="block text-amber-200/70 group-hover:text-amber-100">
                  Vencendo ou atrasadas · ver lista
                </span>
              </span>
            </Link>
          )}
        </nav>

        {natal.ligado && !recolhido && <CartaoNatal dias={natal.dias} />}

        <div className="relative border-t border-white/10 p-3">
          <div
            className={cn(
              "flex rounded-lg px-2 py-2",
              recolhido ? "flex-col items-center gap-1 px-0" : "items-center gap-3",
            )}
          >
            <div className="group relative" tabIndex={recolhido ? 0 : undefined}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white ring-1 ring-white/15">
                {iniciais(nomeUsuario)}
              </div>
              {recolhido && (
                <Dica>
                  <span className="block">{nomeUsuario}</span>
                  <span className="block font-normal text-slate-400">
                    {NOME_PAPEL[papel]} · {emailUsuario}
                  </span>
                </Dica>
              )}
            </div>
            {!recolhido && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight text-white">
                  {nomeUsuario}
                </p>
                <p className="truncate text-xs leading-tight text-slate-400" title={emailUsuario}>
                  {NOME_PAPEL[papel]} · {emailUsuario}
                </p>
              </div>
            )}
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

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[padding] duration-200 ease-out",
          recolhido ? "lg:pl-[4.5rem]" : "lg:pl-64",
        )}
      >
        {/* ---------------- Topo (celular) ---------------- */}
        <header className="no-print area-segura-superior sticky top-0 z-20 border-b border-slate-200 bg-superficie/95 backdrop-blur lg:hidden">
          {natal.ligado && <PiscaPisca className="-bottom-[9px]" quantidade={11} />}
          <div className="flex items-center gap-2.5 px-4 py-2">
            <span className="relative">
              <Logo tamanho="sm" />
              {natal.ligado && <Gorro className="absolute -right-2 -top-2.5 h-5 w-5 rotate-[18deg]" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-slate-900">
                {nomeEmpresa}
              </p>
              <p className="truncate text-[11px] leading-tight text-slate-500">{nomeUsuario}</p>
            </div>
            <button
              type="button"
              onClick={abrirBuscaGlobal}
              className="rounded-lg p-2 text-slate-500 transition-colors active:bg-slate-100"
              aria-label="Buscar"
            >
              <Search className="h-5 w-5" />
            </button>
            <AlternarTema className="text-slate-500 active:bg-slate-100" />
            <Link
              href="/manutencoes?filtro=alertas"
              className="relative rounded-lg p-2 text-slate-500 transition-colors active:bg-slate-100"
              aria-label={`Alertas${alertas > 0 ? `: ${alertas}` : ""}`}
            >
              <Bell className="h-5 w-5" />
              {alertas > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-black/80">
                  {alertas > 9 ? "9+" : alertas}
                </span>
              )}
            </Link>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:p-6 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] lg:p-8 lg:pb-8">
          <div key={pathname} className="entrada-pagina mx-auto w-full max-w-7xl">
            {children}
          </div>
        </main>
      </div>

      {natal.ligado && <Treno />}

      <BuscaGlobal destinos={MENU} podeRegistrar={podeRegistrar(papel)} />
      <BarraAcoesCelular />

      {/* ---------------- Menu suspenso (celular) ---------------- */}
      {menuAberto && (
        <div className="no-print fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          <div
            className="veu absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setMenuAberto(false)}
            aria-hidden
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="folha area-segura-inferior relative rounded-t-2xl bg-superficie pb-2 shadow-xl"
          >
            <div className="flex justify-center pt-2.5" aria-hidden>
              <span className="h-1 w-9 rounded-full bg-slate-300" />
            </div>

            <header className="flex items-center justify-between px-5 pb-1 pt-3">
              <h2 className="text-base font-semibold text-slate-900">Menu</h2>
              <button
                type="button"
                onClick={() => setMenuAberto(false)}
                className="-mr-1 rounded-lg p-1.5 text-slate-400 active:bg-slate-100"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Quadrados */}
            <div className="grid grid-cols-3 gap-3 px-5 pb-4 pt-3">
              {[...NO_MENU, ...NA_BARRA].map(({ href, rotulo, Icone }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "pressionavel flex h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border text-center",
                    ativo(href)
                      ? "border-slate-900 bg-slate-900 text-slate-50"
                      : "border-slate-200 bg-slate-50 text-slate-700 active:bg-slate-100",
                  )}
                >
                  <Icone className="h-6 w-6" />
                  <span className="px-1 text-[12px] font-medium leading-tight">{rotulo}</span>
                </Link>
              ))}

              <Link
                href="/auth/sair"
                prefetch={false}
                className="pressionavel flex h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 text-center text-red-700 active:bg-red-100"
              >
                <LogOut className="h-6 w-6" />
                <span className="px-1 text-[12px] font-medium leading-tight">Sair</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Barra inferior (celular) ---------------- */}
      <nav
        className="no-print area-segura-inferior fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-superficie/95 backdrop-blur lg:hidden"
        aria-label="Navegação principal"
      >
        <div className="grid grid-cols-5">
          {NA_BARRA.map(({ href, rotulo, Icone }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "pressionavel relative flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10.5px] font-medium",
                ativo(href) ? "text-slate-900" : "text-slate-500 active:text-slate-900",
              )}
            >
              <span
                className={cn(
                  "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                  ativo(href) && "bg-slate-100",
                )}
              >
                <Icone className={cn("h-5 w-5", ativo(href) && "stroke-[2.3]")} />
                {href === "/manutencoes" && alertas > 0 && (
                  <span className="absolute -top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-black/80">
                    {alertas > 9 ? "9+" : alertas}
                  </span>
                )}
              </span>
              {rotulo}
            </Link>
          ))}

          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            aria-expanded={menuAberto}
            className={cn(
              "pressionavel relative flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10.5px] font-medium",
              algumNoMenu || menuAberto ? "text-slate-900" : "text-slate-500 active:text-slate-900",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                (algumNoMenu || menuAberto) && "bg-slate-100",
              )}
            >
              <LayoutGrid className={cn("h-5 w-5", algumNoMenu && "stroke-[2.3]")} />
            </span>
            Mais
          </button>
        </div>
      </nav>
    </div>
  );
}

function ItemMenu({
  item: { href, rotulo, Icone },
  ativo,
  recolhido,
  alertas,
}: {
  item: Item;
  ativo: boolean;
  recolhido: boolean;
  alertas: number;
}) {
  const contagem = alertas > 99 ? "99+" : String(alertas);
  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "pressionavel group relative flex items-center rounded-lg py-2.5 text-sm",
        recolhido ? "justify-center px-0" : "gap-3 px-3",
        ativo
          ? "bg-gradient-to-r from-white/[0.12] to-white/[0.04] font-medium text-white ring-1 ring-inset ring-white/10"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
      )}
    >
      {ativo && (
        <span className="pop-in absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-marca-400 shadow-[0_0_10px_var(--color-marca-400)]" />
      )}
      <span className="relative">
        <Icone
          className={cn(
            "h-[18px] w-[18px] shrink-0 transition-[color,transform]",
            ativo
              ? "text-marca-400"
              : cn("text-slate-500 group-hover:text-slate-300", !recolhido && "group-hover:translate-x-0.5"),
          )}
        />
        {recolhido && alertas > 0 && (
          <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-slate-900" />
        )}
      </span>
      <span className={recolhido ? "sr-only" : "flex-1 truncate"}>{rotulo}</span>
      {!recolhido && alertas > 0 && (
        <span className="min-w-5 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-slate-950">
          {contagem}
        </span>
      )}
      {recolhido && (
        <Dica>
          {rotulo}
          {alertas > 0 && <span className="ml-1.5 text-amber-400">· {contagem}</span>}
        </Dica>
      )}
    </Link>
  );
}

/**
 * Rótulo que aparece ao lado do ícone com o menu recolhido (mouse ou teclado).
 * O pai precisa de `group relative`. É só visual: o nome acessível vem do
 * texto `sr-only` / aria-label do próprio link.
 */
function Dica({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg ring-1 ring-white/10 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}
