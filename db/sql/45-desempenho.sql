-- ============================================================================
--  DESEMPENHO: índices compostos e totais calculados no banco
--  Idempotente (roda a cada deploy).
--
--  As telas filtram sempre pela empresa e ordenam pela data; com só os índices
--  simples de 10-schema.sql o Postgres lia a empresa inteira e ordenava depois.
--  As funções devolvem números prontos em vez de a tela baixar todas as
--  manutenções para somar: são `security invoker`, então o RLS de quem chama
--  continua valendo (mesmo padrão de dashboard_resumo).
-- ============================================================================

create index if not exists idx_manut_org_data   on public.manutencoes (org_id, data_manutencao desc);
create index if not exists idx_manut_ativo_data on public.manutencoes (ativo_id, data_manutencao desc);
create index if not exists idx_anexos_org       on public.manutencao_anexos (org_id);
create index if not exists idx_ativos_org_nome  on public.ativos (org_id, nome);
create index if not exists idx_pneus_org_fogo   on public.pneus (org_id, numero_fogo);

-- Dashboard: gasto e quantidade por mês e por categoria desde `p_desde`.
create or replace function public.dashboard_gastos(p_org uuid, p_desde date)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select m.data_manutencao, coalesce(m.valor, 0) as valor, c.id as categoria_id, c.nome, c.cor
    from public.manutencoes m
    join public.ativos a on a.id = m.ativo_id
    join public.categorias c on c.id = a.categoria_id
    where m.org_id = p_org and m.data_manutencao >= p_desde
  )
  select json_build_object(
    'meses', coalesce((
      select json_agg(json_build_object('mes', mes, 'valor', valor, 'quantidade', quantidade) order by mes)
      from (
        select to_char(data_manutencao, 'YYYY-MM') as mes, sum(valor) as valor, count(*) as quantidade
        from base group by 1
      ) x
    ), '[]'::json),
    'categorias', coalesce((
      select json_agg(json_build_object('id', categoria_id, 'nome', nome, 'cor', cor,
                                        'valor', valor, 'quantidade', quantidade) order by valor desc)
      from (
        select categoria_id, nome, cor, sum(valor) as valor, count(*) as quantidade
        from base group by categoria_id, nome, cor
      ) y
    ), '[]'::json)
  );
$$;

-- Tela da categoria: por ativo, quantas manutenções, custo, a última e alertas.
create or replace function public.resumo_ativos_categoria(p_categoria uuid)
returns table (ativo_id uuid, total bigint, custo numeric, ultima date, alertas bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id,
         coalesce(m.total, 0),
         coalesce(m.custo, 0),
         m.ultima,
         coalesce(p.alertas, 0)
  from public.ativos a
  left join lateral (
    select count(*) as total, sum(coalesce(valor, 0)) as custo, max(data_manutencao) as ultima
    from public.manutencoes where ativo_id = a.id
  ) m on true
  left join lateral (
    select count(*) as alertas from public.vw_planos_status
    where ativo_id = a.id and situacao in ('proxima', 'atrasada')
  ) p on true
  where a.categoria_id = p_categoria;
$$;

-- Histórico de manutenções com filtros, ordenação e paginação no banco.
-- Devolve { total, valor_total, linhas } numa ida só. A busca procura em
-- descrição, peças, responsável, prestador, nota fiscal e nome/identificação
-- do ativo. `p_limite` é limitado a 5000 (exportação).
create or replace function public.historico_manutencoes(
  p_org       uuid,
  p_busca     text    default null,
  p_tipo      text    default null,
  p_ativo     uuid    default null,
  p_categoria uuid    default null,
  p_de        date    default null,
  p_ate       date    default null,
  p_ordem     text    default 'data',
  p_desc      boolean default true,
  p_limite    int     default 50,
  p_inicio    int     default 0
)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with par as (
    -- Curinga do ILIKE vira texto comum: "%" e "_" digitados não casam com tudo.
    select case when nullif(btrim(coalesce(p_busca, '')), '') is null then null
                else '%' || replace(replace(replace(btrim(p_busca), '\', '\\'), '%', '\%'), '_', '\_') || '%'
           end as busca
  ),
  f as (
    select v.* from public.vw_manutencoes_completo v, par
    where v.org_id = p_org
      and (p_tipo is null or v.tipo::text = p_tipo)
      and (p_ativo is null or v.ativo_id = p_ativo)
      and (p_categoria is null or v.categoria_id = p_categoria)
      and (p_de is null or v.data_manutencao >= p_de)
      and (p_ate is null or v.data_manutencao <= p_ate)
      and (par.busca is null or (
           v.descricao ilike par.busca or v.pecas ilike par.busca or v.responsavel ilike par.busca
        or v.empresa ilike par.busca or v.nota_fiscal ilike par.busca
        or v.ativo_nome ilike par.busca or v.ativo_identificacao ilike par.busca))
  ),
  pagina as (
    select f.*, row_number() over (
      order by
        case when p_ordem = 'valor' and not p_desc then f.valor end asc,
        case when p_ordem = 'valor' and p_desc     then f.valor end desc,
        case when p_ordem = 'ativo' and not p_desc then f.ativo_nome end asc,
        case when p_ordem = 'ativo' and p_desc     then f.ativo_nome end desc,
        case when p_ordem = 'tipo'  and not p_desc then f.tipo::text end asc,
        case when p_ordem = 'tipo'  and p_desc     then f.tipo::text end desc,
        case when not p_desc then f.data_manutencao end asc,
        f.data_manutencao desc,
        f.created_at desc
    ) as posicao
    from f
  )
  select json_build_object(
    'total',       (select count(*) from f),
    'valor_total', (select coalesce(sum(valor), 0) from f),
    'linhas', coalesce((
      select json_agg(to_jsonb(pg) - 'posicao' order by pg.posicao)
      from pagina pg
      where pg.posicao > greatest(coalesce(p_inicio, 0), 0)
        and pg.posicao <= greatest(coalesce(p_inicio, 0), 0) + least(greatest(coalesce(p_limite, 50), 1), 5000)
    ), '[]'::json)
  );
$$;

-- Busca global (Ctrl+K): até 6 ativos, manutenções, periódicas e pneus que
-- casam com o termo, numa ida só. Termo com menos de 2 letras não busca.
create or replace function public.busca_global(p_org uuid, p_termo text)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with par as (
    select case when length(btrim(coalesce(p_termo, ''))) < 2 then null
                else '%' || replace(replace(replace(btrim(p_termo), '\', '\\'), '%', '\%'), '_', '\_') || '%'
           end as t
  )
  select json_build_object(
    'ativos', coalesce((
      select json_agg(x) from (
        select a.id, a.nome, a.identificacao, c.nome as categoria
        from public.ativos a join public.categorias c on c.id = a.categoria_id, par
        where par.t is not null and a.org_id = p_org
          and (a.nome ilike par.t or a.identificacao ilike par.t or a.marca ilike par.t or a.modelo ilike par.t)
        order by a.nome limit 6
      ) x), '[]'::json),
    'manutencoes', coalesce((
      select json_agg(x) from (
        select m.id, m.ativo_id, m.descricao, m.data_manutencao, a.nome as ativo_nome
        from public.manutencoes m join public.ativos a on a.id = m.ativo_id, par
        where par.t is not null and m.org_id = p_org
          and (m.descricao ilike par.t or m.nota_fiscal ilike par.t or m.empresa ilike par.t or m.pecas ilike par.t)
        order by m.data_manutencao desc limit 6
      ) x), '[]'::json),
    'planos', coalesce((
      select json_agg(x) from (
        select p.id, p.ativo_id, p.tipo, p.situacao, p.ativo_nome
        from public.vw_planos_status p, par
        where par.t is not null and p.org_id = p_org and (p.tipo ilike par.t or p.ativo_nome ilike par.t)
        order by p.proxima_data nulls last limit 6
      ) x), '[]'::json),
    'pneus', coalesce((
      select json_agg(x) from (
        select n.id, n.numero_fogo, n.marca, n.modelo, n.status
        from public.pneus n, par
        where par.t is not null and n.org_id = p_org
          and (n.numero_fogo ilike par.t or n.marca ilike par.t or n.modelo ilike par.t)
        order by n.numero_fogo limit 6
      ) x), '[]'::json)
  );
$$;

revoke execute on function public.busca_global(uuid, text) from public, anon;
grant execute on function public.busca_global(uuid, text) to authenticated;

revoke execute on function public.dashboard_gastos(uuid, date) from public, anon;
revoke execute on function public.resumo_ativos_categoria(uuid) from public, anon;
revoke execute on function public.historico_manutencoes(uuid, text, text, uuid, uuid, date, date, text, boolean, int, int)
  from public, anon;
grant execute on function public.dashboard_gastos(uuid, date) to authenticated;
grant execute on function public.resumo_ativos_categoria(uuid) to authenticated;
grant execute on function public.historico_manutencoes(uuid, text, text, uuid, uuid, date, date, text, boolean, int, int)
  to authenticated;
