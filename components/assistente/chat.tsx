"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, CalendarClock, Check, CircleDot, Copy, Sparkles, SquarePen, Wallet, Wrench } from "lucide-react";
import { TextoAssistente } from "@/components/assistente/texto";
import { Botao, cn } from "@/components/ui";
import { chamarAcao } from "@/lib/acao-cliente";
import { perguntarAssistente } from "@/lib/actions/assistente";
import type { MensagemChat } from "@/lib/assistente";

const SUGESTOES = [
  { Icone: CalendarClock, texto: "Quais manutenções estão atrasadas?" },
  { Icone: Wallet, texto: "Quanto gastei com manutenção este mês, por ativo?" },
  { Icone: Wrench, texto: "Quais ativos mais tiveram corretiva este ano?" },
  { Icone: CircleDot, texto: "Quais pneus estão com sulco abaixo de 3 mm?" },
];

/** Depois disso o aviso de "consultando" muda, para não parecer travado. */
const DEMORA_MS = 8000;

function SeloAssistente() {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-marca-50 text-marca-600 ring-1 ring-marca-100"
    >
      <Sparkles className="h-3.5 w-3.5" />
    </span>
  );
}

function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          ?.writeText(texto)
          .then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          })
          .catch(() => {});
      }}
      className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
    >
      {copiado ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

/**
 * Conversa com o assistente. O histórico vai inteiro a cada pergunta (o
 * modelo lembra do contexto) e fica guardado na aba (sessionStorage, por
 * empresa): sair para outra tela e voltar não perde a conversa; fechar a aba,
 * sim. A rolagem é a da página e o campo fica preso embaixo (acima da barra
 * inferior no celular), o que se comporta melhor com o teclado do celular do
 * que uma caixa com rolagem própria.
 */
export function ChatAssistente({ nome, orgId }: { nome: string | null; orgId: string }) {
  const chaveSessao = `assistente:${orgId}`;
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pensando, iniciar] = useTransition();
  const [demorando, setDemorando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  // Lê depois de montar: o servidor não conhece o sessionStorage (hidratação).
  useEffect(() => {
    try {
      const salvo = JSON.parse(sessionStorage.getItem(chaveSessao) ?? "[]");
      if (Array.isArray(salvo) && salvo.length) setMensagens(salvo);
    } catch {}
  }, [chaveSessao]);

  useEffect(() => {
    try {
      if (mensagens.length) sessionStorage.setItem(chaveSessao, JSON.stringify(mensagens.slice(-40)));
      else sessionStorage.removeItem(chaveSessao);
    } catch {}
  }, [mensagens, chaveSessao]);

  useEffect(() => {
    if (mensagens.length || pensando) fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, pensando]);

  useEffect(() => {
    if (!pensando) return;
    const t = setTimeout(() => setDemorando(true), DEMORA_MS);
    return () => {
      clearTimeout(t);
      setDemorando(false);
    };
  }, [pensando]);

  // O campo cresce com o texto (até um limite) em vez de mostrar barra de rolagem.
  useLayoutEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [texto]);

  function focarCampo() {
    // No celular, focar abre o teclado por cima da resposta: só no computador.
    if (window.matchMedia("(pointer: fine)").matches) campo.current?.focus();
  }

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
      focarCampo();
    });
  }

  function novaConversa() {
    setMensagens([]);
    setErro(null);
    setTexto("");
    focarCampo();
  }

  const vazio = mensagens.length === 0 && !pensando;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10.5rem)] w-full max-w-3xl flex-col lg:min-h-[calc(100dvh-6rem)]">
      <header className="flex items-center justify-between gap-3 pb-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="text-lg font-semibold text-slate-900">Assistente</h1>
          <span className="truncate text-[12px] text-slate-400">só consulta, não altera nada</span>
        </div>
        {mensagens.length > 0 && (
          <Botao type="button" variante="fantasma" tamanho="sm" onClick={novaConversa} disabled={pensando}>
            <SquarePen className="h-4 w-4" aria-hidden />
            Nova conversa
          </Botao>
        )}
      </header>

      <div className="flex-1" aria-live="polite">
        {vazio ? (
          <div className="flex h-full flex-col items-center justify-center py-4 text-center sm:py-14">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-marca-50 text-marca-600 ring-1 ring-marca-100">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-slate-900 sm:text-2xl">
              {nome ? `Olá, ${nome}.` : "Olá."} Em que posso ajudar?
            </h2>
            <p className="mt-1.5 max-w-md text-sm text-slate-500">
              Pergunte sobre ativos, manutenções, planos e pneus. Eu consulto os dados da empresa para responder.
            </p>
            <div className="mt-5 grid w-full gap-2 sm:mt-7 sm:grid-cols-2">
              {SUGESTOES.map(({ Icone, texto: s }) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  className="pressionavel flex items-center gap-2.5 rounded-xl border border-slate-200 bg-superficie px-3.5 py-3 text-left text-sm text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <Icone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {mensagens.map((m, i) =>
              m.papel === "usuario" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-slate-200/70 px-3.5 py-2 text-[15px] leading-relaxed text-slate-900 sm:text-sm">
                    {m.texto}
                  </p>
                </div>
              ) : (
                <div key={i} className="group flex gap-3">
                  <SeloAssistente />
                  <div className="min-w-0 flex-1 text-[15px] leading-relaxed text-slate-800 sm:text-sm">
                    <TextoAssistente texto={m.texto} />
                    <div className="-ml-1.5 mt-1">
                      <BotaoCopiar texto={m.texto} />
                    </div>
                  </div>
                </div>
              ),
            )}

            {pensando && (
              <div className="flex items-center gap-3">
                <SeloAssistente />
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  {demorando ? "Ainda consultando, quase lá" : "Consultando os dados"}
                  <span className="flex gap-1" aria-hidden>
                    {[0, 150, 300].map((atraso) => (
                      <span
                        key={atraso}
                        className="h-1 w-1 rounded-full bg-slate-400 motion-safe:animate-pulse"
                        style={{ animationDelay: `${atraso}ms` }}
                      />
                    ))}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}
        <div ref={fim} className="scroll-mb-40" />
      </div>

      {/* Preso embaixo: no celular, logo acima da barra de navegação. */}
      <form
        className="sticky bottom-[calc(3.9rem+env(safe-area-inset-bottom))] z-10 -mx-1 bg-gradient-to-t from-slate-50 from-70% to-transparent px-1 pb-2 pt-4 lg:bottom-0 lg:pb-5"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
      >
        {erro && (
          <p role="alert" className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </p>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-superficie p-1.5 pl-3.5 shadow-elevada transition-colors focus-within:border-slate-400">
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
            enterKeyHint="send"
            placeholder="Pergunte sobre seus ativos…"
            aria-label="Pergunta para o assistente"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 text-slate-900 outline-none placeholder:text-slate-400 sm:text-sm"
          />
          <button
            type="submit"
            disabled={pensando || !texto.trim()}
            title="Enviar"
            aria-label="Enviar"
            className={cn(
              "pressionavel flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
              texto.trim() && !pensando
                ? "bg-slate-900 text-slate-50 hover:bg-slate-800"
                : "bg-slate-100 text-slate-400",
            )}
          >
            <ArrowUp className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-slate-400">
          A IA pode errar. Confira números importantes nos relatórios.
        </p>
      </form>
    </div>
  );
}
