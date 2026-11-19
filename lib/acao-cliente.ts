import { unstable_rethrow } from "next/navigation";
import { versaoDesatualizada } from "@/components/erro-tela";

/**
 * Chama uma server action a partir do navegador sem deixar a tela quebrar.
 *
 * As actions já devolvem `{ ok: false, erro }` para erros conhecidos, mas a
 * CHAMADA pode falhar antes de chegar nelas: internet caiu, servidor
 * reiniciando, ou a aba ainda tem a versão anterior depois de um deploy. Sem
 * isto, o erro subia para a fronteira de erro e o formulário digitado sumia.
 */
export async function chamarAcao<T>(acao: () => Promise<T>): Promise<T | { ok: false; erro: string }> {
  try {
    return await acao();
  } catch (e) {
    // Redirect/notFound vindos da action são do Next: ele mesmo navega.
    unstable_rethrow(e);
    console.error(e);
    const erro = e instanceof Error ? e : new Error(String(e));
    if (versaoDesatualizada(erro)) {
      return { ok: false, erro: "O sistema foi atualizado. Recarregue a página para continuar." };
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false, erro: "Sem internet. Confira a conexão e tente de novo." };
    }
    return { ok: false, erro: "Não consegui falar com o servidor agora. Tente de novo em instantes." };
  }
}
