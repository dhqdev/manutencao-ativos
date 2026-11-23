import "server-only";
import { urlAssinada, caminhoValido } from "@/lib/arquivos";

/**
 * Links temporários (30 min) para as fotos dos ativos. Os arquivos não são
 * públicos, então o caminho guardado em `ativos.foto_url` não abre sozinho.
 */
export async function urlsDasFotos(caminhos: (string | null)[]) {
  const mapa = new Map<string, string>();
  for (const c of new Set(caminhos)) {
    if (c && caminhoValido(c)) mapa.set(c, urlAssinada(c));
  }
  return mapa;
}
