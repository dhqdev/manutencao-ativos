import { CabecalhoEsqueleto, CartoesEsqueleto, ListaEsqueleto, PainelEsqueleto } from "@/components/esqueleto";

export default function Carregando() {
  return (
    <>
      <CabecalhoEsqueleto comAcoes={false} />
      <CartoesEsqueleto />
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[1fr_20rem]">
        <ListaEsqueleto linhas={4} />
        <PainelEsqueleto>
          <div className="h-56" />
        </PainelEsqueleto>
      </div>
    </>
  );
}
