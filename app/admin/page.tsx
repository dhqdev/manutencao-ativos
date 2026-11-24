import { redirect } from "next/navigation";
import { ehFiltroUsuario } from "@/components/admin/tipos";
import { ListaUsuarios } from "@/components/admin/usuarios";
import { Cabecalho } from "@/components/ui";
import { carregarEmpresas, carregarUsuarios, exigirSuperadminTela } from "@/lib/admin-console";
import { urlSite } from "@/lib/auth/config";

export const metadata = { title: "Usuários · Console do superadmin" };

/** Endereços antigos (?aba=...) das abas que viraram páginas do menu lateral. */
const ABAS_ANTIGAS: Record<string, string> = {
  clientes: "/admin/clientes",
  assinaturas: "/admin/assinaturas",
  integracoes: "/admin/integracoes",
};

/**
 * Primeira seção do console: todas as pessoas com login no sistema. As outras
 * seções (Clientes e uso, Assinaturas, Integrações e backup, Versão) ficam no
 * menu lateral, cada uma na sua página (components/admin/console.tsx).
 */
export default async function UsuariosAdmin({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; aba?: string }>;
}) {
  const sessao = await exigirSuperadminTela();
  const { filtro, aba } = await searchParams;
  // Links antigos (mensagem de WhatsApp já enviada, favoritos) continuam valendo.
  if (aba && Object.hasOwn(ABAS_ANTIGAS, aba)) redirect(ABAS_ANTIGAS[aba]);

  const [usuarios, empresas] = await Promise.all([carregarUsuarios(), carregarEmpresas()]);
  const erro = usuarios.erro ?? empresas.erro;

  return (
    <>
      <Cabecalho
        titulo="Usuários"
        descricao="Todas as pessoas com login no sistema, de todas as empresas. Clique numa pessoa para ver os detalhes, trocar senha, bloquear ou entrar como ela."
      />
      {erro ? (
        <p className="card px-5 py-4 text-sm text-red-700">
          Não foi possível carregar os dados: {erro}. Confira se o migrador da versão nova rodou.
        </p>
      ) : (
        <ListaUsuarios
          usuarios={usuarios.dados ?? []}
          empresas={empresas.dados ?? []}
          eu={sessao.userId}
          urlSistema={urlSite()}
          filtroInicial={ehFiltroUsuario(filtro) ? filtro : "todos"}
          agora={Date.now()}
        />
      )}
    </>
  );
}
