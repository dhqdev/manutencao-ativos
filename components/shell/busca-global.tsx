"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  CircleDot,
  ClipboardList,
  CornerDownLeft,
  Keyboard,
  LoaderCircle,
  type LucideIcon,
  Package,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/components/ui";
import { buscarNoSistema, type ResultadoBusca } from "@/lib/actions/busca";
import { chamarAcao } from "@/lib/acao-cliente";
import { dataBR } from "@/lib/format";

type Destino = { href: string; rotulo: string; Icone: LucideIcon };

type Item = {
  id: string;
  grupo: string;
  titulo: string;
  detalhe?: string;
  Icone: LucideIcon;
  executar: () => void;
};

/** Evento para abrir a busca de qualquer botão (menu lateral, topo do celular). */
export const ABRIR_BUSCA = "abrir-busca-global";
export function abrirBuscaGlobal() {
  window.dispatchEvent(new Event(ABRIR_BUSCA));
}

export const ATALHOS: { teclas: string; o_que: string }[] = [
  { teclas: "Ctrl K", o_que: "Abrir esta busca" },
  { teclas: "/", o_que: "Ir para a busca da tela" },
  { teclas: "N", o_que: "Novo registro na tela (manutenção, ativo, pneu)" },
  { teclas: "Ctrl B", o_que: "Recolher ou abrir o menu lateral" },
  { teclas: "?", o_que: "Ver os atalhos" },
  { teclas: "Esc", o_que: "Fechar janelas" },
];

function digitando(alvo: EventTarget | null) {
  const el = alvo as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Há um modal aberto? Os atalhos de uma letra não valem por cima dele. */
function modalAberto() {
  return Boolean(document.querySelector('[aria-modal="true"]'));
}

/**
 * Busca global (Ctrl+K / ⌘K) e atalhos de teclado do sistema. Procura ativos,
 * manutenções, periódicas e pneus da empresa aberta e leva às telas e ações
 * mais usadas sem tirar a mão do teclado.
 */
export function BuscaGlobal({ destinos, podeRegistrar }: { destinos: Destino[]; podeRegistrar: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<ResultadoBusca | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [selecionado, setSelecionado] = useState(0);
  const [verAtalhos, setVerAtalhos] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const pedido = useRef(0);

  const abrir = useCallback((atalhos = false) => {
    setVerAtalhos(atalhos);
    setAberto(true);
  }, []);

  const fechar = useCallback(() => {
    setAberto(false);
    setTermo("");
    setResultado(null);
    setSelecionado(0);
  }, []);

  // Teclado em qualquer tela.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k === "k") {
        e.preventDefault();
        if (aberto) fechar();
        else abrir();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || aberto || digitando(e.target) || modalAberto()) return;

      if (e.key === "/") {
        const busca = document.querySelector<HTMLInputElement>("main [data-busca]:not([disabled])");
        e.preventDefault();
        if (busca && busca.offsetParent !== null) {
          busca.focus();
          busca.select();
        } else abrir();
      } else if (e.key === "?") {
        e.preventDefault();
        abrir(true);
      } else if (k === "n" && !e.shiftKey) {
        const botao = document.querySelector<HTMLElement>("main [data-atalho-novo]");
        if (botao && botao.offsetParent !== null) {
          e.preventDefault();
          botao.click();
        }
      }
    }
    const pedirAbertura = () => abrir();
    document.addEventListener("keydown", tecla);
    window.addEventListener(ABRIR_BUSCA, pedirAbertura);
    return () => {
      document.removeEventListener("keydown", tecla);
      window.removeEventListener(ABRIR_BUSCA, pedirAbertura);
    };
  }, [aberto, abrir, fechar]);

  // Trocar de tela fecha a busca.
  useEffect(() => fechar(), [pathname, fechar]);

  useEffect(() => {
    if (!aberto) return;
    campo.current?.focus();
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

  // Busca no banco com espera curta; resposta atrasada de um termo antigo é ignorada.
  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) {
      setResultado(null);
      setBuscando(false);
      return;
    }
    const n = ++pedido.current;
    setBuscando(true);
    const espera = setTimeout(async () => {
      const r = await chamarAcao(() => buscarNoSistema(t));
      if (n !== pedido.current) return;
      setBuscando(false);
      setResultado(r.ok ? r.resultado : null);
    }, 220);
    return () => clearTimeout(espera);
  }, [termo]);

  const itens = useMemo<Item[]>(() => {
    const t = termo.trim().toLowerCase();
    const ir = (href: string) => () => {
      fechar();
      router.push(href);
    };
    const saida: Item[] = [];

    if (podeRegistrar && (!t || "registrar nova manutenção".includes(t))) {
      saida.push({
        id: "acao-manutencao",
        grupo: "Ações",
        titulo: "Registrar manutenção",
        Icone: Plus,
        executar: () => {
          fechar();
          const botao = document.querySelector<HTMLElement>("main [data-atalho-novo]");
          if (pathname === "/manutencoes" && botao) botao.click();
          else router.push("/manutencoes?novo=1");
        },
      });
    }

    for (const d of destinos) {
      if (!t || d.rotulo.toLowerCase().includes(t)) {
        saida.push({ id: `ir-${d.href}`, grupo: "Ir para", titulo: d.rotulo, Icone: d.Icone, executar: ir(d.href) });
      }
    }

    if (resultado) {
      for (const a of resultado.ativos) {
        saida.push({
          id: `a-${a.id}`,
          grupo: "Ativos",
          titulo: a.nome,
          detalhe: [a.identificacao, a.categoria].filter(Boolean).join(" · "),
          Icone: Package,
          executar: ir(`/ativos/${a.id}`),
        });
      }
      for (const m of resultado.manutencoes) {
        saida.push({
          id: `m-${m.id}`,
          grupo: "Manutenções",
          titulo: m.descricao,
          detalhe: `${m.ativo_nome} · ${dataBR(m.data_manutencao)}`,
          Icone: ClipboardList,
          executar: ir(`/ativos/${m.ativo_id}`),
        });
      }
      for (const p of resultado.planos) {
        saida.push({
          id: `p-${p.id}`,
          grupo: "Periódicas",
          titulo: p.tipo,
          detalhe: p.ativo_nome,
          Icone: CalendarClock,
          executar: ir(`/ativos/${p.ativo_id}`),
        });
      }
      for (const n of resultado.pneus) {
        saida.push({
          id: `n-${n.id}`,
          grupo: "Pneus",
          titulo: `Pneu ${n.numero_fogo}`,
          detalhe: [n.marca, n.modelo].filter(Boolean).join(" "),
          Icone: CircleDot,
          executar: ir(`/estoque?q=${encodeURIComponent(n.numero_fogo)}`),
        });
      }
    }
    return saida;
  }, [termo, resultado, destinos, podeRegistrar, router, fechar, pathname]);

  useEffect(() => setSelecionado(0), [termo, resultado]);

  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-indice="${selecionado}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selecionado]);

  if (!aberto) return null;

  function navegar(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelecionado((s) => Math.min(s + 1, itens.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelecionado((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      itens[selecionado]?.executar();
    } else if (e.key === "Escape") {
      e.preventDefault();
      fechar();
    }
  }

  let grupoAnterior = "";

  return (
    <div className="no-print fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[10vh] sm:pt-[14vh]">
      <div className="veu absolute inset-0 bg-black/50" onClick={fechar} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        className="dialogo relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-superficie shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-3">
          {buscando ? (
            <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <input
            ref={campo}
            value={termo}
            onChange={(e) => {
              setTermo(e.target.value);
              setVerAtalhos(false);
            }}
            onKeyDown={navegar}
            placeholder="Buscar ativo, manutenção, pneu ou tela..."
            className="h-12 w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 sm:text-sm"
            role="combobox"
            aria-expanded="true"
            aria-controls="busca-global-lista"
            aria-activedescendant={itens[selecionado] ? `busca-${itens[selecionado].id}` : undefined}
          />
          <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 sm:block">Esc</kbd>
        </div>

        {verAtalhos ? (
          <div className="overflow-y-auto p-3">
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Atalhos de teclado</p>
            <dl className="divide-y divide-slate-100 text-sm">
              {ATALHOS.map((a) => (
                <div key={a.teclas} className="flex items-center justify-between gap-3 px-1 py-2">
                  <dt className="text-slate-700">{a.o_que}</dt>
                  <dd>
                    <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                      {a.teclas}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <ul ref={lista} id="busca-global-lista" role="listbox" className="overflow-y-auto py-1.5">
            {itens.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-slate-500">
                {buscando ? "Buscando..." : "Nada encontrado."}
              </li>
            )}
            {itens.map((item, i) => {
              const titulo = item.grupo !== grupoAnterior ? item.grupo : null;
              grupoAnterior = item.grupo;
              return (
                <li key={item.id} role="presentation">
                  {titulo && (
                    <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{titulo}</p>
                  )}
                  <button
                    type="button"
                    id={`busca-${item.id}`}
                    role="option"
                    aria-selected={i === selecionado}
                    data-indice={i}
                    onMouseMove={() => setSelecionado(i)}
                    onClick={item.executar}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-left text-sm",
                      i === selecionado ? "bg-slate-100 text-slate-900" : "text-slate-700",
                    )}
                  >
                    <item.Icone className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate">
                      {item.titulo}
                      {item.detalhe && <span className="ml-2 text-xs text-slate-500">{item.detalhe}</span>}
                    </span>
                    {i === selecionado && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          <span className="hidden sm:inline">↑ ↓ para escolher · Enter para abrir</span>
          <button
            type="button"
            onClick={() => setVerAtalhos((v) => !v)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:bg-slate-200/60"
          >
            <Keyboard className="h-3.5 w-3.5" />
            {verAtalhos ? "Voltar à busca" : "Atalhos (?)"}
          </button>
        </div>
      </div>
    </div>
  );
}
