import "server-only";
import { PostgrestClient } from "@supabase/postgrest-js";
import { segredoBanco, urlRest } from "@/lib/auth/config";
import { assinarJwt } from "@/lib/auth/jwt";

/**
 * Cliente do banco como SERVIDOR (papel service_role): IGNORA o RLS.
 *
 * Usado só onde nenhuma sessão de usuário serve: autenticação (login,
 * sessões, senhas), a rotina diária que varre todas as empresas, e a gestão
 * de equipe depois que a permissão já foi conferida com a sessão de quem pediu.
 * Nunca use para buscar dados de tela.
 */
export function createAdminClient() {
  const token = assinarJwt({ role: "service_role" }, segredoBanco(), 300);
  return new PostgrestClient(urlRest(), {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30_000,
  });
}
