/**
 * Datas comemorativas. O sistema ganha um enfeite discreto 30 dias antes de
 * cada data e ele some sozinho quando a data passa: sem deploy, sem botão,
 * sem ninguém lembrar de ligar. As datas móveis (Carnaval, Páscoa, Dia das
 * Mães e dos Pais) são calculadas para cada ano.
 *
 * Tudo no fuso de Brasília (`hoje()` de lib/format.ts): o container roda em
 * UTC e, depois das 21h, já estaria no dia seguinte.
 *
 * Quem não quiser os enfeites desliga em Configurações → Aparência. A escolha
 * fica num cookie (como o tema e o menu lateral) para o servidor já entregar a
 * tela certa, sem o enfeite aparecer e sumir depois de hidratar.
 */
import { hoje, somarDias } from "./format";

export type IdFesta =
  | "ano-novo"
  | "carnaval"
  | "pascoa"
  | "trabalhador"
  | "maes"
  | "junina"
  | "pais"
  | "independencia"
  | "criancas"
  | "natal";

export type Festa = {
  id: IdFesta;
  nome: string;
  /** Primeiro dia da comemoração (AAAA-MM-DD): a contagem regressiva mira nele. */
  inicio: string;
  /** Último dia em que o enfeite fica (festa de vários dias, como o Carnaval). */
  fim: string;
};

export type FestaDoDia = Festa & {
  /** Dias até o início; 0 enquanto a festa acontece. */
  dias: number;
  durante: boolean;
  /** De 0 a 1: quanto da espera de 30 dias já passou (1 durante a festa). */
  progresso: number;
};

/** Quantos dias antes o enfeite aparece. */
export const DIAS_ANTES = 30;

/** Na reta final a faixa do Dashboard aparece (antes disso, só o enfeite do menu). */
export const DIAS_RETA_FINAL = 7;

const doisDigitos = (n: number) => String(n).padStart(2, "0");
const iso = (ano: number, mes: number, dia: number) => `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;

function diasEntre(de: string, ate: string) {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/**
 * Domingo de Páscoa no calendário gregoriano (algoritmo de Meeus/Jones/Butcher).
 * O Carnaval é 47 dias antes (terça) e Corpus Christi 60 dias depois.
 */
export function pascoa(ano: number) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}

/** n-ésimo domingo do mês (Dia das Mães: 2º de maio; dos Pais: 2º de agosto). */
export function domingoDoMes(ano: number, mes: number, n: number) {
  const diaDaSemana = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
  const primeiro = 1 + ((7 - diaDaSemana) % 7);
  return iso(ano, mes, primeiro + 7 * (n - 1));
}

/** As datas de um ano, na ordem do calendário. */
export function festasDoAno(ano: number): Festa[] {
  const domingoDePascoa = pascoa(ano);
  const unico = (id: IdFesta, nome: string, dia: string): Festa => ({ id, nome, inicio: dia, fim: dia });

  return [
    // Do Réveillon ao Dia de Reis, que fecha as festas de fim de ano.
    { id: "ano-novo", nome: "Ano Novo", inicio: iso(ano, 1, 1), fim: iso(ano, 1, 6) },
    // Do sábado à terça-feira de Carnaval.
    { id: "carnaval", nome: "Carnaval", inicio: somarDias(domingoDePascoa, -50), fim: somarDias(domingoDePascoa, -47) },
    unico("pascoa", "Páscoa", domingoDePascoa),
    unico("trabalhador", "Dia do Trabalhador", iso(ano, 5, 1)),
    unico("maes", "Dia das Mães", domingoDoMes(ano, 5, 2)),
    // A contagem mira o São João (24) e o enfeite fica até o São Pedro (29).
    { id: "junina", nome: "Festa Junina", inicio: iso(ano, 6, 24), fim: iso(ano, 6, 29) },
    unico("pais", "Dia dos Pais", domingoDoMes(ano, 8, 2)),
    unico("independencia", "Independência", iso(ano, 9, 7)),
    unico("criancas", "Dia das Crianças", iso(ano, 10, 12)),
    unico("natal", "Natal", iso(ano, 12, 25)),
  ];
}

/**
 * A festa da vez: a que está acontecendo ou, entre as que estão a 30 dias ou
 * menos, a mais próxima. Quando duas se sobrepõem (Natal e Ano Novo, Dia das
 * Mães e São João), a mais perto ganha e a outra assume quando a primeira passa.
 */
export function festaDoDia(agora = new Date()): FestaDoDia | null {
  const dia = hoje(agora);
  const ano = Number(dia.slice(0, 4));
  let escolhida: FestaDoDia | null = null;

  // O ano anterior e o seguinte entram por causa da virada (Ano Novo em dezembro).
  for (const festa of [ano - 1, ano, ano + 1].flatMap(festasDoAno)) {
    if (dia > festa.fim) continue;
    const dias = Math.max(0, diasEntre(dia, festa.inicio));
    if (dias > DIAS_ANTES) continue;
    if (escolhida && escolhida.dias <= dias) continue;
    const durante = dias === 0;
    escolhida = { ...festa, dias, durante, progresso: durante ? 1 : (DIAS_ANTES - dias) / DIAS_ANTES };
  }
  return escolhida;
}

/** As próximas datas (para mostrar em Configurações que tudo é automático). */
export function proximasFestas(quantas = 4, agora = new Date()): Festa[] {
  const dia = hoje(agora);
  const ano = Number(dia.slice(0, 4));
  return [ano, ano + 1]
    .flatMap(festasDoAno)
    .filter((f) => f.fim >= dia)
    .slice(0, quantas);
}

/* ---------------------------------------------------------------------------
   Preferência do aparelho (cookie)
--------------------------------------------------------------------------- */

export const COOKIE_ENFEITES = "enfeites";
/** Nome antigo, de quando só havia o Natal: quem desligou continua desligado. */
const COOKIE_NATAL_ANTIGO = "natal";

type Biscoitos = { get(nome: string): { value: string } | undefined };

export function enfeitesLigados(biscoitos: Biscoitos) {
  const valor = biscoitos.get(COOKIE_ENFEITES)?.value ?? biscoitos.get(COOKIE_NATAL_ANTIGO)?.value;
  return valor !== "desligado";
}

/** A festa que a tela deve enfeitar agora (null: nenhuma ou desligado neste aparelho). */
export function festaNaTela(biscoitos: Biscoitos, agora = new Date()) {
  return enfeitesLigados(biscoitos) ? festaDoDia(agora) : null;
}

export function salvarEnfeites(ligado: boolean) {
  // Um ano; só preferência visual, pode ser lido no navegador.
  document.cookie = `${COOKIE_ENFEITES}=${ligado ? "ligado" : "desligado"}; path=/; max-age=31536000; samesite=lax`;
  document.cookie = `${COOKIE_NATAL_ANTIGO}=; path=/; max-age=0; samesite=lax`;
}
