import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { obterCredenciais } from "@/lib/integracoes";
import { CHAVES_B2, DIAS_PADRAO, PASTA_PADRAO, finalDoSegredo, type ChaveB2 } from "@/lib/backup-regras";

/**
 * Backup no console do superadmin: credenciais do Backblaze B2 (sem nunca
 * devolver os segredos para o navegador), sinal de vida do serviço backup e
 * as últimas rodadas. Quem roda o backup é o serviço da stack
 * (db/scripts/backup.sh); o app só lê e grava as tabelas de 71-backup.sql.
 *
 * Só chame depois de conferir que quem pediu é o superadmin.
 */

const SEM_SINAL_MS = 90_000;

export type RodadaBackup = {
  id: number;
  origem: "agendado" | "manual";
  estado: "pendente" | "executando" | "ok" | "erro";
  b2: "ok" | "falhou" | "desligado" | null;
  arquivo: string | null;
  bytes_banco: number | null;
  bytes_arquivos: number | null;
  mensagem: string | null;
  criado_em: string;
  iniciado_em: string | null;
  concluido_em: string | null;
};

export type SituacaoBackup = {
  /** O que está salvo no console. Os segredos só aparecem como "…final". */
  b2: {
    configurado: boolean;
    keyId: string | null;
    appKeyFinal: string | null;
    bucket: string | null;
    pasta: string;
    dias: number;
    criptografado: boolean;
    atualizadoEm: string | null;
  };
  servico: {
    online: boolean;
    vistoEm: string | null;
    hora: number | null;
    dias: number | null;
    b2Origem: "console" | "variaveis" | "desligado" | null;
    b2Destino: string | null;
  };
  rodadas: RodadaBackup[];
  erro: string | null;
};

/** Credenciais do B2 como estão no banco (com os segredos: uso só no servidor). */
export async function credenciaisB2(): Promise<Partial<Record<ChaveB2, string>>> {
  return obterCredenciais([...CHAVES_B2]);
}

export async function situacaoBackup(): Promise<SituacaoBackup> {
  const admin = createAdminClient();
  const [cred, sinal, rodadas] = await Promise.all([
    admin.from("sistema_credenciais").select("chave, valor, atualizado_em").in("chave", [...CHAVES_B2]),
    admin.from("sistema_backup_servico").select("visto_em, hora, dias, b2_origem, b2_destino").eq("id", 1).maybeSingle(),
    admin
      .from("sistema_backups")
      .select("id, origem, estado, b2, arquivo, bytes_banco, bytes_arquivos, mensagem, criado_em, iniciado_em, concluido_em")
      .order("id", { ascending: false })
      .limit(10),
  ]);

  const c = new Map((cred.data ?? []).map((l) => [l.chave as string, l]));
  const valor = (k: ChaveB2) => (c.get(k)?.valor as string | undefined) ?? null;
  const datas = [...c.values()].map((l) => l.atualizado_em as string).sort();
  const vistoEm = (sinal.data?.visto_em as string | undefined) ?? null;

  return {
    b2: {
      configurado: !!(valor("b2_key_id") && valor("b2_app_key") && valor("b2_bucket")),
      keyId: valor("b2_key_id"),
      appKeyFinal: finalDoSegredo(valor("b2_app_key")),
      bucket: valor("b2_bucket"),
      pasta: valor("b2_pasta") ?? PASTA_PADRAO,
      dias: Number(valor("b2_dias") ?? DIAS_PADRAO),
      criptografado: !!valor("b2_senha_criptografia"),
      atualizadoEm: datas.at(-1) ?? null,
    },
    servico: {
      online: !!vistoEm && Date.now() - new Date(vistoEm).getTime() < SEM_SINAL_MS,
      vistoEm,
      hora: (sinal.data?.hora as number | null | undefined) ?? null,
      dias: (sinal.data?.dias as number | null | undefined) ?? null,
      b2Origem: (sinal.data?.b2_origem as SituacaoBackup["servico"]["b2Origem"] | undefined) ?? null,
      b2Destino: (sinal.data?.b2_destino as string | null | undefined) ?? null,
    },
    rodadas: (rodadas.data ?? []) as RodadaBackup[],
    erro: cred.error?.message ?? rodadas.error?.message ?? null,
  };
}

/**
 * Confere a chave direto na API do B2 (b2_authorize_account + b2_list_buckets):
 * o superadmin descobre na hora um keyID trocado ou uma chave sem acesso ao
 * bucket, em vez de só no backup da madrugada.
 */
export async function testarB2(keyId: string, appKey: string, bucket: string): Promise<string | null> {
  try {
    const basico = Buffer.from(`${keyId}:${appKey}`).toString("base64");
    const r = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
      headers: { Authorization: `Basic ${basico}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 401) return "O Backblaze recusou o keyID ou a applicationKey.";
    if (!r.ok) return `O Backblaze respondeu ${r.status} ao conferir a chave.`;
    const conta = (await r.json()) as {
      accountId: string;
      authorizationToken: string;
      apiInfo: { storageApi: { apiUrl: string; allowed?: { buckets?: { name: string | null }[] | null } } };
    };

    // Chave restrita a outros buckets: o B2 já diz quais ela alcança.
    const permitidos = conta.apiInfo.storageApi.allowed?.buckets?.map((b) => b.name).filter(Boolean) ?? [];
    if (permitidos.length > 0 && !permitidos.includes(bucket)) {
      return `Essa chave só tem acesso a: ${permitidos.join(", ")}.`;
    }

    const b = await fetch(`${conta.apiInfo.storageApi.apiUrl}/b2api/v3/b2_list_buckets`, {
      method: "POST",
      headers: { Authorization: conta.authorizationToken, "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: conta.accountId, bucketName: bucket }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!b.ok) return `A chave entrou, mas não consegui ver o bucket (${b.status}). Ela precisa de listBuckets.`;
    const { buckets } = (await b.json()) as { buckets: { bucketName: string; bucketType: string }[] };
    const achado = buckets.find((x) => x.bucketName === bucket);
    if (!achado) return `O bucket "${bucket}" não existe nessa conta.`;
    if (achado.bucketType === "allPublic") return `O bucket "${bucket}" é público: deixe-o privado antes de guardar backup nele.`;
    return null;
  } catch (e) {
    return `Não consegui falar com o Backblaze: ${e instanceof Error ? e.message : String(e)}`;
  }
}
