import type { PapelMembro } from "@/lib/types";

/**
 * O que cada papel pode fazer. Espelha as policies de RLS (db/migracao-v2.sql):
 * a tela usa isto só para esconder botões — quem barra de verdade é o banco.
 *
 *   proprietário / gestor -> tudo, inclusive equipe e configurações da empresa
 *   técnico               -> registra manutenções, anexos e movimenta pneus
 *   leitor                -> só consulta
 */
export function podeGerenciar(papel: PapelMembro) {
  return papel === "proprietario" || papel === "gestor";
}

export function podeRegistrar(papel: PapelMembro) {
  return papel !== "leitor";
}

export const SEM_PERMISSAO = "Seu papel nesta empresa não permite esta ação. Fale com o gestor.";

/**
 * No "Entrar como" o superadmin vê e corrige dados, mas o que é da pessoa fica
 * com ela: senha (dela ou da equipe) e excluir a conta.
 */
export const ENTRAR_COMO_SEM_SENHA =
  "No \"Entrar como\" não dá para trocar senhas nem excluir a conta: isso fica com a própria pessoa.";
