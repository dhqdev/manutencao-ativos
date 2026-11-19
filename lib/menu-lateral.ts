/**
 * Menu lateral recolhido ou aberto. Fica num cookie (como o tema) para o
 * servidor já entregar a largura certa: com localStorage o menu abria largo
 * e encolhia depois de hidratar, empurrando a página.
 */
export const COOKIE_MENU = "menu_lateral";

export function menuRecolhido(valor: string | undefined) {
  return valor === "recolhido";
}

export function salvarMenuRecolhido(recolhido: boolean) {
  // Um ano; só preferência visual, pode ser lido no navegador.
  document.cookie = `${COOKIE_MENU}=${recolhido ? "recolhido" : "aberto"}; path=/; max-age=31536000; samesite=lax`;
}
