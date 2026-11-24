"use server";

import { stat } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { obterSessao } from "@/lib/auth/sessao";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { caminhoNoDisco, caminhoValido, tipoDoArquivo, tokenDeEnvio } from "@/lib/arquivos";
import { CFG, lerValorReais } from "@/lib/assinatura";
import { avisarComprovante, testarAvisoWhatsapp } from "@/lib/assinatura-servidor";
import { booleano, data, erroBanco, exigirId, mensagemErro, texto, type Resultado } from "@/lib/form";
import { SEM_PERMISSAO, podeGerenciar } from "@/lib/permissoes";
import { montarPix, normalizarChavePix } from "@/lib/pix";
import { getContextoSemBloqueio } from "@/lib/session";
import { normalizarTelefone, telefoneValido } from "@/lib/telefone";
import {
  INSTANCIA_COBRANCA,
  abrirConexao,
  desconectar,
  estadoSessao,
  type EstadoSessao,
} from "@/lib/whatsapp";

/**
 * Assinatura mensal por Pix. A empresa (proprietário/gestor) envia o
 * comprovante; o superadmin configura a cobrança, define vencimentos e
 * aprova. As ações da empresa usam o contexto SEM bloqueio: com a assinatura
 * vencida, pagar é justamente o que precisa continuar funcionando.
 */

function nomeSeguro(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-80);
}

export type EnvioComprovante = { ok: true; caminho: string; token: string } | { ok: false; erro: string };

/** Autoriza o envio do arquivo do comprovante direto para /api/arquivos. */
export async function autorizarComprovante(nomeArquivo: string): Promise<EnvioComprovante> {
  try {
    const { orgId, papel } = await getContextoSemBloqueio();
    if (!podeGerenciar(papel)) return { ok: false, erro: "Só o proprietário ou um gestor envia o comprovante." };

    const caminho = `${orgId}/assinatura/${crypto.randomUUID()}-${nomeSeguro(String(nomeArquivo ?? ""))}`;
    if (!caminhoValido(caminho)) return { ok: false, erro: "Nome de arquivo inválido." };
    if (!tipoDoArquivo(caminho)) return { ok: false, erro: "Envie o comprovante como imagem (JPG, PNG) ou PDF." };
    return { ok: true, caminho, token: tokenDeEnvio(caminho) };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

/** Registra o comprovante já enviado e avisa o dono no WhatsApp (depois da resposta). */
export async function registrarComprovante(dados: {
  caminho: string;
  nome: string;
  observacao?: string | null;
}): Promise<Resultado> {
  try {
    const { orgId, papel } = await getContextoSemBloqueio();
    if (!podeGerenciar(papel)) return { ok: false, erro: SEM_PERMISSAO };

    const caminho = String(dados?.caminho ?? "");
    if (!caminho.startsWith(`${orgId}/assinatura/`) || !caminhoValido(caminho)) {
      return { ok: false, erro: "Comprovante inválido. Envie de novo." };
    }
    // O arquivo tem que ter chegado de verdade antes de virar registro.
    const info = await stat(caminhoNoDisco(caminho)).catch(() => null);
    if (!info?.isFile()) return { ok: false, erro: "O arquivo do comprovante não chegou. Envie de novo." };

    const db = await createClient();
    const { data: id, error } = await db.rpc("assinatura_enviar_comprovante", {
      p_org: orgId,
      p_caminho: caminho,
      p_nome: String(dados.nome ?? "").slice(0, 200),
      p_observacao: dados.observacao ? String(dados.observacao).slice(0, 500) : null,
    });
    if (error) return erroBanco(error);

    after(() => avisarComprovante(String(id)));
    revalidatePath("/assinatura");
    return { ok: true, id: String(id) };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

// --- Console do superadmin ------------------------------------------------------

async function exigirSuperadmin() {
  const sessao = await obterSessao();
  if (!sessao?.superadmin) throw new Error("Só o superadmin pode fazer isso.");
  return { sessao, admin: createAdminClient() };
}

function pronto(): Resultado {
  revalidatePath("/admin");
  return { ok: true };
}

/** Chave Pix, recebedor, valor, tolerância, teste grátis e o WhatsApp dos avisos. */
export async function adminSalvarCobranca(fd: FormData): Promise<Resultado> {
  try {
    const { sessao, admin } = await exigirSuperadmin();

    const chave = normalizarChavePix(texto(fd, "chave"));
    if (!chave) return { ok: false, erro: "Chave Pix inválida. Use e-mail, CPF, CNPJ, telefone ou a chave aleatória." };
    const nome = texto(fd, "nome");
    const cidade = texto(fd, "cidade");
    if (!nome) return { ok: false, erro: "Informe o nome de quem recebe (como está no banco)." };
    if (!cidade) return { ok: false, erro: "Informe a cidade de quem recebe." };
    const valor = lerValorReais(texto(fd, "valor"));
    if (valor === null || valor <= 0) return { ok: false, erro: "Informe o valor da assinatura, ex.: 99,90." };

    const tolerancia = Number(texto(fd, "tolerancia") ?? 3);
    if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > 60) {
      return { ok: false, erro: "Tolerância: de 0 a 60 dias." };
    }
    const diasTeste = Number(texto(fd, "dias_teste") ?? 7);
    if (!Number.isInteger(diasTeste) || diasTeste < 0 || diasTeste > 365) {
      return { ok: false, erro: "Dias grátis para empresa nova: de 0 a 365." };
    }
    const whatsapp = texto(fd, "whatsapp");
    if (whatsapp && !telefoneValido(whatsapp)) {
      return { ok: false, erro: "WhatsApp inválido. Informe com DDD, ex.: (11) 98765-4321." };
    }

    // Monta uma vez para garantir que o banco do cliente vai aceitar.
    montarPix({ chave: chave.chave, nome, cidade, valor });

    const agora = new Date().toISOString();
    const linhas = [
      [CFG.chave, chave.chave],
      [CFG.nome, nome.slice(0, 60)],
      [CFG.cidade, cidade.slice(0, 40)],
      [CFG.valor, valor.toFixed(2)],
      [CFG.tolerancia, String(tolerancia)],
      [CFG.diasTeste, String(diasTeste)],
    ].map(([c, v]) => ({ chave: c, valor: v, atualizado_em: agora, atualizado_por: sessao.userId }));

    const { error } = await admin.from("sistema_credenciais").upsert(
      whatsapp
        ? [...linhas, { chave: CFG.whatsapp, valor: normalizarTelefone(whatsapp), atualizado_em: agora, atualizado_por: sessao.userId }]
        : linhas,
      { onConflict: "chave" },
    );
    if (error) return { ok: false, erro: error.message };
    if (!whatsapp) await admin.from("sistema_credenciais").delete().eq("chave", CFG.whatsapp);
    revalidatePath("/assinatura");
    return pronto();
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

/** Desliga a cobrança (ninguém é bloqueado). Os vencimentos ficam guardados. */
export async function adminDesligarCobranca(): Promise<Resultado> {
  try {
    const { admin } = await exigirSuperadmin();
    const { error } = await admin.from("sistema_credenciais").delete().eq("chave", CFG.chave);
    if (error) return { ok: false, erro: error.message };
    return pronto();
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

/** Vencimento e isenção de uma empresa, definidos à mão. */
export async function adminDefinirAssinatura(fd: FormData): Promise<Resultado> {
  try {
    const { admin } = await exigirSuperadmin();
    const org = exigirId(fd.get("org_id"), "a empresa");
    const bruto = texto(fd, "vencimento");
    const vencimento = data(fd, "vencimento");
    if (bruto && !vencimento) return { ok: false, erro: "Data de vencimento inválida." };
    const { error } = await admin.rpc("admin_definir_assinatura", {
      p_org: org,
      p_vencimento: vencimento,
      p_isenta: booleano(fd, "isenta"),
    });
    if (error) return erroBanco(error);
    return pronto();
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

/** Aprova (estende 1 mês) ou recusa um comprovante. */
export async function adminAvaliarPagamento(id: string, aprovar: boolean, motivo?: string | null): Promise<Resultado> {
  try {
    const pagamento = exigirId(id, "o comprovante");
    const { sessao, admin } = await exigirSuperadmin();
    if (!aprovar && !String(motivo ?? "").trim()) return { ok: false, erro: "Diga o motivo da recusa (a empresa vê)." };
    const { error } = await admin.rpc("admin_avaliar_pagamento", {
      p_id: pagamento,
      p_aprovar: Boolean(aprovar),
      p_motivo: motivo ? String(motivo).slice(0, 500) : null,
      p_admin: sessao.userId,
    });
    if (error) return erroBanco(error);
    revalidatePath("/assinatura");
    return pronto();
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

/** Manda de novo o aviso de um comprovante para o WhatsApp. */
export async function adminReenviarAviso(id: string): Promise<Resultado> {
  try {
    const pagamento = exigirId(id, "o comprovante");
    await exigirSuperadmin();
    await avisarComprovante(pagamento);
    const { data: linha } = await createAdminClient()
      .from("assinatura_pagamentos")
      .select("whatsapp_erro")
      .eq("id", pagamento)
      .maybeSingle();
    revalidatePath("/admin");
    return linha?.whatsapp_erro ? { ok: false, erro: linha.whatsapp_erro } : { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

// --- WhatsApp do dono (sessão "sistema_cobranca") -----------------------------------

export type StatusWhatsappCobranca = {
  status: EstadoSessao["status"];
  qr: string | null;
  codigoPareamento: string | null;
  numero: string | null;
  nomePerfil: string | null;
  expirado?: boolean;
  erro?: string;
};

function paraStatus(e: EstadoSessao): StatusWhatsappCobranca {
  return {
    status: e.status,
    qr: e.qr ?? null,
    codigoPareamento: e.codigoPareamento ?? null,
    numero: e.numero ?? null,
    nomePerfil: e.nomePerfil ?? null,
    expirado: Boolean(e.expirado),
    ...(e.erro ? { erro: e.erro } : {}),
  };
}

const SEM_CONEXAO: StatusWhatsappCobranca = {
  status: "desconectado",
  qr: null,
  codigoPareamento: null,
  numero: null,
  nomePerfil: null,
};

export async function adminConectarWhatsappCobranca(telefone?: string | null): Promise<StatusWhatsappCobranca> {
  try {
    await exigirSuperadmin();
    if (telefone && !telefoneValido(telefone)) {
      return { ...SEM_CONEXAO, erro: "Telefone inválido. Informe com DDD, ex.: (11) 98765-4321." };
    }
    return paraStatus(await abrirConexao(INSTANCIA_COBRANCA, telefone ? normalizarTelefone(telefone) : null));
  } catch (e) {
    return { ...SEM_CONEXAO, erro: mensagemErro(e) };
  }
}

export async function adminStatusWhatsappCobranca(): Promise<StatusWhatsappCobranca> {
  try {
    await exigirSuperadmin();
    return paraStatus(await estadoSessao(INSTANCIA_COBRANCA));
  } catch (e) {
    return { ...SEM_CONEXAO, erro: mensagemErro(e) };
  }
}

export async function adminDesconectarWhatsappCobranca(): Promise<Resultado> {
  try {
    await exigirSuperadmin();
    await desconectar(INSTANCIA_COBRANCA);
    return pronto();
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export async function adminTestarWhatsappCobranca(): Promise<Resultado> {
  try {
    await exigirSuperadmin();
    await testarAvisoWhatsapp();
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}
