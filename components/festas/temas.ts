import {
  Balloon,
  Drum,
  Egg,
  FlameKindling,
  Flag,
  HandHeart,
  HardHat,
  Heart,
  PartyPopper,
  TreePine,
  type LucideIcon,
} from "lucide-react";
import { DIAS_RETA_FINAL, type Festa, type FestaDoDia, type IdFesta } from "@/lib/festas";

/*
 * Cara e textos de cada data. As cores são duas por tema (degradê do cartão,
 * filete do topo, faixa do Dashboard) e precisam segurar ícone branco por
 * cima; o resto da tela continua com as cores do sistema.
 */
export type Tema = {
  Icone: LucideIcon;
  cores: readonly [string, string];
  /** Completa "Faltam 12 dias ..." */
  para: (f: Festa) => string;
  /** Frase do dia (ou dos dias) da festa. */
  saudacao: (f: Festa) => string;
  /** Recado da faixa do Dashboard na reta final. */
  recado: string;
  /** Recado no dia da festa. */
  recadoNoDia: string;
};

const anoDe = (f: Festa) => f.inicio.slice(0, 4);

export const TEMAS: Record<IdFesta, Tema> = {
  "ano-novo": {
    Icone: PartyPopper,
    cores: ["#eab308", "#6366f1"],
    para: (f) => `para ${anoDe(f)}`,
    saudacao: (f) => `Feliz ${anoDe(f)}!`,
    recado: "Bom momento para fechar o ano com o histórico em dia.",
    recadoNoDia: "Que o ano comece com tudo em dia.",
  },
  carnaval: {
    Icone: Drum,
    cores: ["#d946ef", "#f59e0b"],
    para: () => "para o Carnaval",
    saudacao: () => "Bom Carnaval!",
    recado: "Feriado chegando: confira o que vence até lá e programe antes.",
    recadoNoDia: "Bom feriado para toda a equipe.",
  },
  pascoa: {
    Icone: Egg,
    cores: ["#a78bfa", "#f59e0b"],
    para: () => "para a Páscoa",
    saudacao: () => "Feliz Páscoa!",
    recado: "A Sexta-feira Santa é feriado: programe as manutenções da semana.",
    recadoNoDia: "Um ótimo domingo para toda a equipe.",
  },
  trabalhador: {
    Icone: HardHat,
    cores: ["#f59e0b", "#2563eb"],
    para: () => "para o Dia do Trabalhador",
    saudacao: () => "Feliz Dia do Trabalhador!",
    recado: "Uma homenagem a quem mantém tudo funcionando.",
    recadoNoDia: "Obrigado a quem mantém tudo funcionando.",
  },
  maes: {
    Icone: Heart,
    cores: ["#ec4899", "#f43f5e"],
    para: () => "para o Dia das Mães",
    saudacao: () => "Feliz Dia das Mães!",
    recado: "Um carinho especial às mães da equipe.",
    recadoNoDia: "Um abraço a todas as mães da equipe.",
  },
  junina: {
    Icone: FlameKindling,
    cores: ["#ea580c", "#eab308"],
    para: () => "para o São João",
    saudacao: () => "Bom São João!",
    recado: "Época de arraiá. Que tal deixar as preventivas do mês em dia?",
    recadoNoDia: "Arraiá para toda a equipe!",
  },
  pais: {
    Icone: HandHeart,
    cores: ["#2563eb", "#0d9488"],
    para: () => "para o Dia dos Pais",
    saudacao: () => "Feliz Dia dos Pais!",
    recado: "Um abraço especial aos pais da equipe.",
    recadoNoDia: "Um abraço a todos os pais da equipe.",
  },
  independencia: {
    Icone: Flag,
    cores: ["#16a34a", "#eab308"],
    para: () => "para o 7 de Setembro",
    saudacao: () => "Feliz Dia da Independência!",
    recado: "Feriado chegando: confira o que vence até lá e programe antes.",
    recadoNoDia: "Bom feriado para toda a equipe.",
  },
  criancas: {
    Icone: Balloon,
    cores: ["#06b6d4", "#d946ef"],
    para: () => "para o Dia das Crianças",
    saudacao: () => "Feliz Dia das Crianças!",
    // 12 de outubro também é o feriado de Nossa Senhora Aparecida.
    recado: "Dia 12 é feriado: programe as manutenções da semana.",
    recadoNoDia: "Bom feriado para toda a equipe.",
  },
  natal: {
    Icone: TreePine,
    cores: ["#dc2626", "#16a34a"],
    para: () => "para o Natal",
    saudacao: () => "Feliz Natal!",
    recado: "Que tal deixar as preventivas em dia antes das festas?",
    recadoNoDia: "Bom descanso para toda a equipe.",
  },
};

/** "Faltam 12 dias para o Natal" / "Falta 1 dia para 2027" / "Feliz Natal!" */
export function contagem(festa: FestaDoDia) {
  const tema = TEMAS[festa.id];
  if (festa.durante) return tema.saudacao(festa);
  return `${festa.dias === 1 ? "Falta 1 dia" : `Faltam ${festa.dias} dias`} ${tema.para(festa)}`;
}

/** A faixa do Dashboard só entra na última semana e no dia: antes disso, só o enfeite do menu. */
export const naRetaFinal = (festa: FestaDoDia) => festa.durante || festa.dias <= DIAS_RETA_FINAL;

const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * "sexta, 25 de dezembro". Montado à mão (e não com toLocaleDateString) para o
 * servidor e o navegador escreverem igual, sem erro de hidratação.
 */
export function diaPorExtenso(iso: string) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const semana = SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()];
  return `${semana}, ${dia === 1 ? "1º" : dia} de ${MESES[mes - 1]}`;
}

/** "25/12" */
export const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/* Misturas de cor que valem no tema claro e no escuro (a superfície muda sozinha). */
export const tinta = (cor: string, pct: number) => `color-mix(in oklab, ${cor} ${pct}%, transparent)`;
export const clara = (cor: string, pct = 62) => `color-mix(in oklab, ${cor} ${pct}%, white)`;
