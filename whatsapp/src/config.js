/**
 * Configuração lida das variáveis de ambiente. Tudo que é obrigatório é
 * conferido na partida: melhor o processo não subir do que subir pela metade.
 */

function texto(nome, padrao = "") {
  return (process.env[nome] ?? padrao).trim();
}

function booleano(nome, padrao) {
  const v = texto(nome).toLowerCase();
  if (!v) return padrao;
  return ["1", "true", "sim", "yes", "on"].includes(v);
}

function inteiro(nome, padrao) {
  const n = Number.parseInt(texto(nome), 10);
  return Number.isFinite(n) ? n : padrao;
}

/** Stack sem APP_URL: o app tem o mesmo nome do PostgREST trocando "rest" por "app". */
function appAoLadoDoRest(restUrl) {
  try {
    const u = new URL(restUrl);
    u.hostname = u.hostname.replace(/rest$/, "app");
    u.port = "3000";
    return u.origin;
  } catch {
    return "http://app:3000";
  }
}

export const config = {
  porta: inteiro("PORT", 3000),

  /** Mesma chave cadastrada na Vercel como WHATSAPP_API_KEY. */
  chaveApi: texto("WHATSAPP_API_KEY"),

  /** PostgREST da stack (rede interna), ex.: http://rest:3000 */
  restUrl: texto("POSTGREST_URL").replace(/\/+$/, ""),
  /**
   * App na rede interna. O token do banco (papel whatsapp_servico, 5 min) vem
   * dele, pedido com a WHATSAPP_API_KEY: este serviço não guarda o JWT_SECRET.
   */
  appUrl: (texto("APP_URL") || appAoLadoDoRest(texto("POSTGREST_URL"))).replace(/\/+$/, ""),

  /**
   * Só para stacks antigas que ainda passam JWT_SECRET: se o app não responder,
   * assina aqui — mas já com o papel restrito, nunca service_role. Tire a
   * variável da stack (INSTALACAO.md).
   */
  jwtSecretLegado: texto("JWT_SECRET"),

  /** Aparece no celular em Configurações → Aparelhos conectados. */
  nomeAparelho: texto("WHATSAPP_NOME_APARELHO", "Gestão de Manutenção"),

  /**
   * Mantém o número "online" o tempo todo. Desligado por padrão: enquanto um
   * aparelho conectado está online, o WhatsApp entende que a pessoa está no
   * computador e o celular para de tocar notificação das mensagens recebidas
   * (parece que o número "parou de receber"). Para só enviar avisos, não
   * precisa: o servidor fica online só durante o "digitando" de cada envio.
   */
  sempreOnline: booleano("WHATSAPP_SEMPRE_ONLINE", false),

  /** Mostra "digitando..." para quem recebe, antes de cada mensagem. */
  digitando: booleano("WHATSAPP_DIGITANDO", true),

  /** Recusa ligações recebidas no número conectado. */
  rejeitarChamadas: booleano("WHATSAPP_REJEITAR_CHAMADAS", false),

  /** Pausa entre duas mensagens da mesma sessão (anti-rajada). */
  intervaloEnvioMs: inteiro("WHATSAPP_INTERVALO_ENVIO_MS", 1500),

  nivelLog: texto("LOG_LEVEL", "info"),
  nivelLogBaileys: texto("LOG_LEVEL_BAILEYS", "warn"),
};

export function validarConfig() {
  const faltando = [];
  if (!config.chaveApi) faltando.push("WHATSAPP_API_KEY");
  if (!config.restUrl) faltando.push("POSTGREST_URL");

  if (faltando.length) {
    throw new Error(`Variáveis de ambiente obrigatórias ausentes: ${faltando.join(", ")}`);
  }
  if (/^TROQUE/.test(config.chaveApi)) {
    throw new Error("WHATSAPP_API_KEY ainda com o valor de exemplo (TROQUE-...). Gere uma: openssl rand -hex 32.");
  }
  if (config.chaveApi.length < 24) {
    throw new Error("WHATSAPP_API_KEY muito curta. Use pelo menos 24 caracteres aleatórios.");
  }
}
