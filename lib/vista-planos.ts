/**
 * Como as periódicas aparecem: "quadro" (cards em colunas por situação, como
 * um kanban; padrão, pedido do dono em 24/11/2026) ou "lista" (tabela densa).
 * Fica num cookie, como a densidade e o menu lateral: o servidor já entrega a
 * vista certa, sem trocar depois de hidratar.
 */
export type VistaPlanos = "quadro" | "lista";

export const COOKIE_VISTA_PLANOS = "vista_planos";

export function lerVistaPlanos(valor: string | undefined): VistaPlanos {
  return valor === "lista" ? "lista" : "quadro";
}

export function salvarVistaPlanos(v: VistaPlanos) {
  // Um ano; só preferência visual, pode ser lido no navegador.
  document.cookie = `${COOKIE_VISTA_PLANOS}=${v}; path=/; max-age=31536000; samesite=lax`;
}
