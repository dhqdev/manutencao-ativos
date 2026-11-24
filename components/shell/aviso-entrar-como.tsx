import { ArrowLeft, ShieldCheck } from "lucide-react";

/**
 * Faixa no topo enquanto o superadmin está na conta de alguém pelo "Entrar
 * como" (lib/auth/entrar-como.ts). Deixa claro de quem é a conta e como
 * voltar: o acesso vale até ele voltar ao console ou sair. Sair pelo menu também volta ao console.
 */
export function AvisoEntrarComo({
  nome,
  email,
  empresa,
}: {
  nome: string;
  email: string;
  empresa: string;
}) {
  return (
    <div
      data-entrar-como={email}
      role="status"
      className="no-print mb-4 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center"
    >
      <ShieldCheck className="hidden h-5 w-5 shrink-0 text-amber-700 sm:block" aria-hidden />
      <p className="min-w-0 flex-1">
        Você está na conta de <strong>{nome}</strong> <span className="text-amber-800">({email})</span> em{" "}
        <strong>{empresa}</strong>, pelo console do superadmin. Tudo o que fizer fica no nome dessa pessoa e no
        registro do console.
      </p>
      <form action="/auth/voltar" method="post" className="shrink-0">
        <button
          type="submit"
          className="pressionavel inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 sm:w-auto"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar ao console
        </button>
      </form>
    </div>
  );
}
