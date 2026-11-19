/**
 * Telefones para o WhatsApp. Funções puras: valem no servidor e na tela.
 * Guardamos sempre só dígitos, com DDI (ex.: 5511987654321).
 */

export function soDigitos(valor: string | null | undefined) {
  return String(valor ?? "").replace(/\D/g, "");
}

/** "(11) 98765-4321" → "5511987654321". 10 ou 11 dígitos = brasileiro sem o 55. */
export function normalizarTelefone(valor: string | null | undefined) {
  const d = soDigitos(valor);
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

export function telefoneValido(valor: string | null | undefined) {
  const d = normalizarTelefone(valor);
  return d.length >= 12 && d.length <= 15;
}

/** "5511987654321" → "+55 (11) 98765-4321". */
export function formatarTelefone(n: string | null | undefined) {
  if (!n) return "—";
  const d = soDigitos(n);
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return `+${d}`;
}

export const MAX_DESTINATARIOS = 10;
