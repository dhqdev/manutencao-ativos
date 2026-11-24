import { cookies } from "next/headers";
import { AvisoAssinatura } from "@/components/shell/aviso-assinatura";
import { AvisoEntrarComo } from "@/components/shell/aviso-entrar-como";
import { ConvitesPendentes, type ConvitePendente } from "@/components/shell/convites-pendentes";
import { usuarioPorId } from "@/lib/auth/usuarios";
import { createClient } from "@/lib/db/server";
import { emailConfigurado } from "@/lib/email";
import { Navegacao } from "@/components/shell/navegacao";
import { getContextoSemBloqueio } from "@/lib/session";
import { COOKIE_MENU, menuRecolhido } from "@/lib/menu-lateral";
import { festaNaTela } from "@/lib/festas";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Uma única chamada ao banco traz usuário, empresa e o total de alertas.
  // Os convites vão junto, em paralelo (antes esperavam o contexto).
  // Sem o bloqueio da assinatura: o layout envolve também a tela de
  // Assinatura, que abre bloqueada. Cada página (getContexto) é que leva
  // para /assinatura quando a empresa está bloqueada.
  const [ctx, biscoitos, todosConvites] = await Promise.all([getContextoSemBloqueio(), cookies(), meusConvites()]);
  // Convites para outras empresas: quem aceita é a pessoa, não o superadmin no "Entrar como".
  const convites = ctx.entradaComo ? [] : todosConvites;
  const emailConfirmado = convites.length ? (await usuarioPorId(ctx.userId))?.email_confirmado !== false : true;

  return (
    <Navegacao
      nomeUsuario={ctx.profile.nome ?? ctx.email}
      emailUsuario={ctx.email}
      nomeEmpresa={ctx.organizacao.nome}
      papel={ctx.papel}
      alertas={ctx.alertas}
      recolhidoInicial={menuRecolhido(biscoitos.get(COOKIE_MENU)?.value)}
      festa={festaNaTela(biscoitos)}
    >
      {ctx.entradaComo && (
        <AvisoEntrarComo
          nome={ctx.profile.nome ?? ctx.email}
          email={ctx.email}
          empresa={ctx.organizacao.nome}
        />
      )}
      <AvisoAssinatura situacao={ctx.assinatura} />
      {convites.length > 0 && (
        <ConvitesPendentes convites={convites} emailConfirmado={emailConfirmado} podeEnviarEmail={emailConfigurado()} />
      )}
      {children}
    </Navegacao>
  );
}

async function meusConvites(): Promise<ConvitePendente[]> {
  try {
    const { data } = await (await createClient()).rpc("meus_convites");
    return (data as ConvitePendente[] | null) ?? []; // banco sem 73-convites.sql: nada
  } catch {
    return []; // sem sessão: o getContexto() ao lado já leva ao login
  }
}
