"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { TextoAssistente } from "@/components/assistente/texto";
import { Botao, cn } from "@/components/ui";
import { chamarAcao } from "@/lib/acao-cliente";
import { perguntarAssistente } from "@/lib/actions/assistente";
import type { MensagemChat } from "@/lib/assistente";

const SUGESTOES = [
  "Quais manutenções estão atrasadas?",
  "Quanto gastei com manutenção este mês, por ativo?",
  "Quais ativos mais deram manutenção corretiva este ano?",
  "Quais pneus estão com sulco abaixo de 3 mm?",
];

/**
 * Conversa com o assistente. O histórico fica só nesta aba (some ao recarregar)
 * e vai inteiro a cada pergunta, para o modelo lembrar do contexto.
 */
export function ChatAssistente({ nome }: { nome: string | null }) {
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pensando, iniciar] = useTransition();
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, pensando]);

  function enviar(pergunta: string) {
    const limpa = pergunta.trim();
    if (!limpa || pensando) return;
    const conversa: MensagemChat[] = [...mensagens, { papel: "usuario", texto: limpa }];
    setMensagens(conversa);
    setTexto("");
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => perguntarAssistente(conversa));
      if (r.ok) setMensagens([...conversa, { papel: "assistente", texto: r.resposta }]);
      else {
        // Devolve a pergunta ao campo para a pessoa tentar de novo sem redigitar.
        setMensagens(mensagens);
        setTexto(limpa);
        setErro(r.erro);
      }
      campo.current?.focus();
    });
  }

  return (
    <section className="card flex min-h-[60vh] flex-col overflow-hidden">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5" aria-live="polite">
        {mensagens.length === 0 && (
          <div className="mx-auto max-w-lg py-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-marca-50 text-marca-600">
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <h2 className="mt-3 text-sm font-semibold text-slate-900">
              {nome ? `Olá, ${nome}! Em que posso ajudar?` : "Em que posso ajudar?"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Eu consulto os dados da sua empresa para responder. Experimente:
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((m, i) => (
          <div key={i} className={cn("flex", m.papel === "usuario" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                m.papel === "usuario"
                  ? "whitespace-pre-wrap bg-slate-900 text-slate-50"
                  : "border border-slate-200 bg-slate-50 text-slate-800",
              )}
            >
              {m.papel === "usuario" ? m.texto : <TextoAssistente texto={m.texto} />}
            </div>
          </div>
        ))}

        {pensando && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> Consultando os dados…
          </div>
        )}
        <div ref={fim} />
      </div>

      <form
        className="border-t border-slate-200 px-3 py-3 sm:px-4"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
      >
        {erro && (
          <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                enviar(texto);
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Pergunte sobre seus ativos e manutenções…"
            aria-label="Pergunta para o assistente"
            className="campo max-h-40 min-h-10 flex-1 resize-y"
          />
          {mensagens.length > 0 && (
            <Botao
              type="button"
              variante="secundario"
              tamanho="icone"
              title="Nova conversa"
              aria-label="Nova conversa"
              disabled={pensando}
              onClick={() => {
                setMensagens([]);
                setErro(null);
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </Botao>
          )}
          <Botao type="submit" tamanho="icone" disabled={pensando || !texto.trim()} title="Enviar" aria-label="Enviar">
            <ArrowUp className="h-4 w-4" />
          </Botao>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          A IA pode errar. Confira números importantes nos relatórios.
        </p>
      </form>
    </section>
  );
}
