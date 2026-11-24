import { test } from "node:test";
import assert from "node:assert/strict";
import { lerFiltros, paraQuery, parametrosRpc, temFiltro } from "../../lib/historico.ts";
import { paraCsv } from "../../lib/csv.ts";

test("filtros da URL: só valores válidos chegam ao banco", () => {
  const f = lerFiltros({
    q: "  óleo  ",
    tipo: "corretiva",
    ativo: "6666666A-6666-6666-6666-666666666666",
    categoria: "nao-e-uuid",
    de: "2026-02-30",
    ate: "2026-11-24",
    ordem: "valor; drop table",
    dir: "asc",
    pagina: "-3",
  });
  assert.equal(f.busca, "óleo");
  assert.equal(f.tipo, "corretiva");
  assert.equal(f.ativo, "6666666a-6666-6666-6666-666666666666");
  assert.equal(f.categoria, null);
  assert.equal(f.de, null, "30 de fevereiro não existe");
  assert.equal(f.ate, "2026-11-24");
  assert.equal(f.ordem, "data");
  assert.equal(f.desc, false);
  assert.equal(f.pagina, 1);
  assert.equal(lerFiltros({ tipo: "qualquer" }).tipo, null);
  assert.equal(lerFiltros({ pagina: "3" }).pagina, 3);
});

test("query string guarda só o que foge do padrão e volta igual", () => {
  assert.equal(paraQuery(lerFiltros({})), "");
  const f = lerFiltros({ q: "a b", tipo: "melhoria", ordem: "ativo", dir: "asc", pagina: "2" });
  const volta = lerFiltros(new URLSearchParams(paraQuery(f, { filtro: "historico" })));
  assert.deepEqual(volta, f);
  assert.ok(temFiltro(f));
  assert.ok(!temFiltro(lerFiltros({ ordem: "valor", pagina: "4" })), "ordem e página não são filtro");
});

test("parâmetros da função do banco", () => {
  const p = parametrosRpc("org", lerFiltros({}), 50, 100);
  assert.equal(p.p_busca, null);
  assert.equal(p.p_desc, true);
  assert.equal(p.p_inicio, 100);
});

test("CSV abre no Excel em português e não vira fórmula", () => {
  const csv = paraCsv(["Nome", "Valor"], [["=HYPERLINK(1)", 10.5], ['tem "aspas"; e ponto e vírgula', null]]);
  assert.ok(csv.startsWith("﻿Nome;Valor\r\n"));
  assert.match(csv, /'=HYPERLINK\(1\);10,5\r\n/);
  assert.match(csv, /"tem ""aspas""; e ponto e vírgula";\r\n$/);
  assert.equal(paraCsv(["x"], [[-5]]).split("\r\n")[1], "-5", "número negativo continua número");
});
