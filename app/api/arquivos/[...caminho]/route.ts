import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { type NextRequest } from "next/server";
import {
  LIMITE_BYTES,
  caminhoNoDisco,
  caminhoValido,
  conferirEnvio,
  conferirLeitura,
  tipoDoArquivo,
} from "@/lib/arquivos";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ caminho: string[] }> };

/** Cabeçalhos de segurança: esta rota fica fora do proxy.ts (ver o matcher). */
const SEGURANCA = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  // Mesmo que alguém consiga subir algo estranho, o navegador não executa nada.
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
};

function json(status: number, corpo: unknown) {
  return Response.json(corpo, { status, headers: { ...SEGURANCA, "Cache-Control": "no-store" } });
}

async function caminhoDe(contexto: Contexto) {
  const { caminho } = await contexto.params;
  return (caminho ?? []).join("/");
}

/** Lê um arquivo com link assinado (gerado pelo servidor, válido por 1 h). */
export async function GET(request: NextRequest, contexto: Contexto) {
  const caminho = await caminhoDe(contexto);
  const { searchParams } = request.nextUrl;

  if (!caminhoValido(caminho) || !conferirLeitura(caminho, searchParams.get("exp"), searchParams.get("sig"))) {
    return json(403, { erro: "Link inválido ou expirado." });
  }

  const arquivo = caminhoNoDisco(caminho);
  let tamanho: number;
  try {
    const info = await stat(arquivo);
    if (!info.isFile()) throw new Error("não é arquivo");
    tamanho = info.size;
  } catch {
    return json(404, { erro: "Arquivo não encontrado." });
  }

  const tipo = tipoDoArquivo(caminho);
  const nome = path.basename(caminho).replace(/^[0-9a-f-]{36}-/i, "");

  return new Response(Readable.toWeb(createReadStream(arquivo)) as unknown as ReadableStream<Uint8Array>, {
    headers: {
      ...SEGURANCA,
      "Content-Type": tipo ?? "application/octet-stream",
      "Content-Length": String(tamanho),
      "Content-Disposition": `${tipo ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/**
 * Recebe um arquivo. O navegador manda o corpo cru com o cabeçalho
 * x-token, emitido pelo servidor para ESTE caminho (lib/arquivos.ts). Não
 * sobrescreve nada: cada envio tem um nome novo.
 */
export async function PUT(request: NextRequest, contexto: Contexto) {
  const caminho = await caminhoDe(contexto);

  if (!caminhoValido(caminho) || !conferirEnvio(caminho, request.headers.get("x-token"))) {
    return json(403, { erro: "Envio não autorizado ou expirado. Tente de novo." });
  }
  if (!tipoDoArquivo(caminho)) {
    return json(415, { erro: "Tipo de arquivo não permitido. Envie imagem (JPG, PNG, WEBP, HEIC) ou PDF." });
  }

  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > LIMITE_BYTES) return json(413, { erro: "Arquivo maior que 25 MB." });
  if (!request.body) return json(400, { erro: "Arquivo vazio." });

  const destino = caminhoNoDisco(caminho);
  const temporario = `${destino}.${process.pid}.${Date.now()}.parcial`;
  await mkdir(path.dirname(destino), { recursive: true });

  const arquivo = await open(temporario, "wx");
  let total = 0;
  let excedeu = false;

  try {
    const leitor = request.body.getReader();
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMITE_BYTES) {
        excedeu = true;
        await leitor.cancel();
        break;
      }
      await arquivo.write(value);
    }
  } finally {
    await arquivo.close();
  }

  if (excedeu || total === 0) {
    await rm(temporario, { force: true });
    return json(excedeu ? 413 : 400, { erro: excedeu ? "Arquivo maior que 25 MB." : "Arquivo vazio." });
  }

  try {
    await stat(destino);
    await rm(temporario, { force: true });
    return json(409, { erro: "Já existe um arquivo com este nome." });
  } catch {
    // não existe: segue
  }

  await rename(temporario, destino);
  return json(201, { ok: true, tamanho: total });
}
