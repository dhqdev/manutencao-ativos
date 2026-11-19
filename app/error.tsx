"use client";

import { ErroTela } from "@/components/erro-tela";

/** Erro fora das telas do sistema (login, cadastro, console) ou no layout delas. */
export default function Erro({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErroTela error={error} retry={retry} />;
}
