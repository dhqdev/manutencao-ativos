/**
 * Segredos e endereços lidos do ambiente em tempo de execução (nada de
 * NEXT_PUBLIC_: a mesma imagem Docker serve qualquer domínio).
 *
 * Variável ausente → erro claro dizendo qual, em vez de falha obscura.
 */

function exigir(nome: string, tamanhoMinimo = 0) {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    throw new Error(
      `Variável de ambiente ${nome} não configurada. Confira o arquivo .env do servidor (veja infra/.env.exemplo).`,
    );
  }
  // O valor de exemplo do infra/portainer.yml é público: com ele qualquer um
  // assina sessões e tokens do banco. Melhor o app não subir.
  if (/^TROQUE|TROQUE-/.test(valor)) {
    throw new Error(`${nome} ainda está com o valor de exemplo (TROQUE-...). Gere um valor seu: openssl rand -hex 32.`);
  }
  if (valor.length < tamanhoMinimo) {
    throw new Error(`${nome} precisa ter pelo menos ${tamanhoMinimo} caracteres.`);
  }
  return valor;
}

/** Assina os tokens que o app manda ao PostgREST. O PostgREST usa o mesmo. */
export const segredoBanco = () => exigir("JWT_SECRET", 32);

/** Assina o cookie de sessão do navegador. */
export const segredoSessao = () => exigir("SESSAO_SECRET", 32);

/** Assina os links de fotos e anexos. */
export const segredoArquivos = () => exigir("ARQUIVOS_SECRET", 32);

/** Endereço interno do PostgREST (rede do Docker), ex.: http://rest:3000 */
export const urlRest = () => exigir("POSTGREST_URL").replace(/\/+$/, "");

/** Endereço público do sistema, ex.: https://manutencao.suaempresa.com.br */
export function urlSite() {
  return (process.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
}

/** Cookie com Secure só quando o site é servido em HTTPS. */
export function siteEmHttps() {
  return urlSite().startsWith("https://");
}

export function cadastroAberto() {
  return (process.env.CADASTRO_ABERTO ?? "true").trim().toLowerCase() !== "false";
}
