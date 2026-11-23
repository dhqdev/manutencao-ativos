-- ============================================================================
--  CONVITES PARA A EQUIPE
--  Aplicado pelo migrador depois de 72-entrar-como.sql. Idempotente.
--
--  Pôr na equipe alguém que JÁ tem conta não é mais imediato: vira um convite
--  que a pessoa aceita ao entrar no sistema. E só aceita quem confirmou o
--  e-mail (link do e-mail de confirmação ou de "Esqueci minha senha").
--
--  Por quê: o cadastro público não prova que o e-mail é de quem cadastrou.
--  Antes, um estranho cadastrava joao@empresa.com.br antes do João; quando o
--  gestor ia "Criar usuário" para o João, o sistema só adicionava a conta que
--  já existia — a do estranho — e ele passava a ver tudo da empresa.
--
--  Login criado pelo próprio gestor ("Criar usuário" com e-mail novo) continua
--  entrando direto: quem recebe a senha é quem o gestor escolheu.
-- ============================================================================

create table if not exists public.convites (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizacoes (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  papel         public.papel_membro not null default 'tecnico',
  convidado_por uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (org_id, user_id),
  constraint convites_sem_proprietario check (papel <> 'proprietario')
);

create index if not exists convites_user_idx on public.convites (user_id);

alter table public.convites enable row level security;

-- Leitura: o convidado vê os dele; o gestor vê os da empresa. Escrita só pelas
-- funções abaixo (nenhuma policy de insert/update/delete).
drop policy if exists convites_select on public.convites;
create policy convites_select on public.convites for select to authenticated
  using (user_id = auth.uid() or org_id in (select public.user_admin_org_ids()));

revoke insert, update, delete on public.convites from anon, authenticated;
grant select on public.convites to authenticated;

-- ---------------------------------------------------------------------------
-- Convidar (substitui o adicionar_membro do 10-schema.sql: mesmo nome e
-- parâmetros, para o app antigo seguir funcionando durante a atualização,
-- mas agora cria o convite em vez de pôr a pessoa na equipe).
-- ---------------------------------------------------------------------------
create or replace function public.adicionar_membro(
  p_org   uuid,
  p_email text,
  p_papel public.papel_membro default 'tecnico'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alvo uuid;
begin
  if not public.pode_gerenciar_equipe(p_org) then
    raise exception 'Você não tem permissão para gerenciar a equipe desta empresa.';
  end if;

  if p_papel = 'proprietario' then
    raise exception 'Não é possível criar outro proprietário.';
  end if;

  -- O superadmin nunca entra em equipe (responde como e-mail inexistente).
  select id into v_alvo from auth.users
   where lower(email) = lower(trim(p_email)) and not superadmin
   limit 1;

  if v_alvo is null then
    raise exception 'Nenhum usuário com este e-mail. Use "Criar usuário" para cadastrar a pessoa.';
  end if;

  if exists (select 1 from public.org_membros where org_id = p_org and user_id = v_alvo) then
    raise exception 'Este usuário já faz parte da equipe.';
  end if;

  insert into public.convites (org_id, user_id, papel, convidado_por)
  values (p_org, v_alvo, p_papel, auth.uid())
  on conflict (org_id, user_id)
  do update set papel = excluded.papel, convidado_por = excluded.convidado_por, created_at = now();

  return 'convidado';
end;
$$;

-- Convites pendentes da empresa (tela Equipe): com e-mail e nome do convidado,
-- que o RLS de profiles não mostraria (a pessoa ainda não divide empresa).
create or replace function public.convites_da_empresa(p_org uuid)
returns table (id uuid, email text, nome text, papel public.papel_membro, created_at timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select c.id, u.email, p.nome, c.papel, c.created_at
    from public.convites c
    join auth.users u on u.id = c.user_id
    left join public.profiles p on p.id = c.user_id
   where c.org_id = p_org
     and public.pode_gerenciar_equipe(p_org)
   order by c.created_at desc;
$$;

-- Convites para quem está logado (aviso no topo do sistema).
create or replace function public.meus_convites()
returns table (id uuid, org_id uuid, empresa text, papel public.papel_membro, convidado_por text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select c.id, c.org_id, o.nome, c.papel, coalesce(p.nome, u.email), c.created_at
    from public.convites c
    join public.organizacoes o on o.id = c.org_id
    left join auth.users u on u.id = c.convidado_por
    left join public.profiles p on p.id = c.convidado_por
   where c.user_id = auth.uid()
   order by c.created_at desc;
$$;

create or replace function public.aceitar_convite(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v public.convites;
begin
  select * into v from public.convites where id = p_id and user_id = auth.uid();
  if v.id is null then
    raise exception 'Convite não encontrado (pode ter sido cancelado).';
  end if;

  if exists (select 1 from auth.users where id = v.user_id and superadmin) then
    raise exception 'O superadmin não entra na equipe das empresas.';
  end if;

  if exists (select 1 from auth.users where id = v.user_id and email_confirmed_at is null) then
    raise exception 'Confirme seu e-mail antes de aceitar o convite: é assim que a empresa sabe que a conta é mesmo sua.'
      using errcode = '42501';
  end if;

  insert into public.org_membros (org_id, user_id, papel)
  values (v.org_id, v.user_id, v.papel)
  on conflict (org_id, user_id) do nothing;

  update public.profiles set org_atual = v.org_id where id = v.user_id;
  delete from public.convites where id = v.id;
  return v.org_id;
end;
$$;

create or replace function public.recusar_convite(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.convites where id = p_id and user_id = auth.uid();
$$;

create or replace function public.cancelar_convite(p_org uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pode_gerenciar_equipe(p_org) then
    raise exception 'Você não tem permissão para gerenciar a equipe desta empresa.';
  end if;
  delete from public.convites where id = p_id and org_id = p_org;
end;
$$;

revoke all on function public.convites_da_empresa(uuid)   from public, anon, authenticated;
revoke all on function public.meus_convites()             from public, anon, authenticated;
revoke all on function public.aceitar_convite(uuid)       from public, anon, authenticated;
revoke all on function public.recusar_convite(uuid)       from public, anon, authenticated;
revoke all on function public.cancelar_convite(uuid, uuid) from public, anon, authenticated;
grant execute on function public.convites_da_empresa(uuid)   to authenticated, service_role;
grant execute on function public.meus_convites()             to authenticated, service_role;
grant execute on function public.aceitar_convite(uuid)       to authenticated, service_role;
grant execute on function public.recusar_convite(uuid)       to authenticated, service_role;
grant execute on function public.cancelar_convite(uuid, uuid) to authenticated, service_role;
grant execute on function public.adicionar_membro(uuid, text, public.papel_membro) to authenticated;

notify pgrst, 'reload schema';
