"use server";

import { revalidatePath } from "next/cache";
import { testarChaveGroq } from "@/lib/assistente";
import { obterSessao } from "@/lib/auth/sessao";
import { createAdminClient } from "@/lib/db/admin";
import { mensagemErro, texto, type Resultado } from "@/lib/form";
import { configuracaoGroq, GROQ_CHAVE, GROQ_MODELO } from "@/lib/integracoes";
import { GROQ_MODELO_PADRAO } from "@/lib/modelos-groq";

/**
 * Credenciais da aba "Integrações" do console do superadmin. Cada ação confere
 * o posto na sessão validada no banco antes de usar a chave de serviço.
 */

async function exigirSuperadmin() {
  const sessao = await obterSessao();
  if (!sessao?.superadmin) throw new Error("Só o superadmin pode fazer isso.");
  return { sessao, admin: createAdminClient() };
}

const MODELO = /^[A-Za-z0-9._\/:-]{1,100}$/;

/** Salva a chave (se digitada) e o modelo. Chave em branco mantém a atual. */
export async function adminSalvarGroq(fd: FormData): Promise<Resultado> {
  try {
    const { sessao, admin } = await exigirSuperadmin();
    const chave = texto(fd, "chave");
    const modelo = texto(fd, "modelo") ?? GROQ_MODELO_PADRAO;

    if (chave && !/^\S{20,300}$/.test(chave)) return { ok: false, erro: "Chave inválida: cole a chave inteira (gsk_...)." };
    if (!MODELO.test(modelo)) return { ok: false, erro: "Nome de modelo inválido." };
    if (!chave && !(await configuracaoGroq())) return { ok: false, erro: "Cole a chave da API do Groq." };

    const linhas = [
      ...(chave ? [{ chave: GROQ_CHAVE, valor: chave }] : []),
      { chave: GROQ_MODELO, valor: modelo },
    ].map((l) => ({ ...l, atualizado_em: new Date().toISOString(), atualizado_por: sessao.userId }));

    const { error } = await admin.from("sistema_credenciais").upsert(linhas, { onConflict: "chave" });
    if (error) return { ok: false, erro: error.message };
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export async function adminRemoverGroq(): Promise<Resultado> {
  try {
    const { admin } = await exigirSuperadmin();
    const { error } = await admin.from("sistema_credenciais").delete().in("chave", [GROQ_CHAVE, GROQ_MODELO]);
    if (error) return { ok: false, erro: error.message };
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export type ResultadoTesteGroq = { ok: boolean; erro: string | null; modelo: string; modelos: string[] };

/**
 * Confere a chave salva direto no Groq (lista de modelos + uma pergunta com
 * ferramentas). Devolve os modelos de conversa da chave para o console
 * oferecer na lista. A tela chama sozinha depois de salvar.
 */
export async function adminTestarGroq(): Promise<ResultadoTesteGroq> {
  try {
    await exigirSuperadmin();
    const config = await configuracaoGroq();
    if (!config) return { ok: false, erro: "Nenhuma chave salva ainda.", modelo: GROQ_MODELO_PADRAO, modelos: [] };
    const { erro, modelos } = await testarChaveGroq(config.chave, config.modelo);
    return { ok: !erro, erro, modelo: config.modelo, modelos };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e), modelo: GROQ_MODELO_PADRAO, modelos: [] };
  }
}
