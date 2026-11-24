import "server-only";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "@/lib/db/admin";
import { diretorioBase } from "@/lib/arquivos";

/**
 * Arquivos órfãos: estão no disco, mas nenhuma linha do banco aponta para eles
 * (envio que não terminou, foto trocada com falha no meio, empresa apagada
 * quando o disco estava fora). Ocupam a cota da empresa e o disco da VM.
 *
 * Não apaga na hora: move para ARQUIVOS_DIR/.orfaos/AAAAMMDD/ (fora do formato
 * que /api/arquivos serve) e só apaga depois de DIAS_NA_LIXEIRA. Arquivo com
 * menos de 1 dia fica: pode ser um envio cujo registro ainda vai ser gravado.
 */

const LIXEIRA = ".orfaos";
const IDADE_MINIMA_MS = 24 * 60 * 60 * 1000;
const DIAS_NA_LIXEIRA = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Todos os caminhos que o banco conhece. Erro no banco = aborta (nunca "tudo é órfão"). */
async function caminhosDoBanco() {
  const db = createAdminClient();
  const conhecidos = new Set<string>();
  const fontes: [string, string][] = [
    ["ativos", "foto_url"],
    ["manutencao_anexos", "path"],
    ["assinatura_pagamentos", "comprovante"],
  ];
  for (const [tabela, coluna] of fontes) {
    for (let de = 0; ; de += 1000) {
      const { data, error } = await db.from(tabela).select(coluna).not(coluna, "is", null).range(de, de + 999);
      if (error) throw new Error(`Não li ${tabela}: ${error.message}`);
      const linhas = (data ?? []) as unknown as Record<string, string>[];
      for (const l of linhas) conhecidos.add(l[coluna]);
      if (linhas.length < 1000) break;
    }
  }
  return conhecidos;
}

async function listar(pasta: string, prefixo: string, saida: { relativo: string; mtime: number }[]) {
  const itens = await readdir(pasta, { withFileTypes: true }).catch(() => []);
  for (const item of itens) {
    const absoluto = path.join(pasta, item.name);
    const relativo = `${prefixo}/${item.name}`;
    if (item.isDirectory()) await listar(absoluto, relativo, saida);
    else if (item.isFile()) {
      const info = await stat(absoluto).catch(() => null);
      if (info) saida.push({ relativo, mtime: info.mtimeMs });
    }
  }
}

function carimbo(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export async function limparOrfaos(agora = new Date()) {
  const base = diretorioBase();
  const conhecidos = await caminhosDoBanco();

  const arquivos: { relativo: string; mtime: number }[] = [];
  for (const item of await readdir(base, { withFileTypes: true }).catch(() => [])) {
    if (item.isDirectory() && UUID.test(item.name)) await listar(path.join(base, item.name), item.name, arquivos);
  }

  const orfaos = arquivos.filter((a) => !conhecidos.has(a.relativo) && agora.getTime() - a.mtime > IDADE_MINIMA_MS);

  // Trava de segurança: se "quase tudo" parece órfão, algo está errado (banco
  // restaurado pela metade, pasta errada). Melhor não mexer e avisar.
  if (orfaos.length > 50 && orfaos.length > arquivos.length / 2) {
    throw new Error(`${orfaos.length} de ${arquivos.length} arquivos sem registro no banco: não movi nada. Confira o banco e o ARQUIVOS_DIR.`);
  }

  const destino = path.join(base, LIXEIRA, carimbo(agora));
  for (const o of orfaos) {
    const para = path.join(destino, o.relativo);
    await mkdir(path.dirname(para), { recursive: true });
    await rename(path.join(base, o.relativo), para).catch(() => {});
  }

  // Esvazia a lixeira antiga.
  let apagadas = 0;
  const limite = carimbo(new Date(agora.getTime() - DIAS_NA_LIXEIRA * 86_400_000));
  for (const dia of await readdir(path.join(base, LIXEIRA)).catch(() => [] as string[])) {
    if (/^\d{8}$/.test(dia) && dia < limite) {
      await rm(path.join(base, LIXEIRA, dia), { recursive: true, force: true });
      apagadas++;
    }
  }

  return { conferidos: arquivos.length, movidos: orfaos.length, lixeirasApagadas: apagadas };
}
