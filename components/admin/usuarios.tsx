"use client";

import { useMemo, useState } from "react";
import { Ban, KeyRound, LoaderCircle, LogOut, Pencil, ShieldCheck, UserPlus } from "lucide-react";
import { BotaoExcluir } from "@/components/confirmar";
import { JanelaCredenciais } from "@/components/configuracoes/equipe";
import { Badge, Botao, Campo, cn } from "@/components/ui";
import {
  adminBloquearUsuario,
  adminCriarUsuario,
  adminEditarUsuario,
  adminEncerrarSessoes,
  adminExcluirUsuario,
  adminRedefinirSenha,
} from "@/lib/actions/admin";
import { dataBR, dataHoraBR, iniciais } from "@/lib/format";
import { BotaoIcone, Busca, FormModal, normalizar, useAcao, type Credenciais } from "./comum";
import {
  FILTROS_USUARIO,
  LISTA_PAPEIS,
  PAPEIS,
  passaNoFiltro,
  type EmpresaAdmin,
  type FiltroUsuario,
  type UsuarioAdmin,
} from "./tipos";

export function ListaUsuarios({
  usuarios,
  empresas,
  eu,
  urlSistema,
  filtroInicial = "todos",
  agora,
}: {
  usuarios: UsuarioAdmin[];
  empresas: EmpresaAdmin[];
  eu: string;
  urlSistema: string;
  filtroInicial?: FiltroUsuario;
  /** Instante do servidor: o filtro "7 dias" sai igual no servidor e no navegador. */
  agora: number;
}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroUsuario>(filtroInicial);
  const [novo, setNovo] = useState(false);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);

  const contagem = useMemo(() => {
    const c = {} as Record<FiltroUsuario, number>;
    for (const f of Object.keys(FILTROS_USUARIO) as FiltroUsuario[]) {
      c[f] = usuarios.filter((u) => passaNoFiltro(u, f, agora)).length;
    }
    return c;
  }, [usuarios, agora]);

  const filtrados = useMemo(() => {
    const q = normalizar(busca.trim());
    return usuarios.filter(
      (u) =>
        passaNoFiltro(u, filtro, agora) &&
        (!q || normalizar([u.nome, u.email, u.telefone, ...u.empresas.map((e) => e.nome)].join(" ")).includes(q)),
    );
  }, [busca, filtro, usuarios, agora]);

  return (
    <>
      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {(Object.keys(FILTROS_USUARIO) as FiltroUsuario[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            aria-pressed={filtro === f}
            className={cn(
              "pressionavel flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
              filtro === f
                ? "border-slate-900 bg-slate-900 text-slate-50"
                : "border-slate-200 bg-superficie text-slate-600 hover:border-slate-300 hover:text-slate-900",
            )}
          >
            {FILTROS_USUARIO[f]}
            <span className={cn("text-[11px] tabular-nums", filtro === f ? "text-slate-300" : "text-slate-400")}>
              {contagem[f]}
            </span>
          </button>
        ))}
      </div>

      <section className="card overflow-hidden">
        <header className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar por nome, e-mail ou empresa" />
          <Botao onClick={() => setNovo(true)}>
            <UserPlus className="h-4 w-4" />
            Novo usuário
          </Botao>
        </header>

        {filtrados.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhum usuário encontrado.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtrados.map((u) => (
              <LinhaUsuario key={u.id} usuario={u} eu={u.id === eu} aoCredenciais={setCredenciais} />
            ))}
          </ul>
        )}
      </section>

      <NovoUsuario aberto={novo} aoFechar={() => setNovo(false)} empresas={empresas} aoCriar={setCredenciais} />
      <JanelaCredenciais credenciais={credenciais} urlSistema={urlSistema} aoFechar={() => setCredenciais(null)} />
    </>
  );
}

function LinhaUsuario({
  usuario: u,
  eu,
  aoCredenciais,
}: {
  usuario: UsuarioAdmin;
  eu: boolean;
  aoCredenciais: (c: Credenciais) => void;
}) {
  const { erro, ocupado, rodar } = useAcao();
  const [editando, setEditando] = useState(false);
  const [senha, setSenha] = useState(false);
  const protegido = u.superadmin || eu;

  return (
    <li className="px-4 py-3 sm:px-5" data-usuario={u.email}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            u.bloqueado ? "bg-red-100 text-red-700" : "bg-gradient-to-br from-slate-200 to-slate-300 text-slate-700",
          )}
        >
          {iniciais(u.nome ?? u.email)}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-900">
            <span className="truncate">{u.nome ?? u.email}</span>
            {eu && <span className="text-xs font-normal text-slate-400">(você)</span>}
            {u.superadmin && (
              <Badge className="bg-amber-50 text-amber-800 ring-amber-600/20">
                <ShieldCheck className="h-3 w-3" /> Superadmin
              </Badge>
            )}
            {u.bloqueado && <Badge className="bg-red-50 text-red-700 ring-red-600/20">Bloqueado</Badge>}
          </p>
          <p className="truncate text-xs text-slate-500">
            {u.email} · criado em {dataBR(u.created_at)} ·{" "}
            {u.last_sign_in_at ? `último acesso ${dataHoraBR(u.last_sign_in_at)}` : "nunca entrou"}
            {u.sessoes > 0 ? ` · ${u.sessoes} sessão(ões)` : ""}
          </p>
          {!u.superadmin && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {u.empresas.length === 0 && <span className="text-xs text-slate-400">Sem empresa</span>}
              {u.empresas.map((e) => (
                <Badge key={e.id} className={PAPEIS[e.papel].classe}>
                  {e.nome} · {PAPEIS[e.papel].label}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {ocupado && <LoaderCircle className="mr-1 h-4 w-4 animate-spin text-slate-400" />}
          <BotaoIcone titulo="Editar nome e e-mail" onClick={() => setEditando(true)} disabled={ocupado}>
            <Pencil className="h-4 w-4" />
          </BotaoIcone>
          {!u.superadmin && (
            <BotaoIcone titulo="Definir nova senha" onClick={() => setSenha(true)} disabled={ocupado}>
              <KeyRound className="h-4 w-4" />
            </BotaoIcone>
          )}
          {!eu && u.sessoes > 0 && (
            <BotaoIcone
              titulo="Encerrar sessões (desloga de todos os aparelhos)"
              onClick={() => rodar(() => adminEncerrarSessoes(u.id))}
              disabled={ocupado}
            >
              <LogOut className="h-4 w-4" />
            </BotaoIcone>
          )}
          {!protegido && (
            <BotaoIcone
              titulo={u.bloqueado ? "Desbloquear acesso" : "Bloquear acesso"}
              onClick={() => rodar(() => adminBloquearUsuario(u.id, !u.bloqueado))}
              disabled={ocupado}
              perigo={!u.bloqueado}
            >
              <Ban className={cn("h-4 w-4", u.bloqueado && "text-red-600")} />
            </BotaoIcone>
          )}
          {!protegido && (
            <BotaoExcluir
              compacto
              acao={adminExcluirUsuario.bind(null, u.id)}
              titulo="Excluir usuário"
              mensagem={`O login de ${u.email} será apagado. Empresas em que ele é a única pessoa são apagadas junto (ativos, manutenções e anexos). Nas demais, se for o proprietário, a próxima pessoa da equipe assume.`}
            />
          )}
        </div>
      </div>
      {erro && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</p>}

      <EditarUsuario usuario={u} aberto={editando} aoFechar={() => setEditando(false)} />
      <NovaSenha
        usuario={u}
        aberto={senha}
        aoFechar={() => setSenha(false)}
        aoDefinir={(c) => {
          setSenha(false);
          aoCredenciais(c);
        }}
      />
    </li>
  );
}

function NovoUsuario({
  aberto,
  aoFechar,
  empresas,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  empresas: EmpresaAdmin[];
  aoCriar: (c: Credenciais) => void;
}) {
  const [empresa, setEmpresa] = useState("nova");

  return (
    <FormModal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Novo usuário"
      descricao="No final aparecem o e-mail e a senha para copiar ou mandar no WhatsApp."
      rotulo="Criar usuário"
      acao={async (fd) => {
        const r = await adminCriarUsuario(fd);
        if (r.ok) aoCriar(r);
        return r;
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Nome" obrigatorio>
          <input name="nome" required className="campo" />
        </Campo>
        <Campo label="E-mail (login)" obrigatorio>
          <input name="email" type="email" required className="campo" />
        </Campo>
      </div>
      <Campo label="Senha" hint="Em branco: gera uma senha automática.">
        <input name="senha" type="text" minLength={6} maxLength={72} autoComplete="new-password" className="campo" />
      </Campo>
      <Campo label="Empresa">
        <select name="empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="campo">
          <option value="nova">Criar uma empresa nova para ele (vira o proprietário)</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      </Campo>
      {empresa === "nova" ? (
        <Campo label="Nome da empresa nova" hint="Em branco: usa o nome da pessoa.">
          <input name="empresa_nome" className="campo" />
        </Campo>
      ) : (
        <Campo label="Papel na empresa">
          <select name="papel" defaultValue="tecnico" className="campo">
            {LISTA_PAPEIS.map((p) => (
              <option key={p} value={p}>
                {PAPEIS[p].label}
              </option>
            ))}
          </select>
        </Campo>
      )}
    </FormModal>
  );
}

function EditarUsuario({
  usuario: u,
  aberto,
  aoFechar,
}: {
  usuario: UsuarioAdmin;
  aberto: boolean;
  aoFechar: () => void;
}) {
  return (
    <FormModal aberto={aberto} aoFechar={aoFechar} titulo="Editar usuário" rotulo="Salvar" acao={adminEditarUsuario}>
      <input type="hidden" name="id" value={u.id} />
      <Campo label="Nome">
        <input name="nome" defaultValue={u.nome ?? ""} className="campo" />
      </Campo>
      <Campo
        label="E-mail (login)"
        obrigatorio
        hint={u.superadmin ? "O e-mail do superadmin é definido na stack (SUPERADMIN_EMAIL)." : undefined}
      >
        <input name="email" type="email" required defaultValue={u.email} readOnly={u.superadmin} className="campo" />
      </Campo>
    </FormModal>
  );
}

function NovaSenha({
  usuario: u,
  aberto,
  aoFechar,
  aoDefinir,
}: {
  usuario: UsuarioAdmin;
  aberto: boolean;
  aoFechar: () => void;
  aoDefinir: (c: Credenciais) => void;
}) {
  return (
    <FormModal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Nova senha"
      descricao={`${u.email} sai de todos os aparelhos e passa a entrar com a senha nova.`}
      rotulo="Definir senha"
      acao={async (fd) => {
        const r = await adminRedefinirSenha(u.id, String(fd.get("senha") ?? ""));
        if (r.ok) aoDefinir(r);
        return r;
      }}
    >
      <Campo label="Senha" hint="Em branco: gera uma senha automática.">
        <input name="senha" type="text" minLength={6} maxLength={72} autoComplete="new-password" className="campo" />
      </Campo>
    </FormModal>
  );
}
