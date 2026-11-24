/**
 * Densidade das listas e tabelas. "compacta" (padrão) mostra mais linhas por
 * tela, como num ERP; "confortavel" dá mais respiro. Fica num cookie, como o
 * tema e o menu lateral: o servidor já entrega o HTML com a classe certa no
 * <html>, sem a tabela "pular" depois de hidratar.
 */
export type Densidade = "compacta" | "confortavel";

export const COOKIE_DENSIDADE = "densidade";

export function lerDensidade(valor: string | undefined): Densidade {
  return valor === "confortavel" ? "confortavel" : "compacta";
}

/** Classe aplicada no <html> (CSS em app/globals.css, `.tabela-erp`). */
export function classeDensidade(d: Densidade) {
  return d === "confortavel" ? "densidade-confortavel" : "";
}

export function salvarDensidade(d: Densidade) {
  // Um ano; só preferência visual, pode ser lido no navegador.
  document.cookie = `${COOKIE_DENSIDADE}=${d}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.classList.toggle("densidade-confortavel", d === "confortavel");
}
