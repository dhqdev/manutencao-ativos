import { test } from "node:test";
import assert from "node:assert/strict";
import {
  finalDoSegredo,
  normalizarPasta,
  validarAppKey,
  validarBucket,
  validarDias,
  validarKeyId,
  validarSenhaCripto,
} from "../../lib/backup-regras.ts";

test("keyID e applicationKey: só o formato do B2, sem espaço", () => {
  assert.equal(validarKeyId("005a1b2c3d4e5f60000000001"), "005a1b2c3d4e5f60000000001");
  assert.throws(() => validarKeyId("005a1b 2c3d"));
  assert.throws(() => validarKeyId("curto"));
  assert.equal(validarAppKey("K005abcdEFGH1234/ijkl+mnop5678qrs"), "K005abcdEFGH1234/ijkl+mnop5678qrs");
  assert.throws(() => validarAppKey("K005 abcd EFGH 1234 ijkl mnop"));
  assert.throws(() => validarAppKey("K005abcd\nEFGH1234ijklmnop5678"));
});

test("bucket segue as regras do B2", () => {
  assert.equal(validarBucket("backup-manutencao"), "backup-manutencao");
  assert.throws(() => validarBucket("curto"));
  assert.throws(() => validarBucket("b2-reservado"));
  assert.throws(() => validarBucket("com espaco aqui"));
  assert.throws(() => validarBucket("outro/bucket"));
});

test("pasta: padrão, barras nas pontas e nada de ..", () => {
  assert.equal(normalizarPasta(null), "manutencao");
  assert.equal(normalizarPasta("  "), "manutencao");
  assert.equal(normalizarPasta("/backups/manutencao/"), "backups/manutencao");
  assert.throws(() => normalizarPasta("../outro"));
  assert.throws(() => normalizarPasta("a//b"));
  assert.throws(() => normalizarPasta("pasta com espaço"));
});

test("dias de retenção e senha de criptografia", () => {
  assert.equal(validarDias(null), 30);
  assert.equal(validarDias(90), 90);
  assert.throws(() => validarDias(0));
  assert.throws(() => validarDias(1.5));
  assert.throws(() => validarSenhaCripto("curta"));
  assert.equal(validarSenhaCripto("uma senha bem comprida"), "uma senha bem comprida");
});

test("finalDoSegredo mostra só os 4 últimos", () => {
  assert.equal(finalDoSegredo("K005abcdefgh1234"), "…1234");
  assert.equal(finalDoSegredo(null), null);
});
