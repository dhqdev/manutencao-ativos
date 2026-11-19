import "server-only";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth/sessao";
import { createAdminClient } from "@/lib/db/admin";
import type { EmpresaAdmin, UsoEmpresa, UsuarioAdmin } from "@/components/admin/tipos";
import { diretorioBase } from "@/lib/arquivos";

/**
 * Console do superadmin (/admin). Layout e páginas rodam em paralelo no Next,
 * então CADA página confere o posto antes de usar a chave de serviço — não
 * basta o layout barrar. Quem não é superadmin recebe 404 (nem fica sabendo
 * que a tela existe).
 */
export const exigirSuperadminTela = cache(async () => {
  const sessao = await obterSessao();
  if (!sessao) redirect("/auth/sair");
  if (!sessao.superadmin) notFound();
  return sessao;
});

type Dados<T> = { dados: T; erro: null } | { dados: null; erro: string };

async function rpc<T>(nome: string, vazio: T): Promise<Dados<T>> {
  await exigirSuperadminTela();
  const { data, error } = await createAdminClient().rpc(nome);
  if (error) return { dados: null, erro: error.message };
  return { dados: (data ?? vazio) as T, erro: null };
}

export const carregarUsuarios = cache(() => rpc<UsuarioAdmin[]>("admin_usuarios", []));
export const carregarEmpresas = cache(() => rpc<EmpresaAdmin[]>("admin_empresas", []));

/** Nome para o rodapé do menu do console. */
export const nomeDoSuperadmin = cache(async () => {
  const sessao = await exigirSuperadminTela();
  const { data } = await createAdminClient().from("profiles").select("nome").eq("id", sessao.userId).maybeSingle();
  return { nome: data?.nome ?? "Superadmin", email: sessao.email, userId: sessao.userId };
});

/** Soma os arquivos de uma pasta (com subpastas). Pasta que não existe = zero. */
async function somarPasta(pasta: string): Promise<{ arquivos: number; bytes: number }> {
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

/**
 * Uso de cada empresa: banco (admin_uso_empresas) + fotos e anexos no disco
 * (ARQUIVOS_DIR/{org_id}/…). O disco é lido a cada abertura do console; com
 * milhares de arquivos ainda leva só alguns milissegundos.
 */
export const carregarUso = cache(async (orgIds: string[]): Promise<Dados<Record<string, UsoEmpresa>>> => {
  const banco = await rpc<{ org_id: string; linhas: number; bytes: number }[]>("admin_uso_empresas", []);
  if (banco.erro) return { dados: null, erro: banco.erro };

  const base = diretorioBase();
  const porOrg = new Map(banco.dados!.map((b) => [b.org_id, b]));
  const discos = await Promise.all(orgIds.map((id) => somarPasta(path.join(base, id))));

  const uso: Record<string, UsoEmpresa> = {};
  orgIds.forEach((id, i) => {
    const b = porOrg.get(id);
    uso[id] = {
      org_id: id,
      linhas: Number(b?.linhas ?? 0),
      bytesBanco: Number(b?.bytes ?? 0),
      arquivos: discos[i].arquivos,
      bytesArquivos: discos[i].bytes,
    };
  });
  return { dados: uso, erro: null };
});
