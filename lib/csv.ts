/**
 * CSV no jeito que o Excel em português abre direto: separador ";", vírgula
 * decimal, BOM no começo (senão os acentos saem quebrados) e quebra de linha
 * CRLF. Célula que começa com = + - @ ganha um apóstrofo na frente: sem isso,
 * um texto digitado na tela viraria fórmula ao abrir a planilha.
 */

export type Celula = string | number | null | undefined;

const PERIGOSO = /^[=+\-@\t\r]/;

function celula(v: Celula): string {
  if (v === null || v === undefined) return "";
  let t = typeof v === "number" ? String(v).replace(".", ",") : String(v);
  if (typeof v !== "number" && PERIGOSO.test(t)) t = `'${t}`;
  return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function paraCsv(cabecalho: string[], linhas: Celula[][]): string {
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}

/** Nome de arquivo com a data do dia: `manutencoes-2026-11-24.csv`. */
export function nomeCsv(base: string, hojeISO: string) {
  return `${base}-${hojeISO}.csv`;
}

/** Só no navegador: baixa o texto como arquivo. */
export function baixarCsv(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
