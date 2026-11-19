"use server";

import { revalidatePath } from "next/cache";
import { obterSessao } from "@/lib/auth/sessao";
import { VERSAO_RELEASE, esquecerVersaoPublicada, situacaoAtualizacao, versaoAtual } from "@/lib/atualizacao";
import { createAdminClient } from "@/lib/db/admin";
import { mensagemErro, type Resultado } from "@/lib/form";

/**
 * Botão "Atualizar" do painel do superadmin. A ação só grava o pedido; quem
 * troca as imagens é o serviço atualizador da stack (db/scripts/atualizador.sh).
 */

// Não exportada: num arquivo "use server" todo export vira ação chamável.
async function exigirSuperadmin() {
  const sessao = await obterSessao();
  if (!sessao?.superadmin) throw new Error("Só o superadmin pode fazer isso.");
  return sessao;
}

/** Consulta o ghcr.io de novo, sem esperar o cache de 5 minutos. */
export async function adminVerificarVersao(): Promise<Resultado> {
  try {
    await exigirSuperadmin();
    esquecerVersaoPublicada();
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export async function adminAtualizarSistema(versao: string): Promise<Resultado> {
  try {
    const sessao = await exigirSuperadmin();
    if (!VERSAO_RELEASE.test(versao)) return { ok: false, erro: "Versão inválida." };

    // Confere de novo no servidor: só a última publicada, e com o atualizador no ar.
    const situacao = await situacaoAtualizacao();
    if (!situacao.atualizador.online) {
      return { ok: false, erro: "O serviço atualizador não está rodando na stack. Veja as instruções na tela." };
    }
    if (situacao.disponivel !== versao) {
      return { ok: false, erro: "Essa não é a última versão publicada. Recarregue a tela." };
    }

    const { error } = await createAdminClient().from("sistema_atualizacoes").insert({
      versao,
      versao_antes: versaoAtual(),
      pedido_por: sessao.userId,
    });
    if (error) {
      if (error.code === "23505") return { ok: false, erro: "Já existe uma atualização em andamento." };
      return { ok: false, erro: error.message };
    }

    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}
