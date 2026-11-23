import { test } from "node:test";
import assert from "node:assert/strict";
import { problemaNaSenha } from "../../lib/auth/regras-senha.ts";

test("senha curta é recusada", () => {
  assert.match(problemaNaSenha("abc123") ?? "", /pelo menos 8/);
});

test("senha longa demais (bytes, não letras) é recusada", () => {
  assert.match(problemaNaSenha("ç".repeat(40)) ?? "", /no máximo/);
  assert.equal(problemaNaSenha("a-b".repeat(24)), null);
});

test("senhas comuns e variações óbvias são recusadas", () => {
  for (const s of ["12345678", "Senha123", "senha@2026", "Mudar123!", "Manutenção1", "aaaaaaaa", "Flamengo10"]) {
    assert.ok(problemaNaSenha(s), `${s} devia ser recusada`);
  }
});

test("senha com o próprio e-mail é recusada", () => {
  assert.ok(problemaNaSenha("joaosilva2026", "joao.silva@empresa.com"));
});

test("senhas boas passam", () => {
  for (const s of ["Senha-E2E-2026", "Tecnico-E2E-2026", "Intruso-2026", "cavalo bateria grampo", "tR7mQ2xkPa"]) {
    assert.equal(problemaNaSenha(s), null, s);
  }
});
