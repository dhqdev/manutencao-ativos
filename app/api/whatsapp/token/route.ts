import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { segredoBanco, urlSite } from "@/lib/auth/config";
import { assinarJwt } from "@/lib/auth/jwt";

export const dynamic = "force-dynamic";

const VALIDADE_SEGUNDOS = 300;

function chaveConfere(recebida: string, esperada: string) {
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Token do serviço de WhatsApp para o PostgREST: 5 minutos, papel
 * whatsapp_servico (só as tabelas whatsapp_sessoes e whatsapp_conexoes,
 * db/sql/10-schema.sql). Assim o contêiner do WhatsApp não guarda o
 * JWT_SECRET e não consegue se passar por service_role.
 *
 * Só pela rede interna: pedido que passou pelo Traefik responde 404, mesmo
 * com a chave certa. O sinal é o que só o Traefik põe (X-Real-Ip,
 * X-Forwarded-Server) ou o domínio público no Host — X-Forwarded-For não
 * serve, porque o próprio Next o preenche em todo pedido.
 */
function veioDeFora(request: NextRequest) {
  const h = request.headers;
  if (h.get("x-real-ip") || h.get("x-forwarded-server")) return true;
  const site = urlSite();
  try {
    return Boolean(site) && h.get("host")?.split(":")[0] === new URL(site).hostname;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (veioDeFora(request)) return NextResponse.json({ erro: "não encontrado" }, { status: 404 });

  const esperada = process.env.WHATSAPP_API_KEY?.trim() ?? "";
  const recebida = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (esperada.length < 24 || !chaveConfere(recebida, esperada)) {
    return NextResponse.json({ erro: "chave inválida" }, { status: 401 });
  }

  const token = assinarJwt({ role: "whatsapp_servico" }, segredoBanco(), VALIDADE_SEGUNDOS);
  return NextResponse.json({ token, validade: VALIDADE_SEGUNDOS });
}
