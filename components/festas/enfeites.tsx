import type { CSSProperties } from "react";
import { cn } from "@/components/ui";
import type { FestaDoDia, IdFesta } from "@/lib/festas";
import { variar } from "./sorteio";
import { TEMAS, clara, contagem, diaPorExtenso, tinta } from "./temas";

/*
 * Enfeites das datas comemorativas. Tudo aqui é enfeite: aria-hidden, sem
 * capturar o mouse, fora da impressão e parado para quem pediu menos
 * movimento (bloco prefers-reduced-motion do globals.css). Quando e qual data
 * aparece é decidido em lib/festas.ts.
 *
 * Animação só de transform e opacity, com tempos sorteados (com semente) para
 * não piscar tudo junto, como luz de verdade.
 */

type Estilo = CSSProperties & Record<`--${string}`, string>;

/* ---------------------------------------------------------------------------
   Natal: fio de luzinhas. Cada lâmpada pende no ponto mais baixo do seu
   trecho de fio e acende e apaga no seu tempo (o brilho é uma camada à parte
   que só muda de opacidade).
--------------------------------------------------------------------------- */
const CORES_LUZES = ["#f43f5e", "#fbbf24", "#34d399", "#60a5fa"];

function PiscaPisca({ quantidade, className }: { quantidade: number; className?: string }) {
  const trecho = 10;
  const fio = Array.from({ length: quantidade }, (_, i) => `Q ${i * trecho + trecho / 2} 10 ${(i + 1) * trecho} 2`).join(" ");
  return (
    <div aria-hidden className={cn("no-print pointer-events-none absolute inset-x-0 h-6", className)}>
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox={`0 0 ${quantidade * trecho} 12`}>
        <path d={`M0 2 ${fio}`} fill="none" stroke="#14532d" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
      </svg>
      {Array.from({ length: quantidade }).map((_, i) => {
        const cor = CORES_LUZES[i % CORES_LUZES.length];
        return (
          <span
            key={i}
            className="absolute top-[11px] flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${((i + 0.5) / quantidade) * 100}%`, rotate: `${i % 2 ? 9 : -9}deg`, transformOrigin: "top" }}
          >
            <span className="block h-[3px] w-[4px] rounded-[1px] bg-emerald-950" />
            <span className="relative block h-[9px] w-[6px]">
              {/* vidro apagado */}
              <span className="absolute inset-0 rounded-b-full rounded-t-[3px] opacity-45" style={{ background: cor }} />
              {/* acesa: lâmpada com reflexo + halo; só esta camada pisca */}
              <span
                className="festa-luz absolute inset-0"
                style={{ animationDuration: `${variar(i, 2.2, 4.2)}s`, animationDelay: `${-variar(i + 7, 0, 4)}s` }}
              >
                <span
                  className="absolute -inset-[5px] rounded-full blur-[3px]"
                  style={{ background: `radial-gradient(circle, ${tinta(cor, 70)} 0, transparent 70%)` }}
                />
                <span
                  className="absolute inset-0 rounded-b-full rounded-t-[3px]"
                  style={{ background: `radial-gradient(circle at 35% 30%, #fff 0 16%, ${cor} 52%)` }}
                />
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   São João: varal de bandeirinhas com o recorte em V, tremulando no vento.
--------------------------------------------------------------------------- */
const CORES_BANDEIRAS = ["#ef4444", "#facc15", "#3b82f6", "#22c55e", "#f97316", "#ec4899"];

function Bandeirinhas({ trechos, className }: { trechos: number; className?: string }) {
  const porTrecho = 5;
  const topo = 1.5;
  const fundo = 9; // ponto de controle: o quanto o barbante cede
  const fio = Array.from({ length: trechos }, (_, i) => `Q ${(i + 0.5) * 10} ${fundo} ${(i + 1) * 10} ${topo}`).join(" ");
  return (
    <div aria-hidden className={cn("no-print pointer-events-none absolute inset-x-0 h-8", className)}>
      <svg className="absolute inset-x-0 top-0 h-5 w-full" preserveAspectRatio="none" viewBox={`0 0 ${trechos * 10} 12`}>
        <path d={`M0 ${topo} ${fio}`} fill="none" stroke="#d6c7a1" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      {Array.from({ length: trechos * porTrecho }).map((_, k) => {
        const trecho = Math.floor(k / porTrecho);
        const t = ((k % porTrecho) + 0.5) / porTrecho;
        // Curva do barbante (quadrática simétrica): x anda reto, y cede no meio.
        const y = topo + 2 * t * (1 - t) * (fundo - topo);
        return (
          <span
            key={k}
            className="festa-tremular absolute block h-[11px] w-[9px] -translate-x-1/2"
            style={{
              left: `${((trecho + t) / trechos) * 100}%`,
              top: `${(y / 12) * 1.25 - 0.06}rem`,
              background: CORES_BANDEIRAS[k % CORES_BANDEIRAS.length],
              clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%)",
              animationDuration: `${variar(k, 2.4, 3.8)}s`,
              animationDelay: `${-variar(k + 3, 0, 3)}s`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   As outras datas: um filete fino nas cores do tema, com um brilho que passa
   devagar de vez em quando.
--------------------------------------------------------------------------- */
function Filete({ festa, className }: { festa: IdFesta; className?: string }) {
  const [a, b] = TEMAS[festa].cores;
  return (
    <div aria-hidden className={cn("no-print pointer-events-none absolute inset-x-0 h-[2px] overflow-hidden", className)}>
      <span className="absolute inset-0" style={{ background: `linear-gradient(90deg, transparent, ${a} 18%, ${b} 82%, transparent)` }} />
      <span
        className="festa-reflexo absolute inset-y-0 w-1/3"
        style={{ background: "linear-gradient(90deg, transparent, rgb(255 255 255 / 0.85), transparent)" }}
      />
    </div>
  );
}

/**
 * O enfeite da borda: no topo do menu lateral (`menu`) ou pendurado embaixo
 * do topo do celular (`celular`).
 */
export function EnfeiteBorda({
  festa,
  onde,
  compacto,
}: {
  festa: IdFesta;
  onde: "menu" | "celular";
  /** Menu recolhido: menos lâmpadas e bandeirinhas. */
  compacto?: boolean;
}) {
  if (festa === "natal")
    return onde === "menu" ? (
      <PiscaPisca className="top-0" quantidade={compacto ? 3 : 9} />
    ) : (
      <PiscaPisca className="-bottom-[13px]" quantidade={11} />
    );
  if (festa === "junina")
    return onde === "menu" ? (
      <Bandeirinhas className="top-0" trechos={compacto ? 1 : 3} />
    ) : (
      <Bandeirinhas className="-bottom-[30px]" trechos={4} />
    );
  return <Filete festa={festa} className={onde === "menu" ? "top-0" : "-bottom-px"} />;
}

/* ---------------------------------------------------------------------------
   Pingentes pendurados por um fio, balançando de leve: bolinhas e estrela no
   Natal, ovinhos pintados na Páscoa. Vão no canto do cartão do menu e da
   faixa do Dashboard.
--------------------------------------------------------------------------- */
type Pingente = { x: number; fio: number; r: number; cor: string; brilho: string; forma: "bola" | "estrela" | "ovo" };

const PINGENTES: Partial<Record<IdFesta, Pingente[]>> = {
  natal: [
    { x: 8, fio: 8, r: 5.5, cor: "#dc2626", brilho: "#fca5a5", forma: "bola" },
    { x: 22, fio: 16, r: 4.5, cor: "#eab308", brilho: "#fef08a", forma: "estrela" },
    { x: 35, fio: 6, r: 5, cor: "#16a34a", brilho: "#86efac", forma: "bola" },
  ],
  pascoa: [
    { x: 9, fio: 7, r: 4.6, cor: "#c4b5fd", brilho: "#f5f3ff", forma: "ovo" },
    { x: 22, fio: 14, r: 4, cor: "#fcd34d", brilho: "#fffbeb", forma: "ovo" },
    { x: 35, fio: 5, r: 4.4, cor: "#f9a8d4", brilho: "#fdf2f8", forma: "ovo" },
  ],
};

export function Pingentes({ festa, className }: { festa: IdFesta; className?: string }) {
  const itens = PINGENTES[festa];
  if (!itens) return null;
  return (
    <svg viewBox="0 0 44 34" aria-hidden className={cn("no-print pointer-events-none overflow-visible", className)}>
      {itens.map((b, i) => {
        const cy = b.fio + 1.6 + b.r;
        return (
          <g
            key={b.x}
            className="festa-pendulo"
            style={{ transformOrigin: `${b.x}px 0px`, animationDuration: `${3 + i * 0.4}s`, animationDelay: `${-i * 0.9}s` }}
          >
            <path d={`M${b.x} 0 V${b.fio}`} stroke="#94a3b8" strokeWidth="0.6" />
            {b.forma !== "ovo" && (
              <rect x={b.x - 1.6} y={b.fio - 0.5} width="3.2" height="2.4" rx="0.5" fill="#d4a017" />
            )}
            {b.forma === "estrela" && (
              <path
                d={`M${b.x} ${b.fio + 1.5} l1.7 3.5 3.8 .5 -2.8 2.7 .7 3.8 -3.4 -1.8 -3.4 1.8 .7 -3.8 -2.8 -2.7 3.8 -.5z`}
                fill={b.cor}
                stroke="#ca8a04"
                strokeWidth="0.4"
                strokeLinejoin="round"
              />
            )}
            {b.forma === "bola" && (
              <>
                <circle cx={b.x} cy={cy} r={b.r} fill={b.cor} />
                <path d={`M${b.x - b.r} ${cy} q${b.r} 2 ${b.r * 2} 0`} stroke="#fff" strokeOpacity="0.45" strokeWidth="0.8" fill="none" />
                <circle cx={b.x - b.r * 0.38} cy={cy - b.r * 0.4} r={b.r * 0.28} fill={b.brilho} opacity="0.9" />
              </>
            )}
            {b.forma === "ovo" && (
              <>
                <ellipse cx={b.x} cy={b.fio + b.r * 1.25} rx={b.r} ry={b.r * 1.3} fill={b.cor} />
                {/* faixa em zigue-zague pintada no meio */}
                <path
                  d={`M${b.x - b.r} ${b.fio + b.r * 1.3} l${b.r / 2} -1 ${b.r / 2} 1 ${b.r / 2} -1 ${b.r / 2} 1`}
                  stroke={b.brilho}
                  strokeWidth="0.8"
                  strokeLinejoin="round"
                  fill="none"
                />
                <ellipse cx={b.x - b.r * 0.35} cy={b.fio + b.r * 0.7} rx={b.r * 0.22} ry={b.r * 0.34} fill="#fff" opacity="0.6" />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   Cartão no pé do menu lateral: a data, a contagem e uma barrinha com quanto
   da espera de 30 dias já passou.
--------------------------------------------------------------------------- */
export function CartaoFesta({ festa }: { festa: FestaDoDia }) {
  const tema = TEMAS[festa.id];
  const [a, b] = tema.cores;
  const { Icone } = tema;

  return (
    <div
      className="relative mx-3 mb-2 overflow-hidden rounded-xl px-3 py-2.5 ring-1 ring-white/10"
      style={{ background: `linear-gradient(135deg, ${tinta(a, 26)}, ${tinta(b, 10)} 75%)` }}
      title={diaPorExtenso(festa.inicio)}
    >
      <Pingentes festa={festa.id} className="absolute -top-px right-1.5 h-9 w-11" />
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-white/15"
          style={{ background: tinta(a, 22), color: clara(a) }}
        >
          <Icone className="h-4 w-4" />
        </span>
        <div className={cn("min-w-0 flex-1", PINGENTES[festa.id] && "pr-9")}>
          <p className="truncate text-xs font-semibold text-white">{festa.durante ? tema.saudacao(festa) : festa.nome}</p>
          <p className="text-[11px] leading-snug text-slate-300">
            {festa.durante ? tema.recadoNoDia : festa.dias === 1 ? "Falta 1 dia" : `Faltam ${festa.dias} dias`}
          </p>
        </div>
      </div>
      {!festa.durante && (
        <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(4, festa.progresso * 100)}%`, background: `linear-gradient(90deg, ${a}, ${clara(a, 75)})` }}
          />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Faixa do Dashboard (só na reta final): fina, nas cores do tema misturadas à
   superfície, então serve no tema claro e no escuro.
--------------------------------------------------------------------------- */
export function FaixaFesta({ festa }: { festa: FestaDoDia }) {
  const tema = TEMAS[festa.id];
  const [a, b] = tema.cores;
  const { Icone } = tema;
  const temPingentes = Boolean(PINGENTES[festa.id]);

  return (
    <div
      data-festa={festa.id}
      className="relative mb-4 flex items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 sm:mb-6"
      style={
        {
          borderColor: `color-mix(in oklab, ${a} 26%, var(--color-slate-200))`,
          background: `linear-gradient(100deg, color-mix(in oklab, ${a} 9%, var(--color-superficie)), var(--color-superficie) 55%, color-mix(in oklab, ${b} 7%, var(--color-superficie)))`,
        } as Estilo
      }
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
        style={{ background: `linear-gradient(135deg, ${a}, color-mix(in oklab, ${a} 70%, black))` }}
      >
        <Icone className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{contagem(festa)}</p>
        <p className="text-xs text-slate-600 sm:text-[13px]">{festa.durante ? tema.recadoNoDia : tema.recado}</p>
      </div>
      <p className={cn("hidden shrink-0 text-xs text-slate-500 first-letter:uppercase sm:block", temPingentes && "sm:mr-20")}>
        {diaPorExtenso(festa.inicio)}
      </p>
      {temPingentes && <Pingentes festa={festa.id} className="absolute -top-px right-4 hidden h-12 w-16 sm:block" />}
    </div>
  );
}
