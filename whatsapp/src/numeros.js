/**
 * Números de telefone.
 *
 * O caso chato é o Brasil: muitas contas antigas de celular continuam
 * registradas no WhatsApp SEM o nono dígito (55 11 8765-4321), mesmo que o
 * número de verdade hoje seja 55 11 98765-4321. Por isso, antes de enviar,
 * perguntamos ao WhatsApp pelas duas formas e usamos a que existir.
 */

export function soDigitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

/** Formas possíveis do mesmo número, a original primeiro. */
export function variantes(numero) {
  const d = soDigitos(numero);
  const lista = [d];

  if (d.startsWith("55")) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);

    // Com o nono dígito → tenta também sem.
    if (resto.length === 9 && resto.startsWith("9")) lista.push(`55${ddd}${resto.slice(1)}`);

    // Sem o nono dígito, e é celular (começa com 6–9) → tenta também com.
    if (resto.length === 8 && /^[6-9]/.test(resto)) lista.push(`55${ddd}9${resto}`);
  }

  return lista;
}

/** Aceita "(11) 98765-4321", "+55 11 98765-4321" etc. Devolve só dígitos com DDI. */
export function normalizar(numero) {
  const d = soDigitos(numero);
  // 10 ou 11 dígitos = número brasileiro digitado sem o 55.
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

export function numeroValido(numero) {
  const d = soDigitos(numero);
  return d.length >= 10 && d.length <= 15;
}
