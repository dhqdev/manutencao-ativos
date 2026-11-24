"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/components/ui";

/**
 * No celular vira uma folha que desce da borda superior (pedido do dono: todo
 * modal abre de cima para baixo); no desktop, um diálogo centrado. É o mesmo
 * componente — muda só a moldura.
 */
export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  largura = "max-w-2xl",
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  children: ReactNode;
  largura?: string;
}) {
  const painel = useRef<HTMLDivElement>(null);
  // aoFechar costuma ser uma função nova a cada render (arrow inline). Se ela
  // fosse dependência do efeito, cada letra digitada rodaria o efeito de novo
  // e o foco voltaria para o painel: o campo só aceitava a primeira letra.
  const fechar = useRef(aoFechar);
  useEffect(() => {
    fechar.current = aoFechar;
  });

  useEffect(() => {
    if (!aberto) return;

    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar.current();
    document.addEventListener("keydown", esc);

    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Foco entra no painel: leitor de tela e teclado não ficam presos atrás.
    painel.current?.focus();

    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center sm:items-center sm:p-4">
      <div
        className="veu absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={aoFechar}
        aria-hidden
      />

      <div
        ref={painel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={cn(
          // Encostada no topo: a área segura evita o entalhe/relógio do app instalado.
          "folha-topo area-segura-superior relative flex max-h-[92dvh] w-full flex-col rounded-b-2xl bg-superficie shadow-xl outline-none",
          "sm:dialogo sm:max-h-[88dvh] sm:rounded-2xl sm:pt-0",
          largura,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 pb-4 pt-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-sm text-slate-500">{descricao}</p>}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="-mr-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {/* Alça na borda de baixo: só faz sentido na folha do celular */}
        <div className="flex shrink-0 justify-center pb-2.5 pt-1 sm:hidden" aria-hidden>
          <span className="h-1 w-9 rounded-full bg-slate-300" />
        </div>
      </div>
    </div>
  );
}

export function RodapeModal({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5 sm:flex-row sm:justify-end">
      {children}
    </div>
  );
}
