import type { NextRequest } from "next/server";
import { proxySessao } from "@/lib/proxy-sessao";

export async function proxy(request: NextRequest) {
  return proxySessao(request);
}

export const config = {
  matcher: [
    /**
     * Tudo, menos:
     *  - assets do Next e imagens;
     *  - o service worker e o manifest (o navegador busca sem sessão; se caíssem
     *    no redirecionamento para /login, o PWA não instalaria);
     *  - /api/arquivos: o proxy do Next guarda o corpo da requisição em memória
     *    (até 10 MB) — um anexo de 25 MB não pode passar por ele. A rota confere
     *    a própria assinatura e põe os próprios cabeçalhos de segurança.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icones/|api/arquivos|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
