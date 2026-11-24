import type { PapelMembro } from "@/lib/types";

/** Formatos devolvidos pelas funções admin_* do banco (db/sql/30-superadmin.sql). */

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
  /** Login ou último uso da sessão (bancos antigos não mandam: cai no login). */
  ultimo_acesso?: string | null;
  sessoes: number;
  empresas: { id: string; nome: string; papel: PapelMembro }[];
};

export type MembroAdmin = {
  user_id: string;
  papel: PapelMembro;
  email: string;
  nome: string | null;
  bloqueado: boolean;
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
  /** Último acesso de alguém da empresa (login ou uso da sessão). */
  ultimo_acesso?: string | null;
  whatsapp: string | null;
  whatsapp_numero: string | null;
  membros: MembroAdmin[];
};

export const PAPEIS: Record<PapelMembro, { label: string; classe: string }> = {
  proprietario: { label: "Proprietário", classe: "bg-marca-50 text-marca-700 ring-marca-600/20" },
  gestor: { label: "Gestor", classe: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  tecnico: { label: "Técnico", classe: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  leitor: { label: "Leitor", classe: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};
export const LISTA_PAPEIS = Object.keys(PAPEIS) as PapelMembro[];

/** Filtros da lista de usuários (também usados nos atalhos da visão geral). */
export const FILTROS_USUARIO = {
  todos: "Todos",
  recentes: "Usaram em 7 dias",
  nunca: "Nunca entraram",
  sem_empresa: "Sem empresa",
  bloqueados: "Bloqueados",
} as const;
export type FiltroUsuario = keyof typeof FILTROS_USUARIO;

const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;

/**
 * Último acesso de verdade. A sessão dura 30 dias e se renova com o uso, então
 * só o login (last_sign_in_at) envelhece para quem usa todo dia sem sair.
 */
export const ultimoAcesso = (u: Pick<UsuarioAdmin, "last_sign_in_at" | "ultimo_acesso">) =>
  u.ultimo_acesso ?? u.last_sign_in_at;

export function passaNoFiltro(u: UsuarioAdmin, filtro: FiltroUsuario, agora: number) {
  switch (filtro) {
    case "recentes":
      return !!ultimoAcesso(u) && agora - new Date(ultimoAcesso(u)!).getTime() < SETE_DIAS;
    case "nunca":
      return !u.last_sign_in_at;
    case "sem_empresa":
      return !u.superadmin && u.empresas.length === 0;
    case "bloqueados":
      return u.bloqueado;
    default:
      return true;
  }
}

export const ehFiltroUsuario = (v: unknown): v is FiltroUsuario =>
  typeof v === "string" && Object.hasOwn(FILTROS_USUARIO, v);

/**
 * "há 5 min", "há 3 dias"… A partir do instante do servidor (`agora`), para o
 * texto sair igual no servidor e no navegador (sem erro de hidratação).
 */
export function tempoRelativo(iso: string | null, agora: number) {
  if (!iso) return "nunca";
  const seg = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000));
  if (seg < 60) return "agora há pouco";
  const min = Math.round(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} dia${d > 1 ? "s" : ""}`;
  const m = Math.round(d / 30);
  if (m < 12) return `há ${m} ${m > 1 ? "meses" : "mês"}`;
  const a = Math.round(m / 12);
  return `há ${a} ano${a > 1 ? "s" : ""}`;
}

export const ORDENS = {
  acesso: "Último acesso",
  nome: "Nome",
  novos: "Mais novos",
} as const;
export type Ordem = keyof typeof ORDENS;

/** Quanto uma empresa ocupa: linhas/bytes no banco e arquivos no disco. */
export type UsoEmpresa = {
  org_id: string;
  linhas: number;
  bytesBanco: number;
  arquivos: number;
  bytesArquivos: number;
};

export function tamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const un = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < un.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${un[i]}`;
}
