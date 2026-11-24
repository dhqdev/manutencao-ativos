import { AssinaturasAdmin } from "@/components/admin/assinaturas";
import { Cabecalho } from "@/components/ui";
import { carregarAssinaturas, exigirSuperadminTela } from "@/lib/admin-console";
import { hoje } from "@/lib/format";

export const metadata = { title: "Assinaturas · Console do superadmin" };

/**
 * Cobrança mensal por Pix (db/sql/74-assinaturas.sql): comprovantes para
 * conferir, vencimento e bloqueio de cada empresa, Pix e WhatsApp dos avisos.
 */
export default async function AssinaturasPagina() {
  await exigirSuperadminTela();
  const assinaturas = await carregarAssinaturas();

  return (
    <>
      <Cabecalho
        titulo="Assinaturas"
        descricao="O comprovante que o cliente anexa já vale, sem aprovação. Aqui você vê os comprovantes, marca algum como falso, acompanha o vencimento de cada empresa e bloqueia o acesso quando quiser."
      />
      {assinaturas.dados ? (
        <AssinaturasAdmin dados={assinaturas.dados} mesAtual={hoje().slice(0, 7)} agora={Date.now()} />
      ) : (
        <p className="card px-5 py-4 text-sm text-red-700">
          Não foi possível carregar as assinaturas: {assinaturas.erro}. Confira se o migrador da versão nova rodou.
        </p>
      )}
    </>
  );
}
