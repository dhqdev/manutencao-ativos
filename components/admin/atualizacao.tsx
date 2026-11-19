"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CloudDownload, ExternalLink, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { Modal, RodapeModal } from "@/components/modal";
import { Badge, Botao, Secao } from "@/components/ui";
import { adminAtualizarSistema, adminVerificarVersao } from "@/lib/actions/atualizacao";
import type { SituacaoAtualizacao } from "@/lib/atualizacao";
import { dataHoraBR } from "@/lib/format";

/**
 * Cartão "Versão do sistema" do painel do superadmin: mostra a versão no ar,
 * a última publicada no GitHub Packages e o botão que pede a atualização.
 * Enquanto a atualização roda, recarrega a tela a cada poucos segundos.
 */
export function CartaoAtualizacao({ situacao }: { situacao: SituacaoAtualizacao }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const [verificando, iniciarVerificacao] = useTransition();

  const { atual, disponivel, temNova, atualizador, pedido } = situacao;
  const emAndamento = pedido?.estado === "pendente" || pedido?.estado === "executando";

  // O app reinicia no meio da atualização: a recarga falha por alguns
  // segundos e volta sozinha quando a versão nova sobe.
  useEffect(() => {
    if (!emAndamento) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [emAndamento, router]);

  function verificar() {
    setErro(null);
    iniciarVerificacao(async () => {
      const r = await adminVerificarVersao();
      if (!r.ok) setErro(r.erro);
      router.refresh();
    });
  }

  function atualizar() {
    if (!disponivel) return;
    setErro(null);
    iniciar(async () => {
      const r = await adminAtualizarSistema(disponivel);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setConfirmando(false);
      router.refresh();
    });
  }

  return (
    <Secao
      titulo="Versão do sistema"
      acoes={
        <Botao variante="fantasma" tamanho="sm" onClick={verificar} disabled={verificando || emAndamento}>
          <RefreshCw className={verificando ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          Verificar agora
        </Botao>
      }
    >
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">No ar</dt>
            <dd className="mt-0.5 font-mono font-medium text-slate-900" data-versao-atual>
              {atual}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Última publicada (GitHub Packages)</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="font-mono font-medium text-slate-900">{disponivel ?? "—"}</span>
              {temNova ? (
                <Badge className="bg-amber-50 text-amber-800 ring-amber-600/20">Nova versão</Badge>
              ) : disponivel ? (
                <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Em dia</Badge>
              ) : null}
            </dd>
          </div>
        </dl>

        {situacao.erroConsulta && (
          <Aviso>Não consegui consultar o ghcr.io: {situacao.erroConsulta}.</Aviso>
        )}

        {pedido && <EstadoPedido pedido={pedido} />}

        {erro && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

        {!atualizador.online ? (
          <Aviso>
            O serviço <b>atualizador</b> não está rodando na stack
            {atualizador.vistoEm ? ` (último sinal em ${dataHoraBR(atualizador.vistoEm)})` : ""}, então o botão
            fica desligado. Para ligar, atualize a stack uma vez com o arquivo novo (infra/stack.yml ou
            infra/portainer.yml, serviço <code>atualizador</code>). Depois disso as próximas versões saem por
            aqui.
          </Aviso>
        ) : (
          temNova &&
          !emAndamento && (
            <div className="flex flex-wrap items-center gap-3">
              <Botao onClick={() => setConfirmando(true)}>
                <CloudDownload className="h-4 w-4" />
                Atualizar para {disponivel}
              </Botao>
              {situacao.urlReleases && (
                <a
                  href={`${situacao.urlReleases}/tag/${disponivel}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-marca-700 hover:underline"
                >
                  O que mudou <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )
        )}
      </div>

      <Modal
        aberto={confirmando}
        aoFechar={() => !enviando && setConfirmando(false)}
        titulo={`Atualizar para ${disponivel ?? ""}?`}
        descricao="O banco é atualizado primeiro; depois app, WhatsApp e tarefas, um de cada vez."
        largura="max-w-lg"
      >
        <div className="space-y-3 px-5 py-5 text-sm text-slate-700">
          <p>
            O sistema pode ficar fora do ar por alguns segundos enquanto o app reinicia. Se a versão nova do app
            não subir, ele volta sozinho para a atual.
          </p>
          <p>Faça quando ninguém estiver no meio de um cadastro.</p>
          {erro && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{erro}</p>}
        </div>
        <RodapeModal>
          <Botao variante="secundario" onClick={() => setConfirmando(false)} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao onClick={atualizar} disabled={enviando}>
            {enviando && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Atualizar agora
          </Botao>
        </RodapeModal>
      </Modal>
    </Secao>
  );
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function EstadoPedido({ pedido }: { pedido: NonNullable<SituacaoAtualizacao["pedido"]> }) {
  if (pedido.estado === "pendente" || pedido.estado === "executando") {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-marca-200 bg-marca-50 px-3 py-2 text-sm text-marca-900">
        <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
        <span>
          Atualizando para <b className="font-mono">{pedido.versao}</b>:{" "}
          {pedido.estado === "pendente" ? "aguardando o atualizador..." : (pedido.mensagem ?? "em andamento...")}
        </span>
      </p>
    );
  }
  if (pedido.estado === "erro") {
    return (
      <Aviso>
        A atualização para <b className="font-mono">{pedido.versao}</b> falhou
        {pedido.concluido_em ? ` em ${dataHoraBR(pedido.concluido_em)}` : ""}: {pedido.mensagem}
      </Aviso>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-slate-600">
      <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" />
      <span>
        Última atualização: {pedido.versao_antes ?? "?"} → <span className="font-mono">{pedido.versao}</span>
        {pedido.concluido_em ? ` em ${dataHoraBR(pedido.concluido_em)}` : ""}.
      </span>
    </p>
  );
}
