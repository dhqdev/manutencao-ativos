import { useId, type ReactNode } from "react";
import { Logo } from "@/components/marca";
import { cn } from "@/components/ui";
import type { IdFesta } from "@/lib/festas";

/*
 * Um detalhe no logo para cada data: gorro no Natal, capacete no Dia do
 * Trabalhador, chapéu de palha no São João... Desenhos pequenos em SVG,
 * aria-hidden, fora da impressão. O que fica "atrás" do logo (as orelhas da
 * Páscoa) vem antes dele no DOM; o resto vem depois, por cima.
 */

type Tamanho = "sm" | "md" | "lg";

/** Classes de posição e tamanho por tamanho de logo (sm 32px, md 36px, lg 56px). */
const POR_TAMANHO = (sm: string, md: string, lg: string) => ({ sm, md, lg });

const svg = "no-print pointer-events-none absolute overflow-visible";

/**
 * Id único para o degradê de cada desenho: o logo aparece duas vezes na mesma
 * página (menu lateral e topo do celular, um deles escondido) e id repetido
 * faz o navegador buscar o degradê dentro do que está escondido.
 */
function useIdSvg(nome: string) {
  return `festa-${nome}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function Gorro({ className }: { className: string }) {
  const id = useIdSvg("gorro");
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn(svg, className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ef4444" />
          <stop offset="1" stopColor="#b91c1c" />
        </linearGradient>
      </defs>
      <path d="M3.5 17.5C4.6 10.5 8.6 4.6 14.6 4.1c3.3-.2 5.3 2.2 6 5.6-1.1-1.2-2.6-1.7-3.9-1.2C14.6 9.4 13.6 13.2 13.1 17.5z" fill={`url(#${id})`} />
      <path d="M14.6 4.1c3.3-.2 5.3 2.2 6 5.6-1.1-1.2-2.6-1.7-3.9-1.2" fill="#991b1b" opacity="0.7" />
      <path d="M6.6 14.5C7.8 10 10 7 13 5.6" stroke="#fca5a5" strokeWidth="0.8" strokeLinecap="round" fill="none" opacity="0.6" />
      <path
        d="M3.4 16.6c.8-.9 1.8-.9 2.5 0 .8-.9 1.8-.9 2.5 0 .8-.9 1.8-.9 2.5 0 .8-.9 1.8-.9 2.5 0 1.3.3 1.7 1.6 1.1 2.7-.4 1-1.4 1.4-2.3 1-.8.8-1.9.8-2.6 0-.8.8-1.9.8-2.6 0-.8.8-1.9.8-2.6 0-1.4.2-2.3-1.6-1-3.7z"
        fill="#f8fafc"
      />
      <path d="M4 19.4c3 .6 7 .6 10.4 0" stroke="#cbd5e1" strokeWidth="0.6" fill="none" opacity="0.8" />
      <circle cx="20.4" cy="10.8" r="2.4" fill="#f8fafc" />
      <circle cx="19.8" cy="10.2" r="0.9" fill="#fff" />
      <path d="M21.4 12.6a2.4 2.4 0 0 1-2.8-.4" stroke="#cbd5e1" strokeWidth="0.6" fill="none" />
    </svg>
  );
}

/** Ano Novo: duas estrelinhas douradas cintilando no canto. */
function Brilho({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn(svg, className)}>
      <g className="festa-cintilar" style={{ animationDuration: "3.2s" }}>
        <path d="M10 2C10.8 8 13 10.2 19 11 13 11.8 10.8 14 10 20 9.2 14 7 11.8 1 11 7 10.2 9.2 8 10 2Z" fill="#fcd34d" />
        <path d="M10 6.5C10.4 9.4 11.6 10.6 14.5 11 11.6 11.4 10.4 12.6 10 15.5 9.6 12.6 8.4 11.4 5.5 11 8.4 10.6 9.6 9.4 10 6.5Z" fill="#fffbeb" />
      </g>
      <path
        className="festa-cintilar"
        style={{ animationDuration: "2.4s", animationDelay: "-1.2s" }}
        d="M20 0C20.4 2.6 21.4 3.6 24 4 21.4 4.4 20.4 5.4 20 8 19.6 5.4 18.6 4.4 16 4 18.6 3.6 19.6 2.6 20 0Z"
        fill="#fde68a"
      />
    </svg>
  );
}

/** Carnaval: máscara de colombina com pluma. */
function Mascara({ className }: { className: string }) {
  const id = useIdSvg("mascara");
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn(svg, className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e879f9" />
          <stop offset="1" stopColor="#9333ea" />
        </linearGradient>
      </defs>
      {/* pluma */}
      <path d="M18.6 10.2C18 6.4 19.6 2.6 23 .6c.4 3.6-.9 7.2-3.6 9.8z" fill="#22d3ee" />
      <path d="M19.2 10C19.8 7 21 4.2 23 .6" stroke="#0e7490" strokeWidth="0.5" fill="none" />
      {/* máscara */}
      <path
        d="M2.2 11.2C4.8 9 8.8 9.2 12 11.6 15.2 9.2 19.2 9 21.8 11.2c.5 3.6-2 6.6-5.1 6.4-2-.1-3.6-1.4-4.7-2.7-1.1 1.3-2.7 2.6-4.7 2.7C4.2 17.8 1.7 14.8 2.2 11.2Z"
        fill={`url(#${id})`}
        stroke="#fbbf24"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      <ellipse cx="7.6" cy="13.5" rx="2.3" ry="1.35" transform="rotate(-8 7.6 13.5)" fill="#1e1b4b" />
      <ellipse cx="16.4" cy="13.5" rx="2.3" ry="1.35" transform="rotate(8 16.4 13.5)" fill="#1e1b4b" />
      <circle cx="12" cy="12.6" r="0.8" fill="#fde047" />
      <circle cx="4.6" cy="11.4" r="0.45" fill="#fff" opacity="0.8" />
      <circle cx="19.4" cy="11.4" r="0.45" fill="#fff" opacity="0.8" />
    </svg>
  );
}

/** Páscoa: orelhas de coelho atrás do logo; a da direita mexe de vez em quando. */
function Orelhas({ className }: { className: string }) {
  // A inclinação fica no <g> de fora: a animação do CSS reescreveria o transform.
  const orelha = (x: number, giro: number, mexe?: boolean) => (
    <g transform={`rotate(${giro} ${x} 22)`}>
      <g className={mexe ? "festa-orelha" : undefined} style={{ transformOrigin: `${x}px 22px` }}>
        <ellipse cx={x} cy="11" rx="3.4" ry="10" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="0.6" />
        <ellipse cx={x} cy="11.8" rx="1.6" ry="7" fill="#f9a8d4" />
      </g>
    </g>
  );
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn(svg, className)}>
      {orelha(7.5, -14)}
      {orelha(16.5, 12, true)}
    </svg>
  );
}

/** Dia do Trabalhador: capacete de obra. */
function Capacete({ className }: { className: string }) {
  const id = useIdSvg("capacete");
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn(svg, className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde047" />
          <stop offset="1" stopColor="#eab308" />
        </linearGradient>
      </defs>
      <path d="M4.2 15.6C4.2 9.6 7.6 5.6 12 5.6s7.8 4 7.8 10z" fill={`url(#${id})`} />
      <rect x="10.6" y="5.4" width="2.8" height="10.2" rx="1.4" fill="#facc15" stroke="#ca8a04" strokeWidth="0.5" />
      <path d="M6.4 12.4C6.8 9.6 8.4 7.6 10.2 6.8" stroke="#fef9c3" strokeWidth="0.9" strokeLinecap="round" fill="none" />
      <path d="M2 15.4h20c.2 1.4-.6 2.4-2 2.4H4c-1.4 0-2.2-1-2-2.4Z" fill="#ca8a04" />
      <path d="M3 15.9h18" stroke="#fde047" strokeWidth="0.5" opacity="0.7" />
    </svg>
  );
}

/** Dia das Mães: coraçãozinho que bate de vez em quando. */
function Coracao({ className }: { className: string }) {
  const id = useIdSvg("coracao");
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn(svg, className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fb7185" />
          <stop offset="1" stopColor="#db2777" />
        </linearGradient>
      </defs>
      <g className="festa-batida" style={{ transformOrigin: "12px 13px" }}>
        <path
          d="M12 21.2C5.4 16.8 2 13.4 2 9.2 2 6.2 4.3 4 7.1 4c2 0 3.7 1.1 4.9 2.8C13.2 5.1 14.9 4 16.9 4 19.7 4 22 6.2 22 9.2c0 4.2-3.4 7.6-10 12Z"
          fill={`url(#${id})`}
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M6.2 7.6c.6-.9 1.6-1.4 2.6-1.3" stroke="#ffe4e6" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

/** São João: chapéu de palha com remendo de chita. */
function ChapeuDePalha({ className }: { className: string }) {
  const id = useIdSvg("palha");
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn(svg, className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#d4a72c" />
        </linearGradient>
      </defs>
      {/* aba */}
      <path d="M1.2 15.6c0-1.9 4.8-3.2 10.8-3.2s10.8 1.3 10.8 3.2c0 1.6-4.8 2.6-10.8 2.6S1.2 17.2 1.2 15.6Z" fill={`url(#${id})`} />
      <path d="M3 16.4c2.6 1 15.4 1 18 0" stroke="#b7791f" strokeWidth="0.5" strokeDasharray="1 1.2" fill="none" />
      {/* fiapos soltos na beira */}
      <path d="M1.4 15.9l-.9.6M22.6 15.9l.9.5M5 17.7l-.4.9M19 17.7l.5.8" stroke="#d4a72c" strokeWidth="0.6" strokeLinecap="round" />
      {/* copa */}
      <path d="M6.4 14.2C6.4 9.2 8.8 6 12 6s5.6 3.2 5.6 8.2c-1.8.9-9.4.9-11.2 0Z" fill={`url(#${id})`} />
      <path d="M8 9.6c2.6.6 5.4.6 8 0M7.2 11.8c3.2.7 6.4.7 9.6 0" stroke="#b7791f" strokeWidth="0.45" strokeDasharray="1 1.1" fill="none" />
      {/* fita */}
      <path d="M6.5 12.6c1.9.9 9.1.9 11 0l.1 1.6c-1.8.9-9.4.9-11.2 0Z" fill="#dc2626" />
      {/* remendo de chita */}
      <rect x="13.2" y="7.4" width="3.2" height="3" rx="0.4" transform="rotate(12 14.8 8.9)" fill="#2563eb" />
      <circle cx="14.2" cy="8.4" r="0.35" fill="#fde047" />
      <circle cx="15.5" cy="9.5" r="0.35" fill="#fff" />
      <path d="M13.3 7.6l.4.4M16.2 8.2l-.3.4" stroke="#fff" strokeWidth="0.35" />
    </svg>
  );
}

/** Dia dos Pais: gravata-borboleta embaixo do logo. */
function Gravata({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 12" aria-hidden className={cn(svg, className)}>
      <path d="M12 6 2.6 1.4C1.6 1 .8 1.6.8 2.6v6.8c0 1 .8 1.6 1.8 1.2Z" fill="#b91c1c" />
      <path d="M12 6l9.4-4.6c1-.4 1.8.2 1.8 1.2v6.8c0 1-.8 1.6-1.8 1.2Z" fill="#b91c1c" />
      <path d="M3 3.6l.1 4.8M21 3.6l-.1 4.8" stroke="#7f1d1d" strokeWidth="0.6" strokeLinecap="round" opacity="0.6" />
      {[
        [4.4, 4.2],
        [6.6, 7.4],
        [17.4, 4.6],
        [19.6, 7.6],
        [5, 9.6],
        [18.8, 2.6],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="0.6" fill="#fecaca" />
      ))}
      <rect x="10" y="3.4" width="4" height="5.2" rx="1.3" fill="#991b1b" />
    </svg>
  );
}

/** 7 de Setembro: roseta verde e amarela com fitas. */
function Roseta({ className }: { className: string }) {
  const petalas = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn(svg, className)}>
      <path d="M9.6 14 7 22.4l2.4-1.2 1.4 2.2 1.6-8.2Z" fill="#16a34a" />
      <path d="M14.4 14l2.6 8.4-2.4-1.2-1.4 2.2-1.6-8.2Z" fill="#eab308" />
      <g transform="translate(12 10)">
        {petalas.map((g) => (
          <circle key={g} cx="0" cy="-6.4" r="2.4" fill="#16a34a" transform={`rotate(${g})`} />
        ))}
        <circle r="6.2" fill="#16a34a" />
        <circle r="4.6" fill="#facc15" />
        <circle r="2.6" fill="#1d4ed8" />
        <path d="M-2.2 .4c1.4-.7 3-.7 4.4 0" stroke="#fff" strokeWidth="0.55" fill="none" />
      </g>
    </svg>
  );
}

/** Dia das Crianças: balão amarrado no canto do logo, balançando. */
function Balao({ className }: { className: string }) {
  const id = useIdSvg("balao");
  return (
    <svg viewBox="0 0 24 32" aria-hidden className={cn(svg, className)}>
      <defs>
        <radialGradient id={id} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#f9a8d4" />
          <stop offset="0.55" stopColor="#ec4899" />
          <stop offset="1" stopColor="#be185d" />
        </radialGradient>
      </defs>
      <g className="festa-pendulo" style={{ transformOrigin: "4px 31px", animationDuration: "4.2s" }}>
        <path d="M14 16.4c-.6 3 1.6 4.2.4 7.2-1.2 3-5.6 3.2-10.4 7.4" stroke="#94a3b8" strokeWidth="0.7" fill="none" strokeLinecap="round" />
        <ellipse cx="14" cy="8.6" rx="6.4" ry="7.6" fill={`url(#${id})`} />
        <path d="M12.6 16.2h2.8L14 17.8Z" fill="#be185d" />
        <ellipse cx="11.4" cy="5.4" rx="1.4" ry="2.2" transform="rotate(-24 11.4 5.4)" fill="#fff" opacity="0.55" />
      </g>
    </svg>
  );
}

type Acessorio = {
  Desenho: (p: { className: string }) => ReactNode;
  classes: Record<Tamanho, string>;
  atras?: boolean;
};

/** Canto de cima à direita, inclinado como um chapéu (vale para gorro, capacete, chapéu de palha). */
const CHAPEU = POR_TAMANHO(
  "-right-2 -top-2.5 h-5 w-5 rotate-[18deg]",
  "-right-2 -top-3 h-6 w-6 rotate-[18deg]",
  "-right-3 -top-4 h-9 w-9 rotate-[18deg]",
);

const ACESSORIOS: Record<IdFesta, Acessorio> = {
  natal: { Desenho: Gorro, classes: CHAPEU },
  trabalhador: {
    Desenho: Capacete,
    classes: POR_TAMANHO(
      "-right-2 -top-2.5 h-5 w-5 rotate-[16deg]",
      "-right-2 -top-3 h-6 w-6 rotate-[16deg]",
      "-right-3 -top-4 h-9 w-9 rotate-[16deg]",
    ),
  },
  junina: {
    Desenho: ChapeuDePalha,
    classes: POR_TAMANHO(
      "-right-2.5 -top-3 h-6 w-6 rotate-[14deg]",
      "-right-3 -top-3.5 h-7 w-7 rotate-[14deg]",
      "-right-4 -top-5 h-10 w-10 rotate-[14deg]",
    ),
  },
  "ano-novo": {
    Desenho: Brilho,
    classes: POR_TAMANHO("-right-2 -top-2 h-4 w-4", "-right-2 -top-2.5 h-5 w-5", "-right-3 -top-3.5 h-7 w-7"),
  },
  carnaval: {
    Desenho: Mascara,
    classes: POR_TAMANHO(
      "-right-2.5 -top-2.5 h-5 w-5 rotate-[12deg]",
      "-right-3 -top-3 h-6 w-6 rotate-[12deg]",
      "-right-4 -top-4 h-9 w-9 rotate-[12deg]",
    ),
  },
  pascoa: {
    Desenho: Orelhas,
    atras: true,
    classes: POR_TAMANHO(
      "inset-x-0 -top-[50%] h-[92%] w-full",
      "inset-x-0 -top-[50%] h-[92%] w-full",
      "inset-x-0 -top-[56%] h-full w-full",
    ),
  },
  maes: {
    Desenho: Coracao,
    classes: POR_TAMANHO("-right-1.5 -top-1.5 h-3.5 w-3.5", "-right-1.5 -top-1.5 h-4 w-4", "-right-2 -top-2 h-6 w-6"),
  },
  pais: {
    Desenho: Gravata,
    classes: POR_TAMANHO(
      "-bottom-1 left-1/2 h-2.5 w-5 -translate-x-1/2",
      "-bottom-1 left-1/2 h-3 w-6 -translate-x-1/2",
      "-bottom-1.5 left-1/2 h-4 w-8 -translate-x-1/2",
    ),
  },
  independencia: {
    Desenho: Roseta,
    classes: POR_TAMANHO("-right-2 -top-2 h-4 w-4", "-right-2 -top-2 h-5 w-5", "-right-3 -top-3 h-7 w-7"),
  },
  criancas: {
    Desenho: Balao,
    classes: POR_TAMANHO(
      "-right-2.5 -top-4 h-6 w-[1.15rem]",
      "-right-2.5 -top-[1.1rem] h-6 w-[1.15rem]",
      "-right-4 -top-9 h-12 w-9",
    ),
  },
};

/** O logo do sistema com o detalhe da data da vez (ou só o logo, fora de época). */
export function LogoFestivo({ festa, tamanho = "md" }: { festa: IdFesta | null | undefined; tamanho?: Tamanho }) {
  const acessorio = festa ? ACESSORIOS[festa] : null;
  const desenho = acessorio && <acessorio.Desenho className={acessorio.classes[tamanho]} />;
  return (
    <span className="relative inline-flex shrink-0">
      {acessorio?.atras && desenho}
      <Logo tamanho={tamanho} />
      {!acessorio?.atras && desenho}
    </span>
  );
}
