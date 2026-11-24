import { Abas } from "@/components/abas";
import { AssinaturasAdmin } from "@/components/admin/assinaturas";
import { CartaoAtualizacao } from "@/components/admin/atualizacao";
import { CartaoBackup } from "@/components/admin/backup";
import { UsoClientes } from "@/components/admin/clientes";
import { CartaoGroq, IntegracoesAdmin } from "@/components/admin/integracoes";
import { ehFiltroUsuario } from "@/components/admin/tipos";
import { ListaUsuarios } from "@/components/admin/usuarios";
import { Cabecalho } from "@/components/ui";
import {
  carregarAssinaturas,
  carregarEmpresas,
  carregarGroq,
  carregarUso,
  carregarUsuarios,
  exigirSuperadminTela,
} from "@/lib/admin-console";
import { situacaoAtualizacao } from "@/lib/atualizacao";
import { urlSite } from "@/lib/auth/config";
import { situacaoBackup } from "@/lib/backup";

export const metadata = { title: "Gerência · Console do superadmin" };

/**
 * A única tela do console do superadmin: gerência dos usuários, quanto cada
 * cliente usa e se o WhatsApp dele está conectado, e as integrações (chaves de
 * serviços externos: o Groq do assistente e o Backblaze B2 do backup), além
 * das assinaturas (cobrança mensal por Pix, db/sql/74-assinaturas.sql). A
 * versão do sistema (com o botão Atualizar) fica num bloco abaixo.
 */
export default async function ConsoleAdmin({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; aba?: string }>;
}) {
  const sessao = await exigirSuperadminTela();
  const [{ filtro, aba }, usuarios, empresas, atualizacao, groq, backup, assinaturas] = await Promise.all([
    searchParams,
    carregarUsuarios(),
    carregarEmpresas(),
    situacaoAtualizacao(),
    carregarGroq(),
    situacaoBackup(),
    carregarAssinaturas(),
  ]);
  const pendentes = assinaturas.dados?.pagamentos.filter((p) => p.situacao === "pendente").length ?? 0;
  const uso = empresas.dados ? await carregarUso(empresas.dados.map((e) => e.id)) : null;
  const erro = usuarios.erro ?? empresas.erro;

  return (
    <>
      <Cabecalho
        titulo="Gerência"
        descricao="Usuários de todo o sistema, o uso de cada cliente e as integrações. Clique num usuário para ver os detalhes e as ações."
      />
      {erro ? (
        <p className="card px-5 py-4 text-sm text-red-700">
          Não foi possível carregar os dados: {erro}. Confira se o migrador da versão nova rodou.
        </p>
      ) : (
        <Abas
          inicial={aba === "clientes" ? 1 : aba === "assinaturas" ? 2 : aba === "integracoes" ? 3 : 0}
          abas={[
            {
              id: "usuarios",
              rotulo: "Usuários",
              contador: usuarios.dados?.length ?? 0,
              conteudo: (
                <ListaUsuarios
                  usuarios={usuarios.dados ?? []}
                  empresas={empresas.dados ?? []}
                  eu={sessao.userId}
                  urlSistema={urlSite()}
                  filtroInicial={ehFiltroUsuario(filtro) ? filtro : "todos"}
                  agora={Date.now()}
                />
              ),
            },
            {
              id: "clientes",
              rotulo: "Clientes e uso",
              contador: empresas.dados?.length ?? 0,
              conteudo:
                uso?.erro || !uso?.dados ? (
                  <p className="card px-5 py-4 text-sm text-red-700">
                    Não foi possível calcular o uso: {uso?.erro ?? "sem dados"}.
                  </p>
                ) : (
                  <UsoClientes empresas={empresas.dados ?? []} uso={uso.dados} />
                ),
            },
            {
              id: "assinaturas",
              rotulo: "Assinaturas",
              // Cobrança mensal por Pix: comprovantes, vencimentos, Pix e WhatsApp dos avisos.
              contador: pendentes,
              conteudo: assinaturas.dados ? (
                <AssinaturasAdmin dados={assinaturas.dados} />
              ) : (
                <p className="card px-5 py-4 text-sm text-red-700">
                  Não foi possível carregar as assinaturas: {assinaturas.erro}. Confira se o migrador da versão nova rodou.
                </p>
              ),
            },
            {
              id: "integracoes",
              rotulo: "Integrações",
              // Credenciais de serviços externos (Groq, Backblaze...), em sistema_credenciais.
              conteudo: (
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
              ),
            },
          ]}
        />
      )}
      <div className="mt-6">
        <CartaoAtualizacao situacao={atualizacao} />
      </div>
    </>
  );
}
