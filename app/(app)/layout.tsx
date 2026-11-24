import { cookies } from "next/headers";
import { AvisoEntrarComo } from "@/components/shell/aviso-entrar-como";
import { ConvitesPendentes, type ConvitePendente } from "@/components/shell/convites-pendentes";
import { usuarioPorId } from "@/lib/auth/usuarios";
import { createClient } from "@/lib/db/server";
import { emailConfigurado } from "@/lib/email";
import { Navegacao } from "@/components/shell/navegacao";
import { getContexto } from "@/lib/session";
import { COOKIE_MENU, menuRecolhido } from "@/lib/menu-lateral";
import { COOKIE_NATAL, diasParaONatal, natalLigado } from "@/lib/natal";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Uma única chamada ao banco traz usuário, empresa e o total de alertas.
  const [ctx, biscoitos] = await Promise.all([getContexto(), cookies()]);
  // Convites para outras empresas: quem aceita é a pessoa, não o superadmin no "Entrar como".
  const convites = ctx.entradaComo ? [] : await meusConvites();
  const emailConfirmado = convites.length ? (await usuarioPorId(ctx.userId))?.email_confirmado !== false : true;

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
      {ctx.entradaComo && (
        <AvisoEntrarComo
          nome={ctx.profile.nome ?? ctx.email}
          email={ctx.email}
          empresa={ctx.organizacao.nome}
        />
      )}
      {convites.length > 0 && (
        <ConvitesPendentes convites={convites} emailConfirmado={emailConfirmado} podeEnviarEmail={emailConfigurado()} />
      )}
      {children}
    </Navegacao>
  );
}

async function meusConvites(): Promise<ConvitePendente[]> {
  const { data } = await (await createClient()).rpc("meus_convites");
  return (data as ConvitePendente[] | null) ?? []; // banco sem 73-convites.sql: nada
}
