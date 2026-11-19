import { CircleCheck, CircleX } from "lucide-react";
import { CartaoAtualizacao } from "@/components/admin/atualizacao";
import { Cabecalho, Secao } from "@/components/ui";
import { situacaoAtualizacao } from "@/lib/atualizacao";
import { carregarResumo, exigirSuperadminTela } from "@/lib/admin-console";

export const metadata = { title: "Sistema · Console do superadmin" };

/**
 * Estado do sistema: versão (com o botão de atualizar), saúde e superadmin.
 * Seções novas de operação entram aqui como mais um <Secao>.
 */
export default async function SistemaAdmin() {
  const sessao = await exigirSuperadminTela();
  const [resumo, atualizacao] = await Promise.all([carregarResumo(), situacaoAtualizacao()]);

  const itens: { rotulo: string; ok: boolean; detalhe: string }[] = [
    {
      rotulo: "Banco de dados",
      ok: !resumo.erro,
      detalhe: resumo.erro ? `Sem resposta: ${resumo.erro}` : "App → PostgREST → Postgres respondendo",
    },
    {
      rotulo: "Sessões abertas",
      ok: true,
      detalhe: resumo.dados ? `${resumo.dados.sessoes_ativas} agora` : "—",
    },
    {
      rotulo: "WhatsApp",
      ok: true,
      detalhe: resumo.dados ? `${resumo.dados.whatsapp_conectados} empresa(s) conectada(s)` : "—",
    },
  ];

  return (
    <>
      <Cabecalho titulo="Sistema" descricao="Versão, saúde do servidor e como o superadmin é definido." />

      <div className="space-y-5">
        <CartaoAtualizacao situacao={atualizacao} />

        <Secao titulo="Saúde">
          <ul className="divide-y divide-slate-100">
            {itens.map((i) => (
              <li key={i.rotulo} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                {i.ok ? (
                  <CircleCheck className="h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <CircleX className="h-5 w-5 shrink-0 text-red-600" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{i.rotulo}</p>
                  <p className="truncate text-xs text-slate-500">{i.detalhe}</p>
                </div>
              </li>
            ))}
          </ul>
        </Secao>

        <Secao titulo="Superadmin">
          <div className="space-y-2 px-4 py-4 text-sm text-slate-600 sm:px-5">
            <p>
              Login atual: <strong className="font-medium text-slate-900">{sessao.email}</strong>
            </p>
            <p>
              O superadmin vem da stack (<code>SUPERADMIN_EMAIL</code> e <code>SUPERADMIN_SENHA</code> no serviço{" "}
              <code>migrador</code>). Para trocar o e-mail ou a senha, mude na stack e faça o deploy. Ele só usa este
              console: não entra no sistema das empresas nem faz parte de nenhuma equipe.
            </p>
          </div>
        </Secao>
      </div>
    </>
  );
}
