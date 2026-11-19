import { CabecalhoEsqueleto, CartoesEsqueleto, ListaEsqueleto } from "@/components/esqueleto";

export default function Carregando() {
  return (
    <>
      <CabecalhoEsqueleto comAcoes={false} />
      <CartoesEsqueleto />
      <div className="mt-4">
        <ListaEsqueleto linhas={8} />
      </div>
    </>
  );
}
