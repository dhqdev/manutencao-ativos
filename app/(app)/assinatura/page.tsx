import { CircleCheck, Lock } from "lucide-react";
import { CopiarPix } from "@/components/assinatura/copiar-pix";
import { EnviarComprovante } from "@/components/assinatura/enviar-comprovante";
import { FormularioSalvar } from "@/components/configuracoes/formulario-salvar";
import { Badge, Cabecalho, Campo, Secao, cn } from "@/components/ui";
import { trocarEmpresa } from "@/lib/actions/configuracoes";
import { urlsAssinadas } from "@/lib/arquivos";
import { ESTADOS_ASSINATURA, SITUACOES_PAGAMENTO, avisoAssinatura, type PagamentoAssinatura } from "@/lib/assinatura";
import { pixDaEmpresa } from "@/lib/assinatura-servidor";
import { createClient } from "@/lib/db/server";
import { dataBR, dataHoraBR, moeda } from "@/lib/format";
import { podeGerenciar } from "@/lib/permissoes";
import { getContextoSemBloqueio } from "@/lib/session";

export const metadata = { title: "Assinatura · Gestão de Manutenção" };

/**
 * Assinatura da empresa: situação, Pix (QR + copia e cola), envio do
 * comprovante e o histórico. É a única tela que abre com a assinatura
 * bloqueada (usa o contexto sem bloqueio), para dar para pagar.
 */
export default async function AssinaturaPage() {
  const { orgId, papel, assinatura, organizacao, empresas } = await getContextoSemBloqueio();
  const db = await createClient();

  const [pix, { data: pagamentos }] = await Promise.all([
    pixDaEmpresa(orgId).catch((e) => {
      console.error("[assinatura] Pix", e);
      return null;
    }),
    db
      .from("assinatura_pagamentos")
      .select("id, org_id, valor, comprovante, nome_arquivo, observacao, situacao, enviado_em, avaliado_em, motivo, vencimento_anterior, vencimento_novo")
      .eq("org_id", orgId)
      .order("enviado_em", { ascending: false })
      .limit(50),
  ]);
  const lista = (pagamentos ?? []) as PagamentoAssinatura[];
  const links = urlsAssinadas(lista.map((p) => p.comprovante));
  const estado = assinatura?.estado ?? "sem_cobranca";
  const cobrando = estado !== "sem_cobranca" && estado !== "isenta";
  const aviso = avisoAssinatura(assinatura);
  const bloqueada = estado === "bloqueada";
  const gestor = podeGerenciar(papel);

  return (
    <>
      <Cabecalho
        titulo="Assinatura"
        descricao={`Mensalidade do sistema para ${organizacao.nome}. Pague pelo Pix e anexe o comprovante: assim que ele for aprovado, o próximo mês fica liberado.`}
      />

      {bloqueada && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-bloqueio>
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <strong>{aviso}</strong> As outras telas voltam a abrir assim que o pagamento for confirmado.
          </p>
        </div>
      )}

      {bloqueada && empresas.length > 1 && (
        <div className="mb-4">
          <Secao titulo="Usar outra empresa">
            <FormularioSalvar acao={trocarEmpresa} rotulo="Trocar empresa" mensagemSucesso="Empresa alterada.">
              <Campo label="Você participa de mais de uma empresa">
                <select name="org_id" defaultValue={orgId} className="campo">
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </FormularioSalvar>
          </Secao>
        </div>
      )}

      {!cobrando ? (
        <p className="card flex items-center gap-2 px-5 py-4 text-sm text-slate-700">
          <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden />
          {estado === "isenta" ? "Esta empresa é isenta da assinatura." : "Nenhuma cobrança em aberto para esta empresa."}
        </p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[22rem_1fr]">
          <Secao
            titulo="Situação"
            acoes={<Badge className={ESTADOS_ASSINATURA[estado].classe}>{ESTADOS_ASSINATURA[estado].label}</Badge>}
          >
            <dl className="grid grid-cols-2 gap-3 px-4 py-4 text-sm sm:px-5">
              <div>
                <dt className="text-xs text-slate-500">Vencimento</dt>
                <dd className="font-semibold text-slate-900" data-vencimento>{dataBR(assinatura?.vencimento)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Valor mensal</dt>
                <dd className="font-semibold text-slate-900">{moeda(assinatura?.valor ?? 0)}</dd>
              </div>
            </dl>
            {pix ? (
              <div className="space-y-3 border-t border-slate-200 px-4 py-4 sm:px-5">
                <div
                  className="mx-auto w-52 rounded-xl bg-white p-2 ring-1 ring-slate-200 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
                  role="img"
                  aria-label="QR code do Pix da assinatura"
                  data-qr-pix
                  dangerouslySetInnerHTML={{ __html: pix.qrSvg }}
                />
                <p className="text-center text-xs text-slate-500">
                  Recebedor: <strong className="text-slate-700">{pix.nome}</strong>
                </p>
                <CopiarPix codigo={pix.copiaECola} />
              </div>
            ) : (
              <p className="border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
                O Pix ainda não foi configurado pelo administrador do sistema.
              </p>
            )}
          </Secao>

          <div className="space-y-4">
            {gestor ? (
              <EnviarComprovante pendente={Boolean(assinatura?.pendente)} />
            ) : (
              <p className="card px-5 py-4 text-sm text-slate-600">
                Quem envia o comprovante é o proprietário ou um gestor da empresa.
              </p>
            )}

            <Secao titulo="Histórico de pagamentos" acoes={<Badge>{lista.length}</Badge>}>
              {lista.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-slate-500">Nenhum comprovante enviado ainda.</p>
              ) : (
                <ul className="divide-y divide-slate-100" data-historico-assinatura>
                  {lista.map((p, i) => (
                    <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 sm:px-5">
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-slate-900">
                          {moeda(Number(p.valor))} · enviado em {dataHoraBR(p.enviado_em)}
                        </p>
                        {p.situacao === "aprovado" && p.vencimento_novo && (
                          <p className="text-xs text-emerald-700">Pago até {dataBR(p.vencimento_novo)}</p>
                        )}
                        {p.situacao === "recusado" && (
                          <p className="text-xs text-red-700">Recusado{p.motivo ? `: ${p.motivo}` : ""}. Envie outro comprovante.</p>
                        )}
                        {links[i] && (
                          <a href={links[i]!} target="_blank" rel="noreferrer" className="text-xs text-marca-700 underline">
                            {p.nome_arquivo}
                          </a>
                        )}
                      </div>
                      <Badge className={cn(SITUACOES_PAGAMENTO[p.situacao].classe)}>{SITUACOES_PAGAMENTO[p.situacao].label}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>
          </div>
        </div>
      )}
    </>
  );
}
