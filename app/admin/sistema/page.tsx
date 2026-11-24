import { CartaoAtualizacao } from "@/components/admin/atualizacao";
import { Cabecalho } from "@/components/ui";
import { exigirSuperadminTela } from "@/lib/admin-console";
import { situacaoAtualizacao } from "@/lib/atualizacao";

export const metadata = { title: "Versão e atualização · Console do superadmin" };

/** Versão no ar, a última publicada e o botão Atualizar (o serviço atualizador aplica). */
export default async function SistemaPagina() {
  await exigirSuperadminTela();
  const atualizacao = await situacaoAtualizacao();

  return (
    <>
      <Cabecalho
        titulo="Versão e atualização"
        descricao="Qual versão está no ar e se já saiu uma nova. O botão Atualizar aplica o banco e troca os serviços sozinho, sem abrir o Portainer."
      />
      <CartaoAtualizacao situacao={atualizacao} />
    </>
  );
}
