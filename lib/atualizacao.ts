import "server-only";
import { createAdminClient } from "@/lib/db/admin";

/**
 * Versões do sistema para o painel do superadmin.
 *
 *   atual       APP_VERSAO, gravada na imagem do app pelo GitHub Actions
 *   disponível  a maior tag vAAAA.MM.DD-N publicada no GitHub Packages
 *               (ghcr.io). O CI só publica depois da stack inteira e do teste
 *               ponta a ponta passarem, então toda tag ali já foi testada.
 *
 * Quem aplica é o serviço "atualizador" da stack (db/scripts/atualizador.sh);
 * o app só grava o pedido no banco.
 */

export const VERSAO_RELEASE = /^v(\d{4})\.(\d{2})\.(\d{2})-(\d+)$/;
const IMAGEM_PADRAO = "ghcr.io/dhqdev/manutencao-ativos";
const CACHE_MS = 5 * 60_000;
const SEM_SINAL_MS = 60_000;

export type PedidoAtualizacao = {
  id: number;
  versao: string;
  versao_antes: string | null;
  estado: "pendente" | "executando" | "concluida" | "erro";
  mensagem: string | null;
  criado_em: string;
  concluido_em: string | null;
};

export type SituacaoAtualizacao = {
  atual: string;
  disponivel: string | null;
  temNova: boolean;
  erroConsulta: string | null;
  urlReleases: string | null;
  atualizador: {
    online: boolean;
    vistoEm: string | null;
    stack: string | null;
    /** Última limpeza de contêineres parados feita pelo atualizador. */
    limpeza: { em: string; mensagem: string | null; parados: number | null } | null;
  };
  pedido: PedidoAtualizacao | null;
};

export function versaoAtual() {
  return process.env.APP_VERSAO || "dev";
}

function chave(versao: string): number[] | null {
  const m = VERSAO_RELEASE.exec(versao);
  return m ? m.slice(1).map(Number) : null;
}

/** > 0 quando `a` é mais nova que `b`. Versão fora do padrão conta como a mais velha. */
export function compararVersoes(a: string, b: string) {
  const ka = chave(a);
  const kb = chave(b);
  if (!ka || !kb) return ka ? 1 : kb ? -1 : 0;
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  return 0;
}

let cache: { imagem: string; quando: number; versao: string | null; erro: string | null } | null = null;

export function esquecerVersaoPublicada() {
  cache = null;
}

/** Maior tag de release da imagem do app no ghcr.io (pacote público: token anônimo). */
async function ultimaPublicada(imagem: string): Promise<{ versao: string | null; erro: string | null }> {
  if (cache && cache.imagem === imagem && Date.now() - cache.quando < CACHE_MS) return cache;

  let resultado: { versao: string | null; erro: string | null };
  try {
    const [registro, ...resto] = imagem.split("/");
    if (registro !== "ghcr.io" || resto.length < 2) throw new Error(`só sei consultar o ghcr.io (imagem ${imagem})`);
    const repo = `${resto.join("/")}/app`;

    const t = await fetch(`https://ghcr.io/token?scope=repository:${repo}:pull`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!t.ok) throw new Error(`ghcr.io negou o acesso (${t.status}); o pacote precisa ser público`);
    const { token } = (await t.json()) as { token: string };

    const tags: string[] = [];
    let url: string | null = `https://ghcr.io/v2/${repo}/tags/list?n=1000`;
    for (let pagina = 0; url && pagina < 20; pagina++) {
      const r: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`ghcr.io respondeu ${r.status}`);
      tags.push(...(((await r.json()) as { tags?: string[] }).tags ?? []));
      const proxima = /<([^>]+)>;\s*rel="next"/.exec(r.headers.get("link") ?? "")?.[1];
      url = proxima ? new URL(proxima, "https://ghcr.io").toString() : null;
    }

    const releases = tags.filter((t) => VERSAO_RELEASE.test(t)).sort(compararVersoes);
    resultado = { versao: releases.at(-1) ?? null, erro: null };
  } catch (e) {
    resultado = { versao: null, erro: e instanceof Error ? e.message : String(e) };
  }

  cache = { imagem, quando: Date.now(), ...resultado };
  return resultado;
}

/** Só chame depois de conferir que quem pediu é o superadmin. */
export async function situacaoAtualizacao(): Promise<SituacaoAtualizacao> {
  const admin = createAdminClient();
  const [sinal, pedidos] = await Promise.all([
    // "*": as colunas da limpeza chegaram depois; banco sem elas não pode
    // apagar o sinal de vida (o botão Atualizar sumiria).
    admin.from("sistema_atualizador").select("*").eq("id", 1).maybeSingle(),
    admin
      .from("sistema_atualizacoes")
      .select("id, versao, versao_antes, estado, mensagem, criado_em, concluido_em")
      .order("id", { ascending: false })
      .limit(1),
  ]);

  const vistoEm = (sinal.data?.visto_em as string | undefined) ?? null;
  const imagem = (sinal.data?.imagem as string | undefined) || IMAGEM_PADRAO;
  const atual = versaoAtual();
  const { versao: disponivel, erro } = await ultimaPublicada(imagem);
  const repoGithub = imagem.startsWith("ghcr.io/") ? imagem.split("/").slice(1, 3).join("/") : null;

  return {
    atual,
    disponivel,
    temNova: !!disponivel && compararVersoes(disponivel, atual) > 0,
    erroConsulta: erro,
    urlReleases: repoGithub ? `https://github.com/${repoGithub}/releases` : null,
    atualizador: {
      online: !!vistoEm && Date.now() - new Date(vistoEm).getTime() < SEM_SINAL_MS,
      vistoEm,
      stack: (sinal.data?.stack as string | undefined) ?? null,
      limpeza: sinal.data?.limpeza_em
        ? {
            em: sinal.data.limpeza_em as string,
            mensagem: (sinal.data.limpeza_msg as string | null) ?? null,
            parados: (sinal.data.parados as number | null) ?? null,
          }
        : null,
    },
    pedido: ((pedidos.data ?? [])[0] as PedidoAtualizacao | undefined) ?? null,
  };
}
