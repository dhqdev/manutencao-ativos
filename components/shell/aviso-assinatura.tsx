import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { avisoAssinatura, type SituacaoAssinatura } from "@/lib/assinatura";
import { cn } from "@/components/ui";

/**
 * Faixa no topo quando a assinatura vence em até 5 dias ou já venceu (dentro
 * da tolerância). Bloqueada, a própria tela de Assinatura mostra o aviso.
 */
export function AvisoAssinatura({ situacao }: { situacao: SituacaoAssinatura | null }) {
  const texto = avisoAssinatura(situacao);
  if (!texto || !situacao || situacao.estado === "bloqueada") return null;
  const vencida = situacao.estado === "tolerancia";
  return (
    <div
      role="status"
      data-aviso-assinatura={situacao.estado}
      className={cn(
        "no-print mb-4 flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center",
        vencida ? "border-orange-300 bg-orange-50 text-orange-950" : "border-amber-200 bg-amber-50 text-amber-950",
      )}
    >
      <CircleAlert className="hidden h-5 w-5 shrink-0 sm:block" aria-hidden />
      <p className="min-w-0 flex-1">{texto}</p>
      {!situacao.pendente && (
        <Link
          href="/assinatura"
          className="pressionavel inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Pagar com Pix
        </Link>
      )}
    </div>
  );
}
