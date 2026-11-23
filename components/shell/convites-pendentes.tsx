"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, MailCheck, UserPlus, X } from "lucide-react";
import { Botao } from "@/components/ui";
import { aceitarConvite, recusarConvite, reenviarConfirmacao } from "@/lib/actions/convites";

export type ConvitePendente = {
  id: string;
  empresa: string;
  papel: string;
  convidado_por: string | null;
};

const NOME_PAPEL: Record<string, string> = { gestor: "gestor", tecnico: "técnico", leitor: "leitor" };

/**
 * Faixa no topo para quem foi convidado a entrar na equipe de uma empresa.
 * Aceitar exige o e-mail confirmado (db/sql/73-convites.sql): sem isso a
 * faixa explica por quê e oferece reenviar o link.
 */
export function ConvitesPendentes({
  convites,
  emailConfirmado,
  podeEnviarEmail,
}: {
  convites: ConvitePendente[];
  emailConfirmado: boolean;
  podeEnviarEmail: boolean;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function rodar(acao: () => Promise<{ ok: boolean; erro?: string }>, sucesso?: string) {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) setErro(r.erro ?? "Não deu certo. Tente de novo.");
      else {
        if (sucesso) setAviso(sucesso);
        router.refresh();
      }
    });
  }

  return (
    <div role="status" className="no-print mb-4 space-y-2" data-convites={convites.length}>
      {convites.map((c) => (
        <div
          key={c.id}
          data-convite={c.empresa}
          className="flex flex-col gap-3 rounded-xl border border-marca-200 bg-marca-50 px-4 py-3 text-sm text-slate-800 sm:flex-row sm:items-center"
        >
          <UserPlus className="hidden h-5 w-5 shrink-0 text-marca-600 sm:block" aria-hidden />
          <p className="min-w-0 flex-1">
            {c.convidado_por ? <strong>{c.convidado_por}</strong> : "Alguém"} convidou você para a equipe de{" "}
            <strong>{c.empresa}</strong> como {NOME_PAPEL[c.papel] ?? c.papel}.
            {!emailConfirmado && (
              <span className="block text-xs text-slate-600">
                Para aceitar, confirme antes o seu e-mail: assim a empresa sabe que a conta é mesmo sua.
              </span>
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            {emailConfirmado ? (
              <Botao tamanho="sm" disabled={ocupado} onClick={() => rodar(() => aceitarConvite(c.id))}>
                {ocupado ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Aceitar
              </Botao>
            ) : (
              podeEnviarEmail && (
                <Botao
                  tamanho="sm"
                  disabled={ocupado}
                  onClick={() => rodar(reenviarConfirmacao, "Mandamos o link de confirmação para o seu e-mail.")}
                >
                  <MailCheck className="h-4 w-4" />
                  Confirmar e-mail
                </Botao>
              )
            )}
            <Botao variante="secundario" tamanho="sm" disabled={ocupado} onClick={() => rodar(() => recusarConvite(c.id))}>
              <X className="h-4 w-4" />
              Recusar
            </Botao>
          </div>
        </div>
      ))}
      {!emailConfirmado && !podeEnviarEmail && (
        <p className="text-xs text-slate-500">
          Este servidor não envia e-mails. Peça ao administrador do sistema para incluir você na empresa pelo console.
        </p>
      )}
      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</p>}
      {aviso && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{aviso}</p>}
    </div>
  );
}
