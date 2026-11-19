"use server";

import { getContexto } from "@/lib/session";
import { mensagemErro } from "@/lib/form";
import { caminhoValido, tipoDoArquivo, tokenDeEnvio } from "@/lib/arquivos";
import { SEM_PERMISSAO, podeRegistrar } from "@/lib/permissoes";

export type UploadAssinado =
  | { ok: true; caminho: string; token: string }
  | { ok: false; erro: string };

/**
 * Autoriza o navegador a enviar UM anexo, direto para /api/arquivos.
 *
 * Por que não pela server action: o corpo dela é limitado (1 MB por padrão) —
 * um anexo de 25 MB nunca chegaria. A autorização vale 15 minutos e só para
 * este caminho, que é obrigado a começar pela pasta da empresa. Leitor não
 * envia arquivo (mesma regra do banco para anexos).
 */
export async function criarUploadAssinado(caminho: string): Promise<UploadAssinado> {
  try {
    const { orgId, papel } = await getContexto();
    if (!podeRegistrar(papel)) return { ok: false, erro: SEM_PERMISSAO };

    if (!caminho.startsWith(`${orgId}/`) || !caminhoValido(caminho)) {
      return { ok: false, erro: "Caminho de arquivo inválido." };
    }
    if (!tipoDoArquivo(caminho)) {
      return { ok: false, erro: "Tipo de arquivo não permitido. Envie imagem ou PDF." };
    }

    return { ok: true, caminho, token: tokenDeEnvio(caminho) };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}
