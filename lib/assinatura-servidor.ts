import "server-only";
import { readFile, stat } from "node:fs/promises";
import QRCode from "qrcode";
import { urlSite } from "@/lib/auth/config";
import { createAdminClient } from "@/lib/db/admin";
import { caminhoNoDisco, tipoDoArquivo } from "@/lib/arquivos";
import { CFG, DIAS_TESTE_PADRAO, TOLERANCIA_PADRAO } from "@/lib/assinatura";
import { dataBR, moeda } from "@/lib/format";
import { obterCredenciais } from "@/lib/integracoes";
import { montarPix, normalizarChavePix } from "@/lib/pix";
import { formatarTelefone } from "@/lib/telefone";
import { INSTANCIA_COBRANCA, enviarArquivo, enviarTexto } from "@/lib/whatsapp";

/**
 * Lado do servidor da assinatura: lê a configuração do console (chave Pix,
 * valor...), monta o Pix copia e cola + QR e avisa o dono no WhatsApp quando
 * chega um comprovante. Tudo com a chave de serviço, por isso só é chamado
 * depois de conferir quem pediu (empresa da sessão ou superadmin).
 */

export type ConfigCobranca = {
  chave: string | null;
  nome: string | null;
  cidade: string | null;
  valor: number;
  tolerancia: number;
  diasTeste: number;
  /** Número que recebe o aviso de comprovante (só dígitos, com DDI). */
  whatsapp: string | null;
};

const inteiro = (v: string | undefined, padrao: number) => (v && /^\d+$/.test(v) ? Number(v) : padrao);

export async function configCobranca(): Promise<ConfigCobranca> {
  const c = await obterCredenciais(Object.values(CFG));
  return {
    chave: c[CFG.chave] || null,
    nome: c[CFG.nome] || null,
    cidade: c[CFG.cidade] || null,
    valor: Number(c[CFG.valor]) || 0,
    tolerancia: inteiro(c[CFG.tolerancia], TOLERANCIA_PADRAO),
    diasTeste: inteiro(c[CFG.diasTeste], DIAS_TESTE_PADRAO),
    whatsapp: c[CFG.whatsapp] || null,
  };
}

export const cobrancaLigada = (c: ConfigCobranca) => Boolean(c.chave && c.nome && c.cidade && c.valor > 0);

export type PixPronto = { copiaECola: string; qrSvg: string; valor: number; nome: string; chave: string; tipoChave: string };

/** Desenha o QR como SVG (sem imagem externa, sem biblioteca no navegador). */
export function qrSvg(texto: string) {
  return QRCode.toString(texto, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}

/** Pix desta empresa: o identificador (aparece no extrato) leva o começo do id dela. */
export async function pixDaEmpresa(orgId: string, config?: ConfigCobranca): Promise<PixPronto | null> {
  const c = config ?? (await configCobranca());
  if (!cobrancaLigada(c)) return null;
  const chave = normalizarChavePix(c.chave);
  if (!chave) return null;
  const copiaECola = montarPix({
    chave: chave.chave,
    nome: c.nome!,
    cidade: c.cidade!,
    valor: c.valor,
    identificador: `MANUT${orgId.replace(/-/g, "").slice(0, 12)}`,
  });
  return { copiaECola, qrSvg: await qrSvg(copiaECola), valor: c.valor, nome: c.nome!, chave: chave.chave, tipoChave: chave.tipo };
}

// --- Aviso no WhatsApp do dono -----------------------------------------------------

/** Tipos que o WhatsApp mostra direto; o resto (HEIC) vai só como link. */
const TIPOS_WHATSAPP = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const LIMITE_WHATSAPP = 8 * 1024 * 1024;

/**
 * Manda o comprovante para o WhatsApp do dono, pela sessão "sistema_cobranca"
 * (conectada no console). Nunca lança: grava em assinatura_pagamentos quando
 * saiu ou por que não saiu, e o console mostra.
 */
export async function avisarComprovante(pagamentoId: string) {
  const admin = createAdminClient();
  const registrar = (campos: { whatsapp_em?: string; whatsapp_erro?: string | null }) =>
    admin.from("assinatura_pagamentos").update(campos).eq("id", pagamentoId);

  try {
    const config = await configCobranca();
    if (!config.whatsapp) {
      await registrar({ whatsapp_erro: "Nenhum WhatsApp cadastrado no console para receber os avisos." });
      return;
    }

    const { data: pag, error } = await admin
      .from("assinatura_pagamentos")
      .select("id, org_id, valor, comprovante, nome_arquivo, observacao, enviado_em, organizacoes(nome)")
      .eq("id", pagamentoId)
      .maybeSingle();
    if (error || !pag) throw new Error(error?.message ?? "Comprovante não encontrado.");

    const { data: assinatura } = await admin.from("assinaturas").select("vencimento").eq("org_id", pag.org_id).maybeSingle();
    const empresa = (pag.organizacoes as unknown as { nome: string } | null)?.nome ?? "Empresa";
    const site = urlSite();

    const texto = [
      "*Comprovante de pagamento recebido*",
      `Empresa: ${empresa}`,
      `Valor da assinatura: ${moeda(Number(pag.valor))}`,
      assinatura?.vencimento ? `Vencimento atual: ${dataBR(assinatura.vencimento)}` : null,
      pag.observacao ? `Observação: ${pag.observacao}` : null,
      site ? `\nAprovar ou recusar: ${site}/admin?aba=assinaturas` : "\nAprove ou recuse no console do sistema, aba Assinaturas.",
    ]
      .filter(Boolean)
      .join("\n");

    const tipo = tipoDoArquivo(pag.comprovante);
    const arquivo = caminhoNoDisco(pag.comprovante);
    const tamanho = (await stat(arquivo).catch(() => null))?.size ?? 0;

    if (tipo && TIPOS_WHATSAPP.has(tipo) && tamanho > 0 && tamanho <= LIMITE_WHATSAPP) {
      await enviarArquivo(INSTANCIA_COBRANCA, config.whatsapp, {
        nome: pag.nome_arquivo,
        tipo,
        conteudo: await readFile(arquivo),
        legenda: texto,
      });
    } else {
      await enviarTexto(INSTANCIA_COBRANCA, config.whatsapp, `${texto}\n\n(O arquivo não pôde ir junto: abra no console.)`);
    }
    await registrar({ whatsapp_em: new Date().toISOString(), whatsapp_erro: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[assinatura] aviso no WhatsApp", pagamentoId, msg);
    await registrar({ whatsapp_erro: msg.slice(0, 300) }).then(
      () => {},
      () => {},
    );
  }
}

/** Mensagem de teste do console: confirma sessão e número. */
export async function testarAvisoWhatsapp() {
  const config = await configCobranca();
  if (!config.whatsapp) throw new Error("Cadastre o número que recebe os avisos.");
  await enviarTexto(
    INSTANCIA_COBRANCA,
    config.whatsapp,
    `Teste do sistema de manutenção: os comprovantes de assinatura vão chegar aqui (${formatarTelefone(config.whatsapp)}).`,
  );
}
