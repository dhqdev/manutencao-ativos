import { ConsoleAdmin } from "@/components/admin/console";
import { carregarContadores, nomeDoSuperadmin } from "@/lib/admin-console";

export const metadata = { title: "Console do superadmin · Gestão de Manutenção" };

/**
 * Console do superadmin: fora do grupo (app) de propósito. Não carrega empresa,
 * menu nem dados de nenhuma empresa — só a gerência do sistema.
 */
export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const [{ nome, email }, contadores] = await Promise.all([nomeDoSuperadmin(), carregarContadores()]);
  return (
    <ConsoleAdmin nome={nome} email={email} contadores={contadores}>
      {children}
    </ConsoleAdmin>
  );
}
