import { MolduraAuth } from "@/components/auth/moldura";
import { BotaoLink } from "@/components/ui";
import { FormLogin } from "./form";
import { caminhoInterno } from "@/lib/url-segura";

export const metadata = { title: "Entrar · Gestão de Manutenção" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; erro?: string; conta?: string }>;
}) {
  const { redirect: bruto, erro, conta } = await searchParams;

  // Nunca deixa um destino externo chegar sequer ao formulário.
  const destino = caminhoInterno(bruto);

  return (
    <MolduraAuth
      titulo="Bem-vindo de volta"
      subtitulo="Entre para acompanhar a manutenção dos seus ativos."
      aviso={
        conta === "excluida"
          ? "Sua conta foi excluída. Todos os dados vinculados a ela foram removidos."
          : undefined
      }
      rodape={
        <>
          <div className="mb-5 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            Novo por aqui?
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <BotaoLink href="/cadastro" variante="secundario" className="h-11 w-full justify-center">
            Criar conta grátis
          </BotaoLink>
        </>
      }
    >
      <FormLogin
        destino={destino}
        avisoInicial={
          erro === "link_invalido" ? "Link inválido ou expirado. Tente novamente." : undefined
        }
      />
    </MolduraAuth>
  );
}
