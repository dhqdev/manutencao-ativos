import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function arquivoTs(semExtensao) {
  for (const ext of [".ts", ".tsx", "/index.ts"]) {
    if (existsSync(semExtensao + ext)) return pathToFileURL(semExtensao + ext).href;
  }
  return null;
}

export async function resolve(especificador, contexto, proximo) {
  if (especificador.startsWith("@/")) {
    const url = arquivoTs(path.join(raiz, especificador.slice(2)));
    if (url) return { url, shortCircuit: true };
  }
  // Os pacotes "next/*" não têm mapa de exports: o ESM do Node exige a extensão.
  if (/^next\/[a-z-]+$/.test(especificador)) {
    return proximo(`${especificador}.js`, contexto);
  }
  // Import relativo sem extensão entre arquivos .ts do app.
  if (especificador.startsWith(".") && !path.extname(especificador) && contexto.parentURL?.endsWith(".ts")) {
    const url = arquivoTs(path.resolve(path.dirname(fileURLToPath(contexto.parentURL)), especificador));
    if (url) return { url, shortCircuit: true };
  }
  return proximo(especificador, contexto);
}
