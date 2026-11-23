"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { cadastroAberto, urlSite } from "@/lib/auth/config";
import { conferirSenha, senhaValida } from "@/lib/auth/senhas";
import { encerrarSessaoAtual, iniciarSessao, ipDoCliente, obterSessao } from "@/lib/auth/sessao";
import {
  bloqueadoPorTentativas,
  chavesTentativa,
  criarTokenRecuperacao,
  criarUsuario,
  definirSenha,
  registrarTentativa,
  usuarioPorEmail,
} from "@/lib/auth/usuarios";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { caminhoInterno } from "@/lib/url-segura";

export type EstadoForm = { erro?: string; sucesso?: string } | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MUITAS_TENTATIVAS = "Muitas tentativas. Aguarde 15 minutos e tente novamente.";

/**
 * Endereço público do app — usado no link de recuperação de senha. Em
 * produção vem de SITE_URL; sem ela, cai nos cabeçalhos da requisição.
 */
async function origem() {
  const configurado = urlSite();
  if (configurado) return configurado;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function falhaInesperada(e: unknown): EstadoForm {
  console.error("[auth]", e);
  return { erro: "Sem conexão com o servidor. Tente de novo em instantes." };
}

export async function entrar(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  // Saneado de novo aqui: a página também filtra, mas o FormData vem do cliente.
  let destino = caminhoInterno(String(formData.get("redirect") ?? ""));

  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  try {
    const chaves = chavesTentativa(email, ipDoCliente(await headers()));
    if (await bloqueadoPorTentativas(chaves)) return { erro: MUITAS_TENTATIVAS };

    const usuario = await usuarioPorEmail(email);
    const certa = await conferirSenha(senha, usuario?.hash);
    await registrarTentativa(chaves, certa);

    if (!usuario || !certa) return { erro: "E-mail ou senha incorretos." };
    // Só depois da senha certa: não revela a quem não sabe a senha que a conta existe.
    if (usuario.bloqueado) return { erro: "Seu acesso foi bloqueado. Fale com o administrador do sistema." };

    await iniciarSessao({ id: usuario.id, email: usuario.email });
    // O superadmin só usa o console de gerência; o sistema das empresas não é dele.
    if (usuario.superadmin && !destino.startsWith("/admin")) destino = "/admin";
  } catch (e) {
    return falhaInesperada(e);
  }

  revalidatePath("/", "layout");
  redirect(destino);
}

export async function cadastrar(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (!cadastroAberto()) {
    return { erro: "O cadastro de novas empresas está fechado. Peça acesso ao administrador." };
  }

  const nome = String(formData.get("nome") ?? "").trim();
  const empresa = String(formData.get("empresa") ?? "").trim();
  const telefone = String(formData.get("telefone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (!nome || !email || !senha) return { erro: "Preencha nome, e-mail e senha." };
  if (!EMAIL.test(email)) return { erro: "E-mail inválido." };
  if (!senhaValida(senha)) return { erro: "A senha deve ter entre 6 e 72 caracteres." };
  if (senha !== confirmacao) return { erro: "As senhas não conferem." };

  try {
    const criado = await criarUsuario({ email, senha, meta: { nome, empresa, telefone } });
    if (!criado.ok) {
      return { erro: criado.jaExiste ? "Este e-mail já está cadastrado. Faça login." : criado.erro };
    }
    await iniciarSessao({ id: criado.id, email });
  } catch (e) {
    return falhaInesperada(e);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function recuperarSenha(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { erro: "Informe seu e-mail." };

  if (!emailConfigurado()) {
    return {
      erro:
        "O envio de e-mail não está configurado neste servidor. Peça ao gestor da sua empresa " +
        "para gerar uma senha nova em Configurações → Equipe.",
    };
  }

  try {
    // Limita pedidos por IP: evita usar o formulário para disparar e-mails.
    const ip = ipDoCliente(await headers());
    const chave = { email: `recuperacao:${email}`, ip: ip ? `recuperacao-ip:${ip}` : null };
    if (await bloqueadoPorTentativas(chave)) return { erro: MUITAS_TENTATIVAS };
    await registrarTentativa(chave, false);

    const usuario = await usuarioPorEmail(email);
    // A senha do superadmin é a da stack: um link de recuperação não serviria
    // para nada além de abrir uma sessão dele sem senha.
    if (usuario && !usuario.superadmin) {
      const token = await criarTokenRecuperacao(usuario.id);
      const link = `${await origem()}/auth/confirmar?tipo=recuperacao&token=${token}`;
      await enviarEmail({
        para: usuario.email,
        assunto: "Redefinir sua senha — Gestão de Manutenção",
        texto:
          `Recebemos um pedido para redefinir a sua senha.\n\n` +
          `Abra o link abaixo em até 30 minutos para criar uma senha nova:\n${link}\n\n` +
          `Se não foi você, ignore este e-mail — sua senha continua a mesma.`,
      });
    }
  } catch (e) {
    console.error("[auth] recuperação de senha", e);
    return { erro: "Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos." };
  }

  // Mesma resposta exista ou não a conta: não revela quais e-mails estão cadastrados.
  return { sucesso: "Se este e-mail estiver cadastrado, você receberá o link de redefinição." };
}

export async function definirNovaSenha(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const senha = String(formData.get("senha") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (!senhaValida(senha)) return { erro: "A senha deve ter entre 6 e 72 caracteres." };
  if (senha !== confirmacao) return { erro: "As senhas não conferem." };

  try {
    const sessao = await obterSessao();
    if (!sessao) return { erro: "Sua sessão expirou. Peça um novo link de recuperação." };
    // Derruba as outras sessões (quem estava com a senha antiga sai).
    await definirSenha(sessao.userId, senha, sessao.sessaoId);
  } catch (e) {
    return falhaInesperada(e);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function sair() {
  await encerrarSessaoAtual();
  revalidatePath("/", "layout");
  redirect("/login");
}
