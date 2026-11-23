-- ============================================================================
--  "ENTRAR COMO" À VISTA — o que o superadmin fez na conta de alguém
--  Aplicado pelo migrador depois de 73-convites.sql (e de todas as tabelas
--  das empresas, para o gatilho pegar todas). Idempotente.
--
--  Enquanto o superadmin está numa conta pelo "Entrar como", o app manda ao
--  PostgREST um JWT com a claim entrada_como (o id da sessão emprestada). Um
--  gatilho em cada tabela das empresas anota o que foi criado, mudado ou
--  apagado nessa sessão. Assim fica registrado não só QUE ele entrou, mas o
--  que ALTEROU — e a empresa vê isso na tela Equipe, com o motivo.
--
--  A claim não vem do navegador: o JWT é assinado pelo servidor (JWT_SECRET),
--  e o app só a põe quando a sessão do banco tem aberta_por preenchido.
-- ============================================================================

create table if not exists public.sistema_entradas_como_acoes (
  id          bigint generated always as identity primary key,
  sessao_id   uuid not null,
  tabela      text not null,
  operacao    text not null,
  registro_id uuid,
  org_id      uuid,
  em          timestamptz not null default now()
);

create index if not exists sistema_entradas_como_acoes_sessao on public.sistema_entradas_como_acoes (sessao_id);

alter table public.sistema_entradas_como_acoes enable row level security;
revoke all on public.sistema_entradas_como_acoes from public, anon, authenticated;
grant select on public.sistema_entradas_como_acoes to service_role;

create or replace function public.registrar_acao_entrada_como()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_sessao uuid;
  v_linha  jsonb;
begin
  if v_claims is null then return null; end if;
  v_sessao := nullif(v_claims::json->>'entrada_como', '')::uuid;
  if v_sessao is null then return null; end if;

  v_linha := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.sistema_entradas_como_acoes (sessao_id, tabela, operacao, registro_id, org_id)
  values (
    v_sessao,
    tg_table_name,
    tg_op,
    case when v_linha->>'id' ~ '^[0-9a-f-]{36}$' then (v_linha->>'id')::uuid end,
    case when tg_table_name = 'organizacoes' then (v_linha->>'id')::uuid
         when v_linha->>'org_id' ~ '^[0-9a-f-]{36}$' then (v_linha->>'org_id')::uuid end
  );
  return null;
end;
$$;

revoke execute on function public.registrar_acao_entrada_como() from public, anon, authenticated;

-- Gatilho em toda tabela com org_id (tabela nova entra sozinha no próximo deploy).
do $$
declare
  t text;
begin
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'org_id' and c.table_name not like 'sistema\_%'
    union
    select 'organizacoes'
  loop
    execute format('drop trigger if exists auditar_entrada_como on public.%I', t);
    execute format(
      'create trigger auditar_entrada_como after insert or update or delete on public.%I
         for each row execute function public.registrar_acao_entrada_como()', t);
  end loop;
end $$;

-- Console: as últimas entradas na conta de uma pessoa, com o que foi feito.
create or replace function public.admin_entradas_como(p_user uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(x order by x.inicio desc), '[]'::json)
    from (
      select e.inicio, e.fim, e.expira_em, e.superadmin_email, e.motivo, e.ip,
             (select count(*) from public.sistema_entradas_como_acoes a where a.sessao_id = e.sessao_id) as acoes
        from public.sistema_entradas_como e
       where e.usuario_id = p_user
       order by e.inicio desc
       limit 20
    ) x
$$;

revoke execute on function public.admin_entradas_como(uuid) from public, anon, authenticated;
grant execute on function public.admin_entradas_como(uuid) to service_role;

-- Tela Equipe: quando o suporte entrou na conta de alguém DESTA empresa, por
-- quê e quantas alterações fez nela. Só para proprietário/gestor; mostra os
-- últimos 180 dias.
create or replace function public.entradas_como_da_empresa(p_org uuid)
returns table (inicio timestamptz, fim timestamptz, usuario_email text, motivo text, alteracoes int)
language sql
stable
security definer
set search_path = public
as $$
  select e.inicio, coalesce(e.fim, least(e.expira_em, now())), e.usuario_email, e.motivo,
         (select count(*)::int from public.sistema_entradas_como_acoes a
           where a.sessao_id = e.sessao_id and (a.org_id = p_org or a.org_id is null))
    from public.sistema_entradas_como e
   where public.pode_gerenciar_equipe(p_org)
     and e.inicio > now() - interval '180 days'
     and e.usuario_id in (select m.user_id from public.org_membros m where m.org_id = p_org)
   order by e.inicio desc
   limit 50
$$;

revoke execute on function public.entradas_como_da_empresa(uuid) from public, anon, authenticated;
grant execute on function public.entradas_como_da_empresa(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
