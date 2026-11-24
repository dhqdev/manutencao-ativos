/*
 * Sorteios com semente para espalhar flocos, lâmpadas e bandeirinhas. Só conta
 * com inteiros (Math.imul), então o servidor e qualquer navegador chegam aos
 * mesmos números: sem erro de hidratação e sem a cara de "tudo igual".
 */

function embaralhar(n: number) {
  let t = (n + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const duasCasas = (n: number) => Math.round(n * 100) / 100;

/** Sequência de números entre min e max a partir de uma semente. */
export function sorteador(semente: number) {
  let s = semente >>> 0;
  return (min: number, max: number) => {
    s = (s + 0x9e3779b9) >>> 0;
    return duasCasas(min + embaralhar(s) * (max - min));
  };
}

/** Um número estável para a posição `i` (a mesma lâmpada pisca sempre no mesmo ritmo). */
export const variar = (i: number, min: number, max: number) =>
  duasCasas(min + embaralhar(Math.imul(i + 1, 0x85ebca6b)) * (max - min));
