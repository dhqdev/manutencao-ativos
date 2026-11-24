"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarHeart } from "lucide-react";
import { salvarEnfeites } from "@/lib/festas";

/** Liga/desliga os enfeites das datas neste aparelho (Configurações → Aparência). */
export function AlternarEnfeites({ ligado, agenda }: { ligado: boolean; agenda: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState(ligado);

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
        <CalendarHeart className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">Enfeites de datas comemorativas</span>
        <span className="block text-xs text-slate-500">
          Aparecem sozinhos 30 dias antes de cada data (Natal, Ano Novo, Carnaval, Páscoa, São João...) e somem depois.
        </span>
        <span className="mt-1 block text-xs text-slate-400" data-agenda-festas>
          {agenda}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        name="enfeites"
        checked={estado}
        onChange={(e) => {
          setEstado(e.target.checked);
          salvarEnfeites(e.target.checked);
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
