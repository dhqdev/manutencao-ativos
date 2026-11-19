"use client";

import { useEffect } from "react";

/**
 * Último recurso: erro no layout raiz. Substitui o documento inteiro, então
 * não tem o CSS do app — por isso o estilo vai inline e sem dependências.
 */
export default function ErroGlobal({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const botao = {
    height: 44,
    padding: "0 20px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  } as const;

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
          padding: 24,
          textAlign: "center",
        }}
      >
        <title>Erro · Manutenção</title>
        <main role="alert" style={{ maxWidth: 380 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>O sistema não conseguiu abrir</h1>
          <p style={{ fontSize: 14, color: "#64748b", marginTop: 8 }}>
            Pode ser uma instabilidade passageira. Tente de novo em instantes.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{ ...botao, border: "none", background: "#0f172a", color: "#f8fafc" }}
            >
              Tentar de novo
            </button>
            <button
              type="button"
              onClick={() => window.location.assign("/dashboard")}
              style={{ ...botao, border: "1px solid #cbd5e1", background: "#fff", color: "#334155" }}
            >
              Voltar ao início
            </button>
          </div>
          {error.digest && (
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 24 }}>
              Código do erro: <code>{error.digest}</code>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
