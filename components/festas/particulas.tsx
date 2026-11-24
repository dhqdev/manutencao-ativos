import type { CSSProperties, ReactNode } from "react";
import { Snowflake } from "lucide-react";
import type { IdFesta } from "@/lib/festas";
import { sorteador } from "./sorteio";

/*
 * Movimento de fundo do menu lateral e do painel das telas de entrada: neve,
 * confete, fagulhas da fogueira... Só transform e opacity (a GPU cuida, sem
 * repintar a tela), poucas peças e nada no conteúdo. O atraso negativo faz a
 * animação já começar no meio: ao abrir, a neve já está caindo, em vez de
 * tudo nascer junto no topo. Para quem pediu menos movimento, some (globals.css).
 */

type Estilo = CSSProperties & Record<`--${string}`, string>;

type Peca = { x: number; duracao: number; atraso: number; tamanho: number; amplitude: number; balanco: number; variante: number };

function sortear(semente: number, quantas: number, faixa: { duracao: [number, number]; tamanho: [number, number] }) {
  const r = sorteador(semente);
  return Array.from({ length: quantas }, (_, i): Peca => {
    const duracao = r(...faixa.duracao);
    return {
      // Espalha pela largura em faixas, com um desvio: sorteio puro amontoa.
      x: Math.min(97, Math.round(((i + r(0.15, 0.85)) / quantas) * 100)),
      duracao,
      atraso: -r(0, duracao),
      tamanho: r(...faixa.tamanho),
      amplitude: r(4, 14),
      balanco: r(2.6, 5.5),
      variante: Math.floor(r(0, 5.99)),
    };
  });
}

/** Queda com balanço lateral: o de fora cai, o do meio oscila, o de dentro é a peça. */
function Caindo({ p, children, opacidade }: { p: Peca; children: ReactNode; opacidade?: number }) {
  return (
    <span
      className="festa-cair absolute -top-6"
      style={{ left: `${p.x}%`, animationDuration: `${p.duracao}s`, animationDelay: `${p.atraso}s`, opacity: opacidade }}
    >
      <span
        className="festa-oscilar block"
        style={{ animationDuration: `${p.balanco}s`, animationDelay: `${-p.balanco * (p.variante / 5)}s`, "--amplitude": `${p.amplitude}px` } as Estilo}
      >
        {children}
      </span>
    </span>
  );
}

function Subindo({ p, children, altura }: { p: Peca; children: ReactNode; altura: string }) {
  return (
    <span
      className="festa-subir absolute -bottom-4"
      style={{ left: `${p.x}%`, animationDuration: `${p.duracao}s`, animationDelay: `${p.atraso}s`, "--altura": altura } as Estilo}
    >
      <span
        className="festa-oscilar block"
        style={{ animationDuration: `${p.balanco}s`, animationDelay: `${-p.balanco * (p.variante / 5)}s`, "--amplitude": `${p.amplitude * 0.6}px` } as Estilo}
      >
        {children}
      </span>
    </span>
  );
}

/* ---------- Natal: neve em três camadas (fundo desfocado e lento, frente nítida) ---------- */
const NEVE_FUNDO = sortear(25, 9, { duracao: [18, 26], tamanho: [2, 3] });
const NEVE_MEIO = sortear(12, 7, { duracao: [12, 16], tamanho: [3, 4.5] });
const NEVE_FRENTE = sortear(2026, 5, { duracao: [9, 13], tamanho: [8, 11] });

function Neve() {
  return (
    <>
      {NEVE_FUNDO.map((p, i) => (
        <Caindo key={`f${i}`} p={p} opacidade={0.3}>
          <span className="block rounded-full bg-white blur-[1px]" style={{ width: p.tamanho, height: p.tamanho }} />
        </Caindo>
      ))}
      {NEVE_MEIO.map((p, i) => (
        <Caindo key={`m${i}`} p={p} opacidade={0.5}>
          <span className="block rounded-full bg-white" style={{ width: p.tamanho, height: p.tamanho }} />
        </Caindo>
      ))}
      {NEVE_FRENTE.map((p, i) => (
        <Caindo key={`n${i}`} p={p} opacidade={0.38}>
          <Snowflake className="block text-white" style={{ width: p.tamanho, height: p.tamanho }} strokeWidth={1.6} />
        </Caindo>
      ))}
    </>
  );
}

/* ---------- Carnaval: confete de papel girando no ar ---------- */
const CORES_CONFETE = ["#f472b6", "#facc15", "#22d3ee", "#a78bfa", "#fb923c", "#4ade80"];
const CONFETE = sortear(7, 14, { duracao: [11, 17], tamanho: [4, 6] });

function Confete() {
  return (
    <>
      {CONFETE.map((p, i) => {
        const redondo = p.variante === 0;
        return (
          <Caindo key={i} p={p} opacidade={0.7}>
            <span
              className="festa-girar-3d block"
              style={
                {
                  width: redondo ? p.tamanho : p.tamanho * 0.7,
                  height: redondo ? p.tamanho : p.tamanho * 1.5,
                  borderRadius: redondo ? "999px" : "1px",
                  background: CORES_CONFETE[i % CORES_CONFETE.length],
                  animationDuration: `${1.4 + p.variante * 0.35}s`,
                  "--eixo-x": i % 2 ? "1" : "0.3",
                  "--eixo-y": i % 3 ? "0.4" : "1",
                } as Estilo
              }
            />
          </Caindo>
        );
      })}
    </>
  );
}

/* ---------- Dia das Mães: poucas pétalas caindo devagar ---------- */
const PETALAS = sortear(510, 7, { duracao: [16, 22], tamanho: [7, 10] });

function Petalas() {
  return (
    <>
      {PETALAS.map((p, i) => (
        <Caindo key={i} p={p} opacidade={0.55}>
          <span
            className="festa-girar-3d block"
            style={
              {
                width: p.tamanho,
                height: p.tamanho * 0.75,
                borderRadius: "80% 0 80% 0",
                background: "linear-gradient(135deg, #fbcfe8, #f472b6)",
                animationDuration: `${4 + p.variante}s`,
                "--eixo-x": "0.4",
                "--eixo-y": "1",
              } as Estilo
            }
          />
        </Caindo>
      ))}
    </>
  );
}

/* ---------- São João: fagulhas subindo da fogueira (pé do menu) ---------- */
const FAGULHAS = sortear(624, 10, { duracao: [5, 8], tamanho: [2, 3.5] });

function Fagulhas() {
  return (
    <>
      {FAGULHAS.map((p, i) => (
        <Subindo key={i} p={p} altura="38vh">
          <span
            className="block rounded-full"
            style={{
              width: p.tamanho,
              height: p.tamanho,
              background: i % 3 ? "#fdba74" : "#fde047",
              boxShadow: `0 0 ${p.tamanho * 2}px ${i % 3 ? "#f97316" : "#facc15"}`,
            }}
          />
        </Subindo>
      ))}
    </>
  );
}

/* ---------- Dia das Crianças: bolhas de sabão subindo ---------- */
const BOLHAS = sortear(1210, 8, { duracao: [16, 24], tamanho: [7, 14] });

function Bolhas() {
  return (
    <>
      {BOLHAS.map((p, i) => (
        <Subindo key={i} p={p} altura="105dvh">
          <span
            className="block rounded-full ring-1 ring-white/30"
            style={{
              width: p.tamanho,
              height: p.tamanho,
              background:
                "radial-gradient(circle at 32% 30%, rgb(255 255 255 / 0.55) 0 14%, transparent 22%), radial-gradient(circle at 50% 50%, transparent 55%, rgb(165 243 252 / 0.18) 80%, rgb(240 171 252 / 0.22))",
            }}
          />
        </Subindo>
      ))}
    </>
  );
}

/* ---------- Ano Novo: estrelas cintilando paradas no céu do menu ---------- */
const ESTRELAS = (() => {
  const r = sorteador(2027);
  return Array.from({ length: 14 }, (_, i) => ({
    x: Math.min(96, Math.round(((i % 7) + r(0.1, 0.9)) * (100 / 7))),
    y: Math.round(((Math.floor(i / 7) + r(0.05, 0.95)) / 2) * 92),
    tamanho: i % 3 === 0 ? r(7, 10) : r(2, 3),
    duracao: r(2.6, 5.2),
    atraso: -r(0, 5),
    brilho: i % 3 === 0,
  }));
})();

function Estrelas() {
  return (
    <>
      {ESTRELAS.map((e, i) => (
        <span
          key={i}
          className="festa-cintilar absolute"
          style={{
            left: `${e.x}%`,
            top: `${e.y}%`,
            width: e.tamanho,
            height: e.tamanho,
            opacity: 0.45,
            animationDuration: `${e.duracao}s`,
            animationDelay: `${e.atraso}s`,
          }}
        >
          {e.brilho ? (
            <svg viewBox="0 0 24 24" className="block h-full w-full">
              <path d="M12 0C12.9 8 16 11.1 24 12 16 12.9 12.9 16 12 24 11.1 16 8 12.9 0 12 8 11.1 11.1 8 12 0Z" fill="#fde68a" />
            </svg>
          ) : (
            <span className="block h-full w-full rounded-full bg-amber-100" />
          )}
        </span>
      ))}
    </>
  );
}

const AMBIENTES: Partial<Record<IdFesta, () => ReactNode>> = {
  natal: Neve,
  "ano-novo": Estrelas,
  carnaval: Confete,
  maes: Petalas,
  junina: Fagulhas,
  criancas: Bolhas,
};

/** Fundo animado da data, dentro de um contêiner `relative` escuro. Datas sem ambiente: nada. */
export function Ambiente({ festa }: { festa: IdFesta }) {
  const Conteudo = AMBIENTES[festa];
  if (!Conteudo) return null;
  return (
    <div aria-hidden className="festa-ambiente no-print pointer-events-none absolute inset-0 overflow-hidden">
      <Conteudo />
    </div>
  );
}
