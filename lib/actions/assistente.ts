"use server";

import { configuracaoGroq } from "@/lib/integracoes";
import { ErroAssistente, responder, type MensagemChat } from "@/lib/assistente";
import { mensagemErro } from "@/lib/form";
import { getContexto } from "@/lib/session";
import { createClient } from "@/lib/db/server";

export type RespostaAssistente = { ok: true; resposta: string } | { ok: false; erro: string };

const MENSAGENS_MAX = 20;
const TEXTO_MAX = 4000;
const PERGUNTAS_POR_MINUTO = 15;

// Freio simples por pessoa (por processo): cada pergunta gasta a cota do Groq
// do dono do sistema, e um laço no navegador não pode esgotá-la.
const recentes = new Map<string, number[]>();

function dentroDoLimite(userId: string) {
  const agora = Date.now();
  const lista = (recentes.get(userId) ?? []).filter((t) => agora - t < 60_000);
  if (lista.length >= PERGUNTAS_POR_MINUTO) return false;
  lista.push(agora);
  recentes.set(userId, lista);
  return true;
}

function historicoValido(entrada: unknown): MensagemChat[] {
  if (!Array.isArray(entrada) || entrada.length === 0) throw new Error("Escreva uma pergunta.");
  const lista = entrada.slice(-MENSAGENS_MAX).map((m) => {
    const papel = (m as MensagemChat)?.papel;
    const texto = (m as MensagemChat)?.texto;
    if ((papel !== "usuario" && papel !== "assistente") || typeof texto !== "string") {
      throw new Error("Conversa inválida. Recarregue a página.");
    }
    return { papel, texto: texto.trim().slice(0, TEXTO_MAX) };
  });
  const ultima = lista[lista.length - 1];
  if (ultima.papel !== "usuario" || !ultima.texto) throw new Error("Escreva uma pergunta.");
  return lista;
}

/**
 * Pergunta ao assistente. Qualquer papel pode usar: ele só lê, e só o que o
 * RLS já deixa a pessoa ver na empresa aberta.
 */
export async function perguntarAssistente(historico: MensagemChat[]): Promise<RespostaAssistente> {
  try {
    const { userId, orgId, organizacao, profile, papel, email } = await getContexto();
    const conversa = historicoValido(historico);

    const config = await configuracaoGroq();
    if (!config) return { ok: false, erro: "O assistente ainda não foi ligado pelo administrador do sistema." };
    if (!dentroDoLimite(userId)) {
      return { ok: false, erro: "Muitas perguntas seguidas. Espere um minuto e tente de novo." };
    }

    const db = await createClient();
    const resposta = await responder(
      { db, orgId, empresa: organizacao.nome, usuario: profile.nome || email, papel },
      config,
      conversa,
    );
    return { ok: true, resposta };
  } catch (e) {
    if (e instanceof ErroAssistente) return { ok: false, erro: e.message };
    return { ok: false, erro: mensagemErro(e) };
  }
}
