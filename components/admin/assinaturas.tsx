"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  CircleCheck,
  Clock,
  ExternalLink,
  FileText,
  Inbox,
  LoaderCircle,
  Lock,
  LockOpen,
  MessageCircle,
  QrCode,
  RefreshCw,
  Send,
  Smartphone,
  Unplug,
  Wallet,
  X,
} from "lucide-react";
import { Modal, RodapeModal } from "@/components/modal";
import { Badge, Botao, Campo, Secao, cn } from "@/components/ui";
import { Busca, Erro, Indicador, normalizar, useAcao } from "@/components/admin/comum";
import { CopiarPix } from "@/components/assinatura/copiar-pix";
import { chamarAcao } from "@/lib/acao-cliente";
import {
  adminAvaliarPagamento,
  adminBloquearEmpresa,
  adminConectarWhatsappCobranca,
  adminDefinirAssinatura,
  adminDesconectarWhatsappCobranca,
  adminDesligarCobranca,
  adminReenviarAviso,
  adminSalvarCobranca,
  adminStatusWhatsappCobranca,
  adminTestarWhatsappCobranca,
  type StatusWhatsappCobranca,
} from "@/lib/actions/assinatura";
import type { DadosAssinaturas, EmpresaAssinatura, PagamentoAdmin } from "@/lib/admin-console";
import { ESTADOS_ASSINATURA, SITUACOES_PAGAMENTO, type EstadoAssinatura } from "@/lib/assinatura";
import { dataBR, dataHoraBR, moeda } from "@/lib/format";
import type { Resultado } from "@/lib/form";
import { formatarTelefone } from "@/lib/telefone";

/** "2026-11" do instante, no fuso de Brasília (igual no servidor e no navegador). */
const mesDe = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(new Date(iso))
    .slice(0, 7);

/**
 * Seção "Assinaturas" do console: comprovantes para conferir (cada um já
 * liberou o mês ao chegar), situação e bloqueio de cada empresa, a
 * configuração do Pix e o WhatsApp que recebe os avisos.
 */
export function AssinaturasAdmin({ dados, mesAtual }: { dados: DadosAssinaturas; mesAtual: string }) {
  const conferir = dados.pagamentos.filter((p) => p.situacao === "pendente");
  const historico = dados.pagamentos.filter((p) => p.situacao !== "pendente");
  const [filtro, setFiltro] = useState<FiltroEmpresa>("todas");
  const conta = (f: FiltroEmpresa) => dados.empresas.filter((e) => passaFiltro(e, f)).length;
  const recebidos = dados.pagamentos.filter((p) => p.situacao !== "recusado" && mesDe(p.enviado_em) === mesAtual);
  const recebido = recebidos.reduce((s, p) => s + Number(p.valor), 0);
  const alternar = (f: FiltroEmpresa) => setFiltro((atual) => (atual === f ? "todas" : f));

  return (
    <div className="space-y-5">
      {!dados.ligada && (
        <p className="card border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          A cobrança está <strong>desligada</strong>: ninguém é bloqueado pelo vencimento (o bloqueio à mão continua
          valendo). Preencha a chave Pix e o valor em <strong>Pix da assinatura</strong>, lá embaixo, para ligar.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-5">
        <Indicador
          Icone={Inbox}
          tom={conferir.length ? "ambar" : "neutro"}
          valor={conferir.length}
          rotulo="Comprovantes para conferir"
          detalhe={conferir.length ? "o acesso já foi liberado" : "nada esperando"}
          alerta={conferir.length > 0}
          className="col-span-2 lg:col-span-1"
        />
        <Indicador
          Icone={Wallet}
          tom="azul"
          valor={moeda(recebido)}
          rotulo="Recebido neste mês"
          detalhe={`${recebidos.length} comprovante(s) · ${moeda(dados.config.valor)}/mês`}
        />
        <Indicador
          Icone={CircleCheck}
          tom="verde"
          valor={conta("em_dia")}
          rotulo="Em dia"
          detalhe="vencem daqui a mais de 5 dias"
          ativo={filtro === "em_dia"}
          aoClicar={() => alternar("em_dia")}
        />
        <Indicador
          Icone={Clock}
          tom="laranja"
          valor={conta("atencao")}
          rotulo="Vencendo ou vencidas"
          detalhe="ainda com acesso"
          ativo={filtro === "atencao"}
          aoClicar={() => alternar("atencao")}
        />
        <Indicador
          Icone={Lock}
          tom="vermelho"
          valor={conta("bloqueadas")}
          rotulo="Bloqueadas"
          detalhe={`${dados.empresas.filter((e) => e.bloqueio_manual).length} por você`}
          ativo={filtro === "bloqueadas"}
          aoClicar={() => alternar("bloqueadas")}
        />
      </div>

      <Secao
        titulo="Comprovantes para conferir"
        acoes={<Badge className={conferir.length ? "bg-amber-100 text-amber-800 ring-amber-600/20" : undefined}>{conferir.length}</Badge>}
      >
        <p className="border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600 sm:px-5">
          Quando o cliente anexa o comprovante, o acesso do mês seguinte é <strong>liberado na hora</strong> (e o arquivo
          chega no seu WhatsApp). Abra o comprovante e <strong>confirme</strong> se o Pix caiu, ou{" "}
          <strong>recuse</strong>: o mês dado é desfeito e dá para bloquear a empresa junto.
        </p>
        <ListaComprovantes pagamentos={conferir} vazio="Nenhum comprovante esperando conferência." />
      </Secao>

      <EmpresasAssinatura empresas={dados.empresas} filtro={filtro} aoFiltrar={setFiltro} />

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <CartaoCobranca dados={dados} />
        <CartaoWhatsappCobranca numeroAvisos={dados.config.whatsapp} />
      </div>

      <Secao titulo="Histórico de pagamentos" acoes={<Badge>{historico.length}</Badge>}>
        <ListaComprovantes pagamentos={historico} vazio="Nenhum comprovante conferido ainda." historico />
      </Secao>
    </div>
  );
}

// --- Comprovantes -----------------------------------------------------------------

function ListaComprovantes({
  pagamentos,
  vazio,
  historico,
}: {
  pagamentos: PagamentoAdmin[];
  vazio: string;
  historico?: boolean;
}) {
  if (pagamentos.length === 0) return <p className="px-5 py-8 text-center text-sm text-slate-500">{vazio}</p>;
  return (
    <ul className="divide-y divide-slate-100" data-comprovantes={historico ? "Histórico de pagamentos" : "Para conferir"}>
      {pagamentos.map((p) => (
        <LinhaComprovante key={p.id} p={p} />
      ))}
    </ul>
  );
}

/** Tipo do comprovante pela extensão (o que o visualizador consegue mostrar). */
function tipoVisual(p: PagamentoAdmin): "pdf" | "imagem" | "outro" {
  const ext = (p.comprovante.split(".").pop() ?? "").toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "imagem";
  return "outro";
}

function LinhaComprovante({ p }: { p: PagamentoAdmin }) {
  const { erro, ocupado, rodar } = useAcao();
  const [vendo, setVendo] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const sit = SITUACOES_PAGAMENTO[p.situacao];
  const pendente = p.situacao === "pendente";
  const confirmar = () => rodar(() => chamarAcao(() => adminAvaliarPagamento(p.id, true)), () => setVendo(false));

  return (
    <li className="px-4 py-3 sm:px-5" data-comprovante={p.empresa}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <button
          type="button"
          onClick={() => setVendo(true)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          title="Ver comprovante"
        >
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <FileText className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-slate-900">{p.empresa}</span>
              <span className="text-sm tabular-nums text-slate-700">{moeda(Number(p.valor))}</span>
              <Badge className={sit.classe}>{sit.label}</Badge>
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Enviado em {dataHoraBR(p.enviado_em)}
              {p.enviado_por ? ` por ${p.enviado_por}` : ""} · {p.nome_arquivo}
            </span>
            {p.observacao && <span className="mt-1 block text-xs text-slate-600">“{p.observacao}”</span>}
            <DestinoDoComprovante p={p} />
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <AvisoWhatsapp p={p} ocupado={ocupado} reenviar={() => rodar(() => chamarAcao(() => adminReenviarAviso(p.id)))} />
          <Botao tamanho="sm" variante="secundario" onClick={() => setVendo(true)}>
            <FileText className="h-3.5 w-3.5" /> Ver comprovante
          </Botao>
          {pendente && (
            <>
              <Botao tamanho="sm" disabled={ocupado} onClick={confirmar}>
                {ocupado ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Confirmar
              </Botao>
              <Botao tamanho="sm" variante="secundario" disabled={ocupado} onClick={() => setRecusando(true)}>
                <X className="h-3.5 w-3.5" /> Recusar
              </Botao>
            </>
          )}
        </div>
      </div>
      {erro && !recusando && (
        <div className="mt-2">
          <Erro>{erro}</Erro>
        </div>
      )}

      <Modal
        aberto={vendo}
        aoFechar={() => setVendo(false)}
        titulo={`Comprovante · ${p.empresa}`}
        descricao={`${moeda(Number(p.valor))} · enviado em ${dataHoraBR(p.enviado_em)}`}
        largura="max-w-4xl"
      >
        <div className="space-y-3 px-5 py-4" data-visualizador-comprovante>
          <VisualizadorComprovante p={p} />
          <DestinoDoComprovante p={p} />
          {erro && <Erro>{erro}</Erro>}
        </div>
        <RodapeModal>
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className="mr-auto inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ExternalLink className="h-4 w-4" aria-hidden /> Abrir em outra aba
          </a>
          {pendente ? (
            <>
              <Botao variante="secundario" disabled={ocupado} onClick={() => (setVendo(false), setRecusando(true))}>
                <X className="h-4 w-4" /> Recusar
              </Botao>
              <Botao disabled={ocupado} onClick={confirmar}>
                {ocupado ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirmar pagamento
              </Botao>
            </>
          ) : (
            <Botao variante="secundario" onClick={() => setVendo(false)}>
              Fechar
            </Botao>
          )}
        </RodapeModal>
      </Modal>

      <ModalRecusar p={p} aberto={recusando} aoFechar={() => setRecusando(false)} />
    </li>
  );
}

/** O que aquele comprovante fez com o vencimento (ou por que não fez). */
function DestinoDoComprovante({ p }: { p: PagamentoAdmin }) {
  if (p.situacao === "pendente") {
    return p.liberado_em && p.vencimento_novo ? (
      <span className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
        <LockOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Acesso liberado na hora: vencimento {p.vencimento_anterior ? `${dataBR(p.vencimento_anterior)} → ` : ""}
        {dataBR(p.vencimento_novo)}
      </span>
    ) : (
      <span className="mt-1 flex items-center gap-1 text-xs text-amber-700">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Não liberou sozinho (empresa bloqueada por você, outro comprovante na fila ou recusa anterior). Confirmar dá +1 mês.
      </span>
    );
  }
  if (p.situacao === "aprovado") {
    return (
      <span className="mt-1 block text-xs text-emerald-700">
        Confirmado em {dataHoraBR(p.avaliado_em)}
        {p.vencimento_novo ? ` · pago até ${dataBR(p.vencimento_novo)}` : ""}
      </span>
    );
  }
  return (
    <span className="mt-1 block text-xs text-red-700">
      Recusado em {dataHoraBR(p.avaliado_em)}
      {p.motivo ? `: ${p.motivo}` : ""}
    </span>
  );
}

function AvisoWhatsapp({ p, ocupado, reenviar }: { p: PagamentoAdmin; ocupado: boolean; reenviar: () => void }) {
  if (p.whatsapp_em) {
    return (
      <span className="mr-1 inline-flex items-center gap-1 text-[11px] text-emerald-700" title={`Enviado em ${dataHoraBR(p.whatsapp_em)}`}>
        <MessageCircle className="h-3.5 w-3.5" aria-hidden /> No seu WhatsApp
      </span>
    );
  }
  if (!p.whatsapp_erro) return null;
  return (
    <span className="mr-1 inline-flex items-center gap-1 text-[11px] text-amber-700" title={p.whatsapp_erro}>
      <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp não enviado ·
      <button type="button" className="font-medium underline" disabled={ocupado} onClick={reenviar}>
        reenviar
      </button>
    </span>
  );
}

/** Mostra o PDF ou a imagem ali mesmo, sem baixar. */
function VisualizadorComprovante({ p }: { p: PagamentoAdmin }) {
  const tipo = tipoVisual(p);
  if (tipo === "pdf") {
    return (
      <iframe
        src={p.url}
        title={`Comprovante de ${p.empresa}`}
        className="h-[65dvh] w-full rounded-lg border border-slate-200 bg-slate-50"
      />
    );
  }
  if (tipo === "imagem") {
    return (
      <div className="flex max-h-[65dvh] justify-center overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.url} alt={`Comprovante de ${p.empresa}`} className="h-auto max-w-full object-contain" />
      </div>
    );
  }
  return (
    <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
      Este formato ({p.nome_arquivo}) não abre aqui. Use <strong>Abrir em outra aba</strong> para baixar.
    </p>
  );
}

function ModalRecusar({ p, aberto, aoFechar }: { p: PagamentoAdmin; aberto: boolean; aoFechar: () => void }) {
  const { erro, ocupado, rodar } = useAcao();
  const [motivo, setMotivo] = useState("");
  const [bloquear, setBloquear] = useState(false);
  const desfaz = Boolean(p.liberado_em);

  return (
    <Modal aberto={aberto} aoFechar={() => !ocupado && aoFechar()} titulo="Recusar comprovante" largura="max-w-md">
      <div className="space-y-4 px-5 py-5">
        <p className="text-sm text-slate-600">
          A empresa <strong>{p.empresa}</strong> vê o motivo na tela de Assinatura e pode enviar outro comprovante.
          {desfaz && p.vencimento_anterior !== undefined && (
            <>
              {" "}
              O vencimento volta para <strong>{p.vencimento_anterior ? dataBR(p.vencimento_anterior) : "sem data"}</strong>.
            </>
          )}
        </p>
        <Campo label="Motivo">
          <input
            className="campo"
            name="motivo_recusa"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: Pix não caiu, valor diferente, comprovante ilegível"
            maxLength={500}
          />
        </Campo>
        <label className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5 text-sm text-red-900">
          <input type="checkbox" className="mt-0.5" checked={bloquear} onChange={(e) => setBloquear(e.target.checked)} />
          <span>
            <strong>Bloquear o acesso da empresa agora</strong>
            <span className="block text-xs text-red-800/80">
              Só a tela de Assinatura abre até você desbloquear ou confirmar um comprovante.
            </span>
          </span>
        </label>
        {erro && <Erro>{erro}</Erro>}
      </div>
      <RodapeModal>
        <Botao variante="secundario" onClick={aoFechar} disabled={ocupado}>
          Cancelar
        </Botao>
        <Botao
          variante="perigo"
          disabled={ocupado}
          onClick={() => rodar(() => chamarAcao(() => adminAvaliarPagamento(p.id, false, motivo, bloquear)), aoFechar)}
        >
          {ocupado && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {bloquear ? "Recusar e bloquear" : "Recusar"}
        </Botao>
      </RodapeModal>
    </Modal>
  );
}

// --- Empresas ----------------------------------------------------------------------

const FILTROS_EMPRESA = {
  todas: "Todas",
  em_dia: "Em dia",
  atencao: "Vencendo ou vencidas",
  bloqueadas: "Bloqueadas",
  sem_cobranca: "Isentas ou sem cobrança",
} as const;
type FiltroEmpresa = keyof typeof FILTROS_EMPRESA;

function passaFiltro(e: EmpresaAssinatura, f: FiltroEmpresa) {
  const est: EstadoAssinatura = e.situacao?.estado ?? "sem_cobranca";
  switch (f) {
    case "em_dia":
      return est === "em_dia";
    case "atencao":
      return est === "vencendo" || est === "tolerancia";
    case "bloqueadas":
      return est === "bloqueada";
    case "sem_cobranca":
      return est === "isenta" || est === "sem_cobranca";
    default:
      return true;
  }
}

function EmpresasAssinatura({
  empresas,
  filtro,
  aoFiltrar,
}: {
  empresas: EmpresaAssinatura[];
  filtro: FiltroEmpresa;
  aoFiltrar: (f: FiltroEmpresa) => void;
}) {
  const [busca, setBusca] = useState("");
  const lista = useMemo(() => {
    const q = normalizar(busca.trim());
    return empresas.filter((e) => passaFiltro(e, filtro) && (!q || normalizar(`${e.nome} ${e.dono ?? ""}`).includes(q)));
  }, [busca, filtro, empresas]);

  return (
    <Secao titulo="Empresas: vencimento e acesso" acoes={<Badge>{empresas.length}</Badge>}>
      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
        <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar empresa ou proprietário" />
        <select
          value={filtro}
          onChange={(e) => aoFiltrar(e.target.value as FiltroEmpresa)}
          className="campo sm:w-56"
          aria-label="Mostrar empresas"
        >
          {(Object.keys(FILTROS_EMPRESA) as FiltroEmpresa[]).map((f) => (
            <option key={f} value={f}>
              {FILTROS_EMPRESA[f]}
            </option>
          ))}
        </select>
      </div>
      {lista.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">Nenhuma empresa encontrada.</p>
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(0,1.6fr)_9rem_minmax(0,1.5fr)_10rem] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid">
            <span>Empresa</span>
            <span>Situação</span>
            <span>Vencimento</span>
            <span className="text-right">Acesso</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {lista.map((e) => (
              <LinhaEmpresa key={e.org_id} e={e} />
            ))}
          </ul>
        </>
      )}
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 sm:px-5">
        Cada comprovante empurra o vencimento 1 mês. Aqui dá para mudar a data à mão, deixar a empresa isenta ou bloquear
        o acesso na hora, por qualquer motivo.
      </p>
    </Secao>
  );
}

function LinhaEmpresa({ e }: { e: EmpresaAssinatura }) {
  const { erro, ocupado, rodar } = useAcao();
  const [vencimento, setVencimento] = useState(e.situacao?.vencimento ?? "");
  const [isenta, setIsenta] = useState(e.isenta);
  const [bloqueando, setBloqueando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const mudou = vencimento !== (e.situacao?.vencimento ?? "") || isenta !== e.isenta;
  const est = ESTADOS_ASSINATURA[e.situacao?.estado ?? "sem_cobranca"];
  const dias = e.situacao?.dias;

  function salvar() {
    const fd = new FormData();
    fd.set("org_id", e.org_id);
    fd.set("vencimento", vencimento);
    if (isenta) fd.set("isenta", "on");
    rodar(() => chamarAcao(() => adminDefinirAssinatura(fd)));
  }

  return (
    <li
      className={cn(
        "grid gap-x-4 gap-y-2 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1.6fr)_9rem_minmax(0,1.5fr)_10rem] lg:items-center",
        e.bloqueio_manual && "bg-red-50/40",
      )}
      data-empresa-assinatura={e.nome}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{e.nome}</p>
        <p className="truncate text-xs text-slate-500">
          {e.dono ?? "sem proprietário"}
          {e.ultimo_pagamento ? ` · último pagamento confirmado ${dataBR(e.ultimo_pagamento)}` : ""}
        </p>
      </div>
      <div className="min-w-0">
        <Badge className={est.classe}>{e.bloqueio_manual ? "Bloqueada por você" : est.label}</Badge>
        {e.bloqueio_manual ? (
          e.bloqueio_motivo && <p className="mt-0.5 truncate text-[11px] text-red-700" title={e.bloqueio_motivo}>{e.bloqueio_motivo}</p>
        ) : (
          typeof dias === "number" &&
          e.situacao?.estado !== "sem_cobranca" &&
          e.situacao?.estado !== "isenta" && (
            <p className="mt-0.5 text-[11px] text-slate-500">
              {dias > 0 ? `vence em ${dias} dia(s)` : dias === 0 ? "vence hoje" : `venceu há ${-dias} dia(s)`}
            </p>
          )
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`venc-${e.org_id}`}>
          Vencimento de {e.nome}
        </label>
        <input
          id={`venc-${e.org_id}`}
          type="date"
          value={vencimento}
          onChange={(ev) => setVencimento(ev.target.value)}
          className="campo campo-compacto w-40"
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={isenta} onChange={(ev) => setIsenta(ev.target.checked)} /> Isenta
        </label>
        {mudou && (
          <Botao tamanho="sm" disabled={ocupado} onClick={salvar}>
            {ocupado ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
            Salvar
          </Botao>
        )}
      </div>
      <div className="flex lg:justify-end">
        {e.bloqueio_manual ? (
          <Botao
            tamanho="sm"
            variante="secundario"
            disabled={ocupado}
            onClick={() => rodar(() => chamarAcao(() => adminBloquearEmpresa(e.org_id, false)))}
          >
            <LockOpen className="h-3.5 w-3.5" /> Desbloquear
          </Botao>
        ) : (
          <Botao tamanho="sm" variante="secundario" disabled={ocupado} onClick={() => setBloqueando(true)} className="text-red-700">
            <Lock className="h-3.5 w-3.5" /> Bloquear acesso
          </Botao>
        )}
      </div>
      {erro && !bloqueando && (
        <div className="lg:col-span-4">
          <Erro>{erro}</Erro>
        </div>
      )}

      <Modal
        aberto={bloqueando}
        aoFechar={() => !ocupado && setBloqueando(false)}
        titulo={`Bloquear ${e.nome}`}
        largura="max-w-md"
      >
        <div className="space-y-4 px-5 py-5">
          <p className="text-sm text-slate-600">
            Na hora, ninguém da empresa abre o sistema: só a tela de Assinatura, com o aviso. Vale por cima do
            vencimento. Para liberar, clique em <strong>Desbloquear</strong> ou confirme um comprovante dela.
          </p>
          <Campo label="Motivo (a empresa vê)" hint="Opcional.">
            <input
              className="campo"
              name="motivo_bloqueio"
              value={motivo}
              onChange={(ev) => setMotivo(ev.target.value)}
              placeholder="Ex.: pagamento não identificado"
              maxLength={300}
            />
          </Campo>
          {erro && <Erro>{erro}</Erro>}
        </div>
        <RodapeModal>
          <Botao variante="secundario" onClick={() => setBloqueando(false)} disabled={ocupado}>
            Cancelar
          </Botao>
          <Botao
            variante="perigo"
            disabled={ocupado}
            onClick={() =>
              rodar(
                () => chamarAcao(() => adminBloquearEmpresa(e.org_id, true, motivo)),
                () => setBloqueando(false),
              )
            }
          >
            {ocupado ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Bloquear agora
          </Botao>
        </RodapeModal>
      </Modal>
    </li>
  );
}

// --- Configuração do Pix ---------------------------------------------------------------

function CartaoCobranca({ dados }: { dados: DadosAssinaturas }) {
  const { erro, ocupado, rodar } = useAcao();
  const [salvo, setSalvo] = useState(false);
  const c = dados.config;

  return (
    <Secao
      titulo="Pix da assinatura"
      acoes={
        dados.ligada ? (
          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Cobrança ligada</Badge>
        ) : (
          <Badge>Desligada</Badge>
        )
      }
    >
      <form
        action={(fd) => {
          setSalvo(false);
          rodar(() => chamarAcao(() => adminSalvarCobranca(fd)), () => setSalvo(true));
        }}
        className="space-y-4 px-4 py-4 sm:px-5"
      >
        <p className="text-sm text-slate-600">
          O sistema monta o <strong>Pix copia e cola</strong> e o <strong>QR code</strong> com estes dados (sem
          banco intermediário). O dinheiro cai direto na sua chave.
        </p>
        <Campo label="Chave Pix" hint="E-mail, CPF, CNPJ, telefone ou chave aleatória.">
          <input name="chave" defaultValue={c.chave ?? ""} className="campo font-mono" spellCheck={false} required />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome de quem recebe" hint="Como aparece no banco (até 25 letras).">
            <input name="nome" defaultValue={c.nome ?? ""} className="campo" maxLength={60} required />
          </Campo>
          <Campo label="Cidade" hint="Até 15 letras.">
            <input name="cidade" defaultValue={c.cidade ?? ""} className="campo" maxLength={40} required />
          </Campo>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Valor mensal (R$)">
            <input
              name="valor"
              inputMode="decimal"
              defaultValue={c.valor ? c.valor.toFixed(2).replace(".", ",") : ""}
              placeholder="99,90"
              className="campo"
              required
            />
          </Campo>
          <Campo label="Tolerância (dias)" hint="Depois do vencimento, antes de bloquear.">
            <input name="tolerancia" type="number" min={0} max={60} defaultValue={c.tolerancia} className="campo" />
          </Campo>
          <Campo label="Dias grátis" hint="Para empresa nova.">
            <input name="dias_teste" type="number" min={0} max={365} defaultValue={c.diasTeste} className="campo" />
          </Campo>
        </div>
        <Campo label="Seu WhatsApp (recebe os comprovantes)" hint="Pode ser o mesmo número conectado ao lado.">
          <input
            name="whatsapp"
            inputMode="tel"
            defaultValue={c.whatsapp ? formatarTelefone(c.whatsapp) : ""}
            placeholder="(11) 98765-4321"
            className="campo"
          />
        </Campo>

        {erro && <Erro>{erro}</Erro>}
        {salvo && !erro && (
          <p className="flex items-center gap-2 text-sm text-emerald-700">
            <CircleCheck className="h-4 w-4" aria-hidden /> Salvo.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Botao type="submit" disabled={ocupado}>
            {ocupado ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Salvar
          </Botao>
          {dados.ligada && (
            <Botao
              type="button"
              variante="fantasma"
              className="ml-auto"
              disabled={ocupado}
              onClick={() => rodar(() => chamarAcao(() => adminDesligarCobranca()))}
            >
              Desligar cobrança
            </Botao>
          )}
        </div>
      </form>

      {dados.exemplo && (
        <div className="border-t border-slate-200 px-4 py-4 sm:px-5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <QrCode className="h-3.5 w-3.5" aria-hidden /> Como o cliente vê (o identificador no fim muda de empresa para empresa)
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <div
              className="w-40 shrink-0 rounded-lg bg-white p-1.5 ring-1 ring-slate-200 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
              aria-label="QR code do Pix"
              role="img"
              dangerouslySetInnerHTML={{ __html: dados.exemplo.qrSvg }}
            />
            <CopiarPix codigo={dados.exemplo.copiaECola} />
          </div>
        </div>
      )}
    </Secao>
  );
}

// --- WhatsApp que envia os avisos ----------------------------------------------------------

function CartaoWhatsappCobranca({ numeroAvisos }: { numeroAvisos: string | null }) {
  const router = useRouter();
  const [estado, setEstado] = useState<StatusWhatsappCobranca | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [telefone, setTelefone] = useState("");
  const [modoCodigo, setModoCodigo] = useState(false);
  const parar = useRef(false);

  const consultar = useCallback(async () => {
    const novo = await chamarAcao(() => adminStatusWhatsappCobranca());
    if (parar.current || !("status" in novo)) return;
    setEstado((atual) => ({
      ...novo,
      qr: novo.erro && !novo.qr ? atual?.qr ?? null : novo.qr,
      codigoPareamento: novo.erro && !novo.codigoPareamento ? atual?.codigoPareamento ?? null : novo.codigoPareamento,
    }));
    setErro(novo.erro ?? null);
  }, []);

  // Estado na abertura (o console não espera o serviço de WhatsApp para abrir).
  useEffect(() => {
    parar.current = false;
    void consultar();
    return () => {
      parar.current = true;
    };
  }, [consultar]);

  const conectando = estado?.status === "conectando";
  useEffect(() => {
    if (!conectando) return;
    const t = setInterval(consultar, 3000);
    return () => clearInterval(t);
  }, [conectando, consultar]);

  async function conectar(comTelefone?: string) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    const r = await chamarAcao(() => adminConectarWhatsappCobranca(comTelefone ?? null));
    if ("status" in r) {
      setEstado(r);
      setErro(r.erro ?? null);
    } else setErro(r.erro);
    setOcupado(false);
  }

  async function executar(acao: () => Promise<Resultado>, sucesso: string) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    const r = await chamarAcao(acao);
    if (r.ok) setAviso(sucesso);
    else setErro(r.erro);
    setOcupado(false);
    await consultar();
    router.refresh();
  }

  const conectado = estado?.status === "conectado";

  return (
    <Secao
      titulo="WhatsApp dos avisos"
      acoes={
        estado === null ? (
          <Badge>…</Badge>
        ) : conectado ? (
          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Conectado</Badge>
        ) : conectando ? (
          <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">Conectando</Badge>
        ) : (
          <Badge>Desconectado</Badge>
        )
      }
    >
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <p className="text-sm text-slate-600">
          Conecte um WhatsApp seu. Quando um cliente anexar o comprovante, o sistema manda a imagem (ou o PDF) com os
          dados da empresa para{" "}
          <strong>{numeroAvisos ? formatarTelefone(numeroAvisos) : "o número cadastrado ao lado"}</strong>.
        </p>

        {conectado && (
          <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <Smartphone className="h-4 w-4 text-slate-400" aria-hidden />
            {estado?.numero ? formatarTelefone(estado.numero) : "Número conectado"}
            {estado?.nomePerfil && <span className="text-slate-500">· {estado.nomePerfil}</span>}
          </p>
        )}

        {conectando && (estado?.codigoPareamento || estado?.qr) && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-3">
            {estado.codigoPareamento ? (
              <p className="font-mono text-2xl font-semibold tracking-widest text-slate-900">{estado.codigoPareamento}</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={estado.qr!} alt="QR code para conectar o WhatsApp" className="h-52 w-52" />
            )}
            <p className="text-center text-xs text-slate-500">
              WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho
              {estado.codigoPareamento ? " → Conectar com número de telefone" : ""}
            </p>
          </div>
        )}

        {!conectado && modoCodigo && (
          <Campo label="Número do WhatsApp que vai conectar">
            <input
              className="campo"
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(11) 98765-4321"
            />
          </Campo>
        )}

        {erro && <Erro>{erro}</Erro>}
        {aviso && (
          <p className="flex items-center gap-2 text-sm text-emerald-700">
            <CircleCheck className="h-4 w-4" aria-hidden /> {aviso}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!conectado && (
            <>
              <Botao type="button" disabled={ocupado} onClick={() => conectar(modoCodigo ? telefone : undefined)}>
                {ocupado ? <LoaderCircle className="h-4 w-4 animate-spin" /> : conectando ? <RefreshCw className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
                {conectando ? "Gerar de novo" : modoCodigo ? "Gerar código" : "Conectar com QR code"}
              </Botao>
              <Botao type="button" variante="fantasma" onClick={() => setModoCodigo((m) => !m)} disabled={ocupado}>
                {modoCodigo ? "Usar QR code" : "Conectar pelo número"}
              </Botao>
            </>
          )}
          {conectado && (
            <>
              <Botao
                type="button"
                variante="secundario"
                disabled={ocupado || !numeroAvisos}
                onClick={() => executar(adminTestarWhatsappCobranca, "Mensagem de teste enviada.")}
              >
                <Send className="h-4 w-4" /> Enviar teste
              </Botao>
              <Botao
                type="button"
                variante="fantasma"
                className="ml-auto"
                disabled={ocupado}
                onClick={() => executar(adminDesconectarWhatsappCobranca, "WhatsApp desconectado.")}
              >
                <Unplug className="h-4 w-4" /> Desconectar
              </Botao>
            </>
          )}
        </div>
      </div>
    </Secao>
  );
}
