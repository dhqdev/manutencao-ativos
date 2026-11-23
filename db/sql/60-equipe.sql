-- ============================================================================
--  TELA DA EQUIPE
--  Aplicado pelo migrador depois de 50-validacoes.sql. Idempotente.
--
--  A tela /equipe mostra o último acesso e se a pessoa está com sessão aberta.
--  Isso mora em auth.users / auth.sessoes, que o PostgREST não expõe. A função
--  abaixo devolve só esses dois dados, e só das pessoas da empresa pedida —
--  e só para quem é membro dela (a mesma regra do select de org_membros).
-- ============================================================================

create or replace function public.equipe_acessos(p_org uuid)
returns table (user_id uuid, ultimo_acesso timestamptz, sessoes_ativas int)
language sql
stable
security definer
set search_path = public, auth
as $$
  select m.user_id,
         u.last_sign_in_at,
         (select count(*)::int from auth.sessoes s
           where s.user_id = m.user_id and s.expira_em > now()
             and s.aberta_por is null)  -- "Entrar como" do superadmin não conta
    from public.org_membros m
    join auth.users u on u.id = m.user_id
   where m.org_id = p_org
     and p_org in (select public.user_org_ids());
$$;

revoke all on function public.equipe_acessos(uuid) from public, anon, authenticated;
grant execute on function public.equipe_acessos(uuid) to authenticated, service_role;
