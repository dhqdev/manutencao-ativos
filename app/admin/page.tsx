import Link from "next/link";
import { ArrowRight, Ban, Building2, CircleAlert, UserX } from "lucide-react";
import { Numero } from "@/components/admin/comum";
import { Cabecalho, Secao } from "@/components/ui";
import { carregarEmpresas, carregarResumo, carregarUsuarios, exigirSuperadminTela } from "@/lib/admin-console";
import { dataBR, dataHoraBR, moeda } from "@/lib/format";

export const metadata = { title: "Visão geral · Console do superadmin" };

export default async function VisaoGeral() {
  await exigirSuperadminTela();
  const [resumo, usuarios, empresas] = await Promise.all([carregarResumo(), carregarUsuarios(), carregarEmpresas()]);
  const erro = resumo.erro ?? usuarios.erro ?? empresas.erro;

  if (erro || !resumo.dados || !usuarios.dados || !empresas.dados) {
    return (
      <>
        <Cabecalho titulo="Visão geral" />
        <p className="card px-5 py-4 text-sm text-red-700">
          Não foi possível carregar o console: {erro}. Confira se o migrador da versão nova rodou.
        </p>
      </>
    );
  }

  const r = resumo.dados;
  const pessoas = usuarios.dados.filter((u) => !u.superadmin);
  const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;
  const agora = Date.now();
  const recentes = pessoas.filter(
    (u) => u.last_sign_in_at && agora - new Date(u.last_sign_in_at).getTime() < SETE_DIAS,
  ).length;
  const semEmpresa = pessoas.filter((u) => u.empresas.length === 0).length;
  const semDono = empresas.dados.filter((e) => !e.membros.some((m) => m.papel === "proprietario")).length;

  const atencao = [
    { qtd: r.bloqueados, texto: "usuário(s) bloqueado(s)", href: "/admin/usuarios?filtro=bloqueados", Icone: Ban },
    { qtd: semEmpresa, texto: "usuário(s) sem empresa", href: "/admin/usuarios?filtro=sem_empresa", Icone: UserX },
    { qtd: semDono, texto: "empresa(s) sem proprietário", href: "/admin/empresas", Icone: Building2 },
  ].filter((a) => a.qtd > 0);

  const ultimosAcessos = [...pessoas]
    .filter((u) => u.last_sign_in_at)
    .sort((a, b) => b.last_sign_in_at!.localeCompare(a.last_sign_in_at!))
    .slice(0, 6);
  const empresasRecentes = [...empresas.dados].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);

  return (
    <>
      <Cabecalho titulo="Visão geral" descricao="O sistema inteiro: todas as empresas e todos os usuários." />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Numero rotulo="Usuários" valor={pessoas.length} detalhe={`${recentes} entraram nos últimos 7 dias`} />
        <Numero rotulo="Empresas" valor={Number(r.empresas)} detalhe={`${r.whatsapp_conectados} com WhatsApp conectado`} />
        <Numero rotulo="Ativos" valor={Number(r.ativos)} detalhe={`${r.pneus} pneus no estoque`} />
        <Numero
          rotulo="Manutenções"
          valor={Number(r.manutencoes)}
          detalhe={`${moeda(Number(r.gasto_total))} registrados`}
        />
      </div>
      <p className="mb-5 mt-2 text-xs text-slate-500">{r.sessoes_ativas} sessão(ões) aberta(s) agora</p>

      {atencao.length > 0 && (
        <section className="card mb-5 overflow-hidden border-amber-200">
          <header className="flex items-center gap-2 border-b border-amber-200 bg-amber-50/70 px-4 py-3 text-sm font-semibold text-amber-900 sm:px-5">
            <CircleAlert className="h-4 w-4" /> Pede atenção
          </header>
          <ul className="divide-y divide-slate-100">
            {atencao.map(({ qtd, texto, href, Icone }) => (
              <li key={texto}>
                <Link href={href} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50 sm:px-5">
                  <Icone className="h-4 w-4 text-slate-400" />
                  <span className="flex-1 text-slate-700">
                    <strong className="font-semibold text-slate-900">{qtd}</strong> {texto}
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Secao
          titulo="Últimos acessos"
          acoes={
            <Link href="/admin/usuarios" className="text-xs font-medium text-marca-700 hover:underline">
              Ver usuários
            </Link>
          }
        >
          {ultimosAcessos.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Ninguém entrou ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {ultimosAcessos.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-900">{u.nome ?? u.email}</p>
                    <p className="truncate text-xs text-slate-500">
                      {u.empresas.map((e) => e.nome).join(", ") || "sem empresa"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">{dataHoraBR(u.last_sign_in_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao
          titulo="Empresas mais novas"
          acoes={
            <Link href="/admin/empresas" className="text-xs font-medium text-marca-700 hover:underline">
              Ver empresas
            </Link>
          }
        >
          {empresasRecentes.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Nenhuma empresa ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {empresasRecentes.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/admin/empresas/${e.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-900">{e.nome}</p>
                      <p className="truncate text-xs text-slate-500">
                        {e.membros.length} pessoa(s) · {e.ativos} ativo(s)
                      </p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">{dataBR(e.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>
    </>
  );
}
