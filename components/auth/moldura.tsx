import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { BellRing, FileText, FolderTree, History, ShieldCheck, type LucideIcon } from "lucide-react";
import { Assinatura, Logo } from "@/components/marca";
import { Gorro, NeveMenu } from "@/components/natal/decoracao";
import { AlternarTema } from "@/components/tema/alternar-tema";
import { COOKIE_NATAL, natalLigado } from "@/lib/natal";
import { Vitrine } from "./vitrine";

const DESTAQUES: { Icone: LucideIcon; texto: string }[] = [
  { Icone: FolderTree, texto: "Ativos por categoria" },
  { Icone: History, texto: "Histórico com custos e anexos" },
  { Icone: BellRing, texto: "Alertas no WhatsApp" },
  { Icone: FileText, texto: "Relatórios em PDF" },
];

/** Fundo do painel escuro: aurora azul + grade fina que some nas bordas. */
function Aurora() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[#2563eb] opacity-30 blur-[120px]" />
      <div className="absolute -bottom-48 -right-32 h-[30rem] w-[30rem] rounded-full bg-[#4f46e5] opacity-25 blur-[120px]" />
      <div className="absolute right-1/4 top-1/3 h-48 w-48 rounded-full bg-[#06b6d4] opacity-10 blur-[90px]" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 75%)",
        }}
      />
    </div>
  );
}

/** Logo com o gorro de Natal por cima, quando a decoração está ligada. */
function LogoComGorro({ natal, tamanho }: { natal: boolean; tamanho?: "sm" | "md" | "lg" }) {
  const gorro =
    tamanho === "lg"
      ? "absolute -right-3 -top-4 h-9 w-9 rotate-[18deg]"
      : tamanho === "sm"
        ? "absolute -right-2 -top-2.5 h-5 w-5 rotate-[18deg]"
        : "absolute -right-2 -top-3 h-6 w-6 rotate-[18deg]";
  return (
    <span className="relative">
      <Logo tamanho={tamanho} />
      {natal && <Gorro className={gorro} />}
    </span>
  );
}

export async function MolduraAuth({
  titulo,
  subtitulo,
  children,
  rodape,
  aviso,
}: {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
  rodape?: ReactNode;
  aviso?: string;
}) {
  const natal = natalLigado((await cookies()).get(COOKIE_NATAL)?.value);

  return (
    <main className="flex min-h-dvh flex-col bg-[#040817] lg:grid lg:grid-cols-[1.1fr_1fr] lg:bg-slate-50">
      {/* ---------- Topo (celular) ---------- */}
      <header className="tema-original area-segura-superior relative overflow-hidden bg-[#040817] text-white lg:hidden">
        <Aurora />
        {natal && <NeveMenu />}
        <div className="relative flex justify-end px-4 pt-3">
          <AlternarTema className="text-slate-400 active:bg-white/10" />
        </div>
        <div className="entrada-pagina relative flex flex-col items-center px-6 pb-11 text-center">
          <span className="rounded-[22px] bg-white/[0.04] p-2.5 ring-1 ring-white/10">
            <LogoComGorro natal={natal} tamanho="lg" />
          </span>
          <p className="mt-3.5 text-lg font-semibold tracking-tight">Manutenção</p>
          <p className="text-sm text-slate-400">Gestão de ativos</p>
        </div>
      </header>

      {/* ---------- Painel de marca (desktop) ---------- */}
      <aside className="tema-original relative hidden flex-col overflow-hidden bg-[#040817] px-12 py-10 text-white lg:flex xl:px-16">
        <Aurora />
        {natal && <NeveMenu />}

        <div className="relative flex items-center gap-3">
          <LogoComGorro natal={natal} />
          <Assinatura tom="claro" />
        </div>

        <div className="relative my-auto max-w-xl py-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            Gestão de manutenção de ativos
          </span>
          <h2 className="mt-5 text-[2.25rem] font-semibold leading-[1.1] tracking-tight xl:text-[2.75rem]">
            Toda a manutenção da sua operação{" "}
            <span className="bg-gradient-to-r from-[#93c5fd] via-[#60a5fa] to-[#818cf8] bg-clip-text text-transparent">
              em um só lugar.
            </span>
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-400">
            Preventivas em dia, custos sob controle e o histórico de cada ativo a um clique.
          </p>

          <Vitrine className="entrada-pagina mt-10 h-[15.5rem] max-w-[34rem]" />

          <ul className="mt-10 grid max-w-lg grid-cols-2 gap-x-6 gap-y-3">
            {DESTAQUES.map(({ Icone, texto }) => (
              <li key={texto} className="flex items-center gap-2.5 text-sm text-slate-300">
                <Icone className="h-4 w-4 shrink-0 text-[#60a5fa]" />
                {texto}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">
          © {new Date().getFullYear()} Gestão de Manutenção de Ativos
        </p>
      </aside>

      {/* ---------- Formulário ---------- */}
      <section className="area-segura-inferior relative z-10 -mt-6 flex flex-1 justify-center rounded-t-[28px] bg-superficie px-5 pb-10 pt-8 shadow-[0_-12px_40px_rgb(0_0_0/0.35)] sm:px-6 lg:mt-0 lg:items-center lg:rounded-none lg:bg-slate-50 lg:py-12 lg:shadow-none">
        <div className="hidden lg:absolute lg:right-6 lg:top-6 lg:block">
          <AlternarTema className="text-slate-500 hover:bg-slate-100 hover:text-slate-900" />
        </div>

        {/* Brilho azul bem leve atrás do cartão, só no desktop: tira o "vazio" da metade clara. */}
        <div
          className="pointer-events-none absolute inset-0 hidden lg:block"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 45%, color-mix(in oklab, #3b82f6 9%, transparent), transparent 70%)",
          }}
        />

        <div className="entrada-pagina relative w-full max-w-sm lg:max-w-[27rem] lg:rounded-3xl lg:border lg:border-slate-200/80 lg:bg-superficie lg:p-10 lg:shadow-[0_1px_2px_rgb(15_23_42/0.04),0_24px_60px_-24px_rgb(15_23_42/0.25)]">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[28px]">
            {titulo}
          </h1>
          {subtitulo && <p className="mt-2 text-[15px] leading-relaxed text-slate-500">{subtitulo}</p>}

          {aviso && (
            <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
              {aviso}
            </p>
          )}

          <div className="mt-8">{children}</div>

          {rodape && <div className="mt-6 text-center text-sm text-slate-600">{rodape}</div>}

          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Conexão protegida · dados isolados por empresa
          </p>
        </div>
      </section>
    </main>
  );
}
