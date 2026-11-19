/**
 * Envio de arquivo pelo navegador, direto para o servidor (PUT
 * /api/arquivos/<caminho>), com a autorização emitida pela server action.
 * O arquivo não passa pela server action — o corpo dela é limitado a 1 MB.
 */
export async function enviarArquivo(
  caminho: string,
  token: string,
  arquivo: File,
): Promise<{ error: { message: string } | null }> {
  const url = `/api/arquivos/${caminho.split("/").map(encodeURIComponent).join("/")}`;

  try {
    const resposta = await fetch(url, {
      method: "PUT",
      headers: {
        "x-token": token,
        "Content-Type": arquivo.type || "application/octet-stream",
      },
      body: arquivo,
    });

    if (resposta.ok) return { error: null };

    let mensagem = `Falha no envio (${resposta.status}).`;
    try {
      const corpo = (await resposta.json()) as { erro?: string };
      if (corpo.erro) mensagem = corpo.erro;
    } catch {
      // resposta sem JSON
    }
    return { error: { message: mensagem } };
  } catch {
    return { error: { message: "Sem conexão com o servidor. Confira a internet e tente de novo." } };
  }
}
