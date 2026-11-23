import { test } from "node:test";
import assert from "node:assert/strict";
import { redirect } from "next/navigation.js";
import {
  dataValida,
  erroBanco,
  exigirId,
  idOpcional,
  mensagemErro,
  naoNegativo,
  opcao,
  paraNumero,
  data,
} from "../../lib/form.ts";

const fd = (obj) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
};

test("paraNumero aceita vírgula decimal, milhar e R$", () => {
  assert.equal(paraNumero("1.234,56"), 1234.56);
  assert.equal(paraNumero("1234,5"), 1234.5);
  assert.equal(paraNumero("R$ 10"), 10);
  assert.equal(paraNumero(""), null);
  assert.equal(paraNumero("abc"), null);
});

test("naoNegativo recusa negativo e deixa vazio passar", () => {
  assert.equal(naoNegativo(null, "o valor"), null);
  assert.equal(naoNegativo(0, "o valor"), 0);
  assert.throws(() => naoNegativo(-1, "o valor"), /Valor não pode ser negativo/);
});

test("data só aceita datas que existem", () => {
  assert.equal(dataValida("2026-02-28"), true);
  assert.equal(dataValida("2026-02-31"), false);
  assert.equal(dataValida("2026-13-01"), false);
  assert.equal(data(fd({ d: "2024-02-29" }), "d"), "2024-02-29");
  assert.equal(data(fd({ d: "2025-02-29" }), "d"), null);
});

test("opcao usa o padrão no vazio e recusa valor fora da lista", () => {
  const tipos = ["preventiva", "corretiva"];
  assert.equal(opcao(null, tipos, "corretiva", "o tipo"), "corretiva");
  assert.equal(opcao("preventiva", tipos, "corretiva", "o tipo"), "preventiva");
  assert.throws(() => opcao("qualquer", tipos, "corretiva", "o tipo"), /Tipo inválido/);
  assert.throws(() => opcao(null, tipos, null, "o papel"), /Papel inválido/);
});

test("ids: recusa texto que não é uuid", () => {
  const id = "3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
  assert.equal(exigirId(id), id);
  assert.throws(() => exigirId("1 or 1=1", "o ativo"), /Não encontrei o ativo/);
  assert.equal(idOpcional(fd({ id: "" }), "id"), null);
  assert.throws(() => idOpcional(fd({ id: "x" }), "id"));
});

test("mensagemErro relança o redirect do Next (sessão vencida não vira 'NEXT_REDIRECT')", () => {
  let capturado;
  try {
    redirect("/auth/sair");
  } catch (e) {
    capturado = e;
  }
  assert.throws(() => mensagemErro(capturado), (e) => e === capturado);
});

test("mensagemErro traduz falha de rede", () => {
  assert.match(mensagemErro(new TypeError("fetch failed")), /Não consegui falar com o servidor/);
  assert.equal(mensagemErro(new Error("Informe o nome.")), "Informe o nome.");
});

test("erroBanco traduz os códigos do Postgres para português", () => {
  assert.match(erroBanco({ code: "42501", message: "x" }).erro, /papel/);
  assert.match(erroBanco({ code: "23505" }).erro, /Já existe/);
  // App mais novo que o banco (migrador não rodou): aviso claro, não o texto do PostgREST.
  assert.match(erroBanco({ code: "PGRST202", message: "Could not find the function" }).erro, /migrador/);
  assert.match(erroBanco({ code: "PGRST205", message: "Could not find the table" }).erro, /migrador/);
  assert.match(erroBanco({ code: "22P02", message: 'invalid input syntax for type uuid: "x"' }).erro, /formato inválido/);
  assert.match(erroBanco({ code: "23514", message: "violates check constraint" }).erro, /não é aceito/);
  assert.match(
    erroBanco({ code: "23503", message: 'update or delete on table "x" violates foreign key' }).erro,
    /em uso/,
  );
  assert.match(erroBanco({ code: "22003", message: "numeric field overflow" }).erro, /grande demais/);
  // Mensagem das nossas funções (raise exception) passa como veio.
  assert.equal(
    erroBanco({ code: "P0001", message: "O proprietário da empresa não pode ser removido." }).erro,
    "O proprietário da empresa não pode ser removido.",
  );
});
