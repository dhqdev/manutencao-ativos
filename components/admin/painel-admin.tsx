"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Building2,
  ChevronDown,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { Abas } from "@/components/abas";
import { BotaoExcluir } from "@/components/confirmar";
import { JanelaCredenciais } from "@/components/configuracoes/equipe";
import { Modal, RodapeModal } from "@/components/modal";
import { Badge, Botao, Campo, cn } from "@/components/ui";
import {
  adminAcessarEmpresa,
  adminAdicionarMembro,
  adminAlterarPapel,
  adminBloquearUsuario,
  adminCriarEmpresa,
  adminCriarUsuario,
  adminEditarEmpresa,
  adminEditarUsuario,
  adminEncerrarSessoes,
  adminExcluirEmpresa,
  adminExcluirUsuario,
  adminRedefinirSenha,
  adminRemoverMembro,
  type CredenciaisAdmin,
} from "@/lib/actions/admin";
import { dataBR, dataHoraBR, iniciais, moeda } from "@/lib/format";
import type { Resultado } from "@/lib/form";
import type { PapelMembro } from "@/lib/types";

export type ResumoAdmin = {
  usuarios: number;
  bloqueados: number;
  empresas: number;
  ativos: number;
  manutencoes: number;
  pneus: number;
  sessoes_ativas: number;
  logins_7_dias: number;
  whatsapp_conectados: number;
  gasto_total: number;
};

export type UsuarioAdmin = {
  id: string;
  email: string;
  nome: string | null;
  telefone: string | null;
  superadmin: boolean;
  bloqueado: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  sessoes: number;
  empresas: { id: string; nome: string; papel: PapelMembro }[];
};

export type EmpresaAdmin = {
  id: string;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  created_at: string;
  ativos: number;
  manutencoes: number;
  ultima_atividade: string | null;
  whatsapp: string | null;
  membros: { user_id: string; papel: PapelMembro; email: string; nome: string | null; bloqueado: boolean }[];
};

type Credenciais = Extract<CredenciaisAdmin, { ok: true }>;

const PAPEIS: Record<PapelMembro, { label: string; classe: string }> = {
  proprietario: { label: "Proprietário", classe: "bg-marca-50 text-marca-700 ring-marca-600/20" },
  gestor: { label: "Gestor", classe: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  tecnico: { label: "Técnico", classe: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  leitor: { label: "Leitor", classe: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};
const LISTA_PAPEIS = Object.keys(PAPEIS) as PapelMembro[];

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function PainelAdmin({
  resumo,
  usuarios,
  empresas,
  eu,
  urlSistema,
}: {
  resumo: ResumoAdmin;
  usuarios: UsuarioAdmin[];
  empresas: EmpresaAdmin[];
  eu: string;
  urlSistema: string;
}) {
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Numero rotulo="Usuários" valor={resumo.usuarios} detalhe={`${resumo.logins_7_dias} entraram nos últimos 7 dias`} />
        <Numero rotulo="Empresas" valor={resumo.empresas} detalhe={`${resumo.whatsapp_conectados} com WhatsApp conectado`} />
        <Numero rotulo="Ativos" valor={resumo.ativos} detalhe={`${resumo.pneus} pneus no estoque`} />
        <Numero
          rotulo="Manutenções"
          valor={resumo.manutencoes}
          detalhe={`${moeda(Number(resumo.gasto_total))} registrados`}
        />
      </div>
      <p className="mb-5 mt-2 text-xs text-slate-500">
        {resumo.sessoes_ativas} sessão(ões) aberta(s) · {resumo.bloqueados} usuário(s) bloqueado(s)
      </p>

      <Abas
        abas={[
          {
            id: "usuarios",
            rotulo: "Usuários",
            contador: usuarios.length,
            conteudo: (
              <ListaUsuarios usuarios={usuarios} empresas={empresas} eu={eu} aoCredenciais={setCredenciais} />
            ),
          },
          {
            id: "empresas",
            rotulo: "Empresas",
            contador: empresas.length,
            conteudo: <ListaEmpresas empresas={empresas} eu={eu} />,
          },
        ]}
      />

      <JanelaCredenciais credenciais={credenciais} urlSistema={urlSistema} aoFechar={() => setCredenciais(null)} />
    </>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: number; detalhe: string }) {
  return (
    <div className="card p-3.5 sm:p-5">
      <p className="text-xs font-medium text-slate-500 sm:text-sm">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{Number(valor).toLocaleString("pt-BR")}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500 sm:text-xs">{detalhe}</p>
    </div>
  );
}

function Busca({ valor, aoMudar, placeholder }: { valor: string; aoMudar: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        className="campo pl-9"
      />
    </div>
  );
}

function Erro({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}

/** Botão de ícone que roda uma ação e atualiza a tela. */
function useAcao() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function rodar(acao: () => Promise<Resultado | CredenciaisAdmin>, aoDarCerto?: (r: never) => void) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) setErro(r.erro);
      else {
        aoDarCerto?.(r as never);
        router.refresh();
      }
    });
  }

  return { erro, ocupado, rodar };
}

function BotaoIcone({
  titulo,
  onClick,
  disabled,
  children,
  perigo,
}: {
  titulo: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      aria-label={titulo}
      className={cn(
        "pressionavel rounded-lg p-2 text-slate-400 transition-colors disabled:opacity-40",
        perigo ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-slate-100 hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}

// --- Usuários -------------------------------------------------------------------

function ListaUsuarios({
  usuarios,
  empresas,
  eu,
  aoCredenciais,
}: {
  usuarios: UsuarioAdmin[];
  empresas: EmpresaAdmin[];
  eu: string;
  aoCredenciais: (c: Credenciais) => void;
}) {
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);

  const filtrados = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return usuarios;
    return usuarios.filter((u) =>
      normalizar([u.nome, u.email, u.telefone, ...u.empresas.map((e) => e.nome)].join(" ")).includes(q),
    );
  }, [busca, usuarios]);

  return (
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
            <LinhaUsuario key={u.id} usuario={u} eu={u.id === eu} aoCredenciais={aoCredenciais} />
          ))}
        </ul>
      )}

      <NovoUsuario aberto={novo} aoFechar={() => setNovo(false)} empresas={empresas} aoCriar={aoCredenciais} />
    </section>
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
    <li className="px-4 py-3 sm:px-5">
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
          <div className="mt-1.5 flex flex-wrap gap-1">
            {u.empresas.length === 0 && <span className="text-xs text-slate-400">Sem empresa</span>}
            {u.empresas.map((e) => (
              <Badge key={e.id} className={PAPEIS[e.papel].classe}>
                {e.nome} · {PAPEIS[e.papel].label}
              </Badge>
            ))}
          </div>
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

/** Formulário num modal: envia, mostra erro ou fecha e atualiza. */
function FormModal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  rotulo,
  acao,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  rotulo: string;
  acao: (fd: FormData) => Promise<Resultado | CredenciaisAdmin>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function enviar(fd: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await acao(fd);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      aoFechar();
      router.refresh();
    });
  }

  return (
    <Modal aberto={aberto} aoFechar={() => !enviando && aoFechar()} titulo={titulo} descricao={descricao} largura="max-w-lg">
      <form action={enviar}>
        <div className="space-y-4 px-5 py-5">
          {erro && <Erro>{erro}</Erro>}
          {children}
        </div>
        <RodapeModal>
          <Botao type="button" variante="secundario" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={enviando}>
            {enviando && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {rotulo}
          </Botao>
        </RodapeModal>
      </form>
    </Modal>
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

function EditarUsuario({ usuario: u, aberto, aoFechar }: { usuario: UsuarioAdmin; aberto: boolean; aoFechar: () => void }) {
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

// --- Empresas -------------------------------------------------------------------

function ListaEmpresas({ empresas, eu }: { empresas: EmpresaAdmin[]; eu: string }) {
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
          {filtradas.map((e) => (
            <LinhaEmpresa key={e.id} empresa={e} eu={eu} />
          ))}
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
        <Campo label="E-mail do proprietário" hint="Opcional. A pessoa precisa já ter login (aba Usuários).">
          <input name="dono" type="email" className="campo" />
        </Campo>
      </FormModal>
    </section>
  );
}

function LinhaEmpresa({ empresa: e, eu }: { empresa: EmpresaAdmin; eu: string }) {
  const [aberta, setAberta] = useState(false);
  const [editando, setEditando] = useState(false);
  const { erro, ocupado, rodar } = useAcao();
  const dono = e.membros.find((m) => m.papel === "proprietario");
  const participo = e.membros.some((m) => m.user_id === eu);

  return (
    <li>
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:px-5"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <Building2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{e.nome}</p>
          <p className="truncate text-xs text-slate-500">
            {dono ? `${dono.nome ?? dono.email}` : "sem proprietário"} · {e.membros.length} pessoa(s) · {e.ativos} ativo(s) ·{" "}
            {e.manutencoes} manutenção(ões)
            {e.whatsapp === "conectado" ? " · WhatsApp conectado" : ""}
          </p>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", aberta && "rotate-180")} />
      </button>

      {aberta && (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-5">
          <p className="text-xs text-slate-500">
            Criada em {dataBR(e.created_at)}
            {e.cnpj ? ` · CNPJ ${e.cnpj}` : ""}
            {e.ultima_atividade ? ` · última manutenção lançada em ${dataHoraBR(e.ultima_atividade)}` : ""}
          </p>

          <div className="flex flex-wrap gap-2">
            <Botao tamanho="sm" onClick={() => rodar(() => adminAcessarEmpresa(e.id))} disabled={ocupado}>
              {ocupado ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Abrir no sistema
            </Botao>
            <Botao tamanho="sm" variante="secundario" onClick={() => setEditando(true)}>
              <Pencil className="h-4 w-4" />
              Editar dados
            </Botao>
            <BotaoExcluir
              acao={adminExcluirEmpresa.bind(null, e.id)}
              titulo="Excluir empresa"
              rotulo="Excluir empresa"
              mensagem={`"${e.nome}" será apagada com todos os ativos, manutenções, anexos, pneus e a conexão de WhatsApp. Os logins das pessoas continuam existindo. Não dá para desfazer.`}
            />
          </div>
          {!participo && (
            <p className="text-xs text-slate-500">
              &quot;Abrir no sistema&quot; coloca você na equipe desta empresa como gestor. Para sair depois, remova-se da
              lista abaixo.
            </p>
          )}
          {erro && <Erro>{erro}</Erro>}

          <div className="card overflow-hidden">
            <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800">
              <Users className="h-4 w-4 text-slate-400" />
              Equipe
            </header>
            <ul className="divide-y divide-slate-100">
              {e.membros.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Ninguém na equipe.</li>}
              {e.membros.map((m) => (
                <LinhaMembro key={m.user_id} orgId={e.id} membro={m} eu={m.user_id === eu} />
              ))}
            </ul>
            <AdicionarMembro orgId={e.id} />
          </div>

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
        </div>
      )}
    </li>
  );
}

function LinhaMembro({ orgId, membro: m, eu }: { orgId: string; membro: EmpresaAdmin["membros"][number]; eu: boolean }) {
  const { erro, ocupado, rodar } = useAcao();

  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-900">
            {m.nome ?? m.email}
            {eu && <span className="ml-1 text-xs text-slate-400">(você)</span>}
            {m.bloqueado && <span className="ml-1 text-xs text-red-600">bloqueado</span>}
          </p>
          <p className="truncate text-xs text-slate-500">{m.email}</p>
        </div>
        <select
          value={m.papel}
          onChange={(ev) => rodar(() => adminAlterarPapel(orgId, m.user_id, ev.target.value as PapelMembro))}
          disabled={ocupado}
          className="campo h-8 w-auto py-0 text-xs"
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
  const [enviando, iniciar] = useTransition();

  function enviar(fd: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await adminAdicionarMembro(fd);
      if (!r.ok) setErro(r.erro);
      else {
        (document.getElementById(`adicionar-${orgId}`) as HTMLFormElement | null)?.reset();
        router.refresh();
      }
    });
  }

  return (
    <form id={`adicionar-${orgId}`} action={enviar} className="space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
      {erro && <Erro>{erro}</Erro>}
      <input type="hidden" name="org_id" value={orgId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="email" type="email" required placeholder="E-mail de quem já tem login" className="campo min-w-0 flex-1" />
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
