"use server";

import { revalidatePath } from "next/cache";
import { obterSessao } from "@/lib/auth/sessao";
import { credenciaisB2, testarB2 } from "@/lib/backup";
import {
  CHAVES_B2,
  normalizarPasta,
  validarAppKey,
  validarBucket,
  validarCadaDias,
  validarDias,
  validarModo,
  validarKeyId,
  validarSenhaCripto,
} from "@/lib/backup-regras";
import { createAdminClient } from "@/lib/db/admin";
import { inteiro, mensagemErro, texto, textoObrigatorio, type Resultado } from "@/lib/form";

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
  revalidatePath("/admin", "layout");
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
  // No espelho a tela esconde os dias: fica o que já estava salvo.
  const diasSalvos = salvo.b2_dias ? Number(salvo.b2_dias) : null;
  const dias = validarDias(inteiro(fd, "dias") ?? diasSalvos);
  const modo = validarModo(texto(fd, "modo"));
  const cadaDias = validarCadaDias(inteiro(fd, "cada_dias"));

  // Senha de criptografia opcional (pedido do dono em 24/11/2026: "quero algo
  // simples"). O bucket é privado e o B2 criptografa em repouso; a tela não
  // pede mais a senha, mas uma já salva (ou digitada aqui) continua valendo.
  const senhaNova = texto(fd, "senha_criptografia");
  const senha = senhaNova ? validarSenhaCripto(senhaNova) : (salvo.b2_senha_criptografia ?? null);
  return { keyId, appKey, bucket, pasta, dias, modo, cadaDias, senha };
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
      ["b2_modo", f.modo],
      ["backup_cada_dias", String(f.cadaDias)],
      ...(f.senha ? [["b2_senha_criptografia", f.senha]] : []),
    ].map(([chave, valor]) => ({ chave, valor, atualizado_em: agora, atualizado_por: sessao.userId }));

    const { error } = await db.from("sistema_credenciais").upsert(linhas, { onConflict: "chave" });
    if (error) return { ok: false, erro: error.message };
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
