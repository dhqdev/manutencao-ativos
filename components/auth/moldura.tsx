import type { ReactNode } from "react";
import {
  BellRing,
  FileText,
  FolderTree,
  History,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Assinatura, Logo } from "@/components/marca";
import { AlternarTema } from "@/components/tema/alternar-tema";
import { AnimacaoManutencao } from "./animacao-manutencao";

const DESTAQUES: { Icone: LucideIcon; titulo: string; texto: string }[] = [
  {
    Icone: FolderTree,
    titulo: "Ativos organizados",
    texto: "Por categoria, como pastas.",
  },
  {
    Icone: History,
    titulo: "Histórico completo",
    texto: "Custos, peças e anexos de cada serviço.",
  },
  {
    Icone: BellRing,
    titulo: "Alertas no WhatsApp",
    texto: "Aviso antes de vencer a preventiva.",
  },
  {
    Icone: FileText,
    titulo: "Relatórios em PDF",
    texto: "Prontos para compartilhar.",
  },
];

/** Fundo do painel escuro: malha de pontos + brilho azul. */
function Textura() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        aria-hidden
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-25 blur-3xl"
        aria-hidden
        style={{
          background: "radial-gradient(circle, #2563eb, transparent 70%)",
        }}
      />
    </>
  );
}

export function MolduraAuth({
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
  return (
    <main className="flex min-h-dvh flex-col bg-[#020617] lg:grid lg:grid-cols-[1.05fr_1fr] lg:bg-slate-50">
      {/* ---------- Topo animado (celular) ---------- */}
      <header className="tema-original area-segura-superior relative overflow-hidden bg-slate-950 text-white lg:hidden">
        <Textura />
        <div className="relative flex items-center justify-between px-5 pt-4">
          <div className="flex items-center gap-2.5">
            <Logo tom="claro" tamanho="sm" />
            <Assinatura tom="claro" />
          </div>
          <AlternarTema className="text-slate-400 active:bg-white/10" />
        </div>
        <AnimacaoManutencao className="entrada-pagina relative mx-auto mb-5 mt-1 h-40 w-auto" />
      </header>

      {/* ---------- Painel de marca (desktop) ---------- */}
      <aside className="tema-original relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
        <Textura />

        <div className="relative flex items-center gap-3">
          <Logo tom="claro" />
          <Assinatura tom="claro" />
        </div>

        <div className="relative max-w-lg">
          <AnimacaoManutencao className="entrada-pagina -ml-4 mb-6 h-48 w-auto" />
          <h2 className="text-[2rem] font-semibold leading-[1.15] tracking-tight xl:text-[2.25rem]">
            Toda a manutenção da sua operação{" "}
            <span className="bg-gradient-to-r from-marca-300 to-marca-500 bg-clip-text text-transparent">
              em um só lugar.
            </span>
          </h2>
          <ul className="lista-escalonada mt-9 grid gap-3 sm:grid-cols-2">
            {DESTAQUES.map(({ Icone, titulo, texto }) => (
              <li
                key={titulo}
                className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5 backdrop-blur-sm"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-marca-500/15 text-marca-300 ring-1 ring-marca-400/20">
                  <Icone className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-100">{titulo}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-slate-400">
                    {texto}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">
          © {new Date().getFullYear()} Gestão de Manutenção de Ativos
        </p>
      </aside>

      {/* ---------- Formulário ---------- */}
      <section className="area-segura-inferior relative z-10 -mt-5 flex flex-1 justify-center rounded-t-[28px] bg-superficie px-5 pb-10 pt-8 shadow-[0_-8px_30px_rgb(0_0_0/0.25)] sm:px-6 lg:mt-0 lg:items-center lg:rounded-none lg:bg-slate-50 lg:py-12 lg:shadow-none">
        <div className="hidden lg:absolute lg:right-6 lg:top-6 lg:block">
          <AlternarTema className="text-slate-500 hover:bg-slate-100 hover:text-slate-900" />
        </div>

        {/* Malha suave atrás do formulário, só no desktop: tira o "vazio" da metade branca. */}
        <div
          className="pointer-events-none absolute inset-0 hidden opacity-60 lg:block"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--color-slate-200) 1px, transparent 0)",
            backgroundSize: "24px 24px",
            maskImage: "radial-gradient(ellipse at center, transparent 30%, black 85%)",
          }}
        />

        <div className="entrada-pagina relative w-full max-w-sm lg:max-w-[26rem] lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-superficie lg:p-9 lg:shadow-[0_8px_40px_-12px_rgb(15_23_42/0.18)]">
          <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[26px]">
            {titulo}
          </h1>
          {subtitulo && <p className="mt-1.5 text-[15px] text-slate-500">{subtitulo}</p>}

          {aviso && (
            <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
              {aviso}
            </p>
          )}

          <div className="mt-7">{children}</div>

          {rodape && <div className="mt-6 text-center text-sm text-slate-600">{rodape}</div>}

          <p className="mt-7 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Conexão protegida · dados isolados por empresa
          </p>
        </div>
      </section>
    </main>
  );
}

export function Alerta({ tipo, children }: { tipo: "erro" | "sucesso"; children: ReactNode }) {
  return (
    <div
      role="alert"
      className={
        tipo === "erro"
          ? "pop-in rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
          : "pop-in rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700"
      }
    >
      {children}
    </div>
  );
}
