-- ============================================================================
--  SUPERADMIN — quem administra o sistema inteiro
--  Aplicado pelo migrador depois de 20-auth.sql. Idempotente.
--
--  O login do superadmin vem das variáveis da stack, no serviço migrador:
--
--    SUPERADMIN_EMAIL   e-mail do login
--    SUPERADMIN_SENHA   senha (mínimo 8 caracteres)
--
--  A cada deploy o migrador cria o login (se não existir), liga a marca
--  superadmin, desbloqueia e acerta a senha para a da stack. Trocar a senha
--  na stack derruba as sessões abertas dele. Trocar o e-mail passa o posto
--  para o e-mail novo; deixar as duas variáveis vazias tira o posto de todos.
--
--  O painel (/admin) usa as funções admin_* abaixo. Todas são SECURITY
--  DEFINER e executáveis SÓ pelo service_role: o app confere antes, na
--  sessão do banco, se quem pediu é superadmin.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Login do superadmin (chamado só pelo migrador, que conecta como postgres)
-- ---------------------------------------------------------------------------

-- Confere a senha contra um hash bcrypt sem estourar em hash estranho.
create or replace function auth.senha_confere(p_senha text, p_hash text)
returns boolean
language plpgsql
immutable
set search_path = public, auth
as $$
begin
  if p_hash is null or p_hash !~ '^\$2[abxy]\$' then
    return false;
  end if;
  -- $2b$ (bcryptjs, do app) e $2a$ (pgcrypto) são o mesmo cálculo; o
  -- pgcrypto só não reconhece o prefixo $2b$.
  return crypt(p_senha, regexp_replace(p_hash, '^\$2[by]\$', '$2a$')) = regexp_replace(p_hash, '^\$2[by]\$', '$2a$');
exception when others then
  return false;
end;
$$;

create or replace function auth.definir_superadmin(p_email text, p_senha text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(p_email));
  v_id    uuid;
  v_hash  text;
begin
  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'SUPERADMIN_EMAIL inválido: %', p_email;
  end if;
  if length(coalesce(p_senha, '')) < 8 then
    raise exception 'SUPERADMIN_SENHA precisa ter pelo menos 8 caracteres.';
  end if;

  select id, encrypted_password into v_id, v_hash from auth.users where lower(email) = v_email;

  if v_id is null then
    -- O trigger on_auth_user_created monta a empresa "Administração" dele.
    insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at, superadmin)
    values (v_email, crypt(p_senha, gen_salt('bf', 10)),
            jsonb_build_object('nome', 'Superadmin', 'empresa', 'Administração'), now(), true)
    returning id into v_id;
    update auth.users set superadmin = false where superadmin and id <> v_id;
    return 'criado';
  end if;

  update auth.users set superadmin = true, bloqueado = false, updated_at = now() where id = v_id;
  update auth.users set superadmin = false where superadmin and id <> v_id;

  if auth.senha_confere(p_senha, v_hash) then
    return 'em dia';
  end if;

  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf', 10)) where id = v_id;
  delete from auth.sessoes where user_id = v_id;   -- senha nova: quem estava dentro sai
  return 'senha atualizada';
end;
$$;

revoke execute on function auth.senha_confere(text, text)        from public, anon, authenticated, service_role;
revoke execute on function auth.definir_superadmin(text, text)   from public, anon, authenticated, service_role;

\if :{?superadmin_email}
  select auth.definir_superadmin(:'superadmin_email', :'superadmin_senha') as resultado_superadmin \gset
  \echo '[migrador] superadmin' :superadmin_email '->' :resultado_superadmin
\elif :{?superadmin_manter}
  -- variáveis com problema (o migrador avisou no log): não mexe em nada
\else
  update auth.users set superadmin = false where superadmin;
\endif

-- ---------------------------------------------------------------------------
-- 2. Painel do superadmin
-- ---------------------------------------------------------------------------

-- É superadmin? (o app confere com o id que veio da sessão validada)
create or replace function public.admin_eh_superadmin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((select superadmin and not bloqueado from auth.users where id = p_user), false)
$$;

-- Números do sistema inteiro.
create or replace function public.admin_resumo()
returns json
language sql
stable
security definer
set search_path = public, auth
as $$
  select json_build_object(
    'usuarios',          (select count(*) from auth.users),
    'bloqueados',        (select count(*) from auth.users where bloqueado),
    'empresas',          (select count(*) from public.organizacoes),
    'ativos',            (select count(*) from public.ativos),
    'manutencoes',       (select count(*) from public.manutencoes),
    'pneus',             (select count(*) from public.pneus),
    'sessoes_ativas',    (select count(*) from auth.sessoes where expira_em > now()),
    'logins_7_dias',     (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'whatsapp_conectados', (select count(*) from public.whatsapp_conexoes where status = 'conectado'),
    'gasto_total',       (select coalesce(sum(valor), 0) from public.manutencoes)
  )
$$;

-- Todos os usuários, com as empresas e papéis de cada um.
create or replace function public.admin_usuarios()
returns json
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(json_agg(linha order by linha.created_at desc), '[]'::json)
    from (
      select u.id, u.email, p.nome, p.telefone, u.superadmin, u.bloqueado,
             u.created_at, u.last_sign_in_at,
             (select count(*) from auth.sessoes s where s.user_id = u.id and s.expira_em > now()) as sessoes,
             coalesce((
               select json_agg(json_build_object('id', o.id, 'nome', o.nome, 'papel', m.papel) order by o.nome)
                 from public.org_membros m
                 join public.organizacoes o on o.id = m.org_id
                where m.user_id = u.id
             ), '[]'::json) as empresas
        from auth.users u
        left join public.profiles p on p.id = u.id
    ) linha
$$;

-- Todas as empresas, com números e a equipe.
create or replace function public.admin_empresas()
returns json
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(json_agg(linha order by linha.nome), '[]'::json)
    from (
      select o.id, o.nome, o.cnpj, o.telefone, o.created_at,
             (select count(*) from public.ativos a where a.org_id = o.id) as ativos,
             (select count(*) from public.manutencoes m where m.org_id = o.id) as manutencoes,
             (select max(m.created_at) from public.manutencoes m where m.org_id = o.id) as ultima_atividade,
             (select w.status from public.whatsapp_conexoes w where w.org_id = o.id) as whatsapp,
             (select w.numero from public.whatsapp_conexoes w where w.org_id = o.id) as whatsapp_numero,
             coalesce((
               select json_agg(json_build_object(
                        'user_id', m.user_id, 'papel', m.papel,
                        'email', u.email, 'nome', p.nome, 'bloqueado', u.bloqueado
                      ) order by case m.papel when 'proprietario' then 0 when 'gestor' then 1
                                              when 'tecnico' then 2 else 3 end, m.created_at)
                 from public.org_membros m
                 join auth.users u on u.id = m.user_id
                 left join public.profiles p on p.id = m.user_id
                where m.org_id = o.id
             ), '[]'::json) as membros
        from public.organizacoes o
    ) linha
$$;

-- Edita e-mail e nome de qualquer usuário.
create or replace function public.admin_atualizar_usuario(p_id uuid, p_email text, p_nome text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'E-mail inválido.';
  end if;
  if exists (select 1 from auth.users where id = p_id and superadmin)
     and v_email <> (select lower(email) from auth.users where id = p_id) then
    raise exception 'O e-mail do superadmin é definido na stack (SUPERADMIN_EMAIL).';
  end if;

  update auth.users set email = v_email, updated_at = now() where id = p_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  insert into public.profiles (id, nome, email)
  values (p_id, nullif(trim(p_nome), ''), v_email)
  on conflict (id) do update set nome = coalesce(excluded.nome, public.profiles.nome), email = excluded.email;
end;
$$;

-- Bloqueia (derruba as sessões) ou desbloqueia.
create or replace function public.admin_bloquear_usuario(p_id uuid, p_bloqueado boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_bloqueado and exists (select 1 from auth.users where id = p_id and superadmin) then
    raise exception 'O superadmin não pode ser bloqueado.';
  end if;
  update auth.users set bloqueado = p_bloqueado, updated_at = now() where id = p_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  if p_bloqueado then
    delete from auth.sessoes where user_id = p_id;
  end if;
end;
$$;

-- Põe (ou troca o papel de) alguém numa empresa. Um novo proprietário rebaixa
-- o anterior a gestor: cada empresa tem um proprietário só.
create or replace function public.admin_definir_membro(p_org uuid, p_user uuid, p_papel public.papel_membro)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.organizacoes where id = p_org) then
    raise exception 'Empresa não encontrada.';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'Usuário não encontrado.';
  end if;
  -- O superadmin só administra pelo console (/admin); não entra no sistema das empresas.
  if exists (select 1 from auth.users where id = p_user and superadmin) then
    raise exception 'O superadmin só administra o sistema; ele não entra na equipe das empresas.';
  end if;

  if p_papel = 'proprietario' then
    update public.org_membros set papel = 'gestor'
     where org_id = p_org and papel = 'proprietario' and user_id <> p_user;
  elsif exists (select 1 from public.org_membros
                 where org_id = p_org and user_id = p_user and papel = 'proprietario') then
    raise exception 'Para tirar o proprietário, torne outra pessoa proprietária antes.';
  end if;

  insert into public.org_membros (org_id, user_id, papel) values (p_org, p_user, p_papel)
  on conflict (org_id, user_id) do update set papel = excluded.papel;

  insert into public.profiles (id, email, org_atual)
  select u.id, u.email, p_org from auth.users u where u.id = p_user
  on conflict (id) do update set org_atual = coalesce(public.profiles.org_atual, excluded.org_atual);
end;
$$;

-- Tira alguém de uma empresa. Se era o proprietário, a próxima pessoa assume.
create or replace function public.admin_remover_membro(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_papel    public.papel_membro;
  v_sucessor uuid;
begin
  select papel into v_papel from public.org_membros where org_id = p_org and user_id = p_user;
  if v_papel is null then
    raise exception 'Esta pessoa não faz parte desta empresa.';
  end if;

  delete from public.org_membros where org_id = p_org and user_id = p_user;

  if v_papel = 'proprietario' then
    select user_id into v_sucessor from public.org_membros
     where org_id = p_org
     order by case papel when 'gestor' then 0 when 'tecnico' then 1 else 2 end, created_at
     limit 1;
    if v_sucessor is not null then
      update public.org_membros set papel = 'proprietario' where org_id = p_org and user_id = v_sucessor;
    end if;
  end if;

  update public.profiles
     set org_atual = (select org_id from public.org_membros where user_id = p_user order by created_at limit 1)
   where id = p_user and org_atual = p_org;
end;
$$;

-- Cria uma empresa (com as categorias padrão) e, se informado, o proprietário.
create or replace function public.admin_criar_empresa(p_nome text, p_dono uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org uuid;
begin
  if nullif(trim(p_nome), '') is null then
    raise exception 'Informe o nome da empresa.';
  end if;

  insert into public.organizacoes (nome, criado_por) values (trim(p_nome), p_dono) returning id into v_org;
  perform public.seed_categorias_padrao(v_org);

  if p_dono is not null then
    perform public.admin_definir_membro(v_org, p_dono, 'proprietario');
  end if;
  return v_org;
end;
$$;

-- Apaga uma empresa inteira. Devolve arquivos e instâncias de WhatsApp para o
-- app limpar do disco e do servidor de WhatsApp.
create or replace function public.admin_excluir_empresa(p_org uuid)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_arquivos   text[];
  v_instancias text[];
  v_membros    uuid[];
begin
  if not exists (select 1 from public.organizacoes where id = p_org) then
    raise exception 'Empresa não encontrada.';
  end if;

  v_arquivos := coalesce((select array_agg(path) from public.manutencao_anexos where org_id = p_org), '{}')
             || coalesce((select array_agg(foto_url) from public.ativos where org_id = p_org and foto_url is not null), '{}');
  v_instancias := coalesce((select array_agg(instancia) from public.whatsapp_conexoes where org_id = p_org), '{}');
  v_membros := coalesce((select array_agg(user_id) from public.org_membros where org_id = p_org), '{}');

  delete from public.organizacoes where id = p_org;

  -- Quem estava com ela aberta passa para outra empresa de que participe.
  update public.profiles p
     set org_atual = (select org_id from public.org_membros m where m.user_id = p.id order by created_at limit 1)
   where p.id = any (v_membros) and p.org_atual is null;

  return json_build_object('arquivos', to_json(v_arquivos), 'instancias', to_json(v_instancias));
end;
$$;

-- Apaga um usuário. Mesmas regras da exclusão pelo próprio usuário:
--   empresa em que era a única pessoa -> a empresa vai junto;
--   empresa com mais gente, sendo ele o proprietário -> a próxima pessoa assume;
--   demais -> apenas sai.
create or replace function public.admin_excluir_usuario(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org        uuid;
  v_sucessor   uuid;
  v_arquivos   text[] := '{}';
  v_instancias text[] := '{}';
begin
  if not exists (select 1 from auth.users where id = p_id) then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  if exists (select 1 from auth.users where id = p_id and superadmin) then
    raise exception 'O superadmin não pode ser excluído (ele é definido na stack).';
  end if;

  for v_org in select org_id from public.org_membros where user_id = p_id loop
    if not exists (select 1 from public.org_membros where org_id = v_org and user_id <> p_id) then
      v_arquivos := v_arquivos
        || coalesce((select array_agg(path) from public.manutencao_anexos where org_id = v_org), '{}')
        || coalesce((select array_agg(foto_url) from public.ativos where org_id = v_org and foto_url is not null), '{}');
      v_instancias := v_instancias
        || coalesce((select array_agg(instancia) from public.whatsapp_conexoes where org_id = v_org), '{}');
      delete from public.organizacoes where id = v_org;
    else
      if exists (select 1 from public.org_membros
                  where org_id = v_org and user_id = p_id and papel = 'proprietario') then
        select user_id into v_sucessor from public.org_membros
         where org_id = v_org and user_id <> p_id
         order by case papel when 'gestor' then 0 when 'tecnico' then 1 else 2 end, created_at
         limit 1;
        update public.org_membros set papel = 'proprietario' where org_id = v_org and user_id = v_sucessor;
      end if;
      delete from public.org_membros where org_id = v_org and user_id = p_id;
    end if;
  end loop;

  delete from public.profiles where id = p_id;
  delete from auth.users where id = p_id;   -- sessões e tokens saem em cascata

  return json_build_object('arquivos', to_json(v_arquivos), 'instancias', to_json(v_instancias));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Superadmin fora do sistema das empresas
-- ---------------------------------------------------------------------------
-- O superadmin usa só o console (/admin). Vínculos dele com empresas (a empresa
-- "Administração" que o cadastro monta, ou o "Abrir no sistema" das versões
-- antigas) não servem mais. Roda a cada deploy e não perde dado:
--   empresa vazia em que ele é a única pessoa -> apagada;
--   empresa com mais gente                    -> ele sai (se era o dono, o próximo assume);
--   empresa com dados em que só ele está      -> fica (aparece no console para decidir).
do $$
declare
  v record;
begin
  for v in
    select m.org_id, m.user_id
      from public.org_membros m
      join auth.users u on u.id = m.user_id
     where u.superadmin
  loop
    if exists (select 1 from public.org_membros where org_id = v.org_id and user_id <> v.user_id) then
      perform public.admin_remover_membro(v.org_id, v.user_id);
    elsif not exists (select 1 from public.ativos where org_id = v.org_id)
      and not exists (select 1 from public.manutencoes where org_id = v.org_id)
      and not exists (select 1 from public.pneus where org_id = v.org_id) then
      delete from public.organizacoes where id = v.org_id;
    else
      raise notice 'Superadmin continua na empresa % (tem dados e ninguém mais).', v.org_id;
    end if;
  end loop;
end $$;

-- Quanto cada empresa ocupa no banco: linhas e bytes de todas as tabelas com
-- org_id (descobertas na hora, então tabela nova entra sozinha). Os arquivos
-- (fotos e anexos) ficam no disco e o app soma à parte.
create or replace function public.admin_uso_empresas()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tabela text;
  v_sql    text := '';
  v_json   json;
begin
  for v_tabela in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'org_id' and t.table_type = 'BASE TABLE'
     order by c.table_name
  loop
    v_sql := v_sql || case when v_sql = '' then '' else ' union all ' end
          || format('select org_id, count(*) as linhas, coalesce(sum(pg_column_size(x.*)), 0) as bytes '
                    'from public.%I x group by org_id', v_tabela);
  end loop;

  if v_sql = '' then
    return '[]'::json;
  end if;

  execute format(
    'select coalesce(json_agg(json_build_object(''org_id'', org_id, ''linhas'', linhas, ''bytes'', bytes)), ''[]''::json)
       from (select org_id, sum(linhas)::bigint as linhas, sum(bytes)::bigint as bytes
               from (%s) u where org_id is not null group by org_id) s', v_sql)
    into v_json;
  return v_json;
end;
$$;

-- Permissões: só o servidor ------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'admin\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.assinatura);
    execute format('grant execute on function %s to service_role', f.assinatura);
  end loop;
end $$;

notify pgrst, 'reload schema';
