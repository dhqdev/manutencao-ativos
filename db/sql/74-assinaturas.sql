-- ============================================================================
--  ASSINATURA MENSAL POR PIX — vencimento por empresa, comprovantes e bloqueio
--  Aplicado pelo migrador depois de 73-convites.sql e antes do 79 (para o
--  gatilho do "Entrar como" pegar as tabelas novas). Idempotente.
--
--  Como funciona (pedido do dono em 24/11/2026):
--    * O superadmin cadastra no console a chave Pix, nome, cidade e o valor
--      (chaves pix_* e assinatura_* em sistema_credenciais). O app monta o
--      "Pix copia e cola" e o QR (BR Code estático) a partir disso.
--    * Cada empresa tem um vencimento (assinaturas.vencimento), que o
--      superadmin pode mudar à mão. A empresa paga e anexa o comprovante
--      (assinatura_pagamentos): ele JÁ VALE, sem aprovação (o vencimento anda
--      1 mês na hora). O superadmin olha quando quiser (WhatsApp/console) e,
--      se for falso, marca como falso: desfaz o mês e pode bloquear junto.
--    * O superadmin bloqueia o acesso de uma empresa à mão quando quiser
--      (assinaturas.bloqueio_manual), por cima de qualquer vencimento.
--    * Passou do vencimento + tolerância (padrão 3 dias), a empresa fica
--      bloqueada: o app só abre a tela de Assinatura, que deixa pagar e
--      anexar o comprovante.
--    * Sem chave Pix ou sem valor, a cobrança está desligada e ninguém é
--      bloqueado. Empresa "isenta" nunca é cobrada.
--
--  As empresas só LEEM a própria assinatura e os próprios envios. Toda
--  escrita passa pelas funções abaixo (o vencimento não pode ser mudado por
--  quem paga).
-- ============================================================================

create table if not exists public.assinaturas (
  org_id        uuid primary key references public.organizacoes (id) on delete cascade,
  vencimento    date,
  isenta        boolean not null default false,
  atualizado_em timestamptz not null default now()
);

-- Bloqueio à mão pelo superadmin (pedido do dono em 24/11/2026): vale por
-- cima de tudo (até de empresa isenta ou com a cobrança desligada) e só sai
-- quando ele desbloqueia ou confirma um comprovante.
alter table public.assinaturas add column if not exists bloqueio_manual boolean not null default false;
alter table public.assinaturas add column if not exists bloqueio_motivo text;
alter table public.assinaturas add column if not exists bloqueado_em    timestamptz;

alter table public.assinaturas enable row level security;
revoke insert, update, delete on public.assinaturas from public, anon, authenticated;
grant select on public.assinaturas to authenticated;
grant select, insert, update, delete on public.assinaturas to service_role;

drop policy if exists assinaturas_select on public.assinaturas;
create policy assinaturas_select on public.assinaturas for select to authenticated
  using (org_id in (select public.user_org_ids()));

create table if not exists public.assinatura_pagamentos (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizacoes (id) on delete cascade,
  valor               numeric(12, 2) not null check (valor >= 0),
  comprovante         text not null,
  nome_arquivo        text not null,
  observacao          text,
  situacao            text not null default 'pendente'
                        check (situacao in ('pendente', 'aprovado', 'recusado')),
  enviado_por         uuid references auth.users (id) on delete set null,
  enviado_em          timestamptz not null default now(),
  avaliado_em         timestamptz,
  avaliado_por        uuid references auth.users (id) on delete set null,
  motivo              text,
  vencimento_anterior date,
  vencimento_novo     date,
  -- aviso no WhatsApp do dono: quando saiu, ou por que não saiu
  whatsapp_em         timestamptz,
  whatsapp_erro       text
);

-- Sem aprovação (pedido do dono em 24/11/2026): o comprovante já nasce
-- 'aprovado' e empurra o vencimento ao chegar; liberado_em marca que foi
-- sozinho (avaliado_em fica vazio: ninguém conferiu). Só fica 'pendente'
-- quando a empresa está bloqueada à mão pelo superadmin.
alter table public.assinatura_pagamentos add column if not exists liberado_em timestamptz;
-- A primeira versão da liberação automática deixava o liberado como
-- 'pendente' ("a conferir"); o dono não quer conferir nada.
update public.assinatura_pagamentos set situacao = 'aprovado'
 where situacao = 'pendente' and liberado_em is not null;

create index if not exists assinatura_pagamentos_org on public.assinatura_pagamentos (org_id, enviado_em desc);
create index if not exists assinatura_pagamentos_pendentes on public.assinatura_pagamentos (enviado_em)
  where situacao = 'pendente';

alter table public.assinatura_pagamentos enable row level security;
revoke insert, update, delete on public.assinatura_pagamentos from public, anon, authenticated;
grant select on public.assinatura_pagamentos to authenticated;
grant select, insert, update, delete on public.assinatura_pagamentos to service_role;

drop policy if exists assinatura_pagamentos_select on public.assinatura_pagamentos;
create policy assinatura_pagamentos_select on public.assinatura_pagamentos for select to authenticated
  using (org_id in (select public.user_org_ids()));

-- Configuração (sistema_credenciais) -------------------------------------------
create or replace function public.assinatura_cfg(p_chave text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(valor), '') from public.sistema_credenciais where chave = p_chave
$$;

create or replace function public.assinatura_hoje()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Número da config ou o padrão (valor estranho não derruba a tela).
create or replace function public.assinatura_cfg_numero(p_chave text, p_padrao numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text := public.assinatura_cfg(p_chave);
begin
  if v is null or v !~ '^\d+(\.\d+)?$' then return p_padrao; end if;
  return v::numeric;
end;
$$;

-- Situação da assinatura de uma empresa ------------------------------------------
--   sem_cobranca  cobrança desligada (sem Pix ou sem valor) ou sem vencimento
--   isenta        empresa que não paga
--   em_dia        vence daqui a mais de 5 dias
--   vencendo      vence em até 5 dias (aviso no topo)
--   tolerancia    venceu, mas ainda dentro dos dias de tolerância
--   bloqueada     venceu e passou da tolerância, ou o superadmin bloqueou à
--                 mão: só a tela de Assinatura abre
create or replace function public.assinatura_situacao(p_org uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoje  date    := public.assinatura_hoje();
  v_valor numeric := public.assinatura_cfg_numero('assinatura_valor', 0);
  v_tol   int     := least(60, public.assinatura_cfg_numero('assinatura_tolerancia', 3)::int);
  v_ativa boolean := public.assinatura_cfg('pix_chave') is not null and v_valor > 0;
  v_venc  date;
  v_isenta boolean := false;
  v_manual boolean := false;
  v_motivo text;
  v_dias  int;
  v_estado text;
begin
  -- Usuário comum só consulta empresa da qual participa (o servidor, sem
  -- usuário no token, consulta qualquer uma).
  if auth.uid() is not null and p_org not in (select public.user_org_ids()) then
    return null;
  end if;

  select a.vencimento, a.isenta, a.bloqueio_manual, a.bloqueio_motivo
    into v_venc, v_isenta, v_manual, v_motivo
    from public.assinaturas a where a.org_id = p_org;
  v_isenta := coalesce(v_isenta, false);
  v_manual := coalesce(v_manual, false);
  v_dias := v_venc - v_hoje;

  v_estado := case
    when v_manual then 'bloqueada'
    when not v_ativa or v_venc is null then 'sem_cobranca'
    when v_isenta then 'isenta'
    when v_dias > 5 then 'em_dia'
    when v_dias >= 0 then 'vencendo'
    when -v_dias <= v_tol then 'tolerancia'
    else 'bloqueada'
  end;

  return json_build_object(
    'estado',      v_estado,
    'vencimento',  v_venc,
    'dias',        v_dias,
    'tolerancia',  v_tol,
    'bloqueia_em', v_venc + v_tol + 1,
    'valor',       v_valor,
    'bloqueio_manual', v_manual,
    'bloqueio_motivo', case when v_manual then v_motivo end,
    'pendente',    exists (select 1 from public.assinatura_pagamentos p
                            where p.org_id = p_org and p.situacao = 'pendente')
  );
end;
$$;

revoke execute on function public.assinatura_hoje() from public, anon, authenticated;
revoke execute on function public.assinatura_cfg(text) from public, anon, authenticated;
revoke execute on function public.assinatura_cfg_numero(text, numeric) from public, anon, authenticated;
revoke execute on function public.assinatura_situacao(uuid) from public, anon;
grant execute on function public.assinatura_situacao(uuid) to authenticated, service_role;

-- Empresa nova ganha o período de teste; as que já existiam ganham 30 dias -------
create or replace function public.assinatura_empresa_nova()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.assinaturas (org_id, vencimento)
  values (new.id, public.assinatura_hoje() + public.assinatura_cfg_numero('assinatura_dias_teste', 7)::int)
  on conflict (org_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.assinatura_empresa_nova() from public, anon, authenticated;
drop trigger if exists trg_assinatura_empresa_nova on public.organizacoes;
create trigger trg_assinatura_empresa_nova after insert on public.organizacoes
  for each row execute function public.assinatura_empresa_nova();

-- Só pega quem ainda não tem linha: rodar de novo não mexe em nada.
insert into public.assinaturas (org_id, vencimento)
select o.id, public.assinatura_hoje() + 30 from public.organizacoes o
on conflict (org_id) do nothing;

-- Próximo vencimento depois de um pagamento (pedido do dono em 24/11/2026:
-- vale o dia em que ele paga). Pagou no dia ou adiantado: 1 mês a partir do
-- vencimento atual (adiantado não perde dias e o dia do mês não muda).
-- Pagou atrasado (ou sem vencimento): 1 mês a partir do dia do pagamento.
create or replace function public.assinatura_proximo_vencimento(p_atual date)
returns date
language sql
stable
set search_path = public
as $$
  select case
    when p_atual is null or p_atual < public.assinatura_hoje()
      then (public.assinatura_hoje() + interval '1 month')::date
    else (p_atual + interval '1 month')::date
  end
$$;

revoke execute on function public.assinatura_proximo_vencimento(date) from public, anon, authenticated;

-- A empresa envia o comprovante -------------------------------------------------
-- Só proprietário/gestor. O arquivo já subiu para {org_id}/assinatura/...
create or replace function public.assinatura_enviar_comprovante(
  p_org uuid, p_caminho text, p_nome text, p_observacao text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor numeric := public.assinatura_cfg_numero('assinatura_valor', 0);
  v_id    uuid;
  v_ass   public.assinaturas;
  v_novo  date;
begin
  if auth.uid() is null or p_org not in (select public.user_admin_org_ids()) then
    raise exception 'Só o proprietário ou um gestor da empresa envia o comprovante.';
  end if;
  if public.assinatura_cfg('pix_chave') is null or v_valor <= 0 then
    raise exception 'A cobrança da assinatura ainda não foi configurada.';
  end if;
  if p_caminho is null or position(p_org::text || '/assinatura/' in p_caminho) <> 1 then
    raise exception 'Caminho do comprovante inválido.';
  end if;
  if (select count(*) from public.assinatura_pagamentos
       where org_id = p_org and situacao = 'pendente') >= 3 then
    raise exception 'Já há 3 comprovantes esperando o administrador. Aguarde antes de enviar outro.';
  end if;

  insert into public.assinatura_pagamentos (org_id, valor, comprovante, nome_arquivo, observacao, enviado_por)
  values (p_org, v_valor, p_caminho, left(coalesce(nullif(trim(p_nome), ''), 'comprovante'), 200),
          nullif(left(trim(coalesce(p_observacao, '')), 500), ''), auth.uid())
  returning id into v_id;

  -- Vale na hora, sem aprovação: o dono olha depois e marca como falso se
  -- precisar. A única exceção é a empresa bloqueada à mão pelo superadmin:
  -- aí o comprovante espera por ele (senão bloquear não adiantaria nada).
  insert into public.assinaturas (org_id, vencimento) values (p_org, null)
  on conflict (org_id) do nothing;
  select * into v_ass from public.assinaturas where org_id = p_org for update;

  if not v_ass.bloqueio_manual then
    v_novo := public.assinatura_proximo_vencimento(v_ass.vencimento);
    update public.assinaturas set vencimento = v_novo, atualizado_em = now() where org_id = p_org;
    update public.assinatura_pagamentos
       set situacao = 'aprovado', liberado_em = now(),
           vencimento_anterior = v_ass.vencimento, vencimento_novo = v_novo
     where id = v_id;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.assinatura_enviar_comprovante(uuid, text, text, text) from public, anon;
grant execute on function public.assinatura_enviar_comprovante(uuid, text, text, text) to authenticated;

-- Console do superadmin ---------------------------------------------------------
-- Empresas com a situação + os envios (mais recentes primeiro).
create or replace function public.admin_assinaturas()
returns json
language sql
stable
security definer
set search_path = public, auth
as $$
  select json_build_object(
    'empresas', coalesce((
      select json_agg(json_build_object(
               'org_id', o.id,
               'nome', o.nome,
               'isenta', coalesce(a.isenta, false),
               'bloqueio_manual', coalesce(a.bloqueio_manual, false),
               'bloqueio_motivo', a.bloqueio_motivo,
               'bloqueado_em', a.bloqueado_em,
               'situacao', public.assinatura_situacao(o.id),
               'dono', (select coalesce(p.nome, u.email) from public.org_membros m
                          join auth.users u on u.id = m.user_id
                          left join public.profiles p on p.id = m.user_id
                         where m.org_id = o.id and m.papel = 'proprietario'
                         order by m.created_at limit 1),
               'ultimo_pagamento', (select max(coalesce(g.liberado_em, g.avaliado_em)) from public.assinatura_pagamentos g
                                     where g.org_id = o.id and g.situacao = 'aprovado')
             ) order by a.vencimento nulls last, o.nome)
        from public.organizacoes o
        left join public.assinaturas a on a.org_id = o.id
    ), '[]'::json),
    'pagamentos', coalesce((
      select json_agg(linha order by linha.pendente desc, linha.enviado_em desc)
        from (
          select g.id, g.org_id, o.nome as empresa, g.valor, g.comprovante, g.nome_arquivo, g.observacao,
                 g.situacao, g.enviado_em, g.avaliado_em, g.motivo, g.vencimento_anterior, g.vencimento_novo,
                 g.whatsapp_em, g.whatsapp_erro, g.liberado_em, g.situacao = 'pendente' as pendente,
                 (select coalesce(p.nome, u.email) from auth.users u
                    left join public.profiles p on p.id = u.id where u.id = g.enviado_por) as enviado_por
            from public.assinatura_pagamentos g
            join public.organizacoes o on o.id = g.org_id
           order by g.situacao = 'pendente' desc, g.enviado_em desc
           limit 300
        ) linha
    ), '[]'::json)
  )
$$;

-- Vencimento e isenção definidos à mão.
create or replace function public.admin_definir_assinatura(p_org uuid, p_vencimento date, p_isenta boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.organizacoes where id = p_org) then
    raise exception 'Empresa não encontrada.' using errcode = 'P0002';
  end if;
  insert into public.assinaturas (org_id, vencimento, isenta, atualizado_em)
  values (p_org, p_vencimento, coalesce(p_isenta, false), now())
  on conflict (org_id) do update
    set vencimento = excluded.vencimento, isenta = excluded.isenta, atualizado_em = now();
end;
$$;

-- O que o superadmin faz com um comprovante:
--   * aprovar um 'pendente' (empresa que ele bloqueou mandou comprovante):
--     estende 1 mês e tira o bloqueio à mão;
--   * recusar (marcar como falso) um 'pendente' ou um que liberou sozinho
--     (liberado_em): desfaz o mês dado, se ninguém mexeu no vencimento
--     depois (mudança à mão ou outro comprovante valem mais). Devolve
--     { desfeito } para a tela avisar quando a data não voltou sozinha.
create or replace function public.admin_avaliar_pagamento(
  p_id uuid, p_aprovar boolean, p_motivo text, p_admin uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pag  public.assinatura_pagamentos;
  v_ant  date;
  v_novo date;
  v_desfeito boolean := false;
begin
  select * into v_pag from public.assinatura_pagamentos where id = p_id for update;
  if not found then
    raise exception 'Comprovante não encontrado.' using errcode = 'P0002';
  end if;
  if v_pag.situacao = 'recusado' then
    raise exception 'Este comprovante já foi marcado como recusado.';
  end if;
  if v_pag.situacao = 'aprovado' and (p_aprovar or v_pag.liberado_em is null) then
    raise exception 'Este comprovante já foi aprovado.';
  end if;

  insert into public.assinaturas (org_id, vencimento) values (v_pag.org_id, null)
  on conflict (org_id) do nothing;
  select vencimento into v_ant from public.assinaturas where org_id = v_pag.org_id for update;

  if not p_aprovar then
    if v_pag.liberado_em is not null and v_ant is not distinct from v_pag.vencimento_novo then
      update public.assinaturas set vencimento = v_pag.vencimento_anterior, atualizado_em = now()
       where org_id = v_pag.org_id;
      v_desfeito := true;
    end if;
    update public.assinatura_pagamentos
       set situacao = 'recusado', avaliado_em = now(), avaliado_por = p_admin,
           motivo = nullif(left(trim(coalesce(p_motivo, '')), 500), '')
     where id = p_id;
    return json_build_object('situacao', 'recusado',
                             'desfeito', v_desfeito or v_pag.liberado_em is null,
                             'vencimento', (select vencimento from public.assinaturas where org_id = v_pag.org_id));
  end if;

  v_novo := public.assinatura_proximo_vencimento(v_ant);
  update public.assinaturas
     set vencimento = v_novo, bloqueio_manual = false, bloqueio_motivo = null, bloqueado_em = null,
         atualizado_em = now()
   where org_id = v_pag.org_id;
  update public.assinatura_pagamentos
     set situacao = 'aprovado', avaliado_em = now(), avaliado_por = p_admin,
         vencimento_anterior = v_ant, vencimento_novo = v_novo,
         motivo = nullif(left(trim(coalesce(p_motivo, '')), 500), '')
   where id = p_id;
  return json_build_object('situacao', 'aprovado', 'vencimento_novo', v_novo);
end;
$$;

-- Bloquear / desbloquear o acesso de uma empresa a qualquer momento.
create or replace function public.admin_bloquear_empresa(p_org uuid, p_bloquear boolean, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.organizacoes where id = p_org) then
    raise exception 'Empresa não encontrada.' using errcode = 'P0002';
  end if;
  insert into public.assinaturas (org_id, vencimento) values (p_org, null)
  on conflict (org_id) do nothing;
  update public.assinaturas
     set bloqueio_manual = coalesce(p_bloquear, false),
         bloqueio_motivo = case when p_bloquear then nullif(left(trim(coalesce(p_motivo, '')), 300), '') end,
         bloqueado_em    = case when p_bloquear then now() end,
         atualizado_em   = now()
   where org_id = p_org;
end;
$$;

-- Funções admin_* deste arquivo: só o servidor (o 30-superadmin.sql faz o
-- mesmo para as dele, mas roda antes destas existirem).
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('admin_assinaturas', 'admin_definir_assinatura', 'admin_avaliar_pagamento',
                         'admin_bloquear_empresa')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.assinatura);
    execute format('grant execute on function %s to service_role', f.assinatura);
  end loop;
end $$;

notify pgrst, 'reload schema';
