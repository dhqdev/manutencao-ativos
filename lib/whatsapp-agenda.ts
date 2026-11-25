/**
 * Agenda do resumo diário do WhatsApp, sempre no horário de Brasília.
 *
 * O serviço "cron" chama a rotina (app/api/notificacoes/disparar) no minuto 1
 * de cada hora. A empresa recebe uma vez por dia, na primeira rodada a partir
 * do horário escolhido em que o WhatsApp está conectado e há algo pendente;
 * se uma rodada falha (ou não há nada pendente), a próxima hora tenta de novo.
 * A rotina e a tela de Configurações usam estas mesmas contas: assim a tela
 * diz quando o próximo resumo sai e, se o de hoje atrasou, por quê.
 */

export const HORARIO_PADRAO = 8;

const FUSO = "America/Sao_Paulo";

/** Dia (AAAA-MM-DD) e hora cheia (0 a 23) em Brasília. O container roda em UTC. */
export function agoraEmBrasilia(agora = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "00";
  return { hoje: `${v("year")}-${v("month")}-${v("day")}`, hora: Number(v("hour")), minuto: Number(v("minute")) };
}

/** Horário salvo da empresa (0 a 23); sem valor válido, o padrão de 8h. */
export function horarioDoResumo(valor: unknown) {
  const n = Number(valor ?? HORARIO_PADRAO);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : HORARIO_PADRAO;
}

/** "05:00" */
export const horaCheia = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Hora e minuto (HH:MM) de um instante, em Brasília. */
function horaMinuto(iso: string) {
  const { hora, minuto } = agoraEmBrasilia(new Date(iso));
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

/** Linha de `whatsapp_envios` do dia (uma por empresa e dia). */
export type EnvioDoDia = {
  data_referencia: string;
  sucesso: boolean;
  detalhe: string | null;
  enviado_em: string;
  /** Rodadas que reservaram o envio no dia (banco sem a coluna: ausente). */
  tentativas?: number | null;
  /** Último erro do dia; um envio com sucesso depois não apaga. */
  ultima_falha?: string | null;
};

/** Detalhes que a rotina grava e que não são falha. */
export const NADA_PENDENTE = "nada pendente";
export const ENVIANDO = "enviando";

/**
 * O que a tela mostra embaixo do horário: como foi o resumo de hoje (só quando
 * há algo a explicar) e quando sai o próximo.
 */
export function situacaoDoResumo({
  horario,
  envioHoje,
  agora = new Date(),
}: {
  horario: unknown;
  /** Linha de hoje em `whatsapp_envios`; de outro dia é ignorada. */
  envioHoje: EnvioDoDia | null | undefined;
  agora?: Date;
}): { hoje: string | null; proximo: string | null } {
  const h = horarioDoResumo(horario);
  const { hoje, hora } = agoraEmBrasilia(agora);
  const envio = envioHoje && envioHoje.data_referencia === hoje ? envioHoje : null;
  const amanha = `Próximo resumo: amanhã às ${horaCheia(h)}.`;

  // A rodada seguinte é a da próxima hora cheia; depois das 23h já é outro dia,
  // e aí vale o horário escolhido de novo.
  const proximaRodada =
    hora < h
      ? `Próximo resumo: hoje às ${horaCheia(h)}.`
      : hora < 23
        ? `Próximo resumo: hoje às ${horaCheia(hora + 1)}.`
        : amanha;

  if (!envio) return { hoje: null, proximo: proximaRodada };

  if (envio.sucesso) {
    const antes = (envio.tentativas ?? 0) > 1;
    const explicacao = !antes
      ? null
      : envio.ultima_falha
        ? `Hoje saiu às ${horaMinuto(envio.enviado_em)} porque as tentativas anteriores falharam (${envio.ultima_falha}).`
        : `Hoje saiu às ${horaMinuto(envio.enviado_em)}: nas rodadas anteriores não havia nada pendente.`;
    return { hoje: explicacao, proximo: amanha };
  }

  if (envio.detalhe === ENVIANDO) return { hoje: "Enviando o resumo de hoje agora.", proximo: null };
  if (envio.detalhe === NADA_PENDENTE) {
    return { hoje: "Hoje ainda não havia nada pendente para avisar.", proximo: proximaRodada };
  }
  return { hoje: `O resumo de hoje ainda não saiu: ${envio.detalhe ?? "erro desconhecido"}.`, proximo: proximaRodada };
}
