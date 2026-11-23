"use server";

import { revalidatePath } from "next/cache";
import { getContexto } from "@/lib/session";
import { createClient } from "@/lib/db/server";
import { enviarLinkConfirmacao } from "@/lib/auth/links-email";
import { bloqueadoPorTentativas, registrarTentativa } from "@/lib/auth/usuarios";
import { emailConfigurado } from "@/lib/email";
import { erroBanco, exigirId, mensagemErro, type Resultado } from "@/lib/form";

/**
 * Convites para a equipe (db/sql/73-convites.sql). Quem já tem conta não é
 * posto direto na empresa: aceita aqui, e só com o e-mail confirmado.
 */

const NAO_NO_ENTRAR_COMO = "Convite é a pessoa quem aceita ou recusa, não o console.";

export async function aceitarConvite(id: string): Promise<Resultado> {
  try {
    exigirId(id, "o convite");
    if ((await getContexto()).entradaComo) return { ok: false, erro: NAO_NO_ENTRAR_COMO };
    const db = await createClient();
    const { error } = await db.rpc("aceitar_convite", { p_id: id });
    if (error) return erroBanco(error);
    // A empresa que aceitou vira a aberta: tudo muda (menu, dados, papel).
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export async function recusarConvite(id: string): Promise<Resultado> {
  try {
    exigirId(id, "o convite");
    if ((await getContexto()).entradaComo) return { ok: false, erro: NAO_NO_ENTRAR_COMO };
    const db = await createClient();
    const { error } = await db.rpc("recusar_convite", { p_id: id });
    if (error) return erroBanco(error);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

/** Gestor desiste de um convite que ainda não foi aceito. */
export async function cancelarConvite(id: string): Promise<Resultado> {
  try {
    exigirId(id, "o convite");
    const { orgId } = await getContexto();
    const db = await createClient();
    const { error } = await db.rpc("cancelar_convite", { p_org: orgId, p_id: id });
    if (error) return erroBanco(error);
    revalidatePath("/equipe");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

/** Manda de novo o link que confirma o e-mail (no máximo 3 por hora). */
export async function reenviarConfirmacao(): Promise<Resultado> {
  try {
    const { userId, email, entradaComo } = await getContexto();
    if (entradaComo) return { ok: false, erro: NAO_NO_ENTRAR_COMO };
    if (!emailConfigurado()) {
      return { ok: false, erro: "O envio de e-mail não está configurado neste servidor. Fale com o administrador do sistema." };
    }
    const chaves = [{ chave: `confirmacao:${userId}`, limite: 3 }];
    if (await bloqueadoPorTentativas(chaves)) {
      return { ok: false, erro: "Já mandamos alguns e-mails agora há pouco. Confira a caixa de spam ou tente mais tarde." };
    }
    await registrarTentativa(chaves, false);
    await enviarLinkConfirmacao({ id: userId, email });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}
