"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
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
