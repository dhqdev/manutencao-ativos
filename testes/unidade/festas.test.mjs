import { test } from "node:test";
import assert from "node:assert/strict";
import { domingoDoMes, enfeitesLigados, festaDoDia, festasDoAno, pascoa, proximasFestas } from "../../lib/festas.ts";
import { contagem, diaPorExtenso, naRetaFinal } from "../../components/festas/temas.ts";

// Meio-dia em Brasília (15h UTC): longe da virada do dia.
const em = (dia) => new Date(`${dia}T15:00:00Z`);
const festa = (dia) => festaDoDia(em(dia));

test("Páscoa bate com o calendário oficial", () => {
  const esperado = {
    2019: "2019-04-21",
    2024: "2024-03-31",
    2025: "2025-04-20",
    2026: "2026-04-05",
    2027: "2027-03-28",
    2028: "2028-04-16",
    2038: "2038-04-25", // a mais tardia possível
    2285: "2285-03-22", // a mais cedo possível
  };
  for (const [ano, dia] of Object.entries(esperado)) assert.equal(pascoa(Number(ano)), dia, `Páscoa de ${ano}`);
});

test("Carnaval (sábado a terça) sai da Páscoa; Mães e Pais são o 2º domingo", () => {
  const de = (ano, id) => festasDoAno(ano).find((f) => f.id === id);
  assert.deepEqual([de(2026, "carnaval").inicio, de(2026, "carnaval").fim], ["2026-02-14", "2026-02-17"]);
  assert.deepEqual([de(2027, "carnaval").inicio, de(2027, "carnaval").fim], ["2027-02-06", "2027-02-09"]);
  assert.equal(domingoDoMes(2026, 5, 2), "2026-05-10");
  assert.equal(domingoDoMes(2027, 5, 2), "2027-05-09");
  assert.equal(domingoDoMes(2026, 8, 2), "2026-08-09");
  assert.equal(domingoDoMes(2027, 8, 2), "2027-08-08");
});

test("entra 30 dias antes e sai sozinho depois da data", () => {
  assert.equal(festa("2026-11-24"), null);
  assert.deepEqual([festa("2026-11-25").id, festa("2026-11-25").dias], ["natal", 30]);
  assert.equal(festa("2026-11-25").progresso, 0);
  assert.deepEqual([festa("2026-12-25").id, festa("2026-12-25").durante], ["natal", true]);
  assert.equal(festa("2026-10-12").id, "criancas");
  assert.equal(festa("2026-10-13"), null);
  assert.equal(festa("2027-02-10"), null); // quarta de cinzas: Carnaval já foi
});

test("datas sobrepostas: a mais próxima ganha e a outra assume depois", () => {
  // Natal e Ano Novo
  assert.equal(festa("2026-12-24").id, "natal");
  assert.deepEqual([festa("2026-12-26").id, festa("2026-12-26").dias], ["ano-novo", 6]);
  assert.equal(festa("2027-01-06").id, "ano-novo"); // até o Dia de Reis
  assert.equal(festa("2027-01-07").id, "carnaval");
  // Dia do Trabalhador, Dia das Mães e São João
  assert.equal(festa("2027-05-01").id, "trabalhador");
  assert.deepEqual([festa("2027-05-02").id, festa("2027-05-02").dias], ["maes", 7]);
  assert.equal(festa("2027-05-25").id, "junina");
  assert.deepEqual([festa("2027-06-29").id, festa("2027-06-29").durante], ["junina", true]);
  assert.equal(festa("2027-06-30"), null);
});

test("o dia é o de Brasília, não o de UTC", () => {
  // 25/11 às 02h UTC = 24/11 às 23h em Brasília: ainda fora do Natal.
  assert.equal(festaDoDia(new Date("2026-11-25T02:00:00Z")), null);
  assert.equal(festaDoDia(new Date("2026-11-25T03:30:00Z")).id, "natal");
});

test("próximas datas para a tela de Configurações", () => {
  assert.deepEqual(
    proximasFestas(4, em("2026-11-24")).map((f) => f.id),
    ["natal", "ano-novo", "carnaval", "pascoa"],
  );
});

test("textos da contagem e do dia", () => {
  assert.equal(contagem(festa("2026-11-25")), "Faltam 30 dias para o Natal");
  assert.equal(contagem(festa("2026-12-24")), "Falta 1 dia para o Natal");
  assert.equal(contagem(festa("2026-12-25")), "Feliz Natal!");
  assert.equal(contagem(festa("2026-12-28")), "Faltam 4 dias para 2027");
  assert.equal(contagem(festa("2027-01-02")), "Feliz 2027!");
  assert.equal(diaPorExtenso("2026-12-25"), "sexta, 25 de dezembro");
  assert.equal(diaPorExtenso("2027-01-01"), "sexta, 1º de janeiro");
  assert.equal(naRetaFinal(festa("2026-12-17")), false);
  assert.equal(naRetaFinal(festa("2026-12-18")), true);
});

test("cada aparelho pode desligar; quem desligou o Natal antes continua desligado", () => {
  const biscoitos = (valores) => ({ get: (nome) => (nome in valores ? { value: valores[nome] } : undefined) });
  assert.equal(enfeitesLigados(biscoitos({})), true);
  assert.equal(enfeitesLigados(biscoitos({ enfeites: "desligado" })), false);
  assert.equal(enfeitesLigados(biscoitos({ natal: "desligado" })), false);
  assert.equal(enfeitesLigados(biscoitos({ natal: "desligado", enfeites: "ligado" })), true);
});
