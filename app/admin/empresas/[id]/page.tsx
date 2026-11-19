import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Numero } from "@/components/admin/comum";
import { AcoesEmpresa, EquipeEmpresa } from "@/components/admin/empresas";
import { Cabecalho } from "@/components/ui";
import { carregarEmpresas, exigirSuperadminTela } from "@/lib/admin-console";
import { dataBR, dataHoraBR } from "@/lib/format";

export const metadata = { title: "Empresa · Console do superadmin" };

export default async function EmpresaAdmin({ params }: { params: Promise<{ id: string }> }) {
  await exigirSuperadminTela();
  const [{ id }, empresas] = await Promise.all([params, carregarEmpresas()]);
  if (empresas.erro) {
    return <p className="card px-5 py-4 text-sm text-red-700">Não foi possível carregar a empresa: {empresas.erro}</p>;
  }

  const e = empresas.dados?.find((x) => x.id === id);
  if (!e) notFound();

  const dono = e.membros.find((m) => m.papel === "proprietario");
  const dados: [string, string][] = [
    ["Proprietário", dono ? `${dono.nome ?? dono.email} (${dono.email})` : "ninguém — defina na equipe abaixo"],
    ["Criada em", dataBR(e.created_at)],
    ["CNPJ", e.cnpj ?? "—"],
    ["Telefone", e.telefone ?? "—"],
    ["Última manutenção lançada", e.ultima_atividade ? dataHoraBR(e.ultima_atividade) : "nenhuma"],
  ];

  return (
    <>
      <Link
        href="/admin/empresas"
        className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" /> Empresas
      </Link>
      <Cabecalho titulo={e.nome} descricao="Dados, números e equipe da empresa." acoes={<AcoesEmpresa empresa={e} />} />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Numero rotulo="Pessoas" valor={e.membros.length} />
        <Numero rotulo="Ativos" valor={Number(e.ativos)} />
        <Numero rotulo="Manutenções" valor={Number(e.manutencoes)} />
        <Numero rotulo="WhatsApp" valor={e.whatsapp === "conectado" ? "Conectado" : "Desligado"} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="card overflow-hidden">
          <header className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 sm:px-5">
            Dados
          </header>
          <dl className="divide-y divide-slate-100 text-sm">
            {dados.map(([rotulo, valor]) => (
              <div key={rotulo} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-3 sm:px-5">
                <dt className="shrink-0 text-slate-500 sm:w-48">{rotulo}</dt>
                <dd className="min-w-0 break-words text-slate-900">{valor}</dd>
              </div>
            ))}
          </dl>
        </section>

        <EquipeEmpresa empresa={e} />
      </div>
    </>
  );
}
