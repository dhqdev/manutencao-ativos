function criar(nivel = "info", base = {}) {
  const niveis = ["trace", "debug", "info", "warn", "error", "fatal"];
  const log = {};
  for (const n of niveis) {
    log[n] = (...args) => {
      if (process.env.MOSTRAR_LOG && niveis.indexOf(n) >= niveis.indexOf(nivel)) {
        console.log(`[${n}]`, JSON.stringify(base), ...args.map((x) => (x?.err ? { ...x, err: x.err?.message } : x)));
      }
    };
  }
  log.child = (b, o) => criar(o?.level ?? nivel, { ...base, ...b });
  log.level = nivel;
  return log;
}
export default function pino(opcoes) {
  return criar(opcoes?.level);
}
pino.stdTimeFunctions = { isoTime: () => "" };
