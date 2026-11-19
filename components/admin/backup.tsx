"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, DatabaseBackup, FolderTree, LoaderCircle, PlugZap, TriangleAlert } from "lucide-react";
import { BotaoExcluir } from "@/components/confirmar";
import { Badge, Botao, Campo, Secao } from "@/components/ui";
import { chamarAcao } from "@/lib/acao-cliente";
import { adminBackupAgora, adminRemoverBackblaze, adminSalvarBackblaze, adminTestarBackblaze } from "@/lib/actions/backup";
import type { RodadaBackup, SituacaoBackup } from "@/lib/backup";
import { dataHoraBR } from "@/lib/format";
import { tamanho } from "./tipos";

/**
 * Cartão "Backup no Backblaze B2" da aba Integrações do console: credenciais
 * do B2 (os segredos nunca voltam para a tela, só o final), situação do
 * serviço backup da stack, botão "Fazer backup agora" e as últimas rodadas.
 */
export function CartaoBackup({ situacao }: { situacao: SituacaoBackup }) {
  const router = useRouter();
  const { b2, servico, rodadas } = situacao;
  const ativa = rodadas.find((r) => r.estado === "pendente" || r.estado === "executando");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  // Enquanto o backup roda, a tela acompanha sozinha.
  useEffect(() => {
    if (!ativa) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [ativa, router]);

  function rodar(acao: () => Promise<{ ok: boolean; erro?: string }>, sucesso: string) {
    setMsg(null);
    iniciar(async () => {
      const r = await chamarAcao(acao);
      if (r && !r.ok) {
        setMsg({ tipo: "erro", texto: ("erro" in r && r.erro) || "Não deu certo." });
        return;
      }
      setMsg({ tipo: "ok", texto: sucesso });
      router.refresh();
    });
  }

  const dados = () => new FormData(form.current ?? undefined);
  const horario = servico.hora !== null ? `todo dia às ${servico.hora}h30` : "todo dia de madrugada";
  const pasta = b2.pasta;

  return (
    <Secao
      titulo="Backup no Backblaze B2"
      acoes={
        <Botao
          variante="secundario"
          tamanho="sm"
          disabled={ocupado || !!ativa || !servico.online}
          onClick={() => rodar(adminBackupAgora, "Backup pedido. Ele começa em alguns segundos.")}
        >
          <DatabaseBackup className="h-3.5 w-3.5" />
          Fazer backup agora
        </Botao>
      }
    >
      <div className="space-y-5 px-4 py-4 sm:px-5" data-cartao-backup>
        {situacao.erro && (
          <Aviso>Não consegui ler as tabelas do backup: {situacao.erro}. Confira se o migrador da versão nova rodou.</Aviso>
        )}

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Item rotulo="Serviço backup">
            {servico.online ? (
              <span className="inline-flex items-center gap-1.5 text-slate-900" data-backup-servico="online">
                <CircleCheck className="h-4 w-4 text-emerald-600" /> No ar · {horario}
                {servico.dias !== null && ` · ${servico.dias} dias no servidor`}
              </span>
            ) : (
              <span className="text-amber-800" data-backup-servico="offline">
                Sem sinal{servico.vistoEm ? ` desde ${dataHoraBR(servico.vistoEm)}` : ""}
              </span>
            )}
          </Item>
          <Item rotulo="Cópia fora do servidor">
            {servico.b2Origem === "console" || servico.b2Origem === "variaveis" ? (
              <span className="text-slate-900">
                <span className="font-mono">{servico.b2Destino}</span>
                {servico.b2Origem === "variaveis" && <span className="text-slate-500"> (variáveis da stack)</span>}
              </span>
            ) : (
              <span className="text-slate-600">Desligada: só a cópia local no servidor</span>
            )}
          </Item>
        </div>

        {!servico.online && (
          <Aviso>
            O serviço <b>backup</b> não está mandando sinal. Ele precisa estar na stack (infra/stack.yml ou
            infra/portainer.yml, serviço <code>backup</code>) na versão nova para ler as credenciais daqui e atender o
            botão &quot;Fazer backup agora&quot;.
          </Aviso>
        )}

        <form
          ref={form}
          className="space-y-4 rounded-xl border border-slate-200 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            rodar(() => adminSalvarBackblaze(dados()), "Credenciais salvas. O próximo backup já usa elas.");
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">Credenciais do Backblaze</p>
            {b2.configurado ? (
              <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
                Configurado{b2.atualizadoEm ? ` em ${dataHoraBR(b2.atualizadoEm)}` : ""}
              </Badge>
            ) : (
              <Badge>Não configurado</Badge>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="keyID" obrigatorio hint="Backblaze → Application Keys → keyID">
              <input name="key_id" className="campo font-mono" defaultValue={b2.keyId ?? ""} autoComplete="off" required />
            </Campo>
            <Campo
              label="applicationKey"
              obrigatorio={!b2.configurado}
              hint={b2.appKeyFinal ? `Salva (${b2.appKeyFinal}). Em branco mantém a atual.` : "Aparece uma vez só, quando a chave é criada."}
            >
              <input
                name="app_key"
                type="password"
                className="campo font-mono"
                autoComplete="new-password"
                placeholder={b2.appKeyFinal ? "••••••••" : ""}
                required={!b2.configurado}
              />
            </Campo>
            <Campo label="Bucket" obrigatorio hint="Bucket privado.">
              <input name="bucket" className="campo font-mono" defaultValue={b2.bucket ?? ""} autoComplete="off" required />
            </Campo>
            <Campo label="Pasta dentro do bucket" hint="Padrão: manutencao">
              <input name="pasta" className="campo font-mono" defaultValue={b2.pasta} autoComplete="off" />
            </Campo>
            <Campo label="Dias guardados no B2" hint="Dumps do banco e arquivos apagados. Padrão: 30">
              <input name="dias" type="number" min={1} max={3650} className="campo" defaultValue={b2.dias} />
            </Campo>
            <Campo
              label="Senha de criptografia (opcional)"
              hint={
                b2.criptografado
                  ? "Ligada. Em branco mantém a atual. Sem ela o backup não abre: guarde num lugar seguro."
                  : "Criptografa tudo antes de sair do servidor. Guarde: sem ela o backup não abre."
              }
            >
              <input
                name="senha_criptografia"
                type="password"
                className="campo"
                autoComplete="new-password"
                placeholder={b2.criptografado ? "••••••••" : ""}
              />
            </Campo>
          </div>
          {b2.criptografado && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="sem_cripto" className="h-4 w-4 rounded border-slate-300" />
              Desligar a criptografia (os backups novos saem sem senha)
            </label>
          )}

          <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            <FolderTree className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <div className="min-w-0 font-mono leading-5">
              <p className="truncate">{pasta}/banco/AAAA/MM/banco-AAAAMMDD-HHMM.dump</p>
              <p className="truncate">{pasta}/arquivos/… (fotos e anexos, espelhados)</p>
              <p className="truncate">{pasta}/arquivos-removidos/AAAAMMDD-HHMM/…</p>
              {b2.criptografado && (
                <p className="mt-1 font-sans text-slate-500">Com criptografia, os nomes no bucket também ficam embaralhados.</p>
              )}
            </div>
          </div>

          {msg && (
            <p
              className={
                msg.tipo === "erro"
                  ? "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                  : "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              }
              role="status"
            >
              {msg.texto}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Botao type="submit" disabled={ocupado}>
              {ocupado && <LoaderCircle className="h-4 w-4 animate-spin" />}
              Salvar
            </Botao>
            <Botao
              type="button"
              variante="secundario"
              disabled={ocupado}
              onClick={() => {
                if (form.current?.reportValidity()) rodar(() => adminTestarBackblaze(dados()), "Conexão ok: a chave alcança o bucket.");
              }}
            >
              <PlugZap className="h-4 w-4" />
              Testar conexão
            </Botao>
            {b2.configurado && (
              <BotaoExcluir
                acao={adminRemoverBackblaze}
                titulo="Remover as credenciais do Backblaze?"
                mensagem="Os próximos backups ficam só no servidor (ou usam as variáveis B2_* da stack, se houver). O que já está no bucket continua lá."
                rotulo="Remover"
                aoConcluir={() => router.refresh()}
              />
            )}
          </div>
        </form>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-900">Últimos backups</p>
          {rodadas.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum backup registrado ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" data-backup-rodadas>
              {rodadas.map((r) => (
                <Rodada key={r.id} r={r} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Secao>
  );
}

const ESTADOS: Record<RodadaBackup["estado"], { rotulo: string; classe: string }> = {
  pendente: { rotulo: "Na fila", classe: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  executando: { rotulo: "Rodando", classe: "bg-marca-50 text-marca-700 ring-marca-600/20" },
  ok: { rotulo: "Ok", classe: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  erro: { rotulo: "Falhou", classe: "bg-red-50 text-red-700 ring-red-600/20" },
};

function Rodada({ r }: { r: RodadaBackup }) {
  const e = ESTADOS[r.estado];
  const partes = [
    r.bytes_banco !== null && `banco ${tamanho(Number(r.bytes_banco))}`,
    r.bytes_arquivos !== null && `arquivos ${tamanho(Number(r.bytes_arquivos))}`,
  ].filter(Boolean);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm" data-backup-estado={r.estado} data-backup-id={r.id}>
      <Badge className={e.classe}>
        {(r.estado === "pendente" || r.estado === "executando") && <LoaderCircle className="h-3 w-3 animate-spin" />}
        {e.rotulo}
      </Badge>
      <span className="text-slate-900">{dataHoraBR(r.iniciado_em ?? r.criado_em)}</span>
      <span className="text-xs text-slate-500">{r.origem === "agendado" ? "automático" : "manual"}</span>
      {partes.length > 0 && <span className="text-xs text-slate-500">{partes.join(" · ")}</span>}
      {r.b2 === "ok" && <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">B2 ok</Badge>}
      {r.b2 === "falhou" && <Badge className="bg-red-50 text-red-700 ring-red-600/20">B2 falhou</Badge>}
      {r.mensagem && <p className="w-full text-xs text-red-700">{r.mensagem}</p>}
    </li>
  );
}

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{rotulo}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
