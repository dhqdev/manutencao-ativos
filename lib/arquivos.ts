import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { segredoArquivos } from "@/lib/auth/config";

/**
 * Fotos e anexos guardados no volume do servidor (ARQUIVOS_DIR, padrão
 * /dados/arquivos), no mesmo formato de caminho de antes:
 *
 *   {org_id}/{manutencao_id}/{uuid}-{nome}       anexos
 *   {org_id}/ativos/{ativo_id}/{uuid}-{nome}     foto do ativo
 *
 * Nada é público. O servidor só assina links para caminhos que vieram do
 * banco (já filtrados pelo RLS), com validade curta:
 *
 *   ler    GET /api/arquivos/<caminho>?exp=...&sig=...   (30 min)
 *   enviar PUT /api/arquivos/<caminho>  x-token: exp.sig  (15 min)
 */

export const LIMITE_BYTES = 25 * 1024 * 1024;

/**
 * Espaço de fotos e anexos por empresa (ARQUIVOS_COTA_MB, padrão 5 GB; 0 = sem
 * limite). Sem cota, uma empresa (ou um técnico com o celular em loop) enchia
 * o disco da VM e derrubava o sistema de todo mundo.
 */
export function cotaPorEmpresaBytes() {
  const mb = Number(process.env.ARQUIVOS_COTA_MB?.trim() || 5120);
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : Infinity;
}


const TIPOS: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

export function diretorioBase() {
  // turbopackIgnore: o caminho vem do ambiente em tempo de execução. Sem isso o
  // build copia o projeto inteiro para .next/standalone (imagem maior e com o
  // código-fonte dentro).
  return path.resolve(/*turbopackIgnore: true*/ process.env.ARQUIVOS_DIR?.trim() || "/dados/arquivos");
}

const FORMATO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._/-]{1,400}$/i;

/** Só caminhos no formato esperado, sem "..", "." ou barras sobrando. */
export function caminhoValido(caminho: string) {
  return FORMATO.test(caminho) && !caminho.split("/").some((p) => p === "" || p === "." || p === "..");
}

/** Caminho absoluto no disco, garantidamente dentro da pasta base. */
export function caminhoNoDisco(caminho: string) {
  if (!caminhoValido(caminho)) throw new Error("Caminho de arquivo inválido.");
  const base = diretorioBase();
  const absoluto = path.resolve(base, caminho);
  if (!absoluto.startsWith(base + path.sep)) throw new Error("Caminho de arquivo inválido.");
  return absoluto;
}

/** Tipo pelo final do nome. Fora da lista → null (não aceito). */
export function tipoDoArquivo(caminho: string) {
  const extensao = caminho.split(".").pop()?.toLowerCase() ?? "";
  return TIPOS[extensao] ?? null;
}

function assinar(...partes: string[]) {
  return createHmac("sha256", segredoArquivos()).update(partes.join("\n")).digest("base64url");
}

function confere(esperada: string, recebida: string) {
  const a = Buffer.from(esperada);
  const b = Buffer.from(recebida);
  return a.length === b.length && timingSafeEqual(a, b);
}

const agora = () => Math.floor(Date.now() / 1000);

export function rotaDoArquivo(caminho: string) {
  return `/api/arquivos/${caminho.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Link de leitura com validade (padrão: 30 min). Curto porque o link vale
 * para qualquer um que o tenha (encaminhado, no histórico, num print):
 * quem saiu da equipe não deve seguir abrindo anexos por horas.
 */
export function urlAssinada(caminho: string, segundos = 1800) {
  // Arredonda para os 15 min seguintes: o link fica igual por um tempo e o
  // navegador reaproveita o cache da imagem (vale de 30 a 45 min).
  const exp = Math.ceil((agora() + segundos) / 900) * 900;
  return `${rotaDoArquivo(caminho)}?exp=${exp}&sig=${assinar("ler", caminho, String(exp))}`;
}

/** Mesma ordem da entrada; caminho vazio ou inválido vira null. */
export function urlsAssinadas(caminhos: (string | null | undefined)[], segundos = 1800) {
  return caminhos.map((c) => (c && caminhoValido(c) ? urlAssinada(c, segundos) : null));
}

export function conferirLeitura(caminho: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < agora()) return false;
  return confere(assinar("ler", caminho, exp), sig);
}

/** Autorização de envio para UM caminho (o navegador manda no cabeçalho x-token). */
export function tokenDeEnvio(caminho: string, segundos = 900) {
  const exp = agora() + segundos;
  return `${exp}.${assinar("enviar", caminho, String(exp))}`;
}

export function conferirEnvio(caminho: string, token: string | null) {
  const [exp, sig] = (token ?? "").split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < agora()) return false;
  return confere(assinar("enviar", caminho, exp), sig);
}

/**
 * Apaga arquivos do disco. Linhas apagadas no banco não levam os arquivos
 * junto, então toda exclusão que envolve anexos ou fotos passa por aqui
 * depois de apagar as linhas.
 */
export async function removerArquivos(caminhos: (string | null | undefined)[]) {
  const validos = [...new Set(caminhos.filter((c): c is string => Boolean(c && caminhoValido(c))))];
  await Promise.all(
    validos.map((c) =>
      rm(caminhoNoDisco(c), { force: true }).catch((e) => console.error("[arquivos] remover", c, e)),
    ),
  );
}

/** Soma os arquivos de uma pasta (com subpastas). Pasta que não existe = zero. */
export async function somarPasta(pasta: string): Promise<{ arquivos: number; bytes: number }> {
  let arquivos = 0;
  let bytes = 0;
  let itens;
  try {
    itens = await readdir(pasta, { withFileTypes: true });
  } catch {
    return { arquivos, bytes };
  }
  for (const item of itens) {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory()) {
      const sub = await somarPasta(caminho);
      arquivos += sub.arquivos;
      bytes += sub.bytes;
    } else if (item.isFile()) {
      const info = await stat(caminho).catch(() => null);
      if (info) {
        arquivos++;
        bytes += info.size;
      }
    }
  }
  return { arquivos, bytes };
}
