import { CalendarClock, CheckCircle2, MessageCircle, TrendingDown } from "lucide-react";

/**
 * Vitrine das telas de entrada: três cartões de vidro que mostram, em
 * miniatura, o que o sistema faz (preventiva chegando, custo do mês, serviço
 * concluído). É só ilustração — dados de exemplo, aria-hidden — e não carrega
 * nada de fora (a CSP bloquearia).
 */

const BARRAS = [46, 62, 38, 70, 54, 84, 60];

function Vidro({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`absolute rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.7)] ring-1 ring-inset ring-white/[0.04] backdrop-blur-md ${className}`}
    >
      {children}
    </div>
  );
}

export function Vitrine({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none relative select-none ${className}`}>
      {/* Custo do mês: o cartão maior, ao fundo */}
      <Vidro className="anim-flutuar left-0 top-4 w-[17rem]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400">Custo do mês</span>
          <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
            <TrendingDown className="h-3 w-3" /> 8%
          </span>
        </div>
        <p className="mt-1.5 text-2xl font-semibold tracking-tight text-white">R$ 12.480</p>
        <div className="mt-4 flex h-16 items-end gap-2">
          {BARRAS.map((altura, i) => (
            <span
              key={i}
              className={`flex-1 rounded-t-[4px] ${
                i === BARRAS.length - 2
                  ? "bg-gradient-to-t from-[#2563eb] to-[#60a5fa]"
                  : "bg-white/[0.12]"
              }`}
              style={{ height: `${altura}%` }}
            />
          ))}
        </div>
      </Vidro>

      {/* Preventiva chegando */}
      <Vidro className="anim-flutuar right-0 top-0 w-[15.5rem] [animation-delay:-2s]">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-300/20">
            <CalendarClock className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">Troca de óleo</p>
            <p className="truncate text-xs text-slate-400">Caminhão 07 · preventiva</p>
          </div>
        </div>
        <div className="mt-3.5 flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Vence em 3 dias</span>
          <span className="font-medium text-amber-300">85%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[85%] rounded-full bg-gradient-to-r from-amber-400 to-amber-300" />
        </div>
      </Vidro>

      {/* Serviço concluído */}
      <Vidro className="anim-flutuar bottom-2 right-2 w-[15rem] [animation-delay:-4s]">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/20">
            <CheckCircle2 className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">Serviço concluído</p>
            <p className="truncate text-xs text-slate-400">Empilhadeira 02 · hoje</p>
          </div>
        </div>
      </Vidro>

      {/* Aviso no WhatsApp */}
      <div className="anim-flutuar absolute -bottom-3 left-6 flex items-center gap-2 rounded-full border border-white/10 bg-[#0b1a33]/80 py-1.5 pl-1.5 pr-3.5 text-xs text-slate-300 shadow-lg backdrop-blur-md [animation-delay:-1s]">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
          <MessageCircle className="h-3.5 w-3.5" />
        </span>
        Lembrete enviado no WhatsApp
      </div>
    </div>
  );
}
