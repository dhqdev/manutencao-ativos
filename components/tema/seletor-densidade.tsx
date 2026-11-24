"use client";

import { useState } from "react";
import { Rows3, Rows4 } from "lucide-react";
import { cn } from "@/components/ui";
import { salvarDensidade, type Densidade } from "@/lib/densidade";

const OPCOES: { id: Densidade; rotulo: string; Icone: typeof Rows3 }[] = [
  { id: "compacta", rotulo: "Compacta", Icone: Rows4 },
  { id: "confortavel", rotulo: "Confortável", Icone: Rows3 },
];

/** Densidade das tabelas, na tela de configurações (ao lado da aparência). */
export function SeletorDensidade({ inicial }: { inicial: Densidade }) {
  const [atual, setAtual] = useState(inicial);
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Densidade das tabelas">
      {OPCOES.map(({ id, rotulo, Icone }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={atual === id}
          onClick={() => {
            setAtual(id);
            salvarDensidade(id);
          }}
          className={cn(
            "pressionavel flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium",
            atual === id
              ? "border-slate-900 bg-slate-900 text-slate-50"
              : "border-slate-200 bg-superficie text-slate-700 hover:bg-slate-50",
          )}
        >
          <Icone className="h-4 w-4" />
          {rotulo}
        </button>
      ))}
    </div>
  );
}
