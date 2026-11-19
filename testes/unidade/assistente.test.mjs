import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agregarLinhas,
  LIMITE_LINHAS,
  mensagemFerramenta,
  TABELAS,
  validarAgregacao,
  validarConsulta,
} from "../../lib/assistente-ferramentas.ts";

const erro = (fn) => {
  try {
    fn();
  } catch (e) {
    return mensagemFerramenta(e);
  }
  assert.fail("devia ter recusado");
};

test("consulta só aceita tabelas da lista e usa a origem real", () => {
  assert.equal(validarConsulta({ tabela: "manutencoes" }).origem, "vw_manutencoes_completo");
  assert.match(erro(() => validarConsulta({ tabela: "profiles" })), /Tabela desconhecida/);
  assert.match(erro(() => validarConsulta({ tabela: "sistema_credenciais" })), /Tabela desconhecida/);
});

test("colunas fora da lista são recusadas (caminho de anexo, ids de usuário)", () => {
  assert.match(erro(() => validarConsulta({ tabela: "anexos", colunas: ["path"] })), /não existe/);
  assert.match(erro(() => validarConsulta({ tabela: "manutencoes", colunas: ["created_by"] })), /não existe/);
  assert.match(erro(() => validarConsulta({ tabela: "ativos", colunas: ["nome,org_id"] })), /não existe/);
  assert.ok(!("path" in TABELAS.anexos.colunas));
});

test("limite fica entre 1 e o máximo, e ordem padrão vale sem pedido", () => {
  assert.equal(validarConsulta({ tabela: "ativos", limite: 10_000 }).limite, LIMITE_LINHAS);
  assert.equal(validarConsulta({ tabela: "ativos", limite: -3 }).limite, 1);
  assert.deepEqual(validarConsulta({ tabela: "manutencoes" }).ordem, { coluna: "data_manutencao", crescente: false });
});

test("filtros validam coluna, operador e valor", () => {
  const c = validarConsulta({
    tabela: "planos",
    filtros: [
      { coluna: "situacao", operador: "in", valor: ["atrasada", "proxima"] },
      { coluna: "proxima_data", operador: "is_null", valor: "ignorado" },
    ],
  });
  assert.deepEqual(c.filtros, [
    { coluna: "situacao", operador: "in", valor: ["atrasada", "proxima"] },
    { coluna: "proxima_data", operador: "is_null" },
  ]);
  assert.match(erro(() => validarConsulta({ tabela: "planos", filtros: [{ coluna: "situacao", operador: "or" }] })), /Operador/);
  assert.match(erro(() => validarConsulta({ tabela: "planos", filtros: [{ coluna: "situacao", operador: "eq", valor: { a: 1 } }] })), /Valor/);
  assert.match(erro(() => validarConsulta({ tabela: "planos", filtros: [{ coluna: "situacao", operador: "in", valor: [] }] })), /in/);
});

test("agregar soma e agrupa, do maior para o menor", () => {
  const a = validarAgregacao({ tabela: "manutencoes", agrupar_por: "ativo_nome", somar: "valor" });
  assert.equal(a.agruparPor, "ativo_nome");
  const grupos = agregarLinhas(
    [
      { ativo_nome: "Caminhão", valor: "100.10" },
      { ativo_nome: "Trator", valor: 500 },
      { ativo_nome: "Caminhão", valor: 0.2 },
      { ativo_nome: null, valor: null },
    ],
    "ativo_nome",
    "valor",
  );
  assert.deepEqual(grupos, [
    { grupo: "Trator", quantidade: 1, soma: 500 },
    { grupo: "Caminhão", quantidade: 2, soma: 100.3 },
    { grupo: null, quantidade: 1, soma: 0 },
  ]);
  assert.deepEqual(agregarLinhas([{}, {}], null, null), [{ grupo: "total", quantidade: 2 }]);
});
