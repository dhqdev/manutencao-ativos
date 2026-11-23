/** Helpers de leitura de FormData (usados pelas server actions). */

import { unstable_rethrow } from "next/navigation";

export type Resultado = { ok: true; id?: string } | { ok: false; erro: string };

export function texto(fd: FormData, chave: string): string | null {
  const v = String(fd.get(chave) ?? "").trim();
  return v.length ? v : null;
}

export function textoObrigatorio(fd: FormData, chave: string, rotulo: string): string {
  const v = texto(fd, chave);
  if (!v) throw new Error(`Informe ${rotulo}.`);
  return v;
}

/** Aceita "1234.56", "1.234,56" e "1234,56". */
export function paraNumero(entrada: unknown): number | null {
  if (entrada === null || entrada === undefined) return null;
  let s = String(entrada).trim();
  if (!s) return null;
  s = s.replace(/[R$\s]/g, "");
  const temPonto = s.includes(".");
  const temVirgula = s.includes(",");
  if (temPonto && temVirgula) s = s.replace(/\./g, "").replace(",", ".");
  else if (temVirgula) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function numero(fd: FormData, chave: string): number | null {
  return paraNumero(fd.get(chave));
}

export function inteiro(fd: FormData, chave: string, padrao: number | null = null): number | null {
  const n = paraNumero(fd.get(chave));
  return n === null ? padrao : Math.trunc(n);
}

/**
 * Número que não pode ser negativo (valor, horímetro, garantia...). Sem esta
 * trava, "-500" num valor entrava no banco e distorcia o gasto do mês.
 * Vazio continua sendo `null` (campo opcional).
 */
export function naoNegativo(valor: number | null, rotulo: string): number | null {
  if (valor !== null && valor < 0) throw new Error(`${primeiraMaiuscula(rotulo)} não pode ser negativo.`);
  return valor;
}

export function booleano(fd: FormData, chave: string): boolean {
  const v = fd.get(chave);
  return v === "on" || v === "true" || v === "1";
}

/** Data AAAA-MM-DD que existe de verdade (31/02 vira `null`, não erro do banco). */
export function dataValida(v: string | null | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function data(fd: FormData, chave: string): string | null {
  const v = texto(fd, chave);
  return dataValida(v) ? v : null;
}

/**
 * Valor de uma lista fechada (enum do banco). Fora da lista vira o padrão, ou
 * erro quando não há padrão. Sem isto, um valor inesperado chegava ao banco e
 * voltava como "invalid input value for enum" — em inglês, na cara do usuário.
 */
export function opcao<T extends string>(
  valor: string | null | undefined,
  permitidas: readonly T[],
  padrao: T | null,
  rotulo: string,
): T {
  if (valor && (permitidas as readonly string[]).includes(valor)) return valor as T;
  if (!valor && padrao !== null) return padrao;
  throw new Error(`${primeiraMaiuscula(rotulo)} inválido.`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function idValido(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/**
 * Confere um id recebido do navegador antes de ir ao banco. Id malformado
 * virava "invalid input syntax for type uuid"; aqui vira uma mensagem clara.
 */
export function exigirId(v: unknown, rotulo = "o registro"): string {
  if (!idValido(v)) throw new Error(`Não encontrei ${rotulo}. Atualize a página e tente de novo.`);
  return v;
}

/** Id opcional do FormData: vazio é `null`; preenchido precisa ser um id válido. */
export function idOpcional(fd: FormData, chave: string, rotulo = "o registro"): string | null {
  const v = texto(fd, chave);
  return v === null ? null : exigirId(v, rotulo);
}

export function emailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function primeiraMaiuscula(s: string) {
  const sem = s.replace(/^(o|a|os|as)\s+/i, "");
  return sem.charAt(0).toUpperCase() + sem.slice(1);
}

const FALHA_GENERICA = "Não foi possível concluir a operação.";
const SEM_CONEXAO = "Não consegui falar com o servidor agora. Tente de novo em instantes.";

/**
 * Mensagem para a tela a partir de qualquer erro.
 *
 * Os erros internos do Next (redirect, notFound) são relançados: as actions
 * chamam `getContexto()` dentro do try, e com a sessão vencida ele redireciona
 * para o login. Antes, o catch engolia o redirect e a tela mostrava
 * "NEXT_REDIRECT" como se fosse um erro.
 */
export function mensagemErro(e: unknown): string {
  unstable_rethrow(e);
  if (e instanceof Error) {
    // Rede: PostgREST ou outro serviço fora do ar ("fetch failed", timeout).
    if (e.name === "TimeoutError" || e.name === "AbortError" || /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(e.message)) {
      return SEM_CONEXAO;
    }
    return e.message || FALHA_GENERICA;
  }
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return FALHA_GENERICA;
}

/**
 * Mensagem amigável para erros do banco. Os dois casos mais comuns depois dos
 * papéis (migracao-v2.sql) são o RLS recusando a gravação e o `.single()`
 * não achando a linha porque o RLS a escondeu — ambos são falta de permissão.
 * Os demais códigos do Postgres viram português em vez do texto cru em inglês.
 */
/**
 * App mais novo que o banco: o PostgREST não acha a função (PGRST202) ou a
 * tabela (PGRST205) desta versão. Acontece quando a stack sobe a imagem nova
 * sem o migrador rodar de novo.
 */
export const BANCO_DESATUALIZADO =
  "O banco ainda não recebeu a atualização desta versão. No Portainer, abra o serviço " +
  "manutencao_migrador e clique em Update the service (com Re-pull image); depois tente de novo.";

export function esquemaDesatualizado(erro: { code?: string } | null | undefined) {
  return erro?.code === "PGRST202" || erro?.code === "PGRST205";
}

export function erroBanco(erro: { code?: string; message?: string }): { ok: false; erro: string } {
  const m = erro.message ?? "";
  const c = erro.code ?? "";
  if (esquemaDesatualizado(erro)) return { ok: false, erro: BANCO_DESATUALIZADO };
  if (/row-level security/i.test(m) || c === "42501" || c === "PGRST116") {
    return { ok: false, erro: "Seu papel nesta empresa não permite esta ação. Fale com o gestor." };
  }
  if (c === "23505") return { ok: false, erro: "Já existe um registro com esses dados." };
  if (c === "23503") {
    return {
      ok: false,
      erro: /delete|update or delete/i.test(m)
        ? "Este registro está em uso por outros dados e não pode ser removido."
        : "Um dos itens escolhidos não existe mais. Atualize a página e tente de novo.",
    };
  }
  if (c === "23502") return { ok: false, erro: "Preencha todos os campos obrigatórios." };
  if (c === "23514") return { ok: false, erro: "Um dos valores informados não é aceito. Confira os campos." };
  if (c === "22P02" || c === "22007" || c === "22008") {
    return { ok: false, erro: "Um dos valores informados está em formato inválido. Confira os campos." };
  }
  if (c === "22003") return { ok: false, erro: "Um dos números informados é grande demais." };
  if (c === "22001") return { ok: false, erro: "Um dos textos informados é longo demais." };
  if (c === "57014") return { ok: false, erro: "O banco demorou demais para responder. Tente de novo." };
  if (c === "PGRST301" || c === "PGRST302" || /JWT/i.test(m)) {
    return { ok: false, erro: "Sua sessão expirou. Entre de novo." };
  }
  if (/fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(m)) return { ok: false, erro: SEM_CONEXAO };
  // P0001 = `raise exception` das nossas funções: a mensagem já é em português.
  return { ok: false, erro: m || FALHA_GENERICA };
}
