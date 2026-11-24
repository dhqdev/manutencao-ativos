-- ============================================================================
--  ENTRAR COMO — o superadmin abre o sistema na conta de outra pessoa
--  Aplicado pelo migrador depois de 71-backup.sql. Idempotente.
--
--  Botão "Entrar como" no detalhe do usuário (console /admin). Sem senha: o
--  servidor confere que quem pediu é o superadmin e cria uma sessão CURTA para
--  a pessoa, marcada com quem a abriu (auth.sessoes.aberta_por). Essa sessão
--  não se renova com o uso, não conta como acesso da pessoa (último acesso e
--  sessões abertas ficam como estavam) e cai se o superadmin perder o posto.
--
--  Cada entrada fica registrada em sistema_entradas_como: quem entrou, na
--  conta de quem, quando, de onde e quando saiu. Os e-mails são copiados na
--  hora: o registro continua legível mesmo se a conta for apagada depois.
-- ============================================================================

create table if not exists public.sistema_entradas_como (
  id               uuid primary key default gen_random_uuid(),
  superadmin_id    uuid references auth.users (id) on delete set null,
  superadmin_email text not null,
  usuario_id       uuid references auth.users (id) on delete set null,
  usuario_email    text not null,
  sessao_id        uuid not null,
  inicio           timestamptz not null default now(),
  expira_em        timestamptz not null,
  fim              timestamptz,
  ip               text,
  agente           text
);

-- Por que entrou (obrigatório no console): fica no registro e aparece para a
-- empresa na tela Equipe (79-entrar-como-auditoria.sql).
alter table public.sistema_entradas_como add column if not exists motivo text;

create index if not exists sistema_entradas_como_usuario on public.sistema_entradas_como (usuario_id, inicio desc);
create index if not exists sistema_entradas_como_sessao on public.sistema_entradas_como (sessao_id);

-- Só o service_role (RLS ligado e nenhuma policy): o registro não aparece
-- para as empresas nem para quem teve a conta aberta.
alter table public.sistema_entradas_como enable row level security;
revoke all on public.sistema_entradas_como from public, anon, authenticated;
grant select, insert, update on public.sistema_entradas_como to service_role;

-- Abre a sessão do "Entrar como" e devolve o id dela. As regras ficam aqui
-- (e não só no app) para nenhum outro caminho conseguir burlar.
drop function if exists public.auth_entrar_como(uuid, uuid, int, text, text);
create or replace function public.auth_entrar_como(
  p_admin   uuid,
  p_user    uuid,
  p_minutos int,
  p_ip      text default null,
  p_agente  text default null,
  p_motivo  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin record;
  v_alvo  record;
  v_id    uuid;
  v_expira timestamptz;
begin
  select id, email, superadmin, bloqueado into v_admin from auth.users where id = p_admin;
  if not found or not v_admin.superadmin or v_admin.bloqueado then
    raise exception 'Só o superadmin pode entrar na conta de outra pessoa.' using errcode = '42501';
  end if;

  select id, email, superadmin, bloqueado into v_alvo from auth.users where id = p_user;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  if v_alvo.superadmin then
    raise exception 'O superadmin não entra na conta de outro superadmin.' using errcode = '42501';
  end if;
  if v_alvo.bloqueado then
    raise exception 'Este usuário está bloqueado. Desbloqueie antes de entrar na conta dele.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.org_membros where user_id = p_user) then
    raise exception 'Este usuário não participa de nenhuma empresa: não há sistema para abrir.' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Diga por que vai entrar na conta (ex.: "chamado 123: relatório não abre").' using errcode = '22023';
  end if;

  -- Vale até o superadmin voltar ao console; o teto é o de um login comum (30 dias).
  v_expira := now() + make_interval(mins => greatest(5, least(coalesce(p_minutos, 43200), 43200)));

  delete from auth.sessoes where user_id = p_user and expira_em < now();

  -- last_sign_in_at fica como está: quem entrou foi o superadmin, não a pessoa.
  insert into auth.sessoes (user_id, expira_em, ip, agente, aberta_por)
  values (p_user, v_expira, left(p_ip, 64), left(p_agente, 300), p_admin)
  returning id into v_id;

  insert into public.sistema_entradas_como
    (superadmin_id, superadmin_email, usuario_id, usuario_email, sessao_id, expira_em, ip, agente, motivo)
  values
    (p_admin, v_admin.email, p_user, v_alvo.email, v_id, v_expira, left(p_ip, 64), left(p_agente, 300),
     left(trim(p_motivo), 300));

  return v_id;
end;
$$;

-- Fecha a sessão do "Entrar como" (botão "Voltar ao console", sair ou tempo
-- esgotado) e anota a hora no registro. Não mexe em sessão de login normal.
create or replace function public.auth_sair_entrada_como(p_sessao uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.sistema_entradas_como
     set fim = least(now(), expira_em)
   where sessao_id = p_sessao and fim is null;

  delete from auth.sessoes where id = p_sessao and aberta_por is not null;
end;
$$;

revoke execute on function public.auth_entrar_como(uuid, uuid, int, text, text, text) from public, anon, authenticated;
revoke execute on function public.auth_sair_entrada_como(uuid) from public, anon, authenticated;
grant execute on function public.auth_entrar_como(uuid, uuid, int, text, text, text) to service_role;
grant execute on function public.auth_sair_entrada_como(uuid) to service_role;

notify pgrst, 'reload schema';
