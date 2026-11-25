import { test } from "node:test";
import assert from "node:assert/strict";
import { dataBR, dataHoraBR, hoje, mesBR, primeiroDiaDoMes, somarDias, somarMeses, ultimoDiaDoMes } from "../../lib/format.ts";

// 01/12/2026 às 01h UTC = 30/11/2026 às 22h em Brasília. O container roda em
// UTC: sem o fuso fixo, o servidor já estaria em dezembro.
const viradaDoMes = new Date("2026-12-01T01:00:00Z");

test("hoje() usa o dia de Brasília, não o de UTC", () => {
  assert.equal(hoje(viradaDoMes), "2026-11-30");
});

test("mês atual e deslocado seguem Brasília", () => {
  assert.deepEqual(mesBR(0, viradaDoMes), { ano: 2026, mes: 11 });
  assert.deepEqual(mesBR(-11, viradaDoMes), { ano: 2025, mes: 12 });
  assert.deepEqual(mesBR(2, viradaDoMes), { ano: 2027, mes: 1 });
  assert.equal(primeiroDiaDoMes(0, viradaDoMes), "2026-11-01");
  assert.equal(ultimoDiaDoMes(0, viradaDoMes), "2026-11-30");
  assert.equal(ultimoDiaDoMes(-9, viradaDoMes), "2026-02-28");
});

test("somarMeses não estoura o fim do mês", () => {
  assert.equal(somarMeses("2026-01-31", 1), "2026-02-28");
  assert.equal(somarMeses("2024-01-31", 1), "2024-02-29");
  assert.equal(somarMeses("2026-11-15", 3), "2027-02-15");
  assert.equal(somarMeses("2026-03-31", -1), "2026-02-28");
});

test("somarDias atravessa mês e ano", () => {
  assert.equal(somarDias("2026-12-30", 3), "2027-01-02");
  assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
});

test("dataBR: instante com hora mostra o dia de Brasília", () => {
  // 26/11 01h30 UTC = 25/11 22h30 aqui. Cortar a string dava 26/11.
  assert.equal(dataBR("2026-11-26T01:30:00+00:00"), "25/11/2026");
  assert.equal(dataBR("2026-11-25T22:30:00-03:00"), "25/11/2026");
  assert.equal(dataBR("2026-11-26T01:30:00.123Z"), "25/11/2026");
});

test("dataBR: data pura não muda de dia em fuso nenhum", () => {
  assert.equal(dataBR("2026-11-25"), "25/11/2026");
  assert.equal(dataBR(null), "—");
});

test("dataHoraBR mostra a hora de Brasília", () => {
  assert.equal(dataHoraBR("2026-11-25T11:01:00Z"), "25/11/2026, 08:01");
});
