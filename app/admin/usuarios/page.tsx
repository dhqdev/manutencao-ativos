import { ehFiltroUsuario } from "@/components/admin/tipos";
import { ListaUsuarios } from "@/components/admin/usuarios";
import { Cabecalho } from "@/components/ui";
import { carregarEmpresas, carregarUsuarios, exigirSuperadminTela } from "@/lib/admin-console";
import { urlSite } from "@/lib/auth/config";

export const metadata = { title: "Usuários · Console do superadmin" };

export default async function UsuariosAdmin({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const sessao = await exigirSuperadminTela();
  const [{ filtro }, usuarios, empresas] = await Promise.all([searchParams, carregarUsuarios(), carregarEmpresas()]);
  const erro = usuarios.erro ?? empresas.erro;

  return (
    <>
      <Cabecalho
        titulo="Usuários"
        descricao="Todos os logins do sistema: criar, editar, trocar senha, encerrar sessões, bloquear e excluir."
      />
      {erro ? (
        <p className="card px-5 py-4 text-sm text-red-700">Não foi possível carregar os usuários: {erro}</p>
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
