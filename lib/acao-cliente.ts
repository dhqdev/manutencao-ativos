import type { FormEvent } from "react";
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

/**
 * Envio de formulário SEM a limpeza automática do React 19. Use
 * `<form onSubmit={enviarSemLimpar(enviar)}>`, nunca `<form action={enviar}>`.
 *
 * Com uma função em `action`, o React limpa o formulário quando ela termina,
 * mesmo quando a action devolveu erro: num diálogo, o que a pessoa digitou
 * sumia; e o `<select>` volta ao valor de quando a página abriu (ele não
 * acompanha o `defaultValue` novo). Era assim que o "Horário do envio" do
 * WhatsApp voltava para o horário antigo logo depois de salvo, e o próximo
 * "Salvar" gravava o valor velho por cima. Quem precisa limpar chama
 * `form.reset()` (como `limparAoSalvar` de `FormularioSalvar`).
 */
export function enviarSemLimpar(
  acao: (dados: FormData) => void,
  iniciar: (f: () => void) => void = (f) => f(),
) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    iniciar(() => acao(dados));
  };
}
