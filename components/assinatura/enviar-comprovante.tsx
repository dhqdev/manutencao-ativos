"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle, Upload } from "lucide-react";
import { Botao, Campo, Secao } from "@/components/ui";
import { chamarAcao } from "@/lib/acao-cliente";
import { autorizarComprovante, registrarComprovante } from "@/lib/actions/assinatura";
import { enviarArquivo } from "@/lib/arquivos-envio";

/**
 * Anexar o comprovante do Pix: o arquivo vai direto para /api/arquivos (com a
 * autorização da action) e depois vira registro. Vale na hora, sem
 * aprovação (assinatura_enviar_comprovante), menos com a empresa bloqueada à
 * mão pelo administrador: aí fica em análise até ele liberar.
 */
export function EnviarComprovante({ pendente, bloqueioManual }: { pendente: boolean; bloqueioManual?: boolean }) {
  const router = useRouter();
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  function enviar() {
    // Lido do campo na hora (não de um estado): arquivo escolhido antes de a
    // tela hidratar também vale.
    const arquivo = entrada.current?.files?.[0] ?? null;
    if (!arquivo) {
      setErro("Escolha a foto ou o PDF do comprovante: ele é obrigatório para liberar o acesso.");
      return;
    }
    setErro(null);
    setEnviado(false);
    iniciar(async () => {
      const auth = await chamarAcao(() => autorizarComprovante(arquivo.name));
      if (!auth.ok) return setErro(auth.erro);
      const { error } = await enviarArquivo(auth.caminho, auth.token, arquivo);
      if (error) return setErro(error.message);
      const r = await chamarAcao(() => registrarComprovante({ caminho: auth.caminho, nome: arquivo.name, observacao }));
      if (!r.ok) return setErro(r.erro);
      setObservacao("");
      if (entrada.current) entrada.current.value = "";
      setEnviado(true);
      router.refresh();
    });
  }

  return (
    <Secao titulo="Anexar comprovante (obrigatório)">
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <p className="text-sm text-slate-600">
          Depois de pagar, <strong>anexe o comprovante</strong> (print ou PDF do banco). É obrigatório: só o Pix, sem o
          comprovante aqui, não libera o acesso. Com ele anexado, o próximo período é liberado <strong>na hora</strong>{" "}
          e quem paga adiantado não perde dias.
        </p>
        {(pendente || bloqueioManual) && !enviado && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            O acesso desta empresa foi bloqueado pelo administrador: o comprovante fica em análise até ele liberar.
          </p>
        )}
        <Campo label="Comprovante" obrigatorio hint="Imagem (JPG, PNG) ou PDF, até 25 MB.">
          <input
            ref={entrada}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            className="campo file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm"
            data-comprovante-arquivo
          />
        </Campo>
        <Campo label="Observação (opcional)">
          <input
            className="campo"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            maxLength={500}
            placeholder="Ex.: pago pela conta da empresa"
          />
        </Campo>
        {erro && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
        {enviado && (
          <p className="flex items-center gap-2 text-sm text-emerald-700" data-comprovante-enviado>
            <CircleCheck className="h-4 w-4" aria-hidden /> Comprovante enviado.{" "}
            {bloqueioManual ? "O administrador vai analisar e liberar o acesso." : "Acesso liberado: confira no histórico até quando."}
          </p>
        )}
        <Botao type="button" onClick={enviar} disabled={ocupado}>
          {ocupado ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Enviar comprovante
        </Botao>
      </div>
    </Secao>
  );
}
