"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { hoje, somarDias, somarMeses } from "@/lib/format";
import { getContexto } from "@/lib/session";
import { createClient } from "@/lib/db/server";
import {
  erroBanco,
  booleano,
  data,
  dataValida,
  exigirId,
  idOpcional,
  idValido,
  inteiro,
  mensagemErro,
  naoNegativo,
  numero,
  opcao,
  texto,
  textoObrigatorio,
  type Resultado,
} from "@/lib/form";
import { SEM_PERMISSAO, podeGerenciar, podeRegistrar } from "@/lib/permissoes";
import { removerArquivos, urlsAssinadas } from "@/lib/arquivos";
import type { TipoManutencao, UnidadePeriodicidade } from "@/lib/types";

function revalidarTudo() {
  revalidatePath("/dashboard");
  revalidatePath("/manutencoes");
  revalidatePath("/calendario");
  revalidatePath("/relatorios");
  revalidatePath("/ativos", "layout");
}

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Avança a periódica depois da baixa.
 *
 * O banco já faz isso no trigger trg_avancar_plano (db/schema.sql), mas
 * numa base onde o SQL não foi aplicado a baixa não recalcularia nada. O cálculo
 * é o mesmo e parte sempre da data do serviço — rodar duas vezes dá no mesmo.
 */
async function avancarPlano(
  db: Db,
  planoId: string,
  dataManutencao: string,
  horimetro: number | null,
) {
  const { data: p } = await db
    .from("planos_manutencao")
    .select("periodicidade_valor, periodicidade_unidade, ultimo_horimetro")
    .eq("id", planoId)
    .maybeSingle();

  if (!p?.periodicidade_valor) return;

  const avanco =
    p.periodicidade_unidade === "dias"
      ? { proxima_data: somarDias(dataManutencao, p.periodicidade_valor) }
      : p.periodicidade_unidade === "meses"
        ? { proxima_data: somarMeses(dataManutencao, p.periodicidade_valor) }
        : {
            proximo_horimetro:
              Number(horimetro ?? p.ultimo_horimetro ?? 0) + p.periodicidade_valor,
          };

  await db
    .from("planos_manutencao")
    .update({
      ultima_data: dataManutencao,
      ultimo_horimetro: horimetro ?? p.ultimo_horimetro,
      ...avanco,
    })
    .eq("id", planoId);
}

const TIPOS: TipoManutencao[] = ["preventiva", "corretiva", "preditiva", "inspecao", "melhoria"];
const UNIDADES: UnidadePeriodicidade[] = ["dias", "meses", "horas"];

export async function salvarManutencao(fd: FormData): Promise<Resultado> {
  try {
    const { orgId, userId, papel } = await getContexto();
    if (!podeRegistrar(papel)) return { ok: false, erro: SEM_PERMISSAO };
    const db = await createClient();

    // Tudo é lido e conferido ANTES de gravar qualquer coisa. Antes, com
    // "Repetir esta manutenção" marcado e a descrição vazia, a periódica era
    // criada e só depois o registro falhava — sobrava uma periódica órfã.
    const id = idOpcional(fd, "id", "a manutenção");
    const ativoId = exigirId(textoObrigatorio(fd, "ativo_id", "o ativo"), "o ativo");
    const dataManutencao = data(fd, "data_manutencao") ?? hoje();
    const horimetro = naoNegativo(numero(fd, "horimetro"), "o horímetro / KM");
    const valor = naoNegativo(numero(fd, "valor"), "o valor") ?? 0;
    const responsavel = texto(fd, "responsavel");

    const dados = {
      org_id: orgId,
      ativo_id: ativoId,
      plano_id: idOpcional(fd, "plano_id", "a manutenção periódica"),
      tipo: opcao(texto(fd, "tipo"), TIPOS, "corretiva", "o tipo de manutenção"),
      data_manutencao: dataManutencao,
      descricao: textoObrigatorio(fd, "descricao", "a descrição do serviço"),
      pecas: texto(fd, "pecas"),
      valor,
      responsavel,
      empresa: texto(fd, "empresa"),
      nota_fiscal: texto(fd, "nota_fiscal"),
      garantia_dias: naoNegativo(inteiro(fd, "garantia_dias", 0), "a garantia") ?? 0,
      horimetro,
      observacoes: texto(fd, "observacoes"),
    };

    // "Repetir esta manutenção": cria o plano periódico junto com o registro,
    // para quem não quer sair da tela e cadastrar a preventiva à parte.
    let planoCriado: string | null = null;
    if (booleano(fd, "criar_plano")) {
      // Plano é cadastro (RLS: só gestor). Antes o técnico via a opção e o
      // banco recusava no meio, com uma mensagem crua.
      if (!podeGerenciar(papel)) return { ok: false, erro: SEM_PERMISSAO };
      const periodicidade = inteiro(fd, "plano_periodicidade_valor", 0) ?? 0;
      const unidade = opcao(
        texto(fd, "plano_periodicidade_unidade"),
        UNIDADES,
        "meses",
        "a unidade da periodicidade",
      );
      const tipoPlano = textoObrigatorio(fd, "plano_tipo", "o nome da manutenção periódica");

      if (periodicidade <= 0) {
        return { ok: false, erro: "Informe de quanto em quanto tempo ela se repete." };
      }
      if (unidade === "horas" && horimetro === null) {
        return {
          ok: false,
          erro: "Para repetir por horas de uso, informe o horímetro / KM na data.",
        };
      }

      const { data: plano, error: erroPlano } = await db
        .from("planos_manutencao")
        .insert({
          org_id: orgId,
          ativo_id: ativoId,
          tipo: tipoPlano,
          periodicidade_valor: periodicidade,
          periodicidade_unidade: unidade,
          proxima_data:
            unidade === "dias"
              ? somarDias(dataManutencao, periodicidade)
              : unidade === "meses"
                ? somarMeses(dataManutencao, periodicidade)
                : null,
          proximo_horimetro:
            unidade === "horas" ? Number(horimetro) + periodicidade : null,
          ultima_data: dataManutencao,
          ultimo_horimetro: horimetro,
          responsavel,
          custo_estimado: valor || null,
          ativo: true,
        })
        .select("id")
        .single();

      if (erroPlano) return erroBanco(erroPlano);
      planoCriado = plano.id;
      dados.plano_id = plano.id;
    }

    const { data: linha, error } = id
      ? await db
          .from("manutencoes")
          .update(dados)
          .eq("id", id)
          .eq("org_id", orgId)
          .select("id")
          .single()
      : await db
          .from("manutencoes")
          .insert({ ...dados, created_by: userId })
          .select("id")
          .single();

    if (error) {
      // O registro não entrou: desfaz a periódica criada para ele.
      if (planoCriado) await db.from("planos_manutencao").delete().eq("id", planoCriado);
      return erroBanco(error);
    }

    if (!id && dados.plano_id) await avancarPlano(db, dados.plano_id, dataManutencao, horimetro);

    revalidarTudo();
    return { ok: true, id: linha.id };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export async function excluirManutencao(id: string): Promise<Resultado> {
  try {
    exigirId(id, "a manutenção");
    const { orgId } = await getContexto();
    const db = await createClient();

    const { data: anexos } = await db
      .from("manutencao_anexos")
      .select("path")
      .eq("manutencao_id", id);

    const { data: apagados, error } = await db
      .from("manutencoes")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)
      .select("id");
    if (error) return erroBanco(error);
    if (!apagados?.length) return { ok: false, erro: SEM_PERMISSAO };

    // Arquivos só depois do banco: se a exclusão for recusada, nada some à toa.
    await removerArquivos((anexos ?? []).map((a) => a.path));

    revalidarTudo();
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export type FiltroLimpeza = {
  de: string;
  ate: string;
  /** "todos" apaga qualquer tipo; os demais apagam só aquele tipo. */
  tipo: "todos" | TipoManutencao;
  ativoId?: string | null;
};

/** Monta a consulta do histórico a limpar, sempre presa à empresa aberta. */
async function consultaLimpeza(f: FiltroLimpeza) {
  if (!dataValida(f.de) || !dataValida(f.ate)) throw new Error("Informe as duas datas.");
  if (f.tipo !== "todos" && !TIPOS.includes(f.tipo)) throw new Error("Tipo de manutenção inválido.");
  if (f.de > f.ate) throw new Error("A data inicial não pode ser maior que a final.");

  const { orgId, papel } = await getContexto();
  if (!podeGerenciar(papel)) throw new Error(SEM_PERMISSAO);

  const db = await createClient();
  let q = db
    .from("manutencoes")
    .select("id, valor")
    .eq("org_id", orgId)
    .gte("data_manutencao", f.de)
    .lte("data_manutencao", f.ate);

  if (f.tipo !== "todos") q = q.eq("tipo", f.tipo);
  if (f.ativoId && idValido(f.ativoId)) q = q.eq("ativo_id", f.ativoId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { db, orgId, linhas: data ?? [] };
}

/** Quantos registros a limpeza apagaria — mostrado antes de confirmar. */
export async function previaLimpeza(
  f: FiltroLimpeza,
): Promise<{ ok: true; quantidade: number; valor: number } | { ok: false; erro: string }> {
  try {
    const { linhas } = await consultaLimpeza(f);
    return {
      ok: true,
      quantidade: linhas.length,
      valor: linhas.reduce((t, l) => t + Number(l.valor ?? 0), 0),
    };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

/**
 * Apaga o histórico de um período (opcionalmente só um tipo, como preventivas).
 * As periódicas não voltam no tempo: a próxima data continua a mesma.
 */
export async function limparHistorico(
  f: FiltroLimpeza,
): Promise<{ ok: true; quantidade: number } | { ok: false; erro: string }> {
  try {
    const { db, orgId, linhas } = await consultaLimpeza(f);
    if (!linhas.length) return { ok: true, quantidade: 0 };

    let apagadas = 0;
    // Em lotes: uma lista enorme de ids estoura o tamanho da URL da API.
    for (let i = 0; i < linhas.length; i += 200) {
      const ids = linhas.slice(i, i + 200).map((l) => l.id);

      const { data: anexos } = await db
        .from("manutencao_anexos")
        .select("path")
        .in("manutencao_id", ids);

      const { data: apagados, error } = await db
        .from("manutencoes")
        .delete()
        .eq("org_id", orgId)
        .in("id", ids)
        .select("id");
      if (error) return erroBanco(error);

      apagadas += apagados?.length ?? 0;
      await removerArquivos((anexos ?? []).map((a) => a.path));
    }

    if (!apagadas) return { ok: false, erro: SEM_PERMISSAO };

    revalidarTudo();
    return { ok: true, quantidade: apagadas };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

/** Tipos aceitos como anexo. Espelha a lista de lib/arquivos.ts. */
const MIME_PERMITIDOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

export async function registrarAnexo(entrada: {
  manutencaoId: string;
  nome: string;
  path: string;
  tipoMime: string | null;
  tamanho: number | null;
}): Promise<Resultado> {
  try {
    exigirId(entrada.manutencaoId, "a manutenção");
    const { orgId } = await getContexto();
    const db = await createClient();

    // A manutenção precisa ser da empresa de quem está enviando. Sem isto, dava
    // para pendurar anexo em registro de outra empresa (o RLS barraria a
    // leitura, mas sujaria o banco alheio).
    const { data: alvo } = await db
      .from("manutencoes")
      .select("id")
      .eq("id", entrada.manutencaoId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (!alvo) return { ok: false, erro: "Manutenção não encontrada nesta empresa." };

    if (entrada.tipoMime && !MIME_PERMITIDOS.includes(entrada.tipoMime)) {
      return { ok: false, erro: "Tipo de arquivo não permitido. Envie imagem ou PDF." };
    }

    // O caminho precisa começar pela pasta da própria empresa.
    if (!entrada.path.startsWith(`${orgId}/${entrada.manutencaoId}/`) || entrada.path.includes("..")) {
      return { ok: false, erro: "Caminho de arquivo inválido." };
    }

    const { error } = await db.from("manutencao_anexos").insert({
      org_id: orgId,
      manutencao_id: entrada.manutencaoId,
      nome: (entrada.nome || "arquivo").slice(0, 200),
      path: entrada.path,
      tipo_mime: entrada.tipoMime,
      tamanho: entrada.tamanho,
    });

    if (error) return erroBanco(error);

    revalidatePath("/ativos", "layout");
    revalidatePath("/manutencoes");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export async function excluirAnexo(id: string): Promise<Resultado> {
  try {
    exigirId(id, "o anexo");
    const { orgId } = await getContexto();
    const db = await createClient();

    const { data: apagados, error } = await db
      .from("manutencao_anexos")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)
      .select("path");
    if (error) return erroBanco(error);
    if (!apagados?.length) return { ok: false, erro: SEM_PERMISSAO };

    await removerArquivos(apagados.map((a) => a.path));

    revalidatePath("/ativos", "layout");
    revalidatePath("/manutencoes");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

/**
 * Gera links temporários (1h) para visualizar os anexos de uma manutenção.
 * Falha vira lista vazia: a tela mostra "sem anexos" em vez de quebrar o modal.
 */
export async function linksDosAnexos(manutencaoId: string) {
  if (!idValido(manutencaoId)) return [];
  try {
    const { orgId } = await getContexto();
    const db = await createClient();
    const { data: anexos, error } = await db
      .from("manutencao_anexos")
      .select("*")
      .eq("manutencao_id", manutencaoId)
      .eq("org_id", orgId)
      .order("created_at");

    if (error) {
      console.error("[anexos] listar", error.message);
      return [];
    }
    if (!anexos?.length) return [];

    const urls = urlsAssinadas(anexos.map((a) => a.path));
    return anexos.map((a, i) => ({ ...a, url: urls[i] }));
  } catch (e) {
    unstable_rethrow(e);
    console.error("[anexos] listar", e);
    return [];
  }
}
