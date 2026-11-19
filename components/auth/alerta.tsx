import type { ReactNode } from "react";

/** Aviso das telas de entrada (fica fora de moldura.tsx: esta lê cookies e só roda no servidor). */
export function Alerta({ tipo, children }: { tipo: "erro" | "sucesso"; children: ReactNode }) {
  return (
    <div
      role="alert"
      className={
        tipo === "erro"
          ? "pop-in rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
          : "pop-in rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700"
      }
    >
      {children}
    </div>
  );
}
