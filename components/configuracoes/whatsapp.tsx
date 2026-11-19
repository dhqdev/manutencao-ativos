"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  KeyRound,
  LoaderCircle,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  Smartphone,
  TriangleAlert,
  Unplug,
  X,
} from "lucide-react";
import { Badge, Botao, Campo } from "@/components/ui";
import {
  consultarStatus,
  encerrarConexao,
  enviarResumoTeste,
  iniciarConexao,
  salvarPreferenciasWhatsapp,
  type StatusWhatsapp,
} from "@/lib/actions/whatsapp";
import { MAX_DESTINATARIOS, formatarTelefone } from "@/lib/telefone";
import { dataHoraBR } from "@/lib/format";

export type ConexaoAtual = {
  status: "desconectado" | "conectando" | "conectado";
  numero: string | null;
  nome_perfil: string | null;
  notificar: boolean;
  incluir_atrasadas: boolean;
  dias_antecedencia: number;
  horario_envio?: number | null;
  destinatarios?: string[] | null;
  ultimo_envio: string | null;
} | null;

const PASSOS_QR = [
  "Abra o WhatsApp no celular",
  "Toque em Configurações → Aparelhos conectados",
  "Toque em Conectar um aparelho",
  "Aponte a câmera para este código",
];

const PASSOS_CODIGO = [
  "Abra o WhatsApp no celular do número informado",
  "Toque em Configurações → Aparelhos conectados",
  "Toque em Conectar um aparelho",
  "Escolha Conectar com número de telefone e digite o código",
];

function Passos({ itens }: { itens: string[] }) {
  return (
    <ol className="mt-3 space-y-2 text-sm text-slate-600">
      {itens.map((passo, i) => (
        <li key={passo} className="flex gap-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
            {i + 1}
          </span>
          {passo}
        </li>
      ))}
    </ol>
  );
}

export function PainelWhatsapp({ conexao }: { conexao: ConexaoAtual }) {
  const router = useRouter();

  const [estado, setEstado] = useState<StatusWhatsapp>({
    status: conexao?.status ?? "desconectado",
    qr: null,
    codigoPareamento: null,
    numero: conexao?.numero ?? null,
    nomePerfil: conexao?.nome_perfil ?? null,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  // Conectar pelo número (sem câmera): útil quando o sistema está aberto no
  // próprio celular e não há como escanear a tela.
  const [modoCodigo, setModoCodigo] = useState(false);
  const [telefone, setTelefone] = useState("");

  const [destinatarios, setDestinatarios] = useState<string[]>(
    (conexao?.destinatarios ?? []).map(formatarTelefone),
  );

  const conectando = estado.status === "conectando";
  const conectado = estado.status === "conectado";
  const pararRef = useRef(false);

  // Enquanto o QR está na tela, pergunta ao servidor se já escanearam.
  const verificar = useCallback(async () => {
    const novo = await consultarStatus();
    if (pararRef.current) return;

    setEstado((atual) => ({
      ...novo,
      // Uma consulta que falhou (servidor oscilando) não apaga o QR da tela.
      qr: novo.erro && !novo.qr ? atual.qr : novo.qr,
      codigoPareamento: novo.erro && !novo.codigoPareamento ? atual.codigoPareamento : novo.codigoPareamento,
    }));
    setErro(novo.erro ?? null);
    if (novo.status === "desconectado" && novo.expirado) {
      setAviso("O código expirou sem ser lido. Gere um novo para tentar de novo.");
    }
    if (novo.status === "conectado") {
      setAviso("WhatsApp conectado. Agora cadastre quem recebe o resumo.");
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    if (!conectando) return;
    pararRef.current = false;
    const timer = setInterval(verificar, 3000);
    return () => {
      pararRef.current = true;
      clearInterval(timer);
    };
  }, [conectando, verificar]);

  function conectar(comTelefone?: string) {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const novo = await iniciarConexao(comTelefone ?? null);
      setEstado(novo);
      if (novo.erro) setErro(novo.erro);
      if (novo.status === "conectado") router.refresh();
    });
  }

  function desconectar() {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await encerrarConexao();
      if (!r.ok) setErro(r.erro);
      else {
        setEstado({ status: "desconectado", qr: null, codigoPareamento: null, numero: null, nomePerfil: null });
        setModoCodigo(false);
        router.refresh();
      }
    });
  }

  function testar() {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await enviarResumoTeste();
      if (!r.ok) setErro(r.erro);
      else {
        setAviso(
          `Resumo enviado para ${r.enviados} número(s).` +
            (r.falhas.length ? ` Não chegou em: ${r.falhas.join(" · ")}` : ""),
        );
      }
    });
  }

  function salvar(fd: FormData) {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await salvarPreferenciasWhatsapp(fd);
      if (!r.ok) setErro(r.erro);
      else {
        setAviso("Preferências salvas.");
        router.refresh();
      }
    });
  }

  const reconectando = conectando && !estado.qr && !estado.codigoPareamento;

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Smartphone className="h-4 w-4 text-slate-400" />
          Notificações por WhatsApp
        </h2>
        {conectado ? (
          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Conectado
          </Badge>
        ) : conectando ? (
          <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">
            {reconectando ? "Reconectando" : "Aguardando leitura"}
          </Badge>
        ) : (
          <Badge>Desconectado</Badge>
        )}
      </header>

      <div className="space-y-4 px-4 py-5 sm:px-5">
        {erro && (
          <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {erro}
          </p>
        )}
        {aviso && (
          <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            {aviso}
          </p>
        )}

        {/* --- Desconectado --- */}
        {!conectado && !conectando && (
          <>
            <p className="text-sm text-slate-600">
              Conecte o WhatsApp da empresa. Todo dia, no horário escolhido, ele envia o resumo das
              manutenções atrasadas e das que estão para vencer para os números que você cadastrar.
            </p>

            {!modoCodigo ? (
              <div className="flex flex-wrap gap-2">
                <Botao onClick={() => conectar()} disabled={ocupado}>
                  {ocupado ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <QrCode className="h-4 w-4" />
                  )}
                  Conectar com QR code
                </Botao>
                <Botao variante="secundario" onClick={() => setModoCodigo(true)} disabled={ocupado}>
                  <KeyRound className="h-4 w-4" />
                  Conectar pelo número
                </Botao>
              </div>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  conectar(telefone);
                }}
              >
                <Campo
                  label="Número do WhatsApp que vai enviar"
                  hint="Com DDD. Você recebe um código de 8 letras para digitar no celular — não precisa de câmera."
                >
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(11) 98765-4321"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    className="campo max-w-xs"
                    required
                  />
                </Campo>
                <div className="flex flex-wrap gap-2">
                  <Botao type="submit" disabled={ocupado || !telefone.trim()}>
                    {ocupado ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                    Gerar código
                  </Botao>
                  <Botao variante="fantasma" type="button" onClick={() => setModoCodigo(false)} disabled={ocupado}>
                    Usar QR code
                  </Botao>
                </div>
              </form>
            )}
          </>
        )}

        {/* --- Aguardando leitura / reconectando --- */}
        {conectando && (
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <div className="shrink-0 rounded-xl border border-slate-200 bg-superficie p-3">
              {estado.codigoPareamento ? (
                <div className="flex h-56 w-56 flex-col items-center justify-center gap-2 text-center">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Código
                  </span>
                  <span className="select-all font-mono text-3xl font-semibold tracking-[0.15em] text-slate-900">
                    {estado.codigoPareamento}
                  </span>
                </div>
              ) : estado.qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={estado.qr}
                  alt="QR Code para conectar o WhatsApp"
                  className="h-56 w-56 bg-white"
                  width={224}
                  height={224}
                />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center">
                  <LoaderCircle className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              {reconectando ? (
                <>
                  <p className="text-sm font-medium text-slate-900">Reconectando ao WhatsApp…</p>
                  <p className="mt-2 text-sm text-slate-600">
                    O servidor está religando a sessão (acontece depois de uma atualização ou queda de
                    internet). Não precisa ler o QR de novo.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-900">
                    {estado.codigoPareamento ? "Digite o código no celular" : "Escaneie com o WhatsApp"}
                  </p>
                  <Passos itens={estado.codigoPareamento ? PASSOS_CODIGO : PASSOS_QR} />
                  <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    {estado.codigoPareamento
                      ? "Assim que você confirmar no celular, a tela atualiza."
                      : "O código se renova sozinho. Assim que você escanear, a tela atualiza."}
                  </p>
                </>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {!reconectando && (
                  <Botao
                    variante="secundario"
                    tamanho="sm"
                    onClick={() => conectar(estado.codigoPareamento ? telefone : undefined)}
                    disabled={ocupado}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Atualizar
                  </Botao>
                )}
                <Botao variante="fantasma" tamanho="sm" onClick={desconectar} disabled={ocupado}>
                  Cancelar
                </Botao>
              </div>
            </div>
          </div>
        )}

        {/* --- Conectado --- */}
        {conectado && (
          <>
            <div className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Smartphone className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {estado.nomePerfil || "WhatsApp conectado"}
                </p>
                <p className="truncate text-sm text-slate-500">
                  Envia de {formatarTelefone(estado.numero)}
                </p>
              </div>
              <div className="flex gap-2">
                <Botao variante="secundario" tamanho="sm" onClick={testar} disabled={ocupado}>
                  {ocupado ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Enviar teste
                </Botao>
                <Botao variante="secundario" tamanho="sm" onClick={desconectar} disabled={ocupado}>
                  <Unplug className="h-4 w-4" />
                  Desconectar
                </Botao>
              </div>
            </div>

            <form action={salvar} className="space-y-4">
              {/* Quem recebe */}
              <div className="rounded-lg border border-slate-200 px-3.5 py-3">
                <p className="text-sm font-medium text-slate-800">Quem recebe o resumo</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  Números com DDD. Se a lista ficar vazia, o resumo vai para o próprio número conectado
                  — e aí o celular normalmente não avisa.
                </p>

                <div className="mt-3 space-y-2">
                  {destinatarios.map((numero, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        name="destinatarios"
                        type="tel"
                        inputMode="tel"
                        placeholder="(11) 98765-4321"
                        value={numero}
                        onChange={(e) =>
                          setDestinatarios((lista) =>
                            lista.map((n, j) => (j === i ? e.target.value : n)),
                          )
                        }
                        className="campo max-w-xs"
                      />
                      <Botao
                        type="button"
                        variante="fantasma"
                        tamanho="icone"
                        aria-label="Remover número"
                        onClick={() => setDestinatarios((lista) => lista.filter((_, j) => j !== i))}
                      >
                        <X className="h-4 w-4" />
                      </Botao>
                    </div>
                  ))}

                  {destinatarios.length < MAX_DESTINATARIOS && (
                    <Botao
                      type="button"
                      variante="sutil"
                      tamanho="sm"
                      onClick={() => setDestinatarios((lista) => [...lista, ""])}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar número
                    </Botao>
                  )}
                </div>
              </div>

              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3.5 py-3">
                <input
                  type="checkbox"
                  name="notificar"
                  defaultChecked={conexao?.notificar ?? true}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-800">Receber resumo diário</span>
                  <span className="mt-0.5 block text-slate-500">
                    Enviado no horário escolhido abaixo. Se não houver nada pendente, nada é enviado.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3.5 py-3">
                <input
                  type="checkbox"
                  name="incluir_atrasadas"
                  defaultChecked={conexao?.incluir_atrasadas ?? true}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-800">Incluir manutenções atrasadas</span>
                  <span className="mt-0.5 block text-slate-500">
                    Cobra as pendências até que sejam registradas como feitas.
                  </span>
                </span>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo label="Horário do envio" hint="Horário de Brasília.">
                  <select
                    name="horario_envio"
                    defaultValue={String(conexao?.horario_envio ?? 8)}
                    className="campo"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo
                  label="Avisar com quantos dias de antecedência"
                  hint="Vale para as manutenções programadas por data."
                >
                  <input
                    name="dias_antecedencia"
                    type="number"
                    min={0}
                    max={60}
                    defaultValue={conexao?.dias_antecedencia ?? 3}
                    className="campo"
                  />
                </Campo>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-xs text-slate-500">
                  {conexao?.ultimo_envio
                    ? `Último envio: ${dataHoraBR(conexao.ultimo_envio)}`
                    : "Nenhum resumo enviado ainda."}
                </p>
                <Botao type="submit" tamanho="sm" disabled={ocupado}>
                  {ocupado && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  Salvar preferências
                </Botao>
              </div>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
