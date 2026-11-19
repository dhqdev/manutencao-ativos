"use server";

import { revalidatePath } from "next/cache";
import { obterSessao } from "@/lib/auth/sessao";
import { credenciaisB2, testarB2 } from "@/lib/backup";
import {
  CHAVES_B2,
  normalizarPasta,
  validarAppKey,
  validarBucket,
  validarDias,
  validarKeyId,
  validarSenhaCripto,
} from "@/lib/backup-regras";
import { createAdminClient } from "@/lib/db/admin";
import { booleano, inteiro, mensagemErro, texto, textoObrigatorio, type Resultado } from "@/lib/form";

/**
 * Cartão "Backup no Backblaze B2" do console do superadmin. As credenciais
 * vão para sistema_credenciais e o serviço backup da stack as relê a cada
 * rodada; os segredos nunca voltam para o navegador. "Fazer backup agora" só
 * grava o pedido — quem executa é o serviço backup.
 */

// Não exportada: num arquivo "use server" todo export vira ação chamável.
async function exigirSuperadmin() {
  const sessao = await obterSessao();
  if (!sessao?.superadmin) throw new Error("Só o superadmin pode fazer isso.");
  return sessao;
}

function pronto(): Resultado {
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Lê o formulário. Campos secretos em branco = manter o que já está salvo
 * (a tela nunca recebe o valor para mostrar de volta).
 */
async function lerFormulario(fd: FormData) {
  const salvo = await credenciaisB2();
  const keyId = validarKeyId(textoObrigatorio(fd, "key_id", "o keyID"));
  const appKeyNova = texto(fd, "app_key");
  const appKey = appKeyNova ? validarAppKey(appKeyNova) : salvo.b2_app_key;
  if (!appKey) throw new Error("Informe a applicationKey.");
  const bucket = validarBucket(textoObrigatorio(fd, "bucket", "o bucket"));
  const pasta = normalizarPasta(texto(fd, "pasta"));
  const dias = validarDias(inteiro(fd, "dias"));

  // Senha de criptografia: em branco mantém; "sem_cripto" marcado tira.
  const senhaNova = texto(fd, "senha_criptografia");
  const senha = booleano(fd, "sem_cripto") ? null : senhaNova ? validarSenhaCripto(senhaNova) : (salvo.b2_senha_criptografia ?? null);
  return { keyId, appKey, bucket, pasta, dias, senha };
}

export async function adminTestarBackblaze(fd: FormData): Promise<Resultado> {
  try {
    await exigirSuperadmin();
    const f = await lerFormulario(fd);
    const problema = await testarB2(f.keyId, f.appKey, f.bucket);
    return problema ? { ok: false, erro: problema } : { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export async function adminSalvarBackblaze(fd: FormData): Promise<Resultado> {
  try {
    const sessao = await exigirSuperadmin();
    const f = await lerFormulario(fd);

    // Testa antes de gravar: chave errada salva só seria descoberta às 3h30.
    const problema = await testarB2(f.keyId, f.appKey, f.bucket);
    if (problema) return { ok: false, erro: `Não salvei: ${problema}` };

    const db = createAdminClient();
    const agora = new Date().toISOString();
    const linhas = [
      ["b2_key_id", f.keyId],
      ["b2_app_key", f.appKey],
      ["b2_bucket", f.bucket],
      ["b2_pasta", f.pasta],
      ["b2_dias", String(f.dias)],
      ...(f.senha ? [["b2_senha_criptografia", f.senha]] : []),
    ].map(([chave, valor]) => ({ chave, valor, atualizado_em: agora, atualizado_por: sessao.userId }));

    const { error } = await db.from("sistema_credenciais").upsert(linhas, { onConflict: "chave" });
    if (error) return { ok: false, erro: error.message };
    if (!f.senha) {
      const { error: e2 } = await db.from("sistema_credenciais").delete().eq("chave", "b2_senha_criptografia");
      if (e2) return { ok: false, erro: e2.message };
    }
    return pronto();
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

/** Tira as credenciais do console: o backup volta a ser só local (ou às variáveis da stack). */
export async function adminRemoverBackblaze(): Promise<Resultado> {
  try {
    await exigirSuperadmin();
    const { error } = await createAdminClient().from("sistema_credenciais").delete().in("chave", [...CHAVES_B2]);
    if (error) return { ok: false, erro: error.message };
    return pronto();
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export async function adminBackupAgora(): Promise<Resultado> {
  try {
    const sessao = await exigirSuperadmin();
    const { error } = await createAdminClient()
      .from("sistema_backups")
      .insert({ origem: "manual", estado: "pendente", pedido_por: sessao.userId });
    if (error) {
      if (error.code === "23505") return { ok: false, erro: "Já tem um backup na fila ou rodando." };
      return { ok: false, erro: error.message };
    }
    return pronto();
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}
