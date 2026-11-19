import { ListaEmpresas } from "@/components/admin/empresas";
import { Cabecalho } from "@/components/ui";
import { carregarEmpresas, exigirSuperadminTela } from "@/lib/admin-console";

export const metadata = { title: "Empresas · Console do superadmin" };

export default async function EmpresasAdmin() {
  await exigirSuperadminTela();
  const empresas = await carregarEmpresas();

  return (
    <>
      <Cabecalho
        titulo="Empresas"
        descricao="Todas as empresas do sistema. Abra uma para ver os números, editar os dados e cuidar da equipe."
      />
      {empresas.erro ? (
        <p className="card px-5 py-4 text-sm text-red-700">Não foi possível carregar as empresas: {empresas.erro}</p>
      ) : (
        <ListaEmpresas empresas={empresas.dados ?? []} />
      )}
    </>
  );
}
