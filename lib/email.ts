import "server-only";
import nodemailer from "nodemailer";

/**
 * E-mail por SMTP (qualquer provedor: o do seu domínio, Brevo, Resend,
 * Amazon SES, Gmail com senha de app…). Só é usado na recuperação de senha.
 * Sem SMTP configurado, o sistema funciona normalmente e a tela de
 * recuperação orienta a pedir uma senha nova ao gestor.
 */

export function emailConfigurado() {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_REMETENTE?.trim());
}

export async function enviarEmail(m: { para: string; assunto: string; texto: string; html?: string }) {
  const porta = Number(process.env.SMTP_PORTA || 587);
  const usuario = process.env.SMTP_USUARIO?.trim();

  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port: porta,
    secure: porta === 465,
    auth: usuario ? { user: usuario, pass: process.env.SMTP_SENHA ?? "" } : undefined,
  });

  await transporte.sendMail({
    from: process.env.SMTP_REMETENTE!.trim(),
    to: m.para,
    subject: m.assunto,
    text: m.texto,
    html: m.html,
  });
}
