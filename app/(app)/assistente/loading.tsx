import { Bloco } from "@/components/esqueleto";

/** Esqueleto no formato da conversa: título curto em cima, campo embaixo. */
export default function Carregando() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10.5rem)] w-full max-w-3xl flex-col lg:min-h-[calc(100dvh-6rem)]">
      <Bloco className="h-7 w-32" />
      <div className="flex-1" />
      <Bloco className="h-12 rounded-2xl" />
    </div>
  );
}
