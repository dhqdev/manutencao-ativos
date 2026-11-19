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

export const config = {
  porta: inteiro("PORT", 3000),

  /** Mesma chave cadastrada na Vercel como WHATSAPP_API_KEY. */
  chaveApi: texto("WHATSAPP_API_KEY"),

  /** PostgREST da stack (rede interna), ex.: http://rest:3000 */
  restUrl: texto("POSTGREST_URL").replace(/\/+$/, ""),
  /** Mesmo JWT_SECRET do PostgREST: o serviço assina o próprio token de servidor. */
  jwtSecret: texto("JWT_SECRET"),

  /** Aparece no celular em Configurações → Aparelhos conectados. */
  nomeAparelho: texto("WHATSAPP_NOME_APARELHO", "Gestão de Manutenção"),

  /**
   * Mantém o número "online" o tempo todo. Efeito colateral conhecido do
   * WhatsApp: enquanto um aparelho conectado está online, o celular pode
   * deixar de tocar notificação de mensagens recebidas.
   */
  sempreOnline: booleano("WHATSAPP_SEMPRE_ONLINE", true),

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
  if (!config.jwtSecret) faltando.push("JWT_SECRET");

  if (faltando.length) {
    throw new Error(`Variáveis de ambiente obrigatórias ausentes: ${faltando.join(", ")}`);
  }
  if (config.chaveApi.length < 24) {
    throw new Error("WHATSAPP_API_KEY muito curta. Use pelo menos 24 caracteres aleatórios.");
  }
}
