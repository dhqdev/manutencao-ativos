/**
 * Decoração de Natal (luzinhas no menu, neve, trenó passando). Liga sozinha na
 * época — de 15 de novembro até o Dia de Reis (6 de janeiro), no fuso de
 * Brasília — e some sozinha depois, sem precisar de deploy.
 *
 * Quem não quiser desliga em Configurações → Aparência. A escolha fica num
 * cookie (como o tema e o menu lateral) para o servidor já entregar a tela
 * certa, sem a decoração aparecer e sumir depois de hidratar.
 */
export const COOKIE_NATAL = "natal";

function hojeEmBrasilia(agora: Date) {
  const [ano, mes, dia] = agora
    .toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .split("-")
    .map(Number);
  return { ano, mes, dia };
}

export function epocaDeNatal(agora = new Date()) {
  const { mes, dia } = hojeEmBrasilia(agora);
  return (mes === 11 && dia >= 15) || mes === 12 || (mes === 1 && dia <= 6);
}

/** Valor do cookie → decoração ligada? Fora da época, sempre desligada. */
export function natalLigado(valor: string | undefined, agora = new Date()) {
  return epocaDeNatal(agora) && valor !== "desligado";
}

/** Dias que faltam para o dia 25 (0 no próprio dia; null depois do Natal). */
export function diasParaONatal(agora = new Date()) {
  const { ano, mes, dia } = hojeEmBrasilia(agora);
  if (mes === 1 || (mes === 12 && dia > 25)) return null;
  const hoje = Date.UTC(ano, mes - 1, dia);
  return Math.round((Date.UTC(ano, 11, 25) - hoje) / 86_400_000);
}

export function salvarNatal(ligado: boolean) {
  // Um ano; só preferência visual, pode ser lido no navegador.
  document.cookie = `${COOKIE_NATAL}=${ligado ? "ligado" : "desligado"}; path=/; max-age=31536000; samesite=lax`;
}
