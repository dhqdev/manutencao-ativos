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
    <div aria-hidden className={cn("no-print pointer-events-none absolute inset-x-0 h-5", className)}>
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 20">
        <path
          d="M0 3 Q 6 9 12.5 3 T 25 3 T 37.5 3 T 50 3 T 62.5 3 T 75 3 T 87.5 3 T 100 3"
          fill="none"
          stroke="#166534"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          opacity="0.85"
        />
      </svg>
      <div className="relative flex h-full justify-around px-1">
        {Array.from({ length: quantidade }).map((_, i) => {
          const cor = CORES_LUZES[i % CORES_LUZES.length];
          return (
            <span
              key={i}
              className="mt-[4px] flex flex-col items-center"
              style={{ transform: `rotate(${i % 2 ? 12 : -12}deg)` }}
            >
              {/* soquete */}
              <span className="block h-[3px] w-[4px] rounded-[1px] bg-emerald-900" />
              {/* lâmpada com reflexo */}
              <span
                className="natal-luz relative block h-[9px] w-[6px] rounded-b-full rounded-t-[3px]"
                style={{
                  background: `radial-gradient(circle at 35% 30%, #ffffffcc 0 18%, ${cor} 45%)`,
                  color: cor,
                  animationDelay: `${(i % 3) * 0.6}s`,
                }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Neve leve caindo dentro do menu lateral (só dentro dele, nunca no conteúdo). */
const FLOCOS = [
  { x: 8, t: 9, d: 0, s: 10, floco: true },
  { x: 16, t: 13, d: 5, s: 4 },
  { x: 22, t: 12, d: 3, s: 7, floco: true },
  { x: 30, t: 10.5, d: 8, s: 3 },
  { x: 37, t: 10, d: 6, s: 9, floco: true },
  { x: 45, t: 14.5, d: 2, s: 4 },
  { x: 51, t: 14, d: 1.5, s: 6, floco: true },
  { x: 58, t: 11.5, d: 9.5, s: 3 },
  { x: 64, t: 11, d: 4.5, s: 10, floco: true },
  { x: 72, t: 13.5, d: 0.8, s: 4 },
  { x: 78, t: 13, d: 7.5, s: 7, floco: true },
  { x: 85, t: 10, d: 11, s: 3 },
  { x: 90, t: 9.5, d: 2.5, s: 8, floco: true },
  { x: 15, t: 15, d: 9, s: 6, floco: true },
  { x: 70, t: 12.5, d: 10.5, s: 8, floco: true },
];

export function NeveMenu() {
  return (
    <div aria-hidden className="no-print pointer-events-none absolute inset-0 overflow-hidden">
      {FLOCOS.map((f, i) => {
        const estilo = {
          left: `${f.x}%`,
          width: f.s,
          height: f.s,
          animationDuration: `${f.t}s`,
          animationDelay: `${f.d}s`,
        };
        return f.floco ? (
          <Snowflake key={i} className="natal-neve absolute -top-4 text-white/30" style={estilo} />
        ) : (
          <span key={i} className="natal-neve absolute -top-4 rounded-full bg-white/35 blur-[0.5px]" style={estilo} />
        );
      })}
    </div>
  );
}

/** Gorro de Papai Noel para pôr no canto do logo. */
export function Gorro({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("no-print pointer-events-none overflow-visible", className)}>
      <defs>
        <linearGradient id="natal-gorro" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ef4444" />
          <stop offset="1" stopColor="#b91c1c" />
        </linearGradient>
      </defs>
      {/* corpo do gorro, com a ponta caindo para o lado */}
      <path d="M3.5 17.5C4.6 10.5 8.6 4.6 14.6 4.1c3.3-.2 5.3 2.2 6 5.6-1.1-1.2-2.6-1.7-3.9-1.2C14.6 9.4 13.6 13.2 13.1 17.5z" fill="url(#natal-gorro)" />
      <path d="M14.6 4.1c3.3-.2 5.3 2.2 6 5.6-1.1-1.2-2.6-1.7-3.9-1.2" fill="#991b1b" opacity="0.7" />
      <path d="M6.6 14.5C7.8 10 10 7 13 5.6" stroke="#fca5a5" strokeWidth="0.8" strokeLinecap="round" fill="none" opacity="0.6" />
      {/* barra de pelúcia ondulada */}
      <path
        d="M3.4 16.6c.8-.9 1.8-.9 2.5 0 .8-.9 1.8-.9 2.5 0 .8-.9 1.8-.9 2.5 0 .8-.9 1.8-.9 2.5 0 1.3.3 1.7 1.6 1.1 2.7-.4 1-1.4 1.4-2.3 1-.8.8-1.9.8-2.6 0-.8.8-1.9.8-2.6 0-.8.8-1.9.8-2.6 0-1.4.2-2.3-1.6-1-3.7z"
        fill="#f8fafc"
      />
      <path d="M4 19.4c3 .6 7 .6 10.4 0" stroke="#cbd5e1" strokeWidth="0.6" fill="none" opacity="0.8" />
      {/* pompom */}
      <circle cx="20.4" cy="10.8" r="2.4" fill="#f8fafc" />
      <circle cx="19.8" cy="10.2" r="0.9" fill="#fff" />
      <path d="M21.4 12.6a2.4 2.4 0 0 1-2.8-.4" stroke="#cbd5e1" strokeWidth="0.6" fill="none" />
    </svg>
  );
}

/**
 * Bolinhas de árvore penduradas por um fio, balançando de leve. Vão no canto
 * do cartão do menu e da faixa do dashboard.
 */
const BOLAS = [
  { x: 8, fio: 8, r: 5.5, cor: "#dc2626", brilho: "#fca5a5", atraso: 0 },
  { x: 22, fio: 16, r: 4.5, cor: "#eab308", brilho: "#fef08a", atraso: 0.5, estrela: true },
  { x: 35, fio: 6, r: 5, cor: "#16a34a", brilho: "#86efac", atraso: 1 },
];

export function Enfeites({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 34" aria-hidden className={cn("no-print pointer-events-none overflow-visible", className)}>
      {BOLAS.map((b) => (
        <g
          key={b.x}
          className="natal-enfeite"
          style={{ transformOrigin: `${b.x}px 0px`, animationDelay: `${b.atraso}s` }}
        >
          <path d={`M${b.x} 0 V${b.fio}`} stroke="#94a3b8" strokeWidth="0.6" />
          <rect x={b.x - 1.6} y={b.fio - 0.5} width="3.2" height="2.4" rx="0.5" fill="#d4a017" />
          {b.estrela ? (
            <path
              d={`M${b.x} ${b.fio + 1.5} l1.7 3.5 3.8 .5 -2.8 2.7 .7 3.8 -3.4 -1.8 -3.4 1.8 .7 -3.8 -2.8 -2.7 3.8 -.5z`}
              fill={b.cor}
              stroke="#ca8a04"
              strokeWidth="0.4"
              strokeLinejoin="round"
            />
          ) : (
            <>
              <circle cx={b.x} cy={b.fio + 1.6 + b.r} r={b.r} fill={b.cor} />
              <path
                d={`M${b.x - b.r} ${b.fio + 1.6 + b.r} q${b.r} 2 ${b.r * 2} 0`}
                stroke="#fff"
                strokeOpacity="0.45"
                strokeWidth="0.8"
                fill="none"
              />
              <circle cx={b.x - b.r * 0.38} cy={b.fio + 1.6 + b.r * 0.6} r={b.r * 0.28} fill={b.brilho} opacity="0.9" />
            </>
          )}
        </g>
      ))}
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
    <div className="relative mx-3 mb-2 overflow-hidden rounded-xl bg-gradient-to-br from-red-700/40 via-red-600/15 to-emerald-700/30 px-3 py-2.5 ring-1 ring-white/10">
      <Enfeites className="absolute -top-px right-1.5 h-9 w-11" />
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-300/20">
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

/*
 * Rena de perfil, em pleno voo: patas da frente esticadas para a frente, as
 * de trás para trás (as duas balançam de leve, como num galope). Pelo com
 * degradê, barriga e focinho mais claros, chifres galhados, coleira com
 * guizos. A da frente é a do nariz vermelho, que brilha.
 */
function Rena({ nariz, atraso = 0 }: { nariz?: boolean; atraso?: number }) {
  const galope = { animationDelay: `${atraso}s` };
  return (
    <g>
      {/* patas do lado de lá (mais escuras, atrás do corpo) */}
      <g className="natal-patas-tras" style={galope}>
        <path d="M18 32 C14 36 10 38 5 38.5" stroke="#5b371d" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M5 38.5 l-2.2 .4" stroke="#24150b" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className="natal-patas-frente" style={galope}>
        <path d="M43 32 C47 36 51 35 55 31.5" stroke="#5b371d" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M55 31.5 l1.6 -1.6" stroke="#24150b" strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* rabinho */}
      <path d="M13 22.5 C10 20 8.5 20.5 8 22 C9 24 11 24.5 13 24.5 Z" fill="#f5ead8" />

      {/* corpo */}
      <path
        d="M13 23 C13 18 20 16.5 29 17 C36 17.5 42 16.5 46.5 19 C50.5 21.5 50.5 29.5 46 32 C40 35 23 35.5 17 33.5 C12.5 32 12 27.5 13 23 Z"
        fill="url(#natal-pelo)"
      />
      {/* barriga clara */}
      <path d="M19 32.6 C26 34.4 38 34.4 44.5 31.4 C40 30 28 30.6 19 30.6 Z" fill="#e7cfa6" opacity="0.9" />

      {/* pescoço e peito */}
      <path d="M41 22 C43 16 47 11.5 52 9 L57.5 12.5 C54.5 15 51.5 20 49.5 27 C47 28 43 26 41 22 Z" fill="url(#natal-pelo)" />
      <path d="M48.5 26 C49.5 21 51.5 17 54 14.5 C52.5 19 51.5 23 50 27 Z" fill="#e7cfa6" opacity="0.85" />

      {/* chifres galhados (atrás da cabeça) */}
      <g stroke="#d9bf92" strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d="M54 6.5 C53 2.5 50.5 -0.5 46.5 -2.5" />
        <path d="M51.8 0.8 C52.6 -1.4 53.8 -2.8 55.6 -3.4" />
        <path d="M49 -1.4 C48.2 -3.4 48 -5 48.6 -6.6" />
        <path d="M56.5 6 C57 2.5 59 0 62.5 -1" />
        <path d="M58.6 1.6 C58.4 -0.6 58.8 -2.2 60 -3.6" />
      </g>

      {/* orelha */}
      <path d="M53 7.5 C50.5 5 48 4.6 46.8 5.6 C48.4 7.6 50.6 8.8 53 9.4 Z" fill="#7a4a26" />
      <path d="M52.2 7.8 C50.6 6.5 49.2 6.1 48.4 6.3 C49.6 7.4 50.8 8.1 52.2 8.5 Z" fill="#e7b9a0" />

      {/* cabeça e focinho */}
      <path d="M51.5 9 C52 5.5 55.5 4 59 5 C61.5 5.7 63 7.5 65.5 9 C68.4 10.6 68.6 13.6 66 14.4 C63 15.3 59.5 15.2 56.5 14.2 C53 13 51.2 11.4 51.5 9 Z" fill="url(#natal-pelo)" />
      <path d="M61 10.2 C63.5 10 66.5 10.6 67.6 12.4 C67.2 14 64.5 14.8 61.8 14.4 C60.2 13.4 60 11.2 61 10.2 Z" fill="#c9a074" />
      <path d="M62.5 13.8 q2 .8 3.6 -.2" stroke="#4a2c17" strokeWidth="0.6" strokeLinecap="round" fill="none" />

      {/* olho com brilho e cílio */}
      <ellipse cx="58.3" cy="8.6" rx="1.1" ry="1.25" fill="#1c1210" />
      <circle cx="58.7" cy="8.1" r="0.4" fill="#fff" />
      <path d="M57 7.3 q1.2 -.9 2.6 -.3" stroke="#3b2414" strokeWidth="0.5" strokeLinecap="round" fill="none" />

      {/* nariz */}
      {nariz ? (
        <>
          <circle className="natal-nariz" cx="68" cy="11.8" r="4" fill="url(#natal-brilho-nariz)" />
          <circle cx="68" cy="11.8" r="2" fill="#ef4444" />
          <circle cx="67.4" cy="11.2" r="0.6" fill="#fecaca" />
        </>
      ) : (
        <ellipse cx="67.6" cy="11.8" rx="1.5" ry="1.3" fill="#2b1a10" />
      )}

      {/* coleira com guizos */}
      <path d="M50.5 11 C49.5 15 47.8 19.5 46 23" stroke="#b91c1c" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <circle cx="49.6" cy="15.4" r="1.3" fill="#fbbf24" stroke="#b45309" strokeWidth="0.4" />
      <circle cx="48" cy="19.6" r="1.3" fill="#fbbf24" stroke="#b45309" strokeWidth="0.4" />

      {/* arreio na barriga */}
      <path d="M34 17.2 C33.4 23 33.4 28.5 34.2 34" stroke="#b91c1c" strokeWidth="2.4" fill="none" />
      <path d="M34 17.2 C33.4 23 33.4 28.5 34.2 34" stroke="#fbbf24" strokeWidth="0.6" strokeDasharray="1.2 2" fill="none" />

      {/* patas do lado de cá */}
      <g className="natal-patas-tras" style={galope}>
        <path d="M21 31 C17 35.5 12.5 37 7.5 36.5" stroke="#6b4024" strokeWidth="3.2" strokeLinecap="round" fill="none" />
        <path d="M7.5 36.5 l-2.3 -.3" stroke="#24150b" strokeWidth="3.2" strokeLinecap="round" />
      </g>
      <g className="natal-patas-frente" style={galope}>
        <path d="M45.5 30.5 C49 35.5 53.5 35.5 58 33" stroke="#6b4024" strokeWidth="3.2" strokeLinecap="round" fill="none" />
        <path d="M58 33 l1.8 -1.4" stroke="#24150b" strokeWidth="3.2" strokeLinecap="round" />
      </g>
    </g>
  );
}

/** Papai Noel sentado no trenó, segurando as rédeas, com o saco de presentes atrás. */
function TrenoComPapaiNoel() {
  return (
    <g>
      {/* saco de presentes */}
      <path d="M14 30 C10 22 12 12 20 9.5 C22 8.8 24 8.8 26 9.5 C33 12 34 22 31 30 Z" fill="url(#natal-saco)" />
      <path d="M18.5 10.5 C20.5 12.5 24.5 12.5 27 10.5" stroke="#5c3a1e" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <rect x="16.5" y="3.5" width="7" height="7" rx="1" fill="#16a34a" transform="rotate(-12 20 7)" />
      <rect x="19.2" y="3.2" width="1.6" height="7.4" fill="#fde047" transform="rotate(-12 20 7)" />
      <rect x="23.5" y="5" width="6" height="6" rx="1" fill="#2563eb" transform="rotate(10 26.5 8)" />
      <rect x="25.8" y="4.8" width="1.4" height="6.4" fill="#f8fafc" transform="rotate(10 26.5 8)" />

      {/* Papai Noel: casaco, cinto, braço esticado e luva */}
      <path d="M33 30 C32 21 35 15.5 42 15 C49 14.6 52 19 52 30 Z" fill="url(#natal-casaco)" />
      <rect x="33" y="24.5" width="19" height="3.2" fill="#1f2937" />
      <rect x="40.5" y="24" width="4.2" height="4.2" rx="0.6" fill="none" stroke="#fbbf24" strokeWidth="1" />
      <path d="M46 19 C51 19.5 55 19 59 17.5" stroke="#dc2626" strokeWidth="4.2" strokeLinecap="round" fill="none" />
      <path d="M56.6 18.4 L57.8 17.9" stroke="#f8fafc" strokeWidth="4.6" strokeLinecap="butt" />
      <circle cx="60.4" cy="17" r="2.3" fill="#1f2937" />

      {/* rosto, barba e bigode */}
      <circle cx="44" cy="9" r="5.2" fill="#fcd9bd" />
      <circle cx="47.2" cy="10.6" r="1.4" fill="#fda4af" opacity="0.7" />
      <path d="M38.5 9.5 C38 15 40 19.5 44 20.5 C48.5 19.5 50 15.5 49.4 11 C47.5 12.6 45 12.8 43 12 C41.2 11.4 39.8 10.6 38.5 9.5 Z" fill="#f8fafc" />
      <path d="M44 11.2 C45.5 10.2 47.5 10.4 48.6 11.6 C47 12.4 45.4 12.3 44 11.2 Z" fill="#e2e8f0" />
      <circle cx="47.6" cy="10" r="1.1" fill="#f87171" />
      <path d="M45 7.4 q.9 -.7 1.8 0" stroke="#1f2937" strokeWidth="0.7" strokeLinecap="round" fill="none" />

      {/* gorro caindo para trás */}
      <path d="M38.6 6.4 C38.4 1.5 42 -1.2 46.4 -0.6 C44 0.4 41 1.8 38.4 4.4" fill="#b91c1c" />
      <path d="M38.8 6.2 C39 1.4 43.4 -0.8 48.6 4.6 L49.6 6 Z" fill="#dc2626" />
      <path d="M40 0.8 C37 -0.6 34.2 0.6 33.4 3.4" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="33.2" cy="4.2" r="2" fill="#f8fafc" />
      <rect x="37.8" y="5" width="12.4" height="3" rx="1.5" fill="#f8fafc" />

      {/* caixa do trenó, com frisos dourados */}
      <path
        d="M6 22 C6 17.5 9.5 16 12.5 18 L15 28 L62 28 C67 28 69 23 70.5 18.5 C72 14 77.5 14.5 77.5 19.5 C77.5 30 71 40 60 40 L18 40 C10 40 6 32 6 22 Z"
        fill="url(#natal-treno)"
      />
      <path d="M10 26 C11.5 33 14.5 36.5 19 36.5 L59 36.5 C66 36.5 71 30 73.5 21" stroke="#fbbf24" strokeWidth="1.4" fill="none" />
      <path d="M38 32.4 c1.4 -2 3.2 -2 4 0 c.8 -2 2.6 -2 4 0" stroke="#fde68a" strokeWidth="0.9" fill="none" strokeLinecap="round" />
      <circle cx="75" cy="18.6" r="1.6" fill="#fbbf24" />

      {/* esqui com a ponta enrolada */}
      <path d="M20 40 V46 M56 40 V46" stroke="#d4a017" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 46 H66 C74 46 78 42 77 37.5 C76.4 35 73.6 35 73.4 37.4 C73.3 39 75 39.6 75.8 38.6" stroke="#fbbf24" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** Renas lado a lado, cada uma um pouco mais alta (a fila sobe em diagonal). */
const RENAS = [
  { x: 112, y: 18, atraso: 0 },
  { x: 178, y: 11, atraso: 0.18 },
  { x: 244, y: 4, atraso: 0.36, nariz: true },
];

function DesenhoTreno() {
  return (
    <svg width="320" height="72" viewBox="0 -6 320 72" className="overflow-visible drop-shadow-[0_4px_6px_rgba(15,23,42,0.25)]">
      <defs>
        <linearGradient id="natal-pelo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a86b3c" />
          <stop offset="1" stopColor="#7a4a26" />
        </linearGradient>
        <radialGradient id="natal-brilho-nariz">
          <stop offset="0" stopColor="#f87171" stopOpacity="0.9" />
          <stop offset="1" stopColor="#f87171" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="natal-treno" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dc2626" />
          <stop offset="1" stopColor="#991b1b" />
        </linearGradient>
        <linearGradient id="natal-casaco" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ef4444" />
          <stop offset="1" stopColor="#b91c1c" />
        </linearGradient>
        <linearGradient id="natal-saco" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a16207" />
          <stop offset="1" stopColor="#78350f" />
        </linearGradient>
      </defs>

      {/* rastro de estrelinhas piscando */}
      <g fill="#fde047">
        <circle className="natal-brilho" cx="4" cy="46" r="1.2" />
        <circle className="natal-brilho" cx="14" cy="40" r="1.5" style={{ animationDelay: "0.3s" }} />
        <circle className="natal-brilho" cx="9" cy="53" r="1" style={{ animationDelay: "0.6s" }} />
        <path className="natal-brilho" d="M24 40 l1.4 3.2 3.2 1.4 -3.2 1.4 -1.4 3.2 -1.4 -3.2 -3.2 -1.4 3.2 -1.4z" style={{ animationDelay: "0.15s" }} />
        <path className="natal-brilho" d="M12 30 l.9 2 2 .9 -2 .9 -.9 2 -.9 -2 -2 -.9 2 -.9z" style={{ animationDelay: "0.45s" }} />
      </g>

      {/* rédeas da luva do Papai Noel até a coleira de cada rena */}
      <g stroke="#7c2d12" strokeWidth="0.9" fill="none">
        {RENAS.map((r) => (
          <path key={r.x} d={`M90 27 Q ${(90 + r.x + 47) / 2} ${r.y + 26} ${r.x + 47} ${r.y + 21}`} />
        ))}
      </g>

      <g transform="translate(30 10)">
        <TrenoComPapaiNoel />
      </g>

      {RENAS.map((r) => (
        <g key={r.x} transform={`translate(${r.x} ${r.y})`}>
          <Rena nariz={r.nariz} atraso={r.atraso} />
        </g>
      ))}
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
          Luzinhas no menu, neve, enfeites e o trenó com as renas passando. Some sozinha depois do Dia de Reis.
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
