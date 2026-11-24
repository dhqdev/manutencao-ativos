import "server-only";
import path from "node:path";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth/sessao";
import { createAdminClient } from "@/lib/db/admin";
import type { EmpresaAdmin, UsoEmpresa, UsuarioAdmin } from "@/components/admin/tipos";
import { diretorioBase, somarPasta, urlAssinada } from "@/lib/arquivos";
import type { PagamentoAssinatura, SituacaoAssinatura } from "@/lib/assinatura";
import { cobrancaLigada, configCobranca, pixDaEmpresa, type ConfigCobranca } from "@/lib/assinatura-servidor";
import type { SituacaoGroq } from "@/components/admin/integracoes";
import { resumoGroq } from "@/lib/integracoes";

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

/**
 * Números do menu lateral do console. Leves de propósito (rodam em toda
 * navegação): contagens prontas do banco, sem baixar as listas. Erro vira
 * "sem número" no menu, nunca derruba a tela.
 */
export const carregarContadores = cache(async () => {
  await exigirSuperadminTela();
  const admin = createAdminClient();
  const [resumo, conferir] = await Promise.all([
    admin.rpc("admin_resumo"),
    admin.from("assinatura_pagamentos").select("id", { count: "exact", head: true }).eq("situacao", "pendente"),
  ]);
  const r = (resumo.data ?? null) as { usuarios?: number; empresas?: number } | null;
  return {
    usuarios: resumo.error || r?.usuarios === undefined ? null : Number(r.usuarios),
    clientes: resumo.error || r?.empresas === undefined ? null : Number(r.empresas),
    conferir: conferir.error ? null : conferir.count ?? 0,
  };
});

/** Nome para o rodapé do menu do console. */
export const nomeDoSuperadmin = cache(async () => {
  const sessao = await exigirSuperadminTela();
  const { data } = await createAdminClient().from("profiles").select("nome").eq("id", sessao.userId).maybeSingle();
  return { nome: data?.nome ?? "Superadmin", email: sessao.email, userId: sessao.userId };
});

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

/** Situação do Groq para a aba Integrações (nunca a chave inteira). */
export const carregarGroq = cache(async (): Promise<Dados<SituacaoGroq>> => {
  await exigirSuperadminTela();
  try {
    const { chave, modelo, modeloSalvo } = await resumoGroq();
    return { dados: { ...chave, modelo, modeloSalvo }, erro: null };
  } catch (e) {
    return { dados: null, erro: e instanceof Error ? e.message : String(e) };
  }
});

export type EmpresaAssinatura = {
  org_id: string;
  nome: string;
  isenta: boolean;
  bloqueio_manual?: boolean;
  bloqueio_motivo?: string | null;
  bloqueado_em?: string | null;
  dono: string | null;
  ultimo_pagamento: string | null;
  situacao: SituacaoAssinatura;
};

export type PagamentoAdmin = PagamentoAssinatura & { empresa: string; enviado_por: string | null; url: string };

export type DadosAssinaturas = {
  config: ConfigCobranca;
  ligada: boolean;
  /** Pix de exemplo (o identificador muda por empresa). */
  exemplo: { copiaECola: string; qrSvg: string } | null;
  empresas: EmpresaAssinatura[];
  pagamentos: PagamentoAdmin[];
};

/** Aba Assinaturas: configuração, situação de cada empresa e os comprovantes. */
export const carregarAssinaturas = cache(async (): Promise<Dados<DadosAssinaturas>> => {
  await exigirSuperadminTela();
  try {
    const [lista, config] = await Promise.all([
      rpc<{ empresas: EmpresaAssinatura[]; pagamentos: (PagamentoAssinatura & { empresa: string; enviado_por: string | null })[] }>(
        "admin_assinaturas",
        { empresas: [], pagamentos: [] },
      ),
      configCobranca(),
    ]);
    if (lista.erro) return { dados: null, erro: lista.erro };
    const exemplo = await pixDaEmpresa("00000000-0000-0000-0000-000000000000", config).catch(() => null);
    return {
      dados: {
        config,
        ligada: cobrancaLigada(config),
        exemplo: exemplo ? { copiaECola: exemplo.copiaECola, qrSvg: exemplo.qrSvg } : null,
        empresas: lista.dados!.empresas ?? [],
        pagamentos: (lista.dados!.pagamentos ?? []).map((p) => ({ ...p, url: urlAssinada(p.comprovante, 3600) })),
      },
      erro: null,
    };
  } catch (e) {
    return { dados: null, erro: e instanceof Error ? e.message : String(e) };
  }
});
