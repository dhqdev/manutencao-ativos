import "server-only";
import { urlSite } from "./config";
import { criarToken } from "./usuarios";
import { enviarEmail } from "@/lib/email";

/**
 * Links que vão por e-mail. O endereço vem SÓ de SITE_URL: montar a partir do
 * cabeçalho Host deixava quem fizesse o pedido escolher o domínio do link — e
 * receber o token de outra pessoa se ela clicasse.
 */
function linkPara(tipo: "recuperacao" | "confirmacao", token: string) {
  const base = urlSite();
  if (!base) throw new Error("SITE_URL não configurada: sem ela o sistema não manda links por e-mail.");
  return `${base}/auth/confirmar?tipo=${tipo}&token=${token}`;
}

export async function enviarLinkRecuperacao(usuario: { id: string; email: string }) {
  const link = linkPara("recuperacao", await criarToken(usuario.id, "recuperacao"));
  await enviarEmail({
    para: usuario.email,
    assunto: "Redefinir sua senha — Gestão de Manutenção",
    texto:
      `Recebemos um pedido para redefinir a sua senha.\n\n` +
      `Abra o link abaixo em até 30 minutos para criar uma senha nova:\n${link}\n\n` +
      `Se não foi você, ignore este e-mail — sua senha continua a mesma.`,
  });
}

export async function enviarLinkConfirmacao(usuario: { id: string; email: string }) {
  const link = linkPara("confirmacao", await criarToken(usuario.id, "confirmacao"));
  await enviarEmail({
    para: usuario.email,
    assunto: "Confirme seu e-mail — Gestão de Manutenção",
    texto:
      `Para confirmar que este e-mail é seu, abra o link abaixo (vale por 3 dias):\n${link}\n\n` +
      `Com o e-mail confirmado você pode aceitar convites de empresas para entrar na equipe delas.\n\n` +
      `Se você não criou uma conta, ignore este e-mail.`,
  });
}
