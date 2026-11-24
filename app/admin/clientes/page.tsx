import { UsoClientes } from "@/components/admin/clientes";
import { Cabecalho } from "@/components/ui";
import { carregarAssinaturas, carregarEmpresas, carregarUso, exigirSuperadminTela } from "@/lib/admin-console";

export const metadata = { title: "Clientes e uso · Console do superadmin" };

/** Cada empresa cliente: quem é o dono, quanto cadastrou, espaço ocupado, WhatsApp e assinatura. */
export default async function ClientesAdmin() {
  await exigirSuperadminTela();
  const [empresas, assinaturas] = await Promise.all([carregarEmpresas(), carregarAssinaturas()]);
  const uso = empresas.dados ? await carregarUso(empresas.dados.map((e) => e.id)) : null;
  const erro = empresas.erro ?? uso?.erro;
  const situacoes = Object.fromEntries((assinaturas.dados?.empresas ?? []).map((a) => [a.org_id, a]));

  return (
    <>
      <Cabecalho
        titulo="Clientes e uso"
        descricao="Cada empresa que usa o sistema: equipe, cadastros, espaço ocupado (banco e arquivos), WhatsApp e situação da assinatura."
      />
      {erro || !uso?.dados ? (
        <p className="card px-5 py-4 text-sm text-red-700">
          Não foi possível calcular o uso: {erro ?? "sem dados"}. Confira se o migrador da versão nova rodou.
        </p>
      ) : (
        <UsoClientes empresas={empresas.dados ?? []} uso={uso.dados} assinaturas={situacoes} agora={Date.now()} />
      )}
    </>
  );
}
