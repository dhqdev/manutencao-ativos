import { test } from "node:test";
import assert from "node:assert/strict";
import { agoraEmBrasilia, horarioDoResumo, situacaoDoResumo } from "../../lib/whatsapp-agenda.ts";

// 25/11/2026 às 11h14 UTC = 08h14 em Brasília (o container roda em UTC).
const manha = new Date("2026-11-25T11:14:00Z");
// 26/11/2026 às 01h UTC = 25/11 às 22h em Brasília: em UTC já seria amanhã.
const noite = new Date("2026-11-26T01:00:00Z");

const envio = (extra) => ({
  data_referencia: "2026-11-25",
  sucesso: true,
  detalhe: null,
  enviado_em: "2026-11-25T11:01:00Z", // 08:01 em Brasília
  tentativas: 1,
  ultima_falha: null,
  ...extra,
});

test("dia e hora da rotina são os de Brasília", () => {
  assert.deepEqual(agoraEmBrasilia(manha), { hoje: "2026-11-25", hora: 8, minuto: 14 });
  assert.deepEqual(agoraEmBrasilia(noite), { hoje: "2026-11-25", hora: 22, minuto: 0 });
});

test("horário salvo: 0 a 23, senão o padrão de 8h", () => {
  assert.equal(horarioDoResumo(5), 5);
  assert.equal(horarioDoResumo(0), 0);
  assert.equal(horarioDoResumo(null), 8);
  assert.equal(horarioDoResumo(undefined), 8);
  assert.equal(horarioDoResumo(24), 8);
  assert.equal(horarioDoResumo("abc"), 8);
});

test("antes do horário: sai hoje no horário escolhido", () => {
  assert.deepEqual(situacaoDoResumo({ horario: 10, envioHoje: null, agora: manha }), {
    hoje: null,
    proximo: "Próximo resumo: hoje às 10:00.",
  });
});

test("enviado hoje no horário: próximo amanhã, sem explicação", () => {
  assert.deepEqual(situacaoDoResumo({ horario: 8, envioHoje: envio(), agora: manha }), {
    hoje: null,
    proximo: "Próximo resumo: amanhã às 08:00.",
  });
});

test("horário mudado depois do envio de hoje: o próximo já usa o novo", () => {
  // O caso da tela: saiu às 08:01 com o horário antigo e a pessoa escolheu 05:00.
  assert.deepEqual(situacaoDoResumo({ horario: 5, envioHoje: envio(), agora: manha }).proximo,
    "Próximo resumo: amanhã às 05:00.");
});

test("saiu atrasado por falha: a tela diz o motivo", () => {
  const r = situacaoDoResumo({
    horario: 5,
    envioHoje: envio({ tentativas: 4, ultima_falha: "WhatsApp conectando" }),
    agora: manha,
  });
  assert.equal(r.hoje, "Hoje saiu às 08:01 porque as tentativas anteriores falharam (WhatsApp conectando).");
  assert.equal(r.proximo, "Próximo resumo: amanhã às 05:00.");
});

test("saiu atrasado porque antes não havia nada pendente", () => {
  const r = situacaoDoResumo({ horario: 5, envioHoje: envio({ tentativas: 3 }), agora: manha });
  assert.equal(r.hoje, "Hoje saiu às 08:01: nas rodadas anteriores não havia nada pendente.");
});

test("falhou hoje: mostra o erro e a próxima rodada de hora em hora", () => {
  const r = situacaoDoResumo({
    horario: 5,
    envioHoje: envio({ sucesso: false, detalhe: "WhatsApp desconectado", ultima_falha: "WhatsApp desconectado" }),
    agora: manha,
  });
  assert.equal(r.hoje, "O resumo de hoje ainda não saiu: WhatsApp desconectado.");
  assert.equal(r.proximo, "Próximo resumo: hoje às 09:00.");
});

test("nada pendente às 22h: a próxima rodada ainda é hoje às 23h", () => {
  const r = situacaoDoResumo({
    horario: 5,
    envioHoje: envio({ sucesso: false, detalhe: "nada pendente" }),
    agora: noite,
  });
  assert.equal(r.hoje, "Hoje ainda não havia nada pendente para avisar.");
  assert.equal(r.proximo, "Próximo resumo: hoje às 23:00.");
});

test("depois das 23h a próxima rodada já é amanhã, no horário escolhido", () => {
  const tarde = new Date("2026-11-26T02:30:00Z"); // 23h30 em Brasília
  assert.equal(situacaoDoResumo({ horario: 5, envioHoje: null, agora: tarde }).proximo, "Próximo resumo: amanhã às 05:00.");
});

test("linha de outro dia não conta como envio de hoje", () => {
  const r = situacaoDoResumo({ horario: 10, envioHoje: envio({ data_referencia: "2026-11-24" }), agora: manha });
  assert.deepEqual(r, { hoje: null, proximo: "Próximo resumo: hoje às 10:00." });
});

test("enviando agora: sem previsão até terminar", () => {
  const r = situacaoDoResumo({ horario: 8, envioHoje: envio({ sucesso: false, detalhe: "enviando" }), agora: manha });
  assert.deepEqual(r, { hoje: "Enviando o resumo de hoje agora.", proximo: null });
});
