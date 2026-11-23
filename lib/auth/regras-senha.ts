/**
 * O que uma senha precisa ter para ser aceita. Sem "server-only": a mesma
 * regra vale no servidor (que decide) e nos testes de unidade.
 *
 * Nada de exigir maiúscula + número + símbolo: isso só gera "Senha@123".
 * O que protege é tamanho e não estar na lista do que todo mundo tenta primeiro.
 */

export const SENHA_MINIMO = 8;
export const SENHA_MAXIMO = 72; // bcrypt ignora o que passa de 72 bytes

/**
 * As mais tentadas em vazamentos brasileiros e as óbvias do sistema. Comparadas
 * sem acento, minúsculas e sem os números/símbolos do fim ("Mudar123!" = "mudar").
 */
const COMUNS = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234",
  "senha", "senha123", "minhasenha", "mudar", "mudarsenha", "trocar", "trocarsenha", "acesso",
  "password", "passw0rd", "qwerty", "qwertyui", "asdfghjk", "abc12345", "abcd1234", "iloveyou",
  "admin", "administrador", "superadmin", "root", "usuario", "teste", "testando", "default",
  "brasil", "flamengo", "corinthians", "palmeiras", "saopaulo", "vasco", "gremio", "cruzeiro",
  "manutencao", "gestao", "empresa", "oficina", "frota", "mecanico", "tecnico", "gestor",
  "deusefiel", "jesus", "amor", "familia", "princesa", "estrela", "futebol",
]);

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Devolve o motivo de recusa, ou null se a senha serve. */
export function problemaNaSenha(senha: string, email?: string | null): string | null {
  if (senha.length < SENHA_MINIMO) return `A senha deve ter pelo menos ${SENHA_MINIMO} caracteres.`;
  if (new TextEncoder().encode(senha).length > SENHA_MAXIMO) {
    return `A senha deve ter no máximo ${SENHA_MAXIMO} caracteres.`;
  }

  const base = semAcento(senha);
  const nucleo = base.replace(/[^a-z0-9]+$/, "").replace(/\d+$/, "").replace(/[^a-z0-9]+$/, "");
  const usuario = email ? semAcento(email.split("@")[0] ?? "").replace(/[^a-z0-9]/g, "") : "";

  if (
    COMUNS.has(base) ||
    (nucleo.length > 0 && COMUNS.has(nucleo)) ||
    /^(.)\1+$/.test(senha) ||
    (/^\d+$/.test(senha) && "01234567890123456789".includes(senha)) ||
    (usuario.length >= 4 && base.replace(/[^a-z0-9]/g, "").includes(usuario))
  ) {
    return "Essa senha é fácil de adivinhar. Use uma frase ou junte palavras que só você sabe.";
  }
  return null;
}
