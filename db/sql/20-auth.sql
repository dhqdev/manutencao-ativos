-- ============================================================================
--  API DE AUTENTICAÇÃO — funções auth_* chamadas pelo app (via PostgREST)
--  Aplicado pelo migrador depois de 10-schema.sql. Idempotente.
--
--  Todas são SECURITY DEFINER e executáveis SÓ pelo service_role: o app as
--  chama com o JWT de servidor, nunca com o JWT de um usuário. Senhas chegam
--  já com hash (bcrypt, feito no app); o banco nunca vê senha em texto.
-- ============================================================================

-- Usuários -------------------------------------------------------------------

-- Cria o login. O trigger on_auth_user_created (10-schema.sql) cria empresa,
-- perfil e categorias — ou, se houver convite em p_app_meta, põe a pessoa
-- direto na empresa que convidou. E-mail repetido → erro 23505.
--
-- O e-mail nasce NÃO confirmado: digitar um endereço não prova que ele é seu.
-- Só o link do e-mail (confirmação ou "Esqueci minha senha") confirma, e só
-- conta confirmada aceita convite para outra empresa (73-convites.sql). Sem
-- isso, quem cadastrasse antes o e-mail de um funcionário entraria na equipe
-- quando o gestor fosse criar o acesso dele.
drop function if exists public.auth_criar_usuario(text, text, jsonb, jsonb);
create or replace function public.auth_criar_usuario(
  p_email      text,
  p_hash       text,
  p_meta       jsonb default '{}',
  p_app_meta   jsonb default '{}',
  p_confirmado boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  insert into auth.users (email, encrypted_password, raw_user_meta_data, raw_app_meta_data, email_confirmed_at)
  values (lower(trim(p_email)), p_hash, coalesce(p_meta, '{}'), coalesce(p_app_meta, '{}'),
          case when p_confirmado then now() end)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.auth_usuario_por_email(p_email text)
returns json
language sql
stable
security definer
set search_path = public, auth
as $$
  select json_build_object('id', u.id, 'email', u.email, 'hash', u.encrypted_password, 'bloqueado', u.bloqueado,
                           'superadmin', u.superadmin)
    from auth.users u
   where lower(u.email) = lower(trim(p_email))
   limit 1
$$;

create or replace function public.auth_usuario_por_id(p_id uuid)
returns json
language sql
stable
security definer
set search_path = public, auth
as $$
  select json_build_object(
           'id', u.id,
           'email', u.email,
           'user_metadata', u.raw_user_meta_data,
           'app_metadata', u.raw_app_meta_data,
           'superadmin', u.superadmin,
           'bloqueado', u.bloqueado,
           'email_confirmado', u.email_confirmed_at is not null
         )
    from auth.users u
   where u.id = p_id
$$;

-- Troca a senha e derruba as outras sessões (todas, se p_manter for nulo).
create or replace function public.auth_definir_senha(p_id uuid, p_hash text, p_manter uuid default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- A senha do superadmin é a da stack (o migrador acerta a cada deploy, por
  -- auth.definir_superadmin). Nenhum caminho do app troca: nem gestor, nem
  -- "Esqueci minha senha", nem o próprio console.
  if exists (select 1 from auth.users where id = p_id and superadmin) then
    raise exception 'A senha do superadmin é definida na stack (SUPERADMIN_SENHA).' using errcode = '42501';
  end if;
  update auth.users set encrypted_password = p_hash, updated_at = now() where id = p_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  delete from auth.sessoes where user_id = p_id and id is distinct from p_manter;
end;
$$;

create or replace function public.auth_excluir_usuario(p_id uuid)
returns void
language sql
security definer
set search_path = public, auth
as $$
  delete from auth.users where id = p_id;
$$;

-- Sessões --------------------------------------------------------------------
-- Duram 30 dias e se renovam com o uso: quem abre o sistema toda semana
-- nunca precisa entrar de novo; quem some por 30 dias, sim.

create or replace function public.auth_criar_sessao(p_user uuid, p_ip text default null, p_agente text default null)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if exists (select 1 from auth.users where id = p_user and bloqueado) then
    raise exception 'Acesso bloqueado.' using errcode = '42501';
  end if;

  delete from auth.sessoes where user_id = p_user and expira_em < now();

  insert into auth.sessoes (user_id, expira_em, ip, agente)
  values (p_user, now() + interval '30 days', left(p_ip, 64), left(p_agente, 300))
  returning id into v_id;

  update auth.users set last_sign_in_at = now() where id = p_user;
  return v_id;
end;
$$;

-- Devolve { user_id, email, superadmin, aberta_por, expira_em } se a sessão
-- vale, ou null (usuário bloqueado também dá null). Renova a validade
-- (no máximo uma gravação por hora por sessão, para não escrever a cada clique).
-- Sessão do "Entrar como" (aberta_por preenchido) não se renova e cai junto se
-- quem a abriu perder o posto de superadmin ou for bloqueado.
create or replace function public.auth_validar_sessao(p_sessao uuid)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v record;
begin
  select s.id, s.user_id, s.expira_em, s.ultimo_uso, s.aberta_por, u.email, u.superadmin, u.bloqueado,
         a.superadmin as admin_ok, a.bloqueado as admin_bloqueado
    into v
    from auth.sessoes s
    join auth.users u on u.id = s.user_id
    left join auth.users a on a.id = s.aberta_por
   where s.id = p_sessao;

  if not found or v.expira_em < now() or v.bloqueado then
    return null;
  end if;

  if v.aberta_por is not null and (v.admin_ok is not true or v.admin_bloqueado) then
    return null;
  end if;

  if v.aberta_por is null and v.ultimo_uso < now() - interval '1 hour' then
    update auth.sessoes
       set ultimo_uso = now(), expira_em = now() + interval '30 days'
     where id = p_sessao;
  end if;

  return json_build_object(
    'user_id', v.user_id,
    'email', v.email,
    'superadmin', v.superadmin,
    'aberta_por', v.aberta_por,
    'expira_em', v.expira_em
  );
end;
$$;

create or replace function public.auth_encerrar_sessao(p_sessao uuid)
returns void
language sql
security definer
set search_path = public, auth
as $$
  delete from auth.sessoes where id = p_sessao;
$$;

create or replace function public.auth_encerrar_sessoes(p_user uuid)
returns void
language sql
security definer
set search_path = public, auth
as $$
  delete from auth.sessoes where user_id = p_user;
$$;

-- Limite de tentativas -------------------------------------------------------

create or replace function public.auth_falhas_recentes(p_chave text, p_minutos int default 15)
returns int
language sql
stable
security definer
set search_path = public, auth
as $$
  select count(*)::int
    from auth.tentativas
   where chave = p_chave
     and not sucesso
     and em > now() - make_interval(mins => p_minutos)
     -- um login certo zera a contagem
     and em > coalesce(
           (select max(em) from auth.tentativas where chave = p_chave and sucesso),
           '-infinity'::timestamptz
         )
$$;

create or replace function public.auth_registrar_tentativa(p_chave text, p_sucesso boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into auth.tentativas (chave, sucesso) values (left(p_chave, 200), p_sucesso);
  -- faxina ocasional
  if random() < 0.02 then
    delete from auth.tentativas where em < now() - interval '2 days';
  end if;
end;
$$;

-- Recuperação de senha -------------------------------------------------------

create or replace function public.auth_criar_token(p_user uuid, p_hash text, p_tipo text, p_minutos int default 30)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Só o link mais recente vale.
  delete from auth.tokens where user_id = p_user and tipo = p_tipo;
  insert into auth.tokens (hash, user_id, tipo, expira_em)
  values (p_hash, p_user, p_tipo, now() + make_interval(mins => p_minutos));
end;
$$;

-- O link do e-mail chegou à pessoa: o endereço é dela.
create or replace function public.auth_confirmar_email(p_user uuid)
returns void
language sql
security definer
set search_path = public, auth
as $$
  update auth.users set email_confirmed_at = now(), updated_at = now()
   where id = p_user and email_confirmed_at is null;
$$;

-- Usa o link (uma vez só). Devolve o id do usuário, ou null.
create or replace function public.auth_consumir_token(p_hash text, p_tipo text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid;
begin
  update auth.tokens
     set usado_em = now()
   where hash = p_hash
     and tipo = p_tipo
     and usado_em is null
     and expira_em > now()
  returning user_id into v_user;
  return v_user;
end;
$$;

-- Permissões: só o servidor -------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'auth\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.assinatura);
    execute format('grant execute on function %s to service_role', f.assinatura);
  end loop;
end $$;

-- O PostgREST relê o schema (funções novas aparecem na API sem reiniciar).
notify pgrst, 'reload schema';
