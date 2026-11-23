"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  Ban,
  Building2,
  ChevronRight,
  CircleCheck,
  Clock,
  Download,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserPlus,
  Users,
  UserX,
  X,
} from "lucide-react";
import { JanelaCredenciais } from "@/components/configuracoes/equipe";
import { Modal, RodapeModal } from "@/components/modal";
import { Badge, Botao, Campo, cn } from "@/components/ui";
import {
  adminAlterarPapel,
  adminBloquearUsuario,
  adminCriarUsuario,
  adminEditarUsuario,
  adminEncerrarSessoes,
  adminEntrarComo,
  adminEntradasComo,
  adminExcluirUsuario,
  type EntradaComoRegistro,
  adminRedefinirSenha,
  adminRemoverMembro,
  adminVincularEmpresa,
} from "@/lib/actions/admin";
import { chamarAcao } from "@/lib/acao-cliente";
import { dataBR, dataHoraBR, iniciais } from "@/lib/format";
import type { PapelMembro } from "@/lib/types";
import { Busca, Erro, FormModal, normalizar, useAcao, type Credenciais } from "./comum";
import {
  FILTROS_USUARIO,
  LISTA_PAPEIS,
  ORDENS,
  PAPEIS,
  passaNoFiltro,
  tempoRelativo,
  type EmpresaAdmin,
  type FiltroUsuario,
  type Ordem,
  type UsuarioAdmin,
} from "./tipos";

/** Cartões do topo: cada um é também um filtro da lista. */
const CARTOES: { filtro: FiltroUsuario; Icone: typeof Users; cor: string }[] = [
  { filtro: "todos", Icone: Users, cor: "text-slate-600 bg-slate-100" },
  { filtro: "recentes", Icone: CircleCheck, cor: "text-emerald-700 bg-emerald-50" },
  { filtro: "nunca", Icone: Clock, cor: "text-amber-700 bg-amber-50" },
  { filtro: "sem_empresa", Icone: UserX, cor: "text-violet-700 bg-violet-50" },
  { filtro: "bloqueados", Icone: Ban, cor: "text-red-700 bg-red-50" },
];

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
  /** Instante do servidor: contagens e "há X min" saem iguais no servidor e no navegador. */
  agora: number;
}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroUsuario>(filtroInicial);
  const [empresa, setEmpresa] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("acesso");
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
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
    const lista = usuarios.filter(
      (u) =>
        passaNoFiltro(u, filtro, agora) &&
        (!empresa || u.empresas.some((e) => e.id === empresa)) &&
        (!q || normalizar([u.nome, u.email, u.telefone, ...u.empresas.map((e) => e.nome)].join(" ")).includes(q)),
    );
    const nome = (u: UsuarioAdmin) => normalizar(u.nome ?? u.email);
    return lista.sort((a, b) => {
      if (ordem === "nome") return nome(a).localeCompare(nome(b));
      if (ordem === "novos") return b.created_at.localeCompare(a.created_at);
      return (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? "");
    });
  }, [busca, filtro, empresa, ordem, usuarios, agora]);

  // Dados frescos depois de cada ação (router.refresh): a gaveta lê da lista.
  const selecionado = aberto ? usuarios.find((u) => u.id === aberto) ?? null : null;
  const algumFiltro = busca || filtro !== "todos" || empresa;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5">
        {CARTOES.map(({ filtro: f, Icone, cor }) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(filtro === f && f !== "todos" ? "todos" : f)}
            aria-pressed={filtro === f}
            className={cn(
              "card pressionavel flex items-center gap-3 p-3.5 text-left transition-shadow sm:p-4",
              filtro === f ? "ring-2 ring-slate-900" : "hover:shadow-md",
              f === "todos" && "col-span-2 sm:col-span-1",
            )}
          >
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", cor)}>
              <Icone className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-2xl font-semibold leading-none tabular-nums text-slate-900">
                {contagem[f]}
              </span>
              <span className="mt-1 block truncate text-xs text-slate-500">
                {f === "todos" ? "Usuários no sistema" : FILTROS_USUARIO[f]}
              </span>
            </span>
          </button>
        ))}
      </div>

      <section className="card overflow-hidden">
        <header className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center sm:px-5">
          <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar por nome, e-mail, telefone ou empresa" />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <select
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              className="campo sm:w-48"
              aria-label="Filtrar por empresa"
            >
              <option value="">Todas as empresas</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
            <select
              value={ordem}
              onChange={(e) => setOrdem(e.target.value as Ordem)}
              className="campo sm:w-40"
              aria-label="Ordenar por"
            >
              {(Object.keys(ORDENS) as Ordem[]).map((o) => (
                <option key={o} value={o}>
                  {ORDENS[o]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Botao
              variante="secundario"
              onClick={() => exportarCsv(filtrados)}
              disabled={filtrados.length === 0}
              title="Baixar a lista filtrada em CSV (abre no Excel)"
              className="flex-1 justify-center"
            >
              <Download className="h-4 w-4" />
              <span className="lg:sr-only xl:not-sr-only">CSV</span>
            </Botao>
            <Botao onClick={() => setNovo(true)} className="flex-1 justify-center">
              <UserPlus className="h-4 w-4" />
              Novo usuário
            </Botao>
          </div>
        </header>

        {algumFiltro && (
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs text-slate-500 sm:px-5">
            <span>
              {filtrados.length} de {usuarios.length} usuário(s)
            </span>
            <button
              type="button"
              onClick={() => {
                setBusca("");
                setFiltro("todos");
                setEmpresa("");
              }}
              className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900"
            >
              <X className="h-3.5 w-3.5" /> Limpar filtros
            </button>
          </div>
        )}

        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Users className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-medium text-slate-900">Nenhum usuário encontrado</p>
            <p className="mt-1 text-sm text-slate-500">Mude a busca ou os filtros.</p>
          </div>
        ) : (
          <>
            {/* Cabeçalho da tabela (desktop) */}
            <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_9rem_6rem_2rem] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid">
              <span>Usuário</span>
              <span>Empresas</span>
              <span>Último acesso</span>
              <span>Situação</span>
              <span />
            </div>
            <ul className="divide-y divide-slate-100">
              {filtrados.map((u) => (
                <LinhaUsuario key={u.id} usuario={u} eu={u.id === eu} agora={agora} aoAbrir={() => setAberto(u.id)} />
              ))}
            </ul>
          </>
        )}
      </section>

      {selecionado && (
        <DetalheUsuario
          usuario={selecionado}
          empresas={empresas}
          eu={selecionado.id === eu}
          agora={agora}
          aoFechar={() => setAberto(null)}
          aoCredenciais={setCredenciais}
        />
      )}
      <NovoUsuario aberto={novo} aoFechar={() => setNovo(false)} empresas={empresas} aoCriar={setCredenciais} />
      <JanelaCredenciais credenciais={credenciais} urlSistema={urlSistema} aoFechar={() => setCredenciais(null)} />
    </>
  );
}

// --- Linha da lista -------------------------------------------------------------------

function Avatar({ usuario: u, grande }: { usuario: UsuarioAdmin; grande?: boolean }) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full font-semibold",
        grande ? "h-14 w-14 text-base" : "h-10 w-10 text-xs",
        u.bloqueado
          ? "bg-red-100 text-red-700"
          : u.superadmin
            ? "bg-amber-100 text-amber-800"
            : "bg-gradient-to-br from-slate-200 to-slate-300 text-slate-700",
      )}
    >
      {iniciais(u.nome ?? u.email)}
      {u.sessoes > 0 && !u.bloqueado && (
        <span
          className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-superficie bg-emerald-500"
          title="Com sessão aberta"
        />
      )}
    </span>
  );
}

function Situacao({ usuario: u }: { usuario: UsuarioAdmin }) {
  if (u.bloqueado) return <Badge className="bg-red-50 text-red-700 ring-red-600/20">Bloqueado</Badge>;
  if (!u.last_sign_in_at) return <Badge className="bg-amber-50 text-amber-800 ring-amber-600/20">Nunca entrou</Badge>;
  return <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Ativo</Badge>;
}

function SelosEmpresas({ usuario: u, limite = 2 }: { usuario: UsuarioAdmin; limite?: number }) {
  if (u.superadmin) return <span className="text-xs text-slate-400">Administra o sistema</span>;
  if (u.empresas.length === 0) return <span className="text-xs text-slate-400">Sem empresa</span>;
  const resto = u.empresas.length - limite;
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {u.empresas.slice(0, limite).map((e) => (
        <Badge key={e.id} className={cn(PAPEIS[e.papel].classe, "max-w-full")}>
          <span className="truncate">{e.nome}</span> · {PAPEIS[e.papel].label}
        </Badge>
      ))}
      {resto > 0 && <Badge className="bg-slate-100 text-slate-600 ring-slate-500/20">+{resto}</Badge>}
    </div>
  );
}

function LinhaUsuario({
  usuario: u,
  eu,
  agora,
  aoAbrir,
}: {
  usuario: UsuarioAdmin;
  eu: boolean;
  agora: number;
  aoAbrir: () => void;
}) {
  return (
    <li data-usuario={u.email}>
      <button
        type="button"
        onClick={aoAbrir}
        aria-label={`Abrir ${u.nome ?? u.email}`}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:px-5 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_9rem_6rem_2rem] lg:gap-4"
      >
        <span className="flex min-w-0 items-center gap-3">
          <Avatar usuario={u} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
              <span className="truncate">{u.nome ?? u.email}</span>
              {eu && <span className="shrink-0 text-xs font-normal text-slate-400">(você)</span>}
              {u.superadmin && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Superadmin" />}
            </span>
            <span className="block truncate text-xs text-slate-500">{u.email}</span>
          </span>
        </span>

        <span className="hidden min-w-0 lg:block">
          <SelosEmpresas usuario={u} />
        </span>
        <span
          className="hidden text-xs tabular-nums text-slate-600 lg:block"
          title={u.last_sign_in_at ? dataHoraBR(u.last_sign_in_at) : undefined}
        >
          {tempoRelativo(u.last_sign_in_at, agora)}
        </span>
        <span className="hidden lg:block">
          <Situacao usuario={u} />
        </span>
        <ChevronRight className="h-4 w-4 justify-self-end text-slate-400" />

        {/* Celular: empresas e situação numa segunda linha */}
        <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-1.5 pl-[3.25rem] lg:hidden">
          <Situacao usuario={u} />
          <span className="text-[11px] text-slate-500">{tempoRelativo(u.last_sign_in_at, agora)}</span>
          <SelosEmpresas usuario={u} limite={1} />
        </span>
      </button>
    </li>
  );
}

// --- Detalhe do usuário --------------------------------------------------------------

function DetalheUsuario({
  usuario: u,
  empresas,
  eu,
  agora,
  aoFechar,
  aoCredenciais,
}: {
  usuario: UsuarioAdmin;
  empresas: EmpresaAdmin[];
  eu: boolean;
  agora: number;
  aoFechar: () => void;
  aoCredenciais: (c: Credenciais) => void;
}) {
  const { erro, ocupado, rodar } = useAcao();
  // Um diálogo de cada vez: o painel do Modal tem animação (transform), e um
  // diálogo aberto dentro dele ficaria preso na caixa do painel.
  const [tela, setTela] = useState<"detalhe" | "editar" | "senha" | "excluir" | "entrar">("detalhe");
  const voltar = () => setTela("detalhe");
  const protegido = u.superadmin || eu;

  // "Entrar como": a action redireciona para o sistema; aqui só o erro.
  const [erroEntrada, setErroEntrada] = useState<string | null>(null);
  const [entrando, iniciarEntrada] = useTransition();
  const podeEntrar = !protegido && !u.bloqueado && u.empresas.length > 0;
  const [motivo, setMotivo] = useState("");
  function entrarComo() {
    setErroEntrada(null);
    iniciarEntrada(async () => {
      const r = await chamarAcao(() => adminEntrarComo(u.id, motivo));
      if (r && !r.ok) setErroEntrada(r.erro);
    });
  }

  // Histórico do "Entrar como" nesta conta (quem, quando, por quê, quanto mudou).
  const [entradas, setEntradas] = useState<EntradaComoRegistro[] | null>(null);
  useEffect(() => {
    if (protegido) return;
    let vivo = true;
    adminEntradasComo(u.id).then((r) => vivo && setEntradas(r.ok ? r.entradas : []));
    return () => {
      vivo = false;
    };
  }, [u.id, protegido]);

  const dados: [string, ReactNode][] = [
    ["Criado em", dataBR(u.created_at)],
    [
      "Último acesso",
      u.last_sign_in_at ? `${dataHoraBR(u.last_sign_in_at)} (${tempoRelativo(u.last_sign_in_at, agora)})` : "nunca entrou",
    ],
    ["Sessões abertas", u.sessoes > 0 ? `${u.sessoes} aparelho(s)` : "nenhuma"],
    ["Telefone", u.telefone ?? "—"],
  ];

  return (
    <>
    <Modal aberto={tela === "detalhe"} aoFechar={aoFechar} titulo="Usuário" largura="max-w-2xl">
      <div className="space-y-5 px-5 py-5" data-detalhe={u.email}>
        <div className="flex items-center gap-4">
          <Avatar usuario={u} grande />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-lg font-semibold text-slate-900">
              <span className="truncate">{u.nome ?? u.email}</span>
              {u.superadmin && (
                <Badge className="bg-amber-50 text-amber-800 ring-amber-600/20">
                  <ShieldCheck className="h-3 w-3" /> Superadmin
                </Badge>
              )}
              <Situacao usuario={u} />
            </p>
            <p className="truncate text-sm text-slate-500">{u.email}</p>
          </div>
          {ocupado && <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" />}
        </div>

        {(erro || erroEntrada) && <Erro>{erro ?? erroEntrada}</Erro>}

        {/* Ações rápidas */}
        <div className="grid grid-cols-2 gap-2 sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none">
          {podeEntrar && (
            <Acao
              Icone={entrando ? LoaderCircle : LogIn}
              rotulo="Entrar como"
              onClick={() => setTela("entrar")}
              disabled={ocupado || entrando}
            />
          )}
          <Acao Icone={Pencil} rotulo="Editar" onClick={() => setTela("editar")} disabled={ocupado} />
          {!u.superadmin && <Acao Icone={KeyRound} rotulo="Nova senha" onClick={() => setTela("senha")} disabled={ocupado} />}
          {!eu && (
            <Acao
              Icone={LogOut}
              rotulo="Encerrar sessões"
              onClick={() => rodar(() => adminEncerrarSessoes(u.id))}
              disabled={ocupado || u.sessoes === 0}
            />
          )}
          {!protegido && (
            <Acao
              Icone={Ban}
              rotulo={u.bloqueado ? "Desbloquear" : "Bloquear"}
              onClick={() => rodar(() => adminBloquearUsuario(u.id, !u.bloqueado))}
              disabled={ocupado}
              perigo={!u.bloqueado}
            />
          )}
        </div>

        <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-slate-200 p-4 text-sm sm:grid-cols-2">
          {dados.map(([rotulo, valor]) => (
            <div key={rotulo} className="min-w-0">
              <dt className="text-xs text-slate-500">{rotulo}</dt>
              <dd className="mt-0.5 break-words text-slate-900">{valor}</dd>
            </div>
          ))}
        </dl>

        {entradas && entradas.length > 0 && (
          <div className="rounded-xl border border-slate-200 p-4" data-historico-entrar-como>
            <p className="text-xs font-medium text-slate-500">"Entrar como" nesta conta</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {entradas.slice(0, 5).map((e) => (
                <li key={e.inicio} className="text-slate-700">
                  <span className="font-medium text-slate-900">{dataHoraBR(e.inicio)}</span> · {e.motivo ?? "sem motivo"}{" "}
                  <span className="text-xs text-slate-500">
                    ({e.acoes} alteração(ões){e.fim ? "" : ", ainda aberta"})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {u.superadmin ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            O superadmin vem da stack (<code>SUPERADMIN_EMAIL</code> / <code>SUPERADMIN_SENHA</code>) e só usa este
            console: não faz parte de nenhuma empresa.
          </p>
        ) : (
          <EmpresasDoUsuario usuario={u} empresas={empresas} />
        )}

        {!protegido && (
          <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/40 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-800">Excluir usuário</p>
              <p className="text-xs text-red-700/80">
                Apaga o login. Empresas em que ele é a única pessoa vão junto; nas demais, se for o dono, a próxima
                pessoa assume.
              </p>
            </div>
            <Botao variante="perigo" tamanho="sm" onClick={() => setTela("excluir")}>
              <Trash2 className="h-4 w-4" /> Excluir
            </Botao>
          </div>
        )}
      </div>
    </Modal>

      <Modal aberto={tela === "entrar"} aoFechar={() => !entrando && voltar()} titulo="Entrar como" largura="max-w-md">
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            entrarComo();
          }}
        >
          <div className="space-y-3 px-5 py-5">
            <p className="text-sm text-slate-600">
              Você vai abrir o sistema na conta de <strong className="font-medium text-slate-900">{u.email}</strong> por
              até 1 hora. O motivo e cada alteração que fizer ficam registrados, e a empresa vê isso na tela Equipe.
            </p>
            <Campo label="Motivo" obrigatorio>
              <input
                name="motivo"
                required
                minLength={5}
                maxLength={300}
                value={motivo}
                onChange={(ev) => setMotivo(ev.target.value)}
                placeholder="Ex.: chamado 123, relatório não abre"
                className="campo"
              />
            </Campo>
            {erroEntrada && <Erro>{erroEntrada}</Erro>}
          </div>
          <RodapeModal>
            <Botao type="button" variante="secundario" onClick={voltar} disabled={entrando}>
              Cancelar
            </Botao>
            <Botao type="submit" disabled={entrando || motivo.trim().length < 5}>
              {entrando && <LoaderCircle className="h-4 w-4 animate-spin" />}
              Entrar na conta
            </Botao>
          </RodapeModal>
        </form>
      </Modal>
      <EditarUsuario usuario={u} aberto={tela === "editar"} aoFechar={voltar} />
      <NovaSenha
        usuario={u}
        aberto={tela === "senha"}
        aoFechar={voltar}
        aoDefinir={(c) => {
          voltar();
          aoCredenciais(c);
        }}
      />
      <Modal aberto={tela === "excluir"} aoFechar={() => !ocupado && voltar()} titulo="Excluir usuário" largura="max-w-md">
        <div className="flex gap-4 px-5 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <TriangleAlert className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-3">
            <p className="text-sm text-slate-600">
              O login de <strong className="font-medium text-slate-900">{u.email}</strong> será apagado. Empresas em
              que ele é a única pessoa são apagadas junto (ativos, manutenções e anexos). Nas demais, se for o
              proprietário, a próxima pessoa da equipe assume. Não dá para desfazer.
            </p>
            {erro && <Erro>{erro}</Erro>}
          </div>
        </div>
        <RodapeModal>
          <Botao variante="secundario" onClick={voltar} disabled={ocupado}>
            Cancelar
          </Botao>
          <Botao variante="perigo" onClick={() => rodar(() => adminExcluirUsuario(u.id), aoFechar)} disabled={ocupado}>
            {ocupado && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Excluir
          </Botao>
        </RodapeModal>
      </Modal>
    </>
  );
}

function Acao({
  Icone,
  rotulo,
  onClick,
  disabled,
  perigo,
}: {
  Icone: typeof Users;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "pressionavel flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors disabled:opacity-40",
        perigo
          ? "border-red-200 text-red-700 hover:bg-red-50"
          : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <Icone className="h-[18px] w-[18px]" />
      {rotulo}
    </button>
  );
}

function EmpresasDoUsuario({ usuario: u, empresas }: { usuario: UsuarioAdmin; empresas: EmpresaAdmin[] }) {
  const disponiveis = empresas.filter((e) => !u.empresas.some((v) => v.id === e.id));
  const [adicionando, setAdicionando] = useState(false);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5">
        <Building2 className="h-4 w-4 text-slate-400" />
        <h3 className="flex-1 text-sm font-semibold text-slate-900">Empresas</h3>
        {disponiveis.length > 0 && !adicionando && (
          <Botao tamanho="sm" variante="secundario" onClick={() => setAdicionando(true)}>
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </Botao>
        )}
      </header>
      <ul className="divide-y divide-slate-100">
        {u.empresas.length === 0 && !adicionando && (
          <li className="px-4 py-3 text-sm text-slate-500">
            Sem empresa: a pessoa entra e não vê nada. Adicione a uma empresa.
          </li>
        )}
        {u.empresas.map((e) => (
          <VinculoEmpresa key={e.id} userId={u.id} empresa={e} />
        ))}
      </ul>
      {adicionando && (
        <AdicionarEmpresa userId={u.id} empresas={disponiveis} aoTerminar={() => setAdicionando(false)} />
      )}
    </section>
  );
}

function VinculoEmpresa({
  userId,
  empresa: e,
}: {
  userId: string;
  empresa: UsuarioAdmin["empresas"][number];
}) {
  const { erro, ocupado, rodar } = useAcao();
  const [confirmando, setConfirmando] = useState(false);

  return (
    <li className="px-4 py-2.5" data-vinculo={e.nome}>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm text-slate-900">{e.nome}</p>
        {ocupado && <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" />}
        <select
          value={e.papel}
          onChange={(ev) => rodar(() => adminAlterarPapel(e.id, userId, ev.target.value as PapelMembro))}
          disabled={ocupado}
          className="campo h-8 w-auto py-0 text-xs"
          aria-label={`Papel em ${e.nome}`}
        >
          {LISTA_PAPEIS.map((p) => (
            <option key={p} value={p}>
              {PAPEIS[p].label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={ocupado}
          title="Tirar da empresa"
          aria-label={`Tirar de ${e.nome}`}
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {confirmando && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 sm:flex-row sm:items-center">
          <p className="flex-1">
            Deixa de ver os dados de &quot;{e.nome}&quot;. O login continua existindo.
            {e.papel === "proprietario" ? " Como é o proprietário, a próxima pessoa da equipe assume." : ""}
          </p>
          <div className="flex gap-2">
            <Botao tamanho="sm" variante="secundario" onClick={() => setConfirmando(false)} disabled={ocupado}>
              Cancelar
            </Botao>
            <Botao
              tamanho="sm"
              variante="perigo"
              onClick={() => rodar(() => adminRemoverMembro(e.id, userId), () => setConfirmando(false))}
              disabled={ocupado}
            >
              Tirar da empresa
            </Botao>
          </div>
        </div>
      )}
      {erro && <p className="mt-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{erro}</p>}
    </li>
  );
}

function AdicionarEmpresa({
  userId,
  empresas,
  aoTerminar,
}: {
  userId: string;
  empresas: EmpresaAdmin[];
  aoTerminar: () => void;
}) {
  const { erro, ocupado, rodar } = useAcao();

  return (
    <form
      action={(fd) => rodar(() => adminVincularEmpresa(fd), aoTerminar)}
      className="space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-3"
    >
      {erro && <Erro>{erro}</Erro>}
      <input type="hidden" name="user_id" value={userId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <select name="org_id" required className="campo min-w-0 flex-1" aria-label="Empresa">
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        <select name="papel" defaultValue="tecnico" className="campo sm:w-36" aria-label="Papel na empresa">
          {LISTA_PAPEIS.map((p) => (
            <option key={p} value={p}>
              {PAPEIS[p].label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <Botao type="button" variante="secundario" tamanho="sm" onClick={aoTerminar} disabled={ocupado}>
          Cancelar
        </Botao>
        <Botao type="submit" tamanho="sm" disabled={ocupado}>
          {ocupado && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
          Pôr na empresa
        </Botao>
      </div>
    </form>
  );
}

// --- CSV ------------------------------------------------------------------------------

/** Lista filtrada em CSV com ";" e BOM: o Excel em português abre certo. */
function exportarCsv(usuarios: UsuarioAdmin[]) {
  const celula = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const linhas = [
    ["Nome", "E-mail", "Telefone", "Empresas (papel)", "Criado em", "Último acesso", "Situação"],
    ...usuarios.map((u) => [
      u.nome ?? "",
      u.email,
      u.telefone ?? "",
      u.superadmin ? "superadmin" : u.empresas.map((e) => `${e.nome} (${PAPEIS[e.papel].label})`).join(", "),
      dataBR(u.created_at),
      u.last_sign_in_at ? dataHoraBR(u.last_sign_in_at) : "nunca",
      u.bloqueado ? "bloqueado" : "ativo",
    ]),
  ];
  const csv = "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `usuarios-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Formulários ----------------------------------------------------------------------

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
        <input name="senha" type="text" minLength={8} maxLength={72} autoComplete="new-password" className="campo" />
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
        <input name="senha" type="text" minLength={8} maxLength={72} autoComplete="new-password" className="campo" />
      </Campo>
    </FormModal>
  );
}
