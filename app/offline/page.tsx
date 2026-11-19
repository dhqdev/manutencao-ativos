import { WifiOff } from "lucide-react";
import { Logo } from "@/components/marca";

export const metadata = { title: "Sem conexão" };

export default function Offline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-50 px-6 text-center">
      <Logo tamanho="lg" />

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Você está sem conexão</h1>
        <p className="mt-2 max-w-xs text-sm text-slate-500">
          Os dados de manutenção precisam de internet para carregar. Assim que a conexão voltar,
          é só recarregar.
        </p>
      </div>

      <a
        href="/dashboard"
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-medium text-slate-50"
      >
        <WifiOff className="h-4 w-4" />
        Tentar novamente
      </a>
    </main>
  );
}

/**
 * Renderização dinâmica obrigatória: o nonce da CSP vem do cabeçalho da
 * requisição. Se esta página for pré-gerada no build, os scripts saem sem nonce
 * e o navegador bloqueia TODO o JavaScript dela.
 */
export const dynamic = "force-dynamic";
