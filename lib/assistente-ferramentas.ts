/**
 * Ferramentas que o assistente de IA pode chamar, e a validação delas.
 *
 * Lógica pura (sem banco), para ser testada em testes/unidade. Quem executa é
 * lib/assistente.ts, SEMPRE com o cliente do usuário (createClient): o RLS
 * limita aos dados das empresas dele e o filtro por org_id à empresa aberta.
 *
 * O modelo só escolhe entre tabelas e colunas desta lista. Nada do que ele
 * manda vira SQL ou nome de coluna sem passar por aqui: colunas fora da lista
 * (caminho de arquivo, ids de usuário etc.) simplesmente não existem para ele.
 * Só leitura: não há ferramenta que grave.
 */

export type Tabela = {
  /** Tabela ou view real no banco. */
  origem: string;
  descricao: string;
  colunas: Record<string, string>;
  /** Ordem padrão quando o modelo não pede outra. */
  ordem: { coluna: string; crescente: boolean };
};

export const TABELAS: Record<string, Tabela> = {
  categorias: {
    origem: "categorias",
    descricao: "Categorias (pastas) dos ativos, ex.: Caminhões, Máquinas.",
    colunas: {
      id: "uuid",
      nome: "texto",
      descricao: "texto",
      created_at: "data e hora de criação",
    },
    ordem: { coluna: "nome", crescente: true },
  },
  ativos: {
    origem: "ativos",
    descricao: "Ativos/equipamentos/veículos da empresa.",
    colunas: {
      id: "uuid",
      categoria_id: "uuid da categoria",
      nome: "texto",
      marca: "texto",
      modelo: "texto",
      identificacao: "placa, nº de série ou patrimônio",
      ano: "inteiro",
      data_cadastro: "data",
      horimetro_atual: "número (horas ou km atuais)",
      status: "ativo | manutencao | inativo | baixado",
      observacoes: "texto",
    },
    ordem: { coluna: "nome", crescente: true },
  },
  planos: {
    origem: "vw_planos_status",
    descricao:
      "Planos de manutenção preventiva/periódica, já com a situação calculada (em_dia, proxima, atrasada, inativo).",
    colunas: {
      id: "uuid",
      ativo_id: "uuid do ativo",
      ativo_nome: "texto",
      ativo_identificacao: "texto",
      categoria_id: "uuid",
      categoria_nome: "texto",
      tipo: "texto, ex.: Troca de óleo",
      descricao: "texto",
      periodicidade_valor: "inteiro",
      periodicidade_unidade: "dias | meses | horas",
      proxima_data: "data",
      proximo_horimetro: "número",
      ultima_data: "data",
      ultimo_horimetro: "número",
      horimetro_atual: "número (do ativo)",
      dias_restantes: "inteiro (negativo = atrasado)",
      horas_restantes: "número (negativo = atrasado)",
      situacao: "em_dia | proxima | atrasada | inativo",
      responsavel: "texto",
      custo_estimado: "número (R$)",
      ativo: "booleano (plano ligado)",
    },
    ordem: { coluna: "proxima_data", crescente: true },
  },
  manutencoes: {
    origem: "vw_manutencoes_completo",
    descricao: "Histórico de manutenções realizadas, com dados do ativo e da categoria.",
    colunas: {
      id: "uuid",
      ativo_id: "uuid",
      ativo_nome: "texto",
      ativo_identificacao: "texto",
      ativo_marca: "texto",
      ativo_modelo: "texto",
      categoria_id: "uuid",
      categoria_nome: "texto",
      plano_id: "uuid do plano (se veio de um plano)",
      tipo: "preventiva | corretiva | preditiva | inspecao | melhoria",
      data_manutencao: "data",
      descricao: "texto",
      pecas: "texto (peças e materiais)",
      valor: "número (R$)",
      responsavel: "texto",
      empresa: "texto (prestador de serviço)",
      nota_fiscal: "texto",
      garantia_dias: "inteiro",
      garantia_ate: "data",
      horimetro: "número",
      observacoes: "texto",
      total_anexos: "inteiro",
    },
    ordem: { coluna: "data_manutencao", crescente: false },
  },
  anexos: {
    origem: "manutencao_anexos",
    descricao: "Arquivos e fotos anexados às manutenções (só nome e tipo).",
    colunas: {
      id: "uuid",
      manutencao_id: "uuid",
      nome: "texto",
      tipo_mime: "texto",
      tamanho: "bytes",
      created_at: "data e hora",
    },
    ordem: { coluna: "created_at", crescente: false },
  },
  pneus: {
    origem: "pneus",
    descricao: "Pneus (estoque e em uso).",
    colunas: {
      id: "uuid",
      numero_fogo: "texto (marcação do pneu)",
      marca: "texto",
      modelo: "texto",
      medida: "texto, ex.: 295/80 R22.5",
      dot: "texto",
      condicao: "novo | recapado | usado",
      status: "estoque | em_uso | recapagem | descartado",
      ativo_id: "uuid do veículo onde está",
      posicao: "texto",
      km_rodados: "número",
      sulco_inicial_mm: "número",
      sulco_atual_mm: "número",
      pressao_psi: "número",
      recapagens: "inteiro",
      data_compra: "data",
      valor_compra: "número (R$)",
      fornecedor: "texto",
      localizacao: "texto",
      observacoes: "texto",
    },
    ordem: { coluna: "numero_fogo", crescente: true },
  },
  pneu_movimentacoes: {
    origem: "pneu_movimentacoes",
    descricao: "Movimentações dos pneus (entrada, instalação, remoção, recapagem...).",
    colunas: {
      id: "uuid",
      pneu_id: "uuid",
      tipo: "entrada | instalacao | remocao | recapagem | retorno | inspecao | descarte",
      data: "data",
      ativo_id: "uuid",
      posicao: "texto",
      horimetro: "número",
      sulco_mm: "número",
      valor: "número (R$)",
      observacoes: "texto",
    },
    ordem: { coluna: "data", crescente: false },
  },
};

export const OPERADORES = ["eq", "neq", "gt", "gte", "lt", "lte", "ilike", "in", "is_null", "not_null"] as const;
export type Operador = (typeof OPERADORES)[number];
type Valor = string | number | boolean;

export type Filtro = { coluna: string; operador: Operador; valor?: Valor | Valor[] };

export type Consulta = {
  origem: string;
  colunas: string[];
  filtros: Filtro[];
  ordem: { coluna: string; crescente: boolean };
  limite: number;
};

export type Agregacao = Omit<Consulta, "colunas" | "ordem" | "limite"> & {
  agruparPor: string | null;
  somar: string | null;
};

export const LIMITE_LINHAS = 50;
/** Linhas lidas para somar/agrupar. Acima disso a resposta avisa que é parcial. */
export const LIMITE_AGREGACAO = 5000;

class ErroFerramenta extends Error {}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function tabelaDe(nome: unknown): Tabela {
  const t = typeof nome === "string" ? TABELAS[nome] : undefined;
  if (!t) throw new ErroFerramenta(`Tabela desconhecida. Use uma destas: ${Object.keys(TABELAS).join(", ")}.`);
  return t;
}

function colunaDe(t: Tabela, nome: unknown): string {
  if (typeof nome !== "string" || !(nome in t.colunas)) {
    throw new ErroFerramenta(`Coluna "${String(nome)}" não existe. Colunas: ${Object.keys(t.colunas).join(", ")}.`);
  }
  return nome;
}

function valorSimples(v: unknown): Valor {
  if (typeof v === "string") return v.slice(0, 200);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v;
  throw new ErroFerramenta("Valor de filtro inválido: use texto, número ou booleano.");
}

function filtrosDe(t: Tabela, lista: unknown): Filtro[] {
  if (lista == null) return [];
  if (!Array.isArray(lista)) throw new ErroFerramenta("`filtros` precisa ser uma lista.");
  if (lista.length > 10) throw new ErroFerramenta("No máximo 10 filtros.");
  return lista.map((f) => {
    const o = objeto(f);
    const coluna = colunaDe(t, o.coluna);
    const operador = o.operador as Operador;
    if (!OPERADORES.includes(operador)) {
      throw new ErroFerramenta(`Operador inválido. Use: ${OPERADORES.join(", ")}.`);
    }
    if (operador === "is_null" || operador === "not_null") return { coluna, operador };
    if (operador === "in") {
      if (!Array.isArray(o.valor) || o.valor.length === 0 || o.valor.length > 50) {
        throw new ErroFerramenta("O operador `in` precisa de uma lista de 1 a 50 valores.");
      }
      return { coluna, operador, valor: o.valor.map(valorSimples) };
    }
    return { coluna, operador, valor: valorSimples(o.valor) };
  });
}

/** Argumentos de `consultar` (JSON vindo do modelo) → consulta segura. */
export function validarConsulta(args: unknown): Consulta {
  const o = objeto(args);
  const t = tabelaDe(o.tabela);
  const colunas =
    Array.isArray(o.colunas) && o.colunas.length > 0
      ? [...new Set(o.colunas.map((c) => colunaDe(t, c)))]
      : Object.keys(t.colunas);
  const ordem = o.ordenar_por
    ? { coluna: colunaDe(t, o.ordenar_por), crescente: o.crescente !== false }
    : t.ordem;
  const pedido = typeof o.limite === "number" ? Math.floor(o.limite) : 20;
  return {
    origem: t.origem,
    colunas,
    filtros: filtrosDe(t, o.filtros),
    ordem,
    limite: Math.min(Math.max(pedido, 1), LIMITE_LINHAS),
  };
}

/** Argumentos de `agregar` → contagem/soma, com ou sem agrupamento. */
export function validarAgregacao(args: unknown): Agregacao {
  const o = objeto(args);
  const t = tabelaDe(o.tabela);
  return {
    origem: t.origem,
    filtros: filtrosDe(t, o.filtros),
    agruparPor: o.agrupar_por ? colunaDe(t, o.agrupar_por) : null,
    somar: o.somar ? colunaDe(t, o.somar) : null,
  };
}

export type Grupo = { grupo: string | number | boolean | null; quantidade: number; soma?: number };

/** Conta (e soma) por grupo. Ordena pela soma, ou pela quantidade sem soma. */
export function agregarLinhas(
  linhas: Record<string, unknown>[],
  agruparPor: string | null,
  somar: string | null,
): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const l of linhas) {
    const g = agruparPor ? ((l[agruparPor] ?? null) as Grupo["grupo"]) : "total";
    const k = JSON.stringify(g);
    const atual = grupos.get(k) ?? { grupo: g, quantidade: 0, ...(somar ? { soma: 0 } : {}) };
    atual.quantidade++;
    if (somar) {
      const n = Number(l[somar]);
      if (Number.isFinite(n)) atual.soma = Math.round(((atual.soma ?? 0) + n) * 100) / 100;
    }
    grupos.set(k, atual);
  }
  return [...grupos.values()].sort((a, b) => (somar ? (b.soma ?? 0) - (a.soma ?? 0) : b.quantidade - a.quantidade));
}

export function mensagemFerramenta(e: unknown): string {
  return e instanceof ErroFerramenta ? e.message : "Falha ao consultar os dados.";
}

/** Descrição das tabelas para o modelo (vai no prompt do sistema). */
export function descreverTabelas(): string {
  return Object.entries(TABELAS)
    .map(
      ([nome, t]) =>
        `- ${nome}: ${t.descricao}\n  colunas: ${Object.entries(t.colunas)
          .map(([c, d]) => `${c} (${d})`)
          .join("; ")}`,
    )
    .join("\n");
}

const NOMES_TABELAS = Object.keys(TABELAS);

const ESQUEMA_FILTROS = {
  type: "array",
  description: "Filtros combinados com E. Datas no formato AAAA-MM-DD. ilike aceita % como curinga.",
  items: {
    type: "object",
    properties: {
      coluna: { type: "string" },
      operador: { type: "string", enum: [...OPERADORES] },
      valor: { description: "Texto, número, booleano ou lista (para `in`). Omitido em is_null/not_null." },
    },
    required: ["coluna", "operador"],
  },
};

/** Definição das ferramentas no formato da API (compatível com OpenAI) do Groq. */
export const FERRAMENTAS = [
  {
    type: "function",
    function: {
      name: "consultar",
      description: `Lista linhas de uma tabela da empresa (no máximo ${LIMITE_LINHAS}). Também devolve o total de linhas que batem com os filtros.`,
      parameters: {
        type: "object",
        properties: {
          tabela: { type: "string", enum: NOMES_TABELAS },
          colunas: { type: "array", items: { type: "string" }, description: "Colunas desejadas. Vazio = todas." },
          filtros: ESQUEMA_FILTROS,
          ordenar_por: { type: "string" },
          crescente: { type: "boolean" },
          limite: { type: "integer", minimum: 1, maximum: LIMITE_LINHAS },
        },
        required: ["tabela"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agregar",
      description:
        "Conta linhas e, opcionalmente, soma uma coluna numérica, agrupando por uma coluna. Use para totais, gastos e rankings.",
      parameters: {
        type: "object",
        properties: {
          tabela: { type: "string", enum: NOMES_TABELAS },
          filtros: ESQUEMA_FILTROS,
          agrupar_por: { type: "string", description: "Coluna de agrupamento (opcional)." },
          somar: { type: "string", description: "Coluna numérica a somar (opcional), ex.: valor." },
        },
        required: ["tabela"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resumo_painel",
      description:
        "Números do dashboard: ativos, categorias, gasto do mês e do ano, manutenções do mês e planos próximos/atrasados.",
      parameters: { type: "object", properties: {} },
    },
  },
] as const;
