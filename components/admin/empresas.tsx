"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, LoaderCircle, Pencil, Plus, UserPlus, Users } from "lucide-react";
import { BotaoExcluir } from "@/components/confirmar";
import { Badge, Botao, Campo, cn } from "@/components/ui";
import {
  adminAdicionarMembro,
  adminAlterarPapel,
  adminCriarEmpresa,
  adminEditarEmpresa,
  adminExcluirEmpresa,
  adminRemoverMembro,
} from "@/lib/actions/admin";
import type { PapelMembro } from "@/lib/types";
import { Busca, Erro, FormModal, normalizar, useAcao } from "./comum";
import { LISTA_PAPEIS, PAPEIS, type EmpresaAdmin, type MembroAdmin } from "./tipos";

// --- Lista ----------------------------------------------------------------------

export function ListaEmpresas({ empresas }: { empresas: EmpresaAdmin[] }) {
  const [busca, setBusca] = useState("");
  const [nova, setNova] = useState(false);

  const filtradas = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return empresas;
    return empresas.filter((e) =>
      normalizar([e.nome, e.cnpj, ...e.membros.map((m) => `${m.nome ?? ""} ${m.email}`)].join(" ")).includes(q),
    );
  }, [busca, empresas]);

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
        <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar por empresa, CNPJ ou pessoa" />
        <Botao onClick={() => setNova(true)}>
          <Plus className="h-4 w-4" />
          Nova empresa
        </Botao>
      </header>

      {filtradas.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhuma empresa encontrada.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {filtradas.map((e) => {
            const dono = e.membros.find((m) => m.papel === "proprietario");
            return (
              <li key={e.id}>
                <Link
                  href={`/admin/empresas/${e.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 sm:px-5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                      <span className="truncate">{e.nome}</span>
                      {!dono && (
                        <Badge className="bg-amber-50 text-amber-800 ring-amber-600/20">sem proprietário</Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {dono ? `${dono.nome ?? dono.email} · ` : ""}
                      {e.membros.length} pessoa(s) · {e.ativos} ativo(s) · {e.manutencoes} manutenção(ões)
                      {e.whatsapp === "conectado" ? " · WhatsApp conectado" : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <FormModal
        aberto={nova}
        aoFechar={() => setNova(false)}
        titulo="Nova empresa"
        descricao="Nasce com as categorias padrão."
        rotulo="Criar empresa"
        acao={adminCriarEmpresa}
      >
        <Campo label="Nome da empresa" obrigatorio>
          <input name="nome" required className="campo" />
        </Campo>
        <Campo label="E-mail do proprietário" hint="Opcional. A pessoa precisa já ter login (tela Usuários).">
          <input name="dono" type="email" className="campo" />
        </Campo>
      </FormModal>
    </section>
  );
}

// --- Detalhe --------------------------------------------------------------------

export function AcoesEmpresa({ empresa: e }: { empresa: EmpresaAdmin }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);

  return (
    <>
      <Botao variante="secundario" onClick={() => setEditando(true)}>
        <Pencil className="h-4 w-4" />
        Editar dados
      </Botao>
      <BotaoExcluir
        className="h-10 px-4 text-sm"
        acao={adminExcluirEmpresa.bind(null, e.id)}
        titulo="Excluir empresa"
        rotulo="Excluir empresa"
        mensagem={`"${e.nome}" será apagada com todos os ativos, manutenções, anexos, pneus e a conexão de WhatsApp. Os logins das pessoas continuam existindo. Não dá para desfazer.`}
        aoConcluir={() => router.replace("/admin/empresas")}
      />

      <FormModal
        aberto={editando}
        aoFechar={() => setEditando(false)}
        titulo="Dados da empresa"
        rotulo="Salvar"
        acao={adminEditarEmpresa}
      >
        <input type="hidden" name="id" value={e.id} />
        <Campo label="Nome" obrigatorio>
          <input name="nome" required defaultValue={e.nome} className="campo" />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="CNPJ">
            <input name="cnpj" defaultValue={e.cnpj ?? ""} className="campo" />
          </Campo>
          <Campo label="Telefone">
            <input name="telefone" defaultValue={e.telefone ?? ""} className="campo" />
          </Campo>
        </div>
      </FormModal>
    </>
  );
}

export function EquipeEmpresa({ empresa: e }: { empresa: EmpresaAdmin }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 sm:px-5">
        <Users className="h-4 w-4 text-slate-400" />
        Equipe
        <span className="text-xs font-normal text-slate-500">{e.membros.length} pessoa(s)</span>
      </header>
      <ul className="divide-y divide-slate-100">
        {e.membros.length === 0 && (
          <li className="px-4 py-4 text-sm text-slate-500 sm:px-5">
            Ninguém na equipe. Adicione alguém abaixo e escolha Proprietário.
          </li>
        )}
        {e.membros.map((m) => (
          <LinhaMembro key={m.user_id} orgId={e.id} membro={m} />
        ))}
      </ul>
      <AdicionarMembro orgId={e.id} />
    </section>
  );
}

function LinhaMembro({ orgId, membro: m }: { orgId: string; membro: MembroAdmin }) {
  const { erro, ocupado, rodar } = useAcao();

  return (
    <li className="px-4 py-2.5 sm:px-5" data-membro={m.email}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-900">
            {m.nome ?? m.email}
            {m.bloqueado && <span className="ml-1 text-xs text-red-600">bloqueado</span>}
          </p>
          <p className="truncate text-xs text-slate-500">{m.email}</p>
        </div>
        {ocupado && <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" />}
        <select
          value={m.papel}
          onChange={(ev) => rodar(() => adminAlterarPapel(orgId, m.user_id, ev.target.value as PapelMembro))}
          disabled={ocupado}
          className={cn("campo h-8 w-auto py-0 text-xs")}
          aria-label={`Papel de ${m.nome ?? m.email}`}
        >
          {LISTA_PAPEIS.map((p) => (
            <option key={p} value={p}>
              {PAPEIS[p].label}
            </option>
          ))}
        </select>
        <BotaoExcluir
          compacto
          acao={adminRemoverMembro.bind(null, orgId, m.user_id)}
          titulo="Tirar da empresa"
          mensagem={`${m.nome ?? m.email} deixa de ver os dados desta empresa. O login continua existindo.${m.papel === "proprietario" ? " Como é o proprietário, a próxima pessoa da equipe assume." : ""}`}
        />
      </div>
      {erro && <p className="mt-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{erro}</p>}
    </li>
  );
}

function AdicionarMembro({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [chave, setChave] = useState(0);
  const [enviando, iniciar] = useTransition();

  function enviar(fd: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await adminAdicionarMembro(fd);
      if (!r.ok) setErro(r.erro);
      else {
        setChave((k) => k + 1); // formulário limpo
        router.refresh();
      }
    });
  }

  return (
    <form key={chave} action={enviar} className="space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
      {erro && <Erro>{erro}</Erro>}
      <input type="hidden" name="org_id" value={orgId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="email"
          type="email"
          required
          placeholder="E-mail de quem já tem login"
          aria-label="E-mail de quem já tem login"
          className="campo min-w-0 flex-1"
        />
        <select name="papel" defaultValue="tecnico" className="campo sm:w-40" aria-label="Papel">
          {LISTA_PAPEIS.map((p) => (
            <option key={p} value={p}>
              {PAPEIS[p].label}
            </option>
          ))}
        </select>
        <Botao type="submit" variante="secundario" disabled={enviando}>
          {enviando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Adicionar
        </Botao>
      </div>
    </form>
  );
}

