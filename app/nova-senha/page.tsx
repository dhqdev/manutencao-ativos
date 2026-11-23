import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MolduraAuth } from "@/components/auth/moldura";
import { COOKIE_RECUPERACAO, lerCookieRecuperacao, obterSessao } from "@/lib/auth/sessao";
import { SENHA_MINIMO } from "@/lib/auth/regras-senha";
import { FormNovaSenha } from "./form";

export const metadata = { title: "Nova senha · Gestão de Manutenção" };

export default async function NovaSenhaPage() {
  // Esta tela troca a senha sem pedir a atual: só vale logo depois do link do
  // e-mail. Quem já está logado troca em Configurações, informando a atual.
  const sessao = await obterSessao();
  const recuperacao = lerCookieRecuperacao((await cookies()).get(COOKIE_RECUPERACAO)?.value);
  if (!sessao) redirect("/recuperar-senha");
  if (recuperacao !== sessao.sessaoId) redirect("/configuracoes");

  return (
    <MolduraAuth titulo="Definir nova senha" subtitulo={`Escolha uma senha com no mínimo ${SENHA_MINIMO} caracteres.`}>
      <FormNovaSenha />
    </MolduraAuth>
  );
}

/**
 * Renderização dinâmica obrigatória: o nonce da CSP vem do cabeçalho da
 * requisição. Se esta página for pré-gerada no build, os scripts saem sem nonce
 * e o navegador bloqueia TODO o JavaScript dela.
 */
export const dynamic = "force-dynamic";
