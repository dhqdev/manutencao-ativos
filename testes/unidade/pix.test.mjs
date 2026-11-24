import { test } from "node:test";
import assert from "node:assert/strict";
import { crc16, montarPix, normalizarChavePix, textoPix } from "../../lib/pix.ts";
import { avisoAssinatura, dataNoDia, descreverPlano, lerValorReais } from "../../lib/assinatura.ts";

test("Pix: confere com o exemplo do manual do BR Code (Banco Central)", () => {
  const codigo = montarPix({
    chave: "123e4567-e12b-12d1-a456-426655440000",
    nome: "Fulano de Tal",
    cidade: "BRASILIA",
  });
  assert.equal(
    codigo,
    "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
  );
});

test("Pix: valor, identificador e CRC do próprio texto", () => {
  const codigo = montarPix({ chave: "pix@Empresa.com.br", nome: "José da Silva", cidade: "São Paulo", valor: 99.9, identificador: "ASSIN-2026-12" });
  assert.match(codigo, /0118pix@empresa\.com\.br/);
  assert.match(codigo, /540599\.90/);
  assert.match(codigo, /5913Jose da Silva6009Sao Paulo/);
  assert.match(codigo, /62150511ASSIN202612/);
  assert.equal(codigo.slice(-4), crc16(codigo.slice(0, -4)));
});

test("Pix: nome e cidade cortados no tamanho do padrão", () => {
  const codigo = montarPix({ chave: "+55 11 98765-4321", nome: "Nome Muito Comprido Demais Para o Pix", cidade: "Cidade Com Nome Grande" });
  assert.match(codigo, /0114\+5511987654321/);
  assert.match(codigo, /5925Nome Muito Comprido Demai/);
  assert.match(codigo, /6015Cidade Com Nome/);
});

test("Pix: tipos de chave", () => {
  assert.deepEqual(normalizarChavePix("529.982.247-25"), { tipo: "cpf", chave: "52998224725" });
  assert.deepEqual(normalizarChavePix("11.222.333/0001-81"), { tipo: "cnpj", chave: "11222333000181" });
  assert.deepEqual(normalizarChavePix("(11) 98765-4321"), { tipo: "telefone", chave: "+5511987654321" });
  assert.deepEqual(normalizarChavePix("11987654321"), { tipo: "telefone", chave: "+5511987654321" });
  assert.equal(normalizarChavePix("11.222.333/0001-00"), null);
  assert.equal(normalizarChavePix("abc"), null);
  assert.equal(normalizarChavePix(""), null);
  assert.throws(() => montarPix({ chave: "x", nome: "a", cidade: "b" }), /Chave Pix inválida/);
  assert.throws(() => montarPix({ chave: "a@b.com", nome: "", cidade: "b" }), /nome/);
});

test("Pix: texto sem acento nem caracteres estranhos", () => {
  assert.equal(textoPix("  Ação ç ~ teste  ", 25), "Acao c teste");
});

test("Assinatura: valor em reais e avisos", () => {
  assert.equal(lerValorReais("R$ 1.234,50"), 1234.5);
  assert.equal(lerValorReais("99.9"), 99.9);
  assert.equal(lerValorReais("abc"), null);
  assert.equal(lerValorReais("1,234"), null);
  const base = { vencimento: "2026-12-01", tolerancia: 3, bloqueia_em: "2026-12-05", valor: 50, pendente: false };
  assert.equal(avisoAssinatura({ ...base, estado: "em_dia", dias: 10 }), null);
  assert.equal(avisoAssinatura({ ...base, estado: "vencendo", dias: 0 }), "A assinatura vence hoje.");
  assert.equal(avisoAssinatura({ ...base, estado: "vencendo", dias: 1 }), "A assinatura vence em 1 dia.");
  assert.match(avisoAssinatura({ ...base, estado: "tolerancia", dias: -1 }), /bloqueado em 3 dias/);
  assert.match(avisoAssinatura({ ...base, estado: "bloqueada", dias: -5, pendente: true }), /há 5 dias\. Seu comprovante está em análise/);
  // Bloqueio à mão do superadmin vale por cima do vencimento (até sem vencimento).
  assert.equal(
    avisoAssinatura({ ...base, estado: "bloqueada", dias: null, bloqueio_manual: true, bloqueio_motivo: "comprovante falso" }),
    "Acesso bloqueado pelo administrador do sistema: comprovante falso.",
  );
  assert.equal(
    avisoAssinatura({ ...base, estado: "bloqueada", dias: 20, bloqueio_manual: true }),
    "Acesso bloqueado pelo administrador do sistema.",
  );
});

test("Assinatura: dia fixo do vencimento igual ao banco (assinatura_no_dia)", () => {
  // O primeiro "dia N" a partir da data, sem encurtar o período.
  assert.equal(dataNoDia("2026-11-24", 5), "2026-12-05");
  assert.equal(dataNoDia("2026-11-03", 5), "2026-11-05");
  assert.equal(dataNoDia("2026-11-05", 5), "2026-11-05");
  // Dia 31 em fevereiro vira o último dia; virada de ano.
  assert.equal(dataNoDia("2026-02-10", 31), "2026-02-28");
  assert.equal(dataNoDia("2026-01-31", 30), "2026-02-28");
  assert.equal(dataNoDia("2028-02-10", 30), "2028-02-29");
  assert.equal(dataNoDia("2026-12-20", 10), "2027-01-10");
  // Sem dia, a data fica como está.
  assert.equal(dataNoDia("2026-11-24", null), "2026-11-24");
  assert.equal(descreverPlano(3, 5), "Trimestral, vence todo dia 5");
  assert.equal(descreverPlano(undefined, null), "Mensal");
});
