import { CartaoAtualizacao } from "@/components/admin/atualizacao";
import { ehFiltroUsuario } from "@/components/admin/tipos";
import { ListaUsuarios } from "@/components/admin/usuarios";
import { Cabecalho } from "@/components/ui";
import { carregarEmpresas, carregarUsuarios, exigirSuperadminTela } from "@/lib/admin-console";
import { situacaoAtualizacao } from "@/lib/atualizacao";
import { urlSite } from "@/lib/auth/config";

export const metadata = { title: "Usuários · Console do superadmin" };

/**
 * A única tela do console do superadmin: a gerência dos usuários. A versão do
 * sistema (com o botão Atualizar) fica num bloco abaixo da lista.
 */
export default async function ConsoleAdmin({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const sessao = await exigirSuperadminTela();
  const [{ filtro }, usuarios, empresas, atualizacao] = await Promise.all([
    searchParams,
    carregarUsuarios(),
    carregarEmpresas(),
    situacaoAtualizacao(),
  ]);
  const erro = usuarios.erro ?? empresas.erro;

  return (
    <>
      <Cabecalho
        titulo="Usuários"
        descricao="Todos os logins do sistema. Clique num usuário para ver os detalhes, as empresas e as ações."
      />
      {erro ? (
        <p className="card px-5 py-4 text-sm text-red-700">
          Não foi possível carregar os usuários: {erro}. Confira se o migrador da versão nova rodou.
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
      <div className="mt-6">
        <CartaoAtualizacao situacao={atualizacao} />
      </div>
    </>
  );
}
