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
  whatsapp: string | null;
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
  recentes: "Entraram em 7 dias",
  nunca: "Nunca entraram",
  sem_empresa: "Sem empresa",
  bloqueados: "Bloqueados",
} as const;
export type FiltroUsuario = keyof typeof FILTROS_USUARIO;

const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;

export function passaNoFiltro(u: UsuarioAdmin, filtro: FiltroUsuario, agora: number) {
  switch (filtro) {
    case "recentes":
      return !!u.last_sign_in_at && agora - new Date(u.last_sign_in_at).getTime() < SETE_DIAS;
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
