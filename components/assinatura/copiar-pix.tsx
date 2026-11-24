"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Botao } from "@/components/ui";

/** Código "Pix copia e cola" com botão de copiar (colar no app do banco). */
export function CopiarPix({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
    } catch {
      // Navegador sem permissão de área de transferência: seleciona o texto.
      const campo = document.getElementById("pix-copia-e-cola") as HTMLTextAreaElement | null;
      campo?.select();
      document.execCommand?.("copy");
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <div className="w-full min-w-0 space-y-2">
      <label htmlFor="pix-copia-e-cola" className="rotulo">
        Pix copia e cola
      </label>
      <textarea
        id="pix-copia-e-cola"
        readOnly
        value={codigo}
        rows={4}
        onFocus={(e) => e.currentTarget.select()}
        className="campo resize-none break-all font-mono text-xs"
        data-pix
      />
      <Botao type="button" variante={copiado ? "secundario" : "primario"} onClick={copiar} className="w-full sm:w-auto">
        {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copiado ? "Copiado" : "Copiar código Pix"}
      </Botao>
    </div>
  );
}
