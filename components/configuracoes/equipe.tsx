"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Minus,
  Pencil,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  Wand2,
} from "lucide-react";
import { BotaoExcluir } from "@/components/confirmar";
import { Modal, RodapeModal } from "@/components/modal";
import { Badge, Botao, Campo, Secao, cn } from "@/components/ui";
import {
  alterarPapel,
  criarUsuario,
  desconectarMembro,
  editarMembro,
  redefinirSenha,
  removerMembro,
  type Credenciais,
} from "@/lib/actions/equipe";
import { cancelarConvite } from "@/lib/actions/convites";
import { dataBR, dataHoraBR, iniciais } from "@/lib/format";
import type { PapelMembro } from "@/lib/types";

export const PAPEIS: Record<
  PapelMembro,
  { label: string; classe: string; ponto: string; descricao: string }
> = {
  proprietario: {
    label: "Proprietário",
    classe: "bg-marca-50 text-marca-700 ring-marca-600/20",
    ponto: "bg-marca-500",
    descricao: "Acesso total, inclusive à equipe",
  },
  gestor: {
    label: "Gestor",
    classe: "bg-violet-50 text-violet-700 ring-violet-600/20",
    ponto: "bg-violet-500",
    descricao: "Cadastra e exclui tudo, gerencia a equipe",
  },
  tecnico: {
    label: "Técnico",
    classe: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    ponto: "bg-emerald-500",
    descricao: "Registra manutenções e movimenta pneus",
  },
  leitor: {
    label: "Leitor",
    classe: "bg-slate-100 text-slate-600 ring-slate-500/20",
    ponto: "bg-slate-400",
    descricao: "Somente consulta",
  },
};

const ORDEM_PAPEIS: PapelMembro[] = ["proprietario", "gestor", "tecnico", "leitor"];
const CONVIDAVEIS: PapelMembro[] = ["gestor", "tecnico", "leitor"];

/**
 * O que cada papel faz, em linguagem de gente. Espelha `lib/permissoes.ts`
 * (que espelha o RLS): mudou lá, muda aqui.
 */
const PERMISSOES: { rotulo: string; papeis: PapelMembro[] }[] = [
  { rotulo: "Ver ativos, manutenções e relatórios", papeis: ORDEM_PAPEIS },
  { rotulo: "Registrar manutenções e anexos", papeis: ["proprietario", "gestor", "tecnico"] },
  { rotulo: "Movimentar pneus no estoque", papeis: ["proprietario", "gestor", "tecnico"] },
  { rotulo: "Cadastrar e excluir ativos e planos", papeis: ["proprietario", "gestor"] },
  { rotulo: "Gerenciar a equipe e a empresa", papeis: ["proprietario", "gestor"] },
];

export type Membro = {
  user_id: string;
  papel: PapelMembro;
  created_at: string;
  nome: string | null;
  email: string | null;
  cargo: string | null;
  telefone: string | null;
  ultimo_acesso: string | null;
  sessoes_ativas: number;
  /** Login criado por esta empresa e só dela: o gestor pode trocar senha, desconectar e editar. */
  conta_da_empresa: boolean;
};

/** Convite para quem já tinha conta: só entra na equipe quando a pessoa aceita. */
export type ConviteEquipe = {
  id: string;
  email: string;
  nome: string | null;
  papel: PapelMembro;
  created_at: string;
};

/** Vez em que o superadmin entrou na conta de alguém daqui pelo "Entrar como". */
export type AcessoSuporte = {
  inicio: string;
  fim: string;
  usuario_email: string;
  motivo: string | null;
  alteracoes: number;
};

type CredenciaisOk = Extract<Credenciais, { ok: true }>;

const DIA = 86_400_000;

/**
 * "há 3 dias". O `agora` vem do servidor para o texto sair igual no servidor
 * e no navegador (sem erro de hidratação).
 */
function haQuanto(iso: string | null, agora: number) {
  if (!iso) return "Nunca entrou";
  const ms = agora - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 2) return "Agora há pouco";
  if (min < 60) return `Há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `Há ${horas} h`;
  const dias = Math.floor(ms / DIA);
  if (dias === 1) return "Ontem";
  if (dias < 30) return `Há ${dias} dias`;
  return `Em ${dataBR(iso)}`;
}

/** Cor fixa por pessoa: ajuda a reconhecer na lista sem ler o nome. */
const CORES_AVATAR = [
  "from-sky-400 to-blue-600",
  "from-violet-400 to-purple-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-600",
  "from-rose-400 to-pink-600",
  "from-cyan-400 to-sky-600",
  "from-lime-400 to-green-600",
];
function corAvatar(chave: string) {
  let h = 0;
  for (const c of chave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES_AVATAR[h % CORES_AVATAR.length];
}

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function PainelEquipe({
  membros,
  userId,
  podeGerenciar,
  urlSistema,
  agora,
  convites = [],
  acessosSuporte = [],
}: {
  membros: Membro[];
  convites?: ConviteEquipe[];
  acessosSuporte?: AcessoSuporte[];
  userId: string;
  podeGerenciar: boolean;
  urlSistema: string;
  agora: number;
}) {
  const [credenciais, setCredenciais] = useState<CredenciaisOk | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<PapelMembro | "todos">("todos");
  const [novoAberto, setNovoAberto] = useState(false);
  const [editando, setEditando] = useState<Membro | null>(null);

  const porPapel = useMemo(() => {
    const c = { proprietario: 0, gestor: 0, tecnico: 0, leitor: 0 } as Record<PapelMembro, number>;
    for (const m of membros) c[m.papel]++;
    return c;
  }, [membros]);

  const online = membros.filter((m) => m.sessoes_ativas > 0).length;
  const semana = membros.filter(
    (m) => m.ultimo_acesso && agora - new Date(m.ultimo_acesso).getTime() < 7 * DIA,
  ).length;
  const nunca = membros.filter((m) => !m.ultimo_acesso).length;

  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim());
    return membros
      .filter((m) => filtro === "todos" || m.papel === filtro)
      .filter(
        (m) =>
          !termo ||
          semAcento([m.nome, m.email, m.cargo, m.telefone].filter(Boolean).join(" ")).includes(termo),
      )
      .sort(
        (a, b) =>
          Number(b.user_id === userId) - Number(a.user_id === userId) ||
          ORDEM_PAPEIS.indexOf(a.papel) - ORDEM_PAPEIS.indexOf(b.papel) ||
          (a.nome ?? a.email ?? "").localeCompare(b.nome ?? b.email ?? "", "pt-BR"),
      );
  }, [membros, filtro, busca, userId]);

  const fecharNovo = useCallback(() => setNovoAberto(false), []);
  const fecharEdicao = useCallback(() => setEditando(null), []);
  const fecharCredenciais = useCallback(() => setCredenciais(null), []);

  return (
    <div className="space-y-4">
      {/* Números da equipe */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Pessoas na equipe" valor={membros.length} detalhe={resumoPapeis(porPapel)} />
        <Numero
          rotulo="Conectadas agora"
          valor={online}
          detalhe="Com sessão aberta"
          destaque={online > 0 ? "bg-emerald-500" : undefined}
        />
        <Numero rotulo="Ativas na semana" valor={semana} detalhe="Entraram nos últimos 7 dias" />
        <Numero
          rotulo="Ainda não entraram"
          valor={nunca}
          detalhe={nunca ? "Reenvie o acesso pelo WhatsApp" : "Todo mundo já entrou"}
          destaque={nunca > 0 ? "bg-amber-500" : undefined}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_20rem]">
        <Secao
          titulo="Pessoas"
          acoes={
            podeGerenciar ? (
              <Botao tamanho="sm" onClick={() => setNovoAberto(true)}>
                <UserPlus className="h-4 w-4" />
                Nova pessoa
              </Botao>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <Users className="h-3.5 w-3.5" />
                {membros.length} pessoa(s)
              </span>
            )
          }
        >
          {/* Busca e filtro por papel */}
          <div className="space-y-3 border-b border-slate-200 px-4 py-3 sm:px-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, e-mail, cargo ou telefone"
                aria-label="Buscar na equipe"
                className="campo pl-9"
              />
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filtrar por papel">
              <Filtro ativo={filtro === "todos"} onClick={() => setFiltro("todos")}>
                Todos <span className="opacity-60">{membros.length}</span>
              </Filtro>
              {ORDEM_PAPEIS.filter((p) => porPapel[p] > 0).map((p) => (
                <Filtro key={p} ativo={filtro === p} onClick={() => setFiltro(p)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", PAPEIS[p].ponto)} aria-hidden />
                  {PAPEIS[p].label} <span className="opacity-60">{porPapel[p]}</span>
                </Filtro>
              ))}
            </div>
          </div>

          {visiveis.length ? (
            <ul className="lista-escalonada divide-y divide-slate-100">
              {visiveis.map((m) => (
                <LinhaMembro
                  key={m.user_id}
                  membro={m}
                  eu={m.user_id === userId}
                  podeGerenciar={podeGerenciar}
                  agora={agora}
                  aoGerarSenha={setCredenciais}
                  aoEditar={setEditando}
                />
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <Search className="h-6 w-6 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">Ninguém encontrado</p>
              <button
                type="button"
                onClick={() => {
                  setBusca("");
                  setFiltro("todos");
                }}
                className="mt-1 text-sm font-medium text-marca-600 hover:text-marca-700"
              >
                Limpar busca e filtro
              </button>
            </div>
          )}

          {!podeGerenciar && (
            <p className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 sm:px-5">
              Só o proprietário ou um gestor pode adicionar pessoas e alterar acessos.
            </p>
          )}
        </Secao>

        <QuadroPermissoes />
      </div>

      {podeGerenciar && acessosSuporte.length > 0 && (
        <Secao titulo="Acessos do suporte">
          <p className="border-b border-slate-200 px-4 py-2.5 text-xs text-slate-500 sm:px-5">
            Vezes em que o administrador do sistema abriu a conta de alguém da equipe para dar suporte (últimos 6 meses).
          </p>
          <ul className="divide-y divide-slate-100" data-acessos-suporte>
            {acessosSuporte.map((a) => (
              <li key={`${a.inicio}-${a.usuario_email}`} className="px-4 py-3 text-sm sm:px-5">
                <p className="text-slate-900">
                  <span className="font-medium">{dataHoraBR(a.inicio)}</span> na conta de {a.usuario_email}
                </p>
                <p className="text-xs text-slate-500">
                  {a.motivo ?? "Sem motivo informado"} · até {dataHoraBR(a.fim)} ·{" "}
                  {a.alteracoes === 0 ? "nada alterado" : `${a.alteracoes} alteração(ões)`}
                </p>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {podeGerenciar && convites.length > 0 && (
        <Secao titulo="Convites pendentes">
          <ul className="divide-y divide-slate-100">
            {convites.map((c) => (
              <li key={c.id} data-convite-pendente={c.email} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{c.nome ?? c.email}</p>
                  <p className="truncate text-xs text-slate-500">
                    {c.email} · {PAPEIS[c.papel].label} · convidado(a) em {dataBR(c.created_at)} · aguardando a pessoa aceitar
                  </p>
                </div>
                <BotaoExcluir
                  compacto
                  acao={cancelarConvite.bind(null, c.id)}
                  titulo="Cancelar convite"
                  mensagem={`O convite para ${c.email} deixa de valer.`}
                />
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {podeGerenciar && (
        <NovoUsuario
          aberto={novoAberto}
          aoFechar={fecharNovo}
          aoCriar={(c) => {
            setNovoAberto(false);
            setCredenciais(c);
          }}
        />
      )}
      {editando && <EditarMembro membro={editando} aoFechar={fecharEdicao} />}

      <JanelaCredenciais credenciais={credenciais} urlSistema={urlSistema} aoFechar={fecharCredenciais} />
    </div>
  );
}

function resumoPapeis(c: Record<PapelMembro, number>) {
  const plural: Record<PapelMembro, string> = {
    proprietario: "proprietários",
    gestor: "gestores",
    tecnico: "técnicos",
    leitor: "leitores",
  };
  const partes = ORDEM_PAPEIS.filter((p) => c[p] > 0 && p !== "proprietario").map(
    (p) => `${c[p]} ${c[p] > 1 ? plural[p] : PAPEIS[p].label.toLowerCase()}`,
  );
  return partes.length ? partes.join(" · ") : "Só você por enquanto";
}

function Numero({
  rotulo,
  valor,
  detalhe,
  destaque,
}: {
  rotulo: string;
  valor: number;
  detalhe: string;
  destaque?: string;
}) {
  return (
    <div className="card px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {destaque && (
          <span className="relative flex h-2 w-2">
            <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden", destaque)} />
            <span className={cn("relative h-2 w-2 rounded-full", destaque)} />
          </span>
        )}
        {rotulo}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{valor}</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{detalhe}</p>
    </div>
  );
}

function Filtro({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "pressionavel inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        ativo
          ? "border-slate-900 bg-slate-900 text-slate-50"
          : "border-slate-200 bg-superficie text-slate-600 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

function QuadroPermissoes() {
  return (
    <Secao titulo="O que cada papel pode fazer">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="px-4 py-2.5 text-left font-medium sm:px-5">
                <span className="sr-only">Permissão</span>
              </th>
              {ORDEM_PAPEIS.map((p) => (
                <th key={p} className="px-1 py-2.5 font-medium" title={PAPEIS[p].descricao}>
                  <span className={cn("mx-auto mb-1 block h-1.5 w-1.5 rounded-full", PAPEIS[p].ponto)} aria-hidden />
                  {PAPEIS[p].label.slice(0, 4)}.
                  <span className="sr-only">{PAPEIS[p].label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {PERMISSOES.map((linha) => (
              <tr key={linha.rotulo}>
                <td className="px-4 py-2.5 text-slate-700 sm:px-5">{linha.rotulo}</td>
                {ORDEM_PAPEIS.map((p) => (
                  <td key={p} className="px-1 py-2.5 text-center">
                    {linha.papeis.includes(p) ? (
                      <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Sim" />
                    ) : (
                      <Minus className="mx-auto h-4 w-4 text-slate-300" aria-label="Não" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 sm:px-5">
        As regras valem no banco de dados: mesmo quem tentar burlar a tela é barrado.
      </p>
    </Secao>
  );
}

function LinhaMembro({
  membro: m,
  eu,
  podeGerenciar,
  agora,
  aoGerarSenha,
  aoEditar,
}: {
  membro: Membro;
  eu: boolean;
  podeGerenciar: boolean;
  agora: number;
  aoGerarSenha: (c: CredenciaisOk) => void;
  aoEditar: (m: Membro) => void;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const editavel = podeGerenciar && !eu && m.papel !== "proprietario";
  const nome = m.nome ?? m.email ?? "Usuário";
  const conectado = m.sessoes_ativas > 0;

  function executar(acao: () => Promise<void>) {
    setErro(null);
    setAviso(null);
    iniciar(acao);
  }

  const trocarPapel = (papel: PapelMembro) =>
    executar(async () => {
      const r = await alterarPapel(m.user_id, papel);
      if (!r.ok) setErro(r.erro);
      router.refresh();
    });

  const novaSenha = () =>
    executar(async () => {
      const r = await redefinirSenha(m.user_id);
      if (r.ok) {
        aoGerarSenha(r);
        router.refresh();
      } else setErro(r.erro);
    });

  const desconectar = () =>
    executar(async () => {
      const r = await desconectarMembro(m.user_id);
      if (r.ok) {
        setAviso(`${nome.split(" ")[0]} foi desconectado(a) de todos os aparelhos.`);
        router.refresh();
      } else setErro(r.erro);
    });

  return (
    <li className={cn("px-4 py-3.5 transition-colors sm:px-5", eu && "bg-marca-50/40")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <span className="relative shrink-0">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white shadow-sm",
              corAvatar(m.user_id),
            )}
          >
            {iniciais(nome)}
          </span>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-superficie",
              conectado ? "bg-emerald-500" : "bg-slate-300",
            )}
            title={conectado ? "Conectado agora" : "Desconectado"}
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-900">
            <span className="truncate">{nome}</span>
            {eu && <span className="shrink-0 text-xs font-normal text-slate-400">(você)</span>}
            {!editavel && (
              <Badge className={cn("shrink-0", PAPEIS[m.papel].classe)}>{PAPEIS[m.papel].label}</Badge>
            )}
          </p>
          <p className="truncate text-xs text-slate-500">
            {m.email}
            {m.cargo ? ` · ${m.cargo}` : ""}
            {m.telefone ? ` · ${m.telefone}` : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            <span
              className={cn(!m.ultimo_acesso && "font-medium text-amber-600")}
              title={m.ultimo_acesso ? `Último acesso: ${dataHoraBR(m.ultimo_acesso)}` : undefined}
            >
              {haQuanto(m.ultimo_acesso, agora)}
            </span>
            {" · "}na equipe desde {dataBR(m.created_at)}
          </p>
        </div>

        {editavel && (
          <div className="flex w-full items-center gap-1 sm:w-auto">
            <select
              value={m.papel}
              onChange={(e) => trocarPapel(e.target.value as PapelMembro)}
              disabled={ocupado}
              className="campo h-8 w-auto flex-1 py-0 text-xs sm:flex-none"
              aria-label={`Papel de ${nome}`}
            >
              {CONVIDAVEIS.map((p) => (
                <option key={p} value={p}>
                  {PAPEIS[p].label}
                </option>
              ))}
            </select>
            {ocupado ? (
              <span className="flex h-8 w-8 items-center justify-center text-slate-400">
                <LoaderCircle className="h-4 w-4 animate-spin" />
              </span>
            ) : (
              m.conta_da_empresa && (
                // Conta que a pessoa mesma criou é dela: senha e dados, só ela troca.
                <>
                  <BotaoIcone titulo="Editar dados" onClick={() => aoEditar(m)}>
                    <Pencil className="h-4 w-4" />
                  </BotaoIcone>
                  <BotaoIcone titulo="Gerar nova senha" onClick={novaSenha}>
                    <KeyRound className="h-4 w-4" />
                  </BotaoIcone>
                  {conectado && (
                    <BotaoIcone titulo="Desconectar de todos os aparelhos" onClick={desconectar}>
                      <LogOut className="h-4 w-4" />
                    </BotaoIcone>
                  )}
                </>
              )
            )}
            <BotaoExcluir
              compacto
              acao={removerMembro.bind(null, m.user_id)}
              titulo="Remover acesso"
              mensagem={`${nome} perderá o acesso aos dados desta empresa. Se o login foi criado aqui e a pessoa não participa de outra empresa, o login também é apagado.`}
            />
          </div>
        )}
      </div>
      {erro && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</p>}
      {aviso && (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <Check className="h-3.5 w-3.5" />
          {aviso}
        </p>
      )}
    </li>
  );
}

function BotaoIcone({
  titulo,
  onClick,
  children,
}: {
  titulo: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className="pressionavel rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
    >
      {children}
    </button>
  );
}

function NovoUsuario({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: (c: CredenciaisOk) => void;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [papel, setPapel] = useState<PapelMembro>("tecnico");
  const [enviando, iniciar] = useTransition();

  function enviar(fd: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await criarUsuario(fd);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setPapel("tecnico");
      aoCriar(r);
      router.refresh();
    });
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Nova pessoa na equipe"
      descricao="O login já nasce dentro desta empresa."
      largura="max-w-lg"
    >
      <form action={enviar}>
        <div className="space-y-4 px-5 py-5">
          {erro && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Nome" obrigatorio>
              <input name="nome" required placeholder="Nome da pessoa" className="campo" autoFocus />
            </Campo>
            <Campo label="E-mail (login)" obrigatorio>
              <input name="email" type="email" required placeholder="pessoa@empresa.com.br" className="campo" />
            </Campo>
          </div>
          <Campo label="Senha" hint="Deixe em branco para gerar uma senha automática.">
            <input
              name="senha"
              type="text"
              minLength={8}
              autoComplete="new-password"
              placeholder="Gerar automaticamente"
              className="campo"
            />
          </Campo>

          <fieldset>
            <legend className="rotulo">Papel</legend>
            <input type="hidden" name="papel" value={papel} />
            <div className="grid gap-2">
              {CONVIDAVEIS.map((p) => (
                <label
                  key={p}
                  className={cn(
                    "pressionavel flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors",
                    papel === p
                      ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                      : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <input
                    type="radio"
                    name="papel-escolha"
                    checked={papel === p}
                    onChange={() => setPapel(p)}
                    className="sr-only"
                  />
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PAPEIS[p].ponto)} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900">{PAPEIS[p].label}</span>
                    <span className="block text-xs text-slate-500">{PAPEIS[p].descricao}</span>
                  </span>
                  {papel === p && <Check className="h-4 w-4 shrink-0 text-slate-900" />}
                </label>
              ))}
            </div>
          </fieldset>

          <p className="text-xs text-slate-500">
            No final aparecem o e-mail e a senha para copiar ou mandar no WhatsApp. Se o e-mail já
            tiver conta, a pessoa só é adicionada à equipe.
          </p>
        </div>

        <RodapeModal>
          <Botao type="button" variante="secundario" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={enviando}>
            {enviando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Criar acesso
          </Botao>
        </RodapeModal>
      </form>
    </Modal>
  );
}

function EditarMembro({ membro: m, aoFechar }: { membro: Membro; aoFechar: () => void }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  function enviar(fd: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await editarMembro(m.user_id, fd);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      aoFechar();
      router.refresh();
    });
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Editar dados" descricao={m.email ?? undefined} largura="max-w-md">
      <form action={enviar}>
        <div className="space-y-4 px-5 py-5">
          {erro && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
          )}
          <Campo label="Nome" obrigatorio>
            <input name="nome" required defaultValue={m.nome ?? ""} className="campo" />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Cargo">
              <input name="cargo" defaultValue={m.cargo ?? ""} placeholder="Ex.: Mecânico" className="campo" />
            </Campo>
            <Campo label="Telefone">
              <input name="telefone" defaultValue={m.telefone ?? ""} placeholder="(11) 99999-9999" className="campo" />
            </Campo>
          </div>
        </div>
        <RodapeModal>
          <Botao type="button" variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando}>
            {salvando && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Salvar
          </Botao>
        </RodapeModal>
      </form>
    </Modal>
  );
}

export function JanelaCredenciais({
  credenciais,
  urlSistema,
  aoFechar,
}: {
  credenciais: { nome: string; email: string; senha: string | null; aviso?: string } | null;
  urlSistema: string;
  aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState<string | null>(null);
  if (!credenciais) return null;

  const url = urlSistema || (typeof window !== "undefined" ? window.location.origin : "");
  const mensagem = [
    `Olá${credenciais.nome ? `, ${credenciais.nome.split(" ")[0]}` : ""}! Seu acesso ao sistema de manutenção:`,
    "",
    `Endereço: ${url}/login`,
    `E-mail: ${credenciais.email}`,
    ...(credenciais.senha ? [`Senha: ${credenciais.senha}`, "", "Troque a senha em Configurações depois do primeiro acesso."] : []),
  ].join("\n");

  async function copiar(chave: string, valor: string) {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(chave);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setCopiado(null);
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Acesso pronto" largura="max-w-md">
      <div className="space-y-4 px-5 py-5">
        {credenciais.aviso ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">{credenciais.aviso}</p>
        ) : (
          <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Anote ou envie agora: por segurança, a senha não é mostrada de novo.
          </p>
        )}

        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          <LinhaCredencial rotulo="Endereço" valor={`${url}/login`} copiado={copiado === "url"} aoCopiar={() => copiar("url", `${url}/login`)} />
          <LinhaCredencial rotulo="E-mail" valor={credenciais.email} copiado={copiado === "email"} aoCopiar={() => copiar("email", credenciais.email)} />
          {credenciais.senha && (
            <LinhaCredencial
              rotulo="Senha"
              valor={credenciais.senha}
              destaque
              copiado={copiado === "senha"}
              aoCopiar={() => copiar("senha", credenciais.senha!)}
            />
          )}
        </div>
      </div>

      <RodapeModal>
        <Botao variante="secundario" onClick={() => copiar("tudo", mensagem)}>
          {copiado === "tudo" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copiado === "tudo" ? "Copiado" : "Copiar tudo"}
        </Botao>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="pressionavel inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <MessageCircle className="h-4 w-4" />
          Enviar no WhatsApp
        </a>
      </RodapeModal>
    </Modal>
  );
}

function LinhaCredencial({
  rotulo,
  valor,
  destaque,
  copiado,
  aoCopiar,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
  copiado: boolean;
  aoCopiar: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
        <p className={cn("truncate text-sm text-slate-900", destaque && "font-mono text-base font-semibold tracking-wide")}>
          {valor}
        </p>
      </div>
      <button
        type="button"
        onClick={aoCopiar}
        className="pressionavel shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        aria-label={`Copiar ${rotulo.toLowerCase()}`}
      >
        {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
