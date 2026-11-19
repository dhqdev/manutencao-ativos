"use server";

import { revalidatePath } from "next/cache";
import { SEM_PERMISSAO, podeGerenciar } from "@/lib/permissoes";
import { getContexto } from "@/lib/session";
import { createClient } from "@/lib/db/server";
import {
  erroBanco,
  exigirId,
  idOpcional,
  inteiro,
  mensagemErro,
  texto,
  textoObrigatorio,
  type Resultado,
} from "@/lib/form";

export async function salvarCategoria(fd: FormData): Promise<Resultado> {
  try {
    const { orgId, papel } = await getContexto();
    if (!podeGerenciar(papel)) return { ok: false, erro: SEM_PERMISSAO };
    const db = await createClient();

    const id = idOpcional(fd, "id", "a categoria");
    const cor = texto(fd, "cor");
    const dados = {
      org_id: orgId,
      nome: textoObrigatorio(fd, "nome", "o nome da categoria"),
      descricao: texto(fd, "descricao"),
      // A cor vai direto para o style da tela: só aceita #RRGGBB.
      cor: cor && /^#[0-9a-f]{6}$/i.test(cor) ? cor : "#2563eb",
      icone: texto(fd, "icone") ?? "package",
      ordem: inteiro(fd, "ordem", 0) ?? 0,
    };

    const { data, error } = id
      ? await db.from("categorias").update(dados).eq("id", id).eq("org_id", orgId).select("id").single()
      : await db.from("categorias").insert(dados).select("id").single();

    if (error) {
      if (error.code === "23505") return { ok: false, erro: "Já existe uma categoria com esse nome." };
      return erroBanco(error);
    }

    revalidatePath("/ativos");
    revalidatePath("/dashboard");
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}

export async function excluirCategoria(id: string): Promise<Resultado> {
  try {
    exigirId(id, "a categoria");
    const { orgId } = await getContexto();
    const db = await createClient();

    const { count, error: erroContagem } = await db
      .from("ativos")
      .select("id", { count: "exact", head: true })
      .eq("categoria_id", id);
    if (erroContagem) return erroBanco(erroContagem);

    if (count && count > 0) {
      return {
        ok: false,
        erro: `Esta categoria tem ${count} ativo(s). Mova ou exclua os ativos antes de removê-la.`,
      };
    }

    const { data: afetadas, error } = await db
      .from("categorias")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId)
      .select("id");
    if (error) return erroBanco(error);
    if (!afetadas?.length) return { ok: false, erro: SEM_PERMISSAO };

    revalidatePath("/ativos");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}
