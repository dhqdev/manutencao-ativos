/**
 * Gera os PNGs do PWA em public/icones a partir do mesmo traço de
 * components/marca.tsx. Desenha no Chromium (o mesmo Playwright do e2e) para o
 * resultado sair idêntico ao SVG da tela, sem depender de biblioteca de imagem.
 *
 * Rode `node scripts/gerar-icones.mjs` depois de mudar a marca.
 *  - icone-*: selo com cantos arredondados e fundo transparente (purpose "any")
 *  - maskable-*: fundo cheio e símbolo dentro da zona segura de 80% (Android corta)
 *  - apple-touch-icon: fundo cheio (o iOS arredonda sozinho)
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const marca = readFileSync(new URL("../components/marca.tsx", import.meta.url), "utf8");
const traco = marca.match(/TRACO_MARCA = "([^"]+)"/)[1];

function svg({ cantos, escala }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%">
  <defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#3B82F6"/><stop offset="1" stop-color="#1D4ED8"/>
  </linearGradient></defs>
  <rect width="24" height="24" rx="${cantos}" fill="url(#f)"/>
  <g transform="translate(12 12) scale(${escala}) translate(-12 -12)">
    <path d="${traco}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const ICONES = [
  { arquivo: "icone-192.png", lado: 192, cantos: 5.5, escala: 1 },
  { arquivo: "icone-512.png", lado: 512, cantos: 5.5, escala: 1 },
  { arquivo: "maskable-192.png", lado: 192, cantos: 0, escala: 0.72 },
  { arquivo: "maskable-512.png", lado: 512, cantos: 0, escala: 0.72 },
  { arquivo: "apple-touch-icon.png", lado: 180, cantos: 0, escala: 0.82 },
];

const navegador = await chromium.launch();
try {
  for (const { arquivo, lado, cantos, escala } of ICONES) {
    const pagina = await navegador.newPage({ viewport: { width: lado, height: lado } });
    await pagina.setContent(
      `<html><body style="margin:0;background:transparent">${svg({ cantos, escala })}</body></html>`,
    );
    await pagina.screenshot({
      path: new URL(`../public/icones/${arquivo}`, import.meta.url).pathname,
      omitBackground: true,
    });
    await pagina.close();
    console.log(`public/icones/${arquivo}`);
  }
} finally {
  await navegador.close();
}
