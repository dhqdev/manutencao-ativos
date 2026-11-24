import { CabecalhoEsqueleto, ListaEsqueleto, PainelEsqueleto } from "@/components/esqueleto";

export default function Carregando() {
  return (
    <>
      <CabecalhoEsqueleto comAcoes={false} />
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[22rem_1fr]">
        <PainelEsqueleto>
          <div className="h-72" />
        </PainelEsqueleto>
        <ListaEsqueleto linhas={4} />
      </div>
    </>
  );
}
