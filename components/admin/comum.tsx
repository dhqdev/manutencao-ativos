"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, type LucideIcon, Search } from "lucide-react";
import { Modal, RodapeModal } from "@/components/modal";
import { Botao, cn } from "@/components/ui";
import type { CredenciaisAdmin } from "@/lib/actions/admin";
import type { Resultado } from "@/lib/form";

/** Peças comuns das telas do console do superadmin. */

export type Credenciais = Extract<CredenciaisAdmin, { ok: true }>;

export const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Busca({
  valor,
  aoMudar,
  placeholder,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="campo pl-9"
      />
    </div>
  );
}

/** Tons dos ícones dos indicadores do console. */
export const TONS = {
  neutro: "text-slate-600 bg-slate-100",
  azul: "text-marca-700 bg-marca-50",
  verde: "text-emerald-700 bg-emerald-50",
  ambar: "text-amber-700 bg-amber-50",
  laranja: "text-orange-700 bg-orange-50",
  vermelho: "text-red-700 bg-red-50",
  violeta: "text-violet-700 bg-violet-50",
} as const;

/**
 * Cartão de número do console (o mesmo em todas as seções): ícone, valor
 * grande, o que ele é e uma linha de detalhe. Com `aoClicar` vira filtro;
 * `alerta` pinta a borda quando o número pede atenção.
 */
export function Indicador({
  Icone,
  tom = "neutro",
  valor,
  rotulo,
  detalhe,
  alerta,
  ativo,
  aoClicar,
  className,
}: {
  Icone: LucideIcon;
  tom?: keyof typeof TONS;
  valor: ReactNode;
  rotulo: string;
  detalhe?: ReactNode;
  alerta?: boolean;
  ativo?: boolean;
  aoClicar?: () => void;
  className?: string;
}) {
  const conteudo = (
    <>
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONS[tom])}>
        <Icone className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-2xl font-semibold leading-none tabular-nums text-slate-900">{valor}</span>
        <span className="mt-1 block truncate text-xs font-medium text-slate-600">{rotulo}</span>
        {detalhe && <span className="mt-0.5 block truncate text-[11px] text-slate-500">{detalhe}</span>}
      </span>
    </>
  );
  const classe = cn(
    "card flex items-center gap-3 p-3.5 text-left sm:p-4",
    alerta && "border-amber-300 bg-amber-50/60",
    ativo && "ring-2 ring-slate-900",
    className,
  );
  if (!aoClicar) return <div className={classe}>{conteudo}</div>;
  return (
    <button type="button" onClick={aoClicar} aria-pressed={ativo} className={cn(classe, "pressionavel transition-shadow hover:shadow-md")}>
      {conteudo}
    </button>
  );
}

export function Erro({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}

/**
 * Roda uma ação do servidor e atualiza a tela. A resposta é conferida antes de
 * ler `ok`: uma ação que redireciona não devolve objeto nenhum.
 */
export function useAcao() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function rodar(acao: () => Promise<Resultado | CredenciaisAdmin>, aoDarCerto?: () => void) {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await acao();
        if (r && !r.ok) {
          setErro(r.erro);
          return;
        }
        aoDarCerto?.();
        router.refresh();
      } catch {
        setErro("Não foi possível falar com o servidor. Tente de novo.");
      }
    });
  }

  return { erro, ocupado, rodar };
}

export function BotaoIcone({
  titulo,
  onClick,
  disabled,
  children,
  perigo,
}: {
  titulo: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      aria-label={titulo}
      className={cn(
        "pressionavel rounded-lg p-2 text-slate-400 transition-colors disabled:opacity-40",
        perigo ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-slate-100 hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}

/** Formulário num modal: envia, mostra erro ou fecha e atualiza. */
export function FormModal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  rotulo,
  acao,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  rotulo: string;
  acao: (fd: FormData) => Promise<Resultado | CredenciaisAdmin>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function enviar(fd: FormData) {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await acao(fd);
        if (r && !r.ok) {
          setErro(r.erro);
          return;
        }
        aoFechar();
        router.refresh();
      } catch {
        setErro("Não foi possível falar com o servidor. Tente de novo.");
      }
    });
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={() => !enviando && aoFechar()}
      titulo={titulo}
      descricao={descricao}
      largura="max-w-lg"
    >
      <form action={enviar}>
        <div className="space-y-4 px-5 py-5">
          {erro && <Erro>{erro}</Erro>}
          {children}
        </div>
        <RodapeModal>
          <Botao type="button" variante="secundario" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={enviando}>
            {enviando && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {rotulo}
          </Botao>
        </RodapeModal>
      </form>
    </Modal>
  );
}
