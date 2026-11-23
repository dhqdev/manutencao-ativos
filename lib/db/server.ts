import "server-only";
import { PostgrestClient } from "@supabase/postgrest-js";
import { segredoBanco, urlRest } from "@/lib/auth/config";
import { assinarJwt } from "@/lib/auth/jwt";
import { obterSessao } from "@/lib/auth/sessao";

/**
 * Cliente do banco COM a identidade de quem está logado.
 *
 * Fala com o nosso PostgREST (container "rest", rede interna) mandando um
 * JWT de 5 minutos { sub: <usuário>, role: "authenticated" }. No banco,
 * auth.uid() lê esse sub e o RLS mostra só as linhas da empresa da pessoa.
 *
 * `@supabase/postgrest-js` é só a biblioteca cliente do PostgREST (código
 * aberto, MIT) — nenhum serviço ou conta do Supabase é usado.
 *
 * Sem sessão, o cliente vai sem token: o PostgREST usa o papel "anon", que
 * não enxerga nada.
 */
export type Db = PostgrestClient;

export async function createClient(): Promise<Db> {
  const sessao = await obterSessao();
  const headers: Record<string, string> = {};

  if (sessao) {
    const token = assinarJwt(
      {
        sub: sessao.userId,
        email: sessao.email,
        role: "authenticated",
        // "Entrar como": o banco anota cada alteração feita nesta sessão
        // (db/sql/79-entrar-como-auditoria.sql). Vem da sessão do banco, nunca do navegador.
        ...(sessao.entradaComo ? { entrada_como: sessao.sessaoId } : {}),
      },
      segredoBanco(),
      300,
    );
    headers.Authorization = `Bearer ${token}`;
  }

  return new PostgrestClient(urlRest(), { headers, timeout: 30_000 });
}
