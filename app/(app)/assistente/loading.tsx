import { CabecalhoEsqueleto, PainelEsqueleto } from "@/components/esqueleto";

export default function Carregando() {
  return (
    <>
      <CabecalhoEsqueleto comAcoes={false} />
      <PainelEsqueleto>
        <div className="h-96" />
      </PainelEsqueleto>
    </>
  );
}
