"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  CircleCheck,
  ExternalLink,
  FileText,
  LoaderCircle,
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
import { Busca, Erro, normalizar, useAcao } from "@/components/admin/comum";
import { CopiarPix } from "@/components/assinatura/copiar-pix";
import { chamarAcao } from "@/lib/acao-cliente";
import {
  adminAvaliarPagamento,
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
import { ESTADOS_ASSINATURA, SITUACOES_PAGAMENTO } from "@/lib/assinatura";
import { dataBR, dataHoraBR, moeda } from "@/lib/format";
import type { Resultado } from "@/lib/form";
import { formatarTelefone } from "@/lib/telefone";

/**
 * Aba "Assinaturas" do console: comprovantes para aprovar, vencimento de cada
 * empresa, a configuração do Pix e o WhatsApp que recebe os avisos.
 */
export function AssinaturasAdmin({ dados }: { dados: DadosAssinaturas }) {
  const pendentes = dados.pagamentos.filter((p) => p.situacao === "pendente");
  const historico = dados.pagamentos.filter((p) => p.situacao !== "pendente");
  const contagem = (estado: string) => dados.empresas.filter((e) => e.situacao?.estado === estado).length;

  return (
    <div className="space-y-4">
      {!dados.ligada && (
        <p className="card border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          A cobrança está <strong>desligada</strong>: ninguém é bloqueado. Preencha a chave Pix e o valor abaixo para
          ligar.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Resumo rotulo="Comprovantes para aprovar" valor={pendentes.length} destaque={pendentes.length > 0} />
        <Resumo rotulo="Vencem em até 5 dias" valor={contagem("vencendo")} />
        <Resumo rotulo="Vencidas (na tolerância)" valor={contagem("tolerancia")} />
        <Resumo rotulo="Bloqueadas" valor={contagem("bloqueada")} />
      </div>

      <Comprovantes titulo="Comprovantes para aprovar" pagamentos={pendentes} vazio="Nenhum comprovante esperando." />

      <EmpresasAssinatura empresas={dados.empresas} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <CartaoCobranca dados={dados} />
        <CartaoWhatsappCobranca numeroAvisos={dados.config.whatsapp} />
      </div>

      <Comprovantes titulo="Histórico de pagamentos" pagamentos={historico} vazio="Nenhum pagamento avaliado ainda." />
    </div>
  );
}

function Resumo({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className={cn("card p-3.5 sm:p-4", destaque && "border-amber-300 bg-amber-50")}>
      <p className="text-xl font-semibold tabular-nums text-slate-900">{valor}</p>
      <p className="text-xs text-slate-500">{rotulo}</p>
    </div>
  );
}

// --- Comprovantes -----------------------------------------------------------------

function Comprovantes({ titulo, pagamentos, vazio }: { titulo: string; pagamentos: PagamentoAdmin[]; vazio: string }) {
  return (
    <Secao titulo={titulo} acoes={<Badge>{pagamentos.length}</Badge>}>
      {pagamentos.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-500">{vazio}</p>
      ) : (
        <ul className="divide-y divide-slate-100" data-comprovantes={titulo}>
          {pagamentos.map((p) => (
            <LinhaComprovante key={p.id} p={p} />
          ))}
        </ul>
      )}
    </Secao>
  );
}

function LinhaComprovante({ p }: { p: PagamentoAdmin }) {
  const { erro, ocupado, rodar } = useAcao();
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const sit = SITUACOES_PAGAMENTO[p.situacao];

  return (
    <li className="space-y-2 px-4 py-3 sm:px-5" data-comprovante={p.empresa}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">
            {p.empresa} · {moeda(Number(p.valor))}
          </p>
          <p className="text-xs text-slate-500">
            Enviado em {dataHoraBR(p.enviado_em)}
            {p.enviado_por ? ` por ${p.enviado_por}` : ""}
          </p>
          {p.observacao && <p className="mt-1 text-xs text-slate-600">“{p.observacao}”</p>}
          {p.situacao === "aprovado" && p.vencimento_novo && (
            <p className="mt-1 text-xs text-emerald-700">
              Vencimento {p.vencimento_anterior ? `${dataBR(p.vencimento_anterior)} → ` : ""}
              {dataBR(p.vencimento_novo)} · aprovado em {dataHoraBR(p.avaliado_em)}
            </p>
          )}
          {p.situacao === "recusado" && (
            <p className="mt-1 text-xs text-red-700">
              Recusado em {dataHoraBR(p.avaliado_em)}
              {p.motivo ? `: ${p.motivo}` : ""}
            </p>
          )}
        </div>
        <Badge className={sit.classe}>{sit.label}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={p.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden /> Ver comprovante
          <ExternalLink className="h-3 w-3 text-slate-400" aria-hidden />
        </a>
        {p.situacao === "pendente" && (
          <>
            <Botao
              tamanho="sm"
              disabled={ocupado}
              onClick={() => rodar(() => chamarAcao(() => adminAvaliarPagamento(p.id, true)))}
            >
              {ocupado ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Aprovar (+1 mês)
            </Botao>
            <Botao tamanho="sm" variante="secundario" disabled={ocupado} onClick={() => setRecusando(true)}>
              <X className="h-3.5 w-3.5" /> Recusar
            </Botao>
          </>
        )}
        <span className="ml-auto text-[11px] text-slate-500">
          {p.whatsapp_em ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <MessageCircle className="h-3 w-3" aria-hidden /> Aviso no WhatsApp {dataHoraBR(p.whatsapp_em)}
            </span>
          ) : p.whatsapp_erro ? (
            <span className="inline-flex items-center gap-1 text-amber-700" title={p.whatsapp_erro}>
              <MessageCircle className="h-3 w-3" aria-hidden /> WhatsApp não enviado
              <button
                type="button"
                className="underline"
                disabled={ocupado}
                onClick={() => rodar(() => chamarAcao(() => adminReenviarAviso(p.id)))}
              >
                reenviar
              </button>
            </span>
          ) : null}
        </span>
      </div>
      {erro && <Erro>{erro}</Erro>}

      <Modal aberto={recusando} aoFechar={() => !ocupado && setRecusando(false)} titulo="Recusar comprovante" largura="max-w-md">
        <div className="space-y-3 px-5 py-5">
          <p className="text-sm text-slate-600">
            A empresa <strong>{p.empresa}</strong> vê o motivo na tela de Assinatura e pode enviar outro comprovante.
          </p>
          <Campo label="Motivo">
            <input
              className="campo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: valor diferente, comprovante ilegível"
              maxLength={500}
            />
          </Campo>
          {erro && <Erro>{erro}</Erro>}
        </div>
        <RodapeModal>
          <Botao variante="secundario" onClick={() => setRecusando(false)} disabled={ocupado}>
            Cancelar
          </Botao>
          <Botao
            variante="perigo"
            disabled={ocupado}
            onClick={() =>
              rodar(
                () => chamarAcao(() => adminAvaliarPagamento(p.id, false, motivo)),
                () => setRecusando(false),
              )
            }
          >
            {ocupado && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Recusar
          </Botao>
        </RodapeModal>
      </Modal>
    </li>
  );
}

// --- Empresas ----------------------------------------------------------------------

function EmpresasAssinatura({ empresas }: { empresas: EmpresaAssinatura[] }) {
  const [busca, setBusca] = useState("");
  const lista = useMemo(() => {
    const q = normalizar(busca.trim());
    return empresas.filter((e) => !q || normalizar(`${e.nome} ${e.dono ?? ""}`).includes(q));
  }, [busca, empresas]);

  return (
    <Secao titulo="Vencimento de cada empresa" acoes={<Badge>{empresas.length}</Badge>}>
      <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
        <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar empresa ou proprietário" />
      </div>
      {lista.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-500">Nenhuma empresa encontrada.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {lista.map((e) => (
            <LinhaEmpresa key={e.org_id} e={e} />
          ))}
        </ul>
      )}
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 sm:px-5">
        Aprovar um comprovante empurra o vencimento 1 mês. Aqui dá para mudar a data à mão ou deixar a empresa isenta.
      </p>
    </Secao>
  );
}

function LinhaEmpresa({ e }: { e: EmpresaAssinatura }) {
  const { erro, ocupado, rodar } = useAcao();
  const [vencimento, setVencimento] = useState(e.situacao?.vencimento ?? "");
  const [isenta, setIsenta] = useState(e.isenta);
  const mudou = vencimento !== (e.situacao?.vencimento ?? "") || isenta !== e.isenta;
  const est = ESTADOS_ASSINATURA[e.situacao?.estado ?? "sem_cobranca"];

  function salvar() {
    const fd = new FormData();
    fd.set("org_id", e.org_id);
    fd.set("vencimento", vencimento);
    if (isenta) fd.set("isenta", "on");
    rodar(() => chamarAcao(() => adminDefinirAssinatura(fd)));
  }

  return (
    <li className="grid gap-2 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1.6fr)_8rem_minmax(0,1.6fr)] lg:items-center" data-empresa-assinatura={e.nome}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{e.nome}</p>
        <p className="truncate text-xs text-slate-500">
          {e.dono ?? "sem proprietário"}
          {e.ultimo_pagamento ? ` · último pagamento ${dataBR(e.ultimo_pagamento)}` : ""}
        </p>
      </div>
      <div>
        <Badge className={est.classe}>{est.label}</Badge>
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
        <Botao tamanho="sm" variante={mudou ? "primario" : "secundario"} disabled={!mudou || ocupado} onClick={salvar}>
          {ocupado ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
          Salvar
        </Botao>
      </div>
      {erro && (
        <div className="lg:col-span-3">
          <Erro>{erro}</Erro>
        </div>
      )}
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
