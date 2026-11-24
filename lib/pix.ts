/**
 * Pix "copia e cola" (BR Code estático, padrão EMV do Banco Central), montado
 * aqui mesmo a partir da chave, do nome e da cidade de quem recebe — sem
 * gateway nem API de banco. O QR code é só este texto desenhado.
 *
 * Funções puras: valem no servidor e na tela, e têm teste em
 * testes/unidade/pix.test.mjs.
 */

export type TipoChavePix = "email" | "cpf" | "cnpj" | "telefone" | "aleatoria";

export type DadosPix = {
  chave: string;
  nome: string;
  cidade: string;
  /** Em reais. Sem valor (ou 0), quem paga digita o valor no app do banco. */
  valor?: number | null;
  /** Identificador que aparece no extrato de quem recebe (até 25 letras/números). */
  identificador?: string | null;
  /** Mensagem curta para quem paga (vai junto da chave, opcional). */
  descricao?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sem acento e só os caracteres que todo app de banco aceita no BR Code. */
export function textoPix(valor: string, maximo: number) {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,\-/@&*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximo)
    .trim();
}

function cpfValido(d: string) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

function cnpjValido(d: string) {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const digito = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digito(12) === Number(d[12]) && digito(13) === Number(d[13]);
}

/**
 * Descobre o tipo da chave e devolve no formato que o Pix espera:
 * e-mail em minúsculas, CPF/CNPJ só números, telefone +55DDDNÚMERO e chave
 * aleatória em minúsculas. null = não é uma chave Pix válida.
 */
export function normalizarChavePix(entrada: string | null | undefined): { tipo: TipoChavePix; chave: string } | null {
  const bruto = String(entrada ?? "").trim();
  if (!bruto) return null;

  if (bruto.includes("@")) {
    const email = bruto.toLowerCase();
    return EMAIL.test(email) && email.length <= 77 ? { tipo: "email", chave: email } : null;
  }
  if (UUID.test(bruto)) return { tipo: "aleatoria", chave: bruto.toLowerCase() };

  const digitos = bruto.replace(/\D/g, "");
  const pareceTelefone = /^\+|\(/.test(bruto);

  if (!pareceTelefone) {
    if (digitos.length === 11 && cpfValido(digitos)) return { tipo: "cpf", chave: digitos };
    if (digitos.length === 14) return cnpjValido(digitos) ? { tipo: "cnpj", chave: digitos } : null;
  }

  // Telefone: com DDI (+55...) ou só DDD + número (10 ou 11 dígitos).
  if (bruto.startsWith("+") && digitos.length >= 12 && digitos.length <= 13) {
    return { tipo: "telefone", chave: `+${digitos}` };
  }
  if (digitos.length === 10 || digitos.length === 11) return { tipo: "telefone", chave: `+55${digitos}` };
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
    return { tipo: "telefone", chave: `+${digitos}` };
  }
  return null;
}

export const ROTULO_CHAVE_PIX: Record<TipoChavePix, string> = {
  email: "E-mail",
  cpf: "CPF",
  cnpj: "CNPJ",
  telefone: "Telefone",
  aleatoria: "Chave aleatória",
};

function campo(id: string, valor: string) {
  if (valor.length > 99) throw new Error(`Campo ${id} do Pix longo demais.`);
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como pede o BR Code. */
export function crc16(texto: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Monta o "Pix copia e cola". Lança erro com mensagem amigável se faltar algo. */
export function montarPix(dados: DadosPix) {
  const chave = normalizarChavePix(dados.chave);
  if (!chave) throw new Error("Chave Pix inválida.");
  const nome = textoPix(dados.nome, 25);
  if (!nome) throw new Error("Informe o nome de quem recebe o Pix.");
  const cidade = textoPix(dados.cidade, 15);
  if (!cidade) throw new Error("Informe a cidade de quem recebe o Pix.");

  const identificador = String(dados.identificador ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  // A conta (chave + descrição) não pode passar de 99 caracteres.
  const folga = 99 - campo("00", "br.gov.bcb.pix").length - campo("01", chave.chave).length - 4;
  const descricao = folga > 0 ? textoPix(dados.descricao ?? "", Math.min(folga, 72)) : "";

  const conta =
    campo("00", "br.gov.bcb.pix") + campo("01", chave.chave) + (descricao ? campo("02", descricao) : "");

  const valor = dados.valor && dados.valor > 0 ? dados.valor.toFixed(2) : null;

  const semCrc =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    (valor ? campo("54", valor) : "") +
    campo("58", "BR") +
    campo("59", nome) +
    campo("60", cidade) +
    campo("62", campo("05", identificador)) +
    "6304";

  return semCrc + crc16(semCrc);
}
