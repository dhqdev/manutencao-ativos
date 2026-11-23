"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { cadastroAberto } from "@/lib/auth/config";
import { enviarLinkConfirmacao, enviarLinkRecuperacao } from "@/lib/auth/links-email";
import { conferirSenha, problemaNaSenha } from "@/lib/auth/senhas";
import {
  COOKIE_RECUPERACAO,
  encerrarSessaoAtual,
  iniciarSessao,
  ipDoCliente,
  lerCookieRecuperacao,
  obterSessao,
} from "@/lib/auth/sessao";
import {
  bloqueadoPorTentativas,
  chavesTentativa,
  criarUsuario,
  definirSenha,
  registrarTentativa,
  usuarioPorEmail,
} from "@/lib/auth/usuarios";
import { emailConfigurado } from "@/lib/email";
import { caminhoInterno } from "@/lib/url-segura";

export type EstadoForm = { erro?: string; sucesso?: string } | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MUITAS_TENTATIVAS = "Muitas tentativas. Aguarde 15 minutos e tente novamente.";

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
  const fraca = problemaNaSenha(senha, email);
  if (fraca) return { erro: fraca };
  if (senha !== confirmacao) return { erro: "As senhas não conferem." };

  try {
    const criado = await criarUsuario({ email, senha, meta: { nome, empresa, telefone } });
    if (!criado.ok) {
      return { erro: criado.jaExiste ? "Este e-mail já está cadastrado. Faça login." : criado.erro };
    }
    await iniciarSessao({ id: criado.id, email });
    // Confirmação do e-mail: não impede de usar a própria empresa, mas é ela
    // que permite aceitar convite de outra (db/sql/73-convites.sql).
    if (emailConfigurado()) {
      await enviarLinkConfirmacao({ id: criado.id, email }).catch((e) =>
        console.error("[auth] e-mail de confirmação", e),
      );
    }
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
    // 5 por e-mail: ninguém usa o formulário para encher a caixa de outra pessoa.
    const chave = [
      { chave: `recuperacao:${email}`, limite: 5 },
      ...(ip ? [{ chave: `recuperacao-ip:${ip}`, limite: 30 }] : []),
    ];
    if (await bloqueadoPorTentativas(chave)) return { erro: MUITAS_TENTATIVAS };
    await registrarTentativa(chave, false);

    const usuario = await usuarioPorEmail(email);
    // A senha do superadmin é a da stack: um link de recuperação não serviria
    // para nada além de abrir uma sessão dele sem senha.
    if (usuario && !usuario.superadmin) {
      await enviarLinkRecuperacao(usuario);
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

  if (senha !== confirmacao) return { erro: "As senhas não conferem." };

  try {
    const sessao = await obterSessao();
    const jar = await cookies();
    // Sem senha atual só com o link do e-mail: a sessão tem de ser a que ele abriu.
    if (!sessao || lerCookieRecuperacao(jar.get(COOKIE_RECUPERACAO)?.value) !== sessao.sessaoId) {
      return { erro: "Este link de recuperação expirou ou já foi usado. Peça um novo." };
    }
    const fraca = problemaNaSenha(senha, sessao.email);
    if (fraca) return { erro: fraca };
    // Derruba as outras sessões (quem estava com a senha antiga sai).
    await definirSenha(sessao.userId, senha, sessao.sessaoId);
    jar.delete(COOKIE_RECUPERACAO);
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
