import { cookies } from "next/headers";
import { Navegacao } from "@/components/shell/navegacao";
import { getContexto } from "@/lib/session";
import { COOKIE_MENU, menuRecolhido } from "@/lib/menu-lateral";
import { COOKIE_NATAL, diasParaONatal, natalLigado } from "@/lib/natal";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Uma única chamada ao banco traz usuário, empresa e o total de alertas.
  const [ctx, biscoitos] = await Promise.all([getContexto(), cookies()]);

  return (
    <Navegacao
      nomeUsuario={ctx.profile.nome ?? ctx.email}
      emailUsuario={ctx.email}
      nomeEmpresa={ctx.organizacao.nome}
      papel={ctx.papel}
      alertas={ctx.alertas}
      recolhidoInicial={menuRecolhido(biscoitos.get(COOKIE_MENU)?.value)}
      natal={{
        ligado: natalLigado(biscoitos.get(COOKIE_NATAL)?.value),
        dias: diasParaONatal(),
      }}
    >
      {children}
    </Navegacao>
  );
}
