import "server-only";

/**
 * Cliente do servidor de WhatsApp do próprio projeto (pasta whatsapp/, com
 * Baileys). Roda num container próprio, ligado 24 h, porque o WhatsApp exige
 * uma conexão aberta o tempo todo. O app fala com ele pela rede interna.
 *
 * A chave dá acesso a TODAS as sessões. Por isso este arquivo é `server-only`
 * e as variáveis não têm prefixo NEXT_PUBLIC_.
 */

export type EstadoSessao = {
  status: "desconectado" | "conectando" | "conectado";
  qr: string | null;
  codigoPareamento: string | null;
  numero: string | null;
  nomePerfil: string | null;
  expirado?: boolean;
  erro?: string | null;
};

export class ErroWhatsapp extends Error {
  status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

function base() {
  const url = process.env.WHATSAPP_API_URL?.trim();
  if (!url) {
    throw new ErroWhatsapp(
      0,
      "WHATSAPP_API_URL não configurada. Confira o .env do servidor (veja WHATSAPP.md).",
    );
  }
  return url.replace(/\/+$/, "");
}

function chave() {
  const k = process.env.WHATSAPP_API_KEY?.trim();
  if (!k) {
    throw new ErroWhatsapp(
      0,
      "WHATSAPP_API_KEY não configurada. Confira o .env do servidor (veja WHATSAPP.md).",
    );
  }
  return k;
}

async function chamar<T>(
  caminho: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${base()}${caminho}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${chave()}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
    });
  } catch (e) {
    if (e instanceof ErroWhatsapp) throw e;
    throw new ErroWhatsapp(
      0,
      "Servidor de WhatsApp fora do ar ou inacessível. Confira se ele está rodando e o endereço em WHATSAPP_API_URL.",
    );
  }

  const texto = await resposta.text();
  let dados: unknown = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = null;
  }

  if (!resposta.ok) {
    const erro = (dados as { erro?: unknown } | null)?.erro;
    if (resposta.status === 401) {
      throw new ErroWhatsapp(401, "A WHATSAPP_API_KEY do app não confere com a do serviço de WhatsApp.");
    }
    throw new ErroWhatsapp(
      resposta.status,
      typeof erro === "string" ? erro : `Servidor de WhatsApp respondeu ${resposta.status}.`,
    );
  }

  return dados as T;
}

const rota = (instancia: string) => `/sessoes/${encodeURIComponent(instancia)}`;

/** Id da sessão desta empresa no servidor de WhatsApp. */
export function nomeInstancia(orgId: string) {
  return `manut_${orgId.replace(/-/g, "").slice(0, 20)}`;
}

/**
 * Abre a sessão e devolve o QR. Com `telefone`, devolve também um código de
 * 8 letras para digitar no celular — para quem está usando o sistema no
 * próprio celular e não tem como escanear a tela.
 */
export async function abrirConexao(instancia: string, telefone?: string | null) {
  return chamar<EstadoSessao>(`${rota(instancia)}/conectar`, {
    method: "POST",
    body: telefone ? { telefone } : {},
    timeoutMs: 25_000,
  });
}

export async function estadoSessao(instancia: string) {
  return chamar<EstadoSessao>(rota(instancia));
}

/** Remove o aparelho do celular e apaga as credenciais. Nunca lança. */
export async function desconectar(instancia: string) {
  try {
    await chamar(rota(instancia), { method: "DELETE", timeoutMs: 20_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Envia texto. O servidor mostra "digitando..." para quem recebe antes de
 * mandar, e acerta sozinho o nono dígito de números brasileiros antigos.
 */
export async function enviarTexto(instancia: string, numero: string, texto: string) {
  return chamar<{ ok: true; id: string | null; jid: string }>(`${rota(instancia)}/mensagens`, {
    method: "POST",
    body: { numero: numero.replace(/\D/g, ""), texto },
    timeoutMs: 60_000,
  });
}

/** Quais números têm WhatsApp (usa a sessão conectada para consultar). */
export async function verificarNumeros(instancia: string, numeros: string[]) {
  const r = await chamar<{ numeros: { numero: string; existe: boolean; jid: string | null }[] }>(
    `${rota(instancia)}/numeros`,
    { method: "POST", body: { numeros }, timeoutMs: 30_000 },
  );
  return r.numeros;
}
