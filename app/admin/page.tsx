import { Abas } from "@/components/abas";
import { CartaoAtualizacao } from "@/components/admin/atualizacao";
import { UsoClientes } from "@/components/admin/clientes";
import { ehFiltroUsuario } from "@/components/admin/tipos";
import { ListaUsuarios } from "@/components/admin/usuarios";
import { Cabecalho } from "@/components/ui";
import { carregarEmpresas, carregarUso, carregarUsuarios, exigirSuperadminTela } from "@/lib/admin-console";
import { situacaoAtualizacao } from "@/lib/atualizacao";
import { urlSite } from "@/lib/auth/config";

export const metadata = { title: "Gerência · Console do superadmin" };

/**
 * A única tela do console do superadmin: gerência dos usuários e, na outra
 * aba, quanto cada cliente usa e se o WhatsApp dele está conectado. A versão do
 * sistema (com o botão Atualizar) fica num bloco abaixo.
 */
export default async function ConsoleAdmin({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; aba?: string }>;
}) {
  const sessao = await exigirSuperadminTela();
  const [{ filtro, aba }, usuarios, empresas, atualizacao] = await Promise.all([
    searchParams,
    carregarUsuarios(),
    carregarEmpresas(),
    situacaoAtualizacao(),
  ]);
  const uso = empresas.dados ? await carregarUso(empresas.dados.map((e) => e.id)) : null;
  const erro = usuarios.erro ?? empresas.erro;

  return (
    <>
      <Cabecalho
        titulo="Gerência"
        descricao="Usuários de todo o sistema e o uso de cada cliente. Clique num usuário para ver os detalhes e as ações."
      />
      {erro ? (
        <p className="card px-5 py-4 text-sm text-red-700">
          Não foi possível carregar os dados: {erro}. Confira se o migrador da versão nova rodou.
        </p>
      ) : (
        <Abas
          inicial={aba === "clientes" ? 1 : 0}
          abas={[
            {
              id: "usuarios",
              rotulo: "Usuários",
              contador: usuarios.dados?.length ?? 0,
              conteudo: (
                <ListaUsuarios
                  usuarios={usuarios.dados ?? []}
                  empresas={empresas.dados ?? []}
                  eu={sessao.userId}
                  urlSistema={urlSite()}
                  filtroInicial={ehFiltroUsuario(filtro) ? filtro : "todos"}
                  agora={Date.now()}
                />
              ),
            },
            {
              id: "clientes",
              rotulo: "Clientes e uso",
              contador: empresas.dados?.length ?? 0,
              conteudo:
                uso?.erro || !uso?.dados ? (
                  <p className="card px-5 py-4 text-sm text-red-700">
                    Não foi possível calcular o uso: {uso?.erro ?? "sem dados"}.
                  </p>
                ) : (
                  <UsoClientes empresas={empresas.dados ?? []} uso={uso.dados} />
                ),
            },
          ]}
        />
      )}
      <div className="mt-6">
        <CartaoAtualizacao situacao={atualizacao} />
      </div>
    </>
  );
}
