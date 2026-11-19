"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Snowflake, TreePine } from "lucide-react";
import { cn } from "@/components/ui";
import { salvarNatal } from "@/lib/natal";

/*
 * Decoração de Natal. Tudo aqui é enfeite: aria-hidden, sem capturar o mouse,
 * fora da impressão e parado para quem pediu menos movimento no sistema.
 * Quando e se aparece é decidido em lib/natal.ts.
 */

const CORES_LUZES = ["#ef4444", "#22c55e", "#facc15", "#3b82f6", "#f97316", "#22c55e", "#ef4444", "#facc15", "#3b82f6"];

/** Fio de luzinhas piscando, para a borda de cima do menu e do topo do celular. */
export function PiscaPisca({ className, quantidade = 9 }: { className?: string; quantidade?: number }) {
  return (
    <div aria-hidden className={cn("no-print pointer-events-none absolute inset-x-0 h-4", className)}>
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 16">
        <path
          d="M0 3 Q 6 9 12.5 3 T 25 3 T 37.5 3 T 50 3 T 62.5 3 T 75 3 T 87.5 3 T 100 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          className="text-slate-500/60"
        />
      </svg>
      <div className="relative flex h-full justify-around px-1">
        {Array.from({ length: quantidade }).map((_, i) => (
          <span
            key={i}
            className="natal-luz mt-[5px] block h-[7px] w-[5px] rounded-b-full rounded-t-sm"
            style={{
              backgroundColor: CORES_LUZES[i % CORES_LUZES.length],
              color: CORES_LUZES[i % CORES_LUZES.length],
              animationDelay: `${(i % 3) * 0.6}s`,
              transform: `rotate(${i % 2 ? 10 : -10}deg)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Neve leve caindo dentro do menu lateral (só dentro dele, nunca no conteúdo). */
const FLOCOS = [
  { x: 8, t: 9, d: 0, s: 10 },
  { x: 22, t: 12, d: 3, s: 7 },
  { x: 37, t: 10, d: 6, s: 9 },
  { x: 51, t: 14, d: 1.5, s: 6 },
  { x: 64, t: 11, d: 4.5, s: 10 },
  { x: 78, t: 13, d: 7.5, s: 7 },
  { x: 90, t: 9.5, d: 2.5, s: 8 },
  { x: 15, t: 15, d: 9, s: 6 },
  { x: 70, t: 12.5, d: 10.5, s: 8 },
];

export function NeveMenu() {
  return (
    <div aria-hidden className="no-print pointer-events-none absolute inset-0 overflow-hidden">
      {FLOCOS.map((f, i) => (
        <Snowflake
          key={i}
          className="natal-neve absolute -top-4 text-white/25"
          style={{
            left: `${f.x}%`,
            width: f.s,
            height: f.s,
            animationDuration: `${f.t}s`,
            animationDelay: `${f.d}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Gorro de Papai Noel para pôr no canto do logo. */
export function Gorro({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("no-print pointer-events-none", className)}>
      <path d="M3.5 17.5C5 10 9 4.5 15 4c3 .3 4.6 2.6 5.2 5.8-.9-1.3-2.3-2-3.6-1.6C14.8 9 13.6 13 13 17.5z" fill="#dc2626" />
      <path d="M15 4c3 .3 4.6 2.6 5.2 5.8-.9-1.3-2.3-2-3.6-1.6" fill="#b91c1c" />
      <rect x="2.5" y="16.3" width="12" height="4" rx="2" fill="#f8fafc" />
      <circle cx="20.3" cy="10.6" r="2.2" fill="#f8fafc" />
    </svg>
  );
}

/** Cartão de contagem no pé do menu. */
export function CartaoNatal({ dias }: { dias: number | null }) {
  const texto =
    dias === null
      ? "Boas festas e um ótimo ano novo!"
      : dias === 0
        ? "Feliz Natal!"
        : dias === 1
          ? "Falta 1 dia para o Natal"
          : `Faltam ${dias} dias para o Natal`;

  return (
    <div className="relative mx-3 mb-2 overflow-hidden rounded-xl bg-gradient-to-br from-red-600/25 via-red-500/10 to-emerald-600/20 px-3 py-2.5 ring-1 ring-white/10">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
          <TreePine className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">Boas festas!</p>
          <p className="truncate text-[11px] text-slate-300">{texto}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Trenó com renas atravessando o alto da tela de vez em quando: a primeira
 * passada alguns segundos depois de abrir o sistema e, depois, a cada poucos
 * minutos. Não passa com a aba escondida nem para quem pediu menos movimento.
 */
const PRIMEIRA_PASSADA_MS = 4_000;
const INTERVALO_MS = 4 * 60_000;

export function Treno() {
  const [voo, setVoo] = useState(0);

  useEffect(() => {
    const movimentoReduzido = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (movimentoReduzido.matches) return;

    const voar = () => {
      if (document.visibilityState === "visible") setVoo((v) => v + 1);
    };
    const primeira = window.setTimeout(voar, PRIMEIRA_PASSADA_MS);
    const repetir = window.setInterval(voar, INTERVALO_MS);
    return () => {
      window.clearTimeout(primeira);
      window.clearInterval(repetir);
    };
  }, []);

  if (!voo) return null;

  return (
    <div
      key={voo}
      aria-hidden
      className="no-print natal-treno pointer-events-none fixed left-0 top-[4.25rem] z-[35] lg:top-3"
      onAnimationEnd={(e) => e.target === e.currentTarget && setVoo(0)}
    >
      <div className="natal-balanco">
        {/* A escala fica fora do balanço: a animação reescreve o transform. */}
        <div className="origin-left max-sm:scale-[0.65]">
          <DesenhoTreno />
        </div>
      </div>
    </div>
  );
}

function Rena({ x, nariz }: { x: number; nariz?: boolean }) {
  return (
    <g transform={`translate(${x} 0)`}>
      {/* chifres */}
      <path d="M34 9 L37 1 M36 4 L40 3 M34 9 L31 2 M32 5 L28 4" stroke="#7c5a3c" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      {/* corpo, pescoço e cabeça */}
      <ellipse cx="18" cy="22" rx="13" ry="6.5" fill="#a16207" />
      <path d="M27 19 L33 11 L37 13 L31 22 Z" fill="#a16207" />
      <ellipse cx="36" cy="11.5" rx="5" ry="3.6" fill="#a16207" />
      <circle cx="41" cy="12" r="1.7" fill={nariz ? "#ef4444" : "#3f2a1a"} />
      <circle cx="36.5" cy="10" r="0.8" fill="#1c1917" />
      {/* rabinho e patas em galope */}
      <path d="M5.5 19 L2 16.5" stroke="#a16207" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M9 26 L4 32 M14 27 L11 34 M24 27 L29 33 M28 25 L34 30" stroke="#854d0e" strokeWidth="2.2" strokeLinecap="round" />
      {/* arreio */}
      <path d="M22 16.5 L22 28" stroke="#dc2626" strokeWidth="2" />
      <circle cx="22" cy="28.5" r="1.4" fill="#facc15" />
    </g>
  );
}

function DesenhoTreno() {
  return (
    <svg width="260" height="64" viewBox="0 0 260 64" className="drop-shadow-[0_4px_6px_rgba(15,23,42,0.25)]">
      {/* rastro de estrelinhas */}
      <g fill="#facc15">
        <circle cx="4" cy="44" r="1.2" opacity="0.5" />
        <circle cx="14" cy="38" r="1.6" opacity="0.7" />
        <circle cx="10" cy="50" r="1" opacity="0.4" />
        <path d="M24 42 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4z" opacity="0.9" />
      </g>

      {/* rédeas */}
      <path d="M98 36 Q 130 30 150 24 Q 175 20 200 24" stroke="#78350f" strokeWidth="1" fill="none" />

      {/* trenó */}
      <g transform="translate(30 10)">
        {/* Papai Noel */}
        <circle cx="38" cy="10" r="6" fill="#fde7d4" />
        <path d="M32 12 Q38 24 44 12 Z" fill="#f8fafc" />
        <path d="M32 8 Q36 -2 46 2 L44 7 Z" fill="#dc2626" />
        <circle cx="46.5" cy="2.5" r="2" fill="#f8fafc" />
        <rect x="31" y="7" width="14" height="2.6" rx="1.3" fill="#f8fafc" />
        <path d="M30 16 h16 v12 h-16 z" fill="#dc2626" />
        {/* saco de presentes */}
        <path d="M10 22 Q 8 8 18 6 Q 28 8 26 22 Z" fill="#92400e" />
        <rect x="14" y="4" width="8" height="5" rx="1" fill="#22c55e" />
        <rect x="17.2" y="4" width="1.6" height="5" fill="#facc15" />
        {/* caixa do trenó */}
        <path d="M6 22 H62 Q66 22 66 27 V34 Q66 40 58 40 H16 Q6 40 6 30 Z" fill="#b91c1c" />
        <path d="M6 26 H66" stroke="#facc15" strokeWidth="2" />
        {/* esqui */}
        <path d="M8 46 H62 Q72 46 72 38" stroke="#facc15" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M18 40 V46 M50 40 V46" stroke="#facc15" strokeWidth="2" />
      </g>

      {/* renas */}
      <g transform="translate(108 14)">
        <Rena x={0} />
      </g>
      <g transform="translate(160 8)">
        <Rena x={0} />
      </g>
      <g transform="translate(212 2)">
        <Rena x={0} nariz />
      </g>
    </svg>
  );
}

/** Liga/desliga a decoração neste aparelho (Configurações → Aparência). */
export function AlternarNatal({ ligado }: { ligado: boolean }) {
  const router = useRouter();
  const [estado, setEstado] = useState(ligado);

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
        <TreePine className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">Decoração de Natal</span>
        <span className="block text-xs text-slate-500">
          Luzinhas no menu, neve e o trenó passando. Some sozinha depois do Dia de Reis.
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={estado}
        onChange={(e) => {
          setEstado(e.target.checked);
          salvarNatal(e.target.checked);
          router.refresh();
        }}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-slate-900 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}
