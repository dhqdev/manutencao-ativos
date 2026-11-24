"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, SlidersHorizontal } from "lucide-react";

/**
 * Celular: quando a pessoa rola a lista e o botão principal da tela (o que tem
 * `data-atalho-novo`) e a busca (`data-busca`) saem da vista, aparece uma
 * barrinha fixa acima da barra inferior com "Novo" e "Filtros". Ela só repete
 * o que a tela já tem (clica no botão original / leva à busca), então nenhuma
 * tela precisa saber dela.
 */
export function BarraAcoesCelular() {
  const pathname = usePathname();
  const [novo, setNovo] = useState<HTMLElement | null>(null);
  const [busca, setBusca] = useState<HTMLElement | null>(null);
  const [visivel, setVisivel] = useState(false);

  // Acha os alvos da tela atual (as telas renderizam depois da navegação).
  useEffect(() => {
    setVisivel(false);
    // Só o que está à mostra (a aba escondida de `Abas` continua no DOM).
    const primeiroVisivel = (seletor: string) =>
      [...document.querySelectorAll<HTMLElement>(seletor)].find((e) => e.offsetParent !== null) ?? null;
    const procurar = () => {
      setNovo(primeiroVisivel("main [data-atalho-novo]"));
      setBusca(primeiroVisivel("main [data-busca]:not([disabled])"));
    };
    procurar();
    const t = setTimeout(procurar, 400);
    return () => clearTimeout(t);
  }, [pathname]);

  // Mostra só quando os originais não estão na tela.
  useEffect(() => {
    const alvos = [novo, busca].filter((e): e is HTMLElement => Boolean(e));
    if (!alvos.length) return;
    const naTela = new Map<Element, boolean>();
    const obs = new IntersectionObserver((entradas) => {
      for (const e of entradas) naTela.set(e.target, e.isIntersecting);
      setVisivel(alvos.every((a) => naTela.get(a) === false));
    });
    alvos.forEach((a) => obs.observe(a));
    return () => obs.disconnect();
  }, [novo, busca]);

  if (!visivel || (!novo && !busca)) return null;

  const rotuloNovo = novo?.textContent?.trim() || "Novo";

  return (
    <div className="no-print pop-in fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 lg:hidden">
      <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-superficie/95 p-1 shadow-[var(--shadow-elevada)] backdrop-blur">
        {busca && (
          <button
            type="button"
            onClick={() => {
              const caixa = document.getElementById("filtros") ?? busca;
              caixa.scrollIntoView({ behavior: "smooth", block: "start" });
              setTimeout(() => busca.focus({ preventScroll: true }), 350);
            }}
            className="pressionavel inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-slate-700 active:bg-slate-100"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
          </button>
        )}
        {novo && (
          <button
            type="button"
            onClick={() => novo.click()}
            className="pressionavel inline-flex h-9 max-w-[14rem] items-center gap-1.5 rounded-full bg-slate-900 px-3.5 text-[13px] font-medium text-slate-50"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="truncate">{rotuloNovo}</span>
          </button>
        )}
      </div>
    </div>
  );
}
