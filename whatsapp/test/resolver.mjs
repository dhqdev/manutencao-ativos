const MOCKS = {
  baileys: new URL("./mocks/baileys.js", import.meta.url).href,
  pino: new URL("./mocks/pino.js", import.meta.url).href,
  qrcode: new URL("./mocks/qrcode.js", import.meta.url).href,
};

export async function resolve(especificador, contexto, proximo) {
  if (MOCKS[especificador]) return { url: MOCKS[especificador], shortCircuit: true };
  return proximo(especificador, contexto);
}
