/**
 * Identidade: um "M" de Manutenção cuja segunda perna sobe como um visto (✓)
 * — o serviço feito. Traço único, sem detalhe fino: continua legível em 16px
 * no favicon. O azul do selo é fixo (não usa `marca-*`, que muda no tema
 * escuro) para a marca ser a mesma em qualquer tela.
 *
 * Os mesmos traços estão em app/icon.svg, app/apple-icon.svg e nos PNGs de
 * public/icones (gerados por scripts/gerar-icones.mjs). Mudou aqui, gere de novo.
 */
export const TRACO_MARCA = "M6.4 17.25V8.25l5.25 6 6-7.5";

export function Simbolo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden focusable="false">
      <path
        d={TRACO_MARCA}
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TAMANHOS = {
  sm: { caixa: "h-8 w-8 rounded-[9px]", icone: "h-5 w-5" },
  md: { caixa: "h-9 w-9 rounded-[10px]", icone: "h-[22px] w-[22px]" },
  lg: { caixa: "h-14 w-14 rounded-2xl", icone: "h-9 w-9" },
} as const;

/** Selo azul com o símbolo. Funciona sobre fundo claro e escuro sem variação. */
export function Logo({
  tamanho = "md",
  className = "",
}: {
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  const t = TAMANHOS[tamanho];
  return (
    <span
      className={`relative flex ${t.caixa} shrink-0 items-center justify-center bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(15_23_42/0.25),0_4px_14px_-4px_rgb(37_99_235/0.55)] ${className}`}
    >
      <Simbolo className={t.icone} />
    </span>
  );
}

export function Assinatura({
  empresa,
  tom = "escuro",
}: {
  empresa?: string;
  tom?: "escuro" | "claro";
}) {
  const principal = tom === "claro" ? "text-white" : "text-slate-900";
  const secundario = tom === "claro" ? "text-slate-400" : "text-slate-500";

  return (
    <div className="min-w-0">
      <p className={`truncate text-[15px] font-semibold leading-tight tracking-tight ${principal}`}>
        Manutenção
      </p>
      <p className={`truncate text-xs leading-tight ${secundario}`}>{empresa ?? "Gestão de ativos"}</p>
    </div>
  );
}
