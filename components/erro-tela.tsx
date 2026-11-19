"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Botao, BotaoLink } from "@/components/ui";

/**
 * Depois de um deploy, a aba aberta ainda tem o JavaScript da versão anterior:
 * os pedaços (chunks) e as server actions antigas não existem mais. Tentar de
 * novo não resolve; só recarregar a página.
 */
export function versaoDesatualizada(e: { name?: string; message?: string }) {
  return (
    e.name === "ChunkLoadError" ||
    /Loading (CSS )?chunk|Failed to find Server Action|failed to fetch dynamically imported module/i.test(
      e.message ?? "",
    )
  );
}

/**
 * Tela de erro das fronteiras (error.tsx). Mostra uma mensagem humana, o
 * código para achar o erro no log do servidor (`digest`) e os caminhos para
 * sair dali: tentar de novo, recarregar ou voltar ao início.
 */
export function ErroTela({
  error,
  retry,
  dentroDoSistema = false,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  /** Dentro do menu do sistema: o cartão ocupa só a área do conteúdo. */
  dentroDoSistema?: boolean;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const desatualizada = versaoDesatualizada(error);

  return (
    <div
      role="alert"
      className={
        dentroDoSistema
          ? "flex min-h-[60vh] items-center justify-center px-4 py-10"
          : "flex min-h-dvh items-center justify-center bg-slate-50 px-6 py-10"
      }
    >
      <div className="card flex w-full max-w-md flex-col items-center px-6 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <TriangleAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-base font-semibold text-slate-900">
          {desatualizada ? "O sistema foi atualizado" : "Algo deu errado nesta tela"}
        </h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          {desatualizada
            ? "Esta aba ainda está com a versão anterior. Recarregue a página para continuar."
            : "Não perdemos nada do que já estava salvo. Tente de novo; se continuar, recarregue a página ou volte ao início."}
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {desatualizada ? (
            <Botao onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" />
              Recarregar a página
            </Botao>
          ) : (
            <>
              <Botao onClick={() => retry()}>
                <RefreshCw className="h-4 w-4" />
                Tentar de novo
              </Botao>
              <BotaoLink href="/dashboard" variante="secundario">
                Voltar ao início
              </BotaoLink>
            </>
          )}
        </div>

        {error.digest && (
          <p className="mt-6 text-xs text-slate-400">
            Código do erro: <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}
