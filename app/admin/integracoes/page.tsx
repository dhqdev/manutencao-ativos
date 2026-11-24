import { CartaoBackup } from "@/components/admin/backup";
import { CartaoGroq, IntegracoesAdmin } from "@/components/admin/integracoes";
import { Cabecalho } from "@/components/ui";
import { carregarGroq, exigirSuperadminTela } from "@/lib/admin-console";
import { situacaoBackup } from "@/lib/backup";

export const metadata = { title: "Integrações e backup · Console do superadmin" };

/** Chaves de serviços externos (sistema_credenciais): o Groq do assistente e o Backblaze B2 do backup. */
export default async function IntegracoesPagina() {
  await exigirSuperadminTela();
  const [groq, backup] = await Promise.all([carregarGroq(), situacaoBackup()]);

  return (
    <>
      <Cabecalho
        titulo="Integrações e backup"
        descricao="Chaves dos serviços de fora que o sistema usa. Elas ficam guardadas no banco e nunca voltam inteiras para a tela."
      />
      <IntegracoesAdmin>
        {groq.dados ? (
          <CartaoGroq situacao={groq.dados} />
        ) : (
          <p className="card px-5 py-4 text-sm text-red-700">
            Não foi possível ler as integrações: {groq.erro}. Confira se o migrador da versão nova rodou.
          </p>
        )}
        <CartaoBackup situacao={backup} />
      </IntegracoesAdmin>
    </>
  );
}
