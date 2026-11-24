/**
 * Modelos do Groq para o assistente. Lógica pura (testada em testes/unidade).
 *
 * O Groq desliga modelos de tempos em tempos (o llama-3.3-70b-versatile saiu
 * do plano gratuito em 16/08/2026 e passou a dar "modelo não existe"). Quem
 * salvou um desses no console não pode ficar com o assistente quebrado: o
 * servidor troca pelo padrão sozinho, e o console avisa.
 */

/** Padrão: aceita chamada de ferramentas e é o substituto oficial do Llama 3.3. */
export const GROQ_MODELO_PADRAO = "openai/gpt-oss-120b";

/** Opções do console. Todas aceitam chamada de ferramentas (tool use). */
export const MODELOS_GROQ: { id: string; rotulo: string; detalhe: string }[] = [
  { id: "openai/gpt-oss-120b", rotulo: "GPT-OSS 120B", detalhe: "recomendado: melhor nas consultas" },
  { id: "openai/gpt-oss-20b", rotulo: "GPT-OSS 20B", detalhe: "mais rápido e econômico" },
  { id: "qwen/qwen3.8-27b", rotulo: "Qwen 3.8 27B", detalhe: "alternativa" },
];

/** Desligados pelo Groq (console.groq.com/docs/deprecations). */
const DESLIGADOS = new Set([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama3-70b-8192",
  "llama3-8b-8192",
  "llama3-groq-70b-8192-tool-use-preview",
  "llama3-groq-8b-8192-tool-use-preview",
  "gemma2-9b-it",
  "mistral-saba-24b",
  "qwen-qwq-32b",
  "qwen/qwen3-32b",
  "qwen/qwen3.6-27b",
  "deepseek-r1-distill-llama-70b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "moonshotai/kimi-k2-instruct",
  "moonshotai/kimi-k2-instruct-0905",
  "groq/compound",
  "groq/compound-mini",
]);

export function modeloDesligado(modelo: string | null | undefined): boolean {
  return Boolean(modelo && DESLIGADOS.has(modelo.trim()));
}

/** O modelo que o assistente de fato usa: o salvo, ou o padrão se vazio/desligado. */
export function modeloEfetivo(modelo: string | null | undefined): string {
  const m = modelo?.trim();
  return !m || modeloDesligado(m) ? GROQ_MODELO_PADRAO : m;
}

/** Modelos de raciocínio aceitam `reasoning_effort` e gastam tokens pensando. */
export function modeloRaciocina(modelo: string): boolean {
  return /^openai\/gpt-oss/.test(modelo);
}

/** Da lista de /models do Groq, só os que servem para conversa (sem áudio, guarda...). */
export function modelosDeConversa(ids: string[]): string[] {
  return ids
    .filter((id) => !/whisper|tts|orpheus|guard|safeguard|compound|playai|prompt-guard/i.test(id))
    .sort();
}
