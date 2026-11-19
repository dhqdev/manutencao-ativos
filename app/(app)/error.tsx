"use client";

import { ErroTela } from "@/components/erro-tela";

/**
 * Erro numa tela do sistema: o menu continua no lugar (o layout do grupo fica
 * fora desta fronteira) e só a área do conteúdo mostra o aviso.
 */
export default function ErroSistema({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErroTela error={error} retry={retry} dentroDoSistema />;
}
