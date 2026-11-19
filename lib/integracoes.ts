import "server-only";
import { createAdminClient } from "@/lib/db/admin";

/**
 * Credenciais de serviços externos (db/sql/70-integracoes.sql), cadastradas
 * pelo superadmin no console. Lidas só no servidor com a chave de serviço:
 * o valor nunca sai daqui para o navegador.
 */

export const GROQ_CHAVE = "groq_api_key";
export const GROQ_MODELO = "groq_modelo";
/** Modelo com chamada de ferramentas estável no Groq. Dá para trocar no console. */
export const GROQ_MODELO_PADRAO = "llama-3.3-70b-versatile";

export async function obterCredenciais(chaves: string[]): Promise<Record<string, string>> {
  const { data, error } = await createAdminClient()
    .from("sistema_credenciais")
    .select("chave, valor")
    .in("chave", chaves);
  if (error) throw new Error(`Não consegui ler as integrações: ${error.message}`);
  return Object.fromEntries((data ?? []).map((l: { chave: string; valor: string }) => [l.chave, l.valor]));
}

export async function configuracaoGroq(): Promise<{ chave: string; modelo: string } | null> {
  const c = await obterCredenciais([GROQ_CHAVE, GROQ_MODELO]);
  if (!c[GROQ_CHAVE]) return null;
  return { chave: c[GROQ_CHAVE], modelo: c[GROQ_MODELO] || GROQ_MODELO_PADRAO };
}

/** O que a tela do console pode ver de uma chave: se existe e o finalzinho. */
export type ResumoChave = { configurada: boolean; final: string | null; atualizadoEm: string | null };

export async function resumoGroq(): Promise<{ chave: ResumoChave; modelo: string }> {
  const { data, error } = await createAdminClient()
    .from("sistema_credenciais")
    .select("chave, valor, atualizado_em")
    .in("chave", [GROQ_CHAVE, GROQ_MODELO]);
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as { chave: string; valor: string; atualizado_em: string }[];
  const chave = linhas.find((l) => l.chave === GROQ_CHAVE);
  const modelo = linhas.find((l) => l.chave === GROQ_MODELO)?.valor || GROQ_MODELO_PADRAO;
  return {
    chave: {
      configurada: Boolean(chave),
      final: chave ? chave.valor.slice(-4) : null,
      atualizadoEm: chave?.atualizado_em ?? null,
    },
    modelo,
  };
}
