import { notFound } from "next/navigation";
import { PainelAdmin, type EmpresaAdmin, type ResumoAdmin, type UsuarioAdmin } from "@/components/admin/painel-admin";
import { Cabecalho } from "@/components/ui";
import { urlSite } from "@/lib/auth/config";
import { createAdminClient } from "@/lib/db/admin";
import { getContexto } from "@/lib/session";

export const metadata = { title: "Administração · Gestão de Manutenção" };

/**
 * Painel do superadmin: todas as empresas e todos os usuários do sistema.
 * Quem não é superadmin recebe 404 (nem fica sabendo que a tela existe).
 */
export default async function AdminPage() {
  const { superadmin, userId } = await getContexto();
  if (!superadmin) notFound();

  const admin = createAdminClient();
  const [resumo, usuarios, empresas] = await Promise.all([
    admin.rpc("admin_resumo"),
    admin.rpc("admin_usuarios"),
    admin.rpc("admin_empresas"),
  ]);

  const erro = resumo.error ?? usuarios.error ?? empresas.error;

  return (
    <>
      <Cabecalho
        titulo="Administração do sistema"
        descricao="Todas as empresas e todos os usuários. Só o superadmin vê esta tela."
      />
      {erro ? (
        <p className="card px-5 py-4 text-sm text-red-700">
          Não foi possível carregar o painel: {erro.message}. Confira se o migrador da versão nova rodou.
        </p>
      ) : (
        <PainelAdmin
          resumo={resumo.data as ResumoAdmin}
          usuarios={(usuarios.data ?? []) as UsuarioAdmin[]}
          empresas={(empresas.data ?? []) as EmpresaAdmin[]}
          eu={userId}
          urlSistema={urlSite()}
        />
      )}
    </>
  );
}
