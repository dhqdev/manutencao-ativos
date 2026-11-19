-- ============================================================================
--  VALIDAÇÕES NO BANCO
--  Aplicado pelo migrador depois de 40-atualizacoes.sql. Idempotente.
--
--  O app já recusa valores negativos e cores fora do padrão (lib/form.ts), mas
--  a regra também mora aqui: vale para qualquer caminho de escrita (outra
--  versão do app, importação, um script) e não depende de alguém lembrar de
--  validar na tela nova.
--
--  As travas entram como NOT VALID: só valem para o que for gravado daqui em
--  diante. Uma base antiga com algum valor estranho não derruba o deploy (o
--  migrador para no primeiro erro); a linha antiga só precisa ser corrigida
--  quando alguém editá-la.
-- ============================================================================

create or replace function pg_temp.trava(p_tabela text, p_nome text, p_regra text)
returns void
language plpgsql
as $$
begin
  if to_regclass('public.' || p_tabela) is null then
    return;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = p_nome and conrelid = ('public.' || p_tabela)::regclass
  ) then
    execute format('alter table public.%I add constraint %I check (%s) not valid', p_tabela, p_nome, p_regra);
  end if;
end;
$$;

-- Dentro de um DO para o log do migrador não encher de linhas "trava".
do $$
begin
  -- Manutenções: custo, garantia e horímetro não existem negativos.
  perform pg_temp.trava('manutencoes', 'manutencoes_valor_nao_negativo', 'valor >= 0');
  perform pg_temp.trava('manutencoes', 'manutencoes_garantia_nao_negativa', 'garantia_dias >= 0');
  perform pg_temp.trava('manutencoes', 'manutencoes_horimetro_nao_negativo', 'horimetro is null or horimetro >= 0');

  -- Ativos
  perform pg_temp.trava('ativos', 'ativos_horimetro_nao_negativo', 'horimetro_atual >= 0');
  perform pg_temp.trava('ativos', 'ativos_ano_plausivel', 'ano is null or ano between 1900 and 2200');

  -- Categorias: a cor vai direto para o style da tela.
  perform pg_temp.trava('categorias', 'categorias_cor_hex', 'cor ~ ''^#[0-9A-Fa-f]{6}$''');

  -- Periódicas
  perform pg_temp.trava('planos_manutencao', 'planos_proximo_horimetro_nao_negativo', 'proximo_horimetro is null or proximo_horimetro >= 0');
  perform pg_temp.trava('planos_manutencao', 'planos_custo_nao_negativo', 'custo_estimado is null or custo_estimado >= 0');
  perform pg_temp.trava('planos_manutencao', 'planos_alerta_dias_nao_negativo', 'alerta_antecedencia_dias >= 0');
  perform pg_temp.trava('planos_manutencao', 'planos_alerta_horas_nao_negativo', 'alerta_antecedencia_horas >= 0');

  -- Pneus
  perform pg_temp.trava('pneus', 'pneus_valor_nao_negativo', 'valor_compra is null or valor_compra >= 0');
  perform pg_temp.trava('pneus', 'pneus_sulco_nao_negativo', '(sulco_inicial_mm is null or sulco_inicial_mm >= 0) and (sulco_atual_mm is null or sulco_atual_mm >= 0)');
  perform pg_temp.trava('pneus', 'pneus_pressao_nao_negativa', 'pressao_psi is null or pressao_psi >= 0');
  perform pg_temp.trava('pneus', 'pneus_recapagens_nao_negativas', 'recapagens >= 0');
  perform pg_temp.trava('pneu_movimentacoes', 'pneu_mov_horimetro_nao_negativo', 'horimetro is null or horimetro >= 0');
  perform pg_temp.trava('pneu_movimentacoes', 'pneu_mov_sulco_nao_negativo', 'sulco_mm is null or sulco_mm >= 0');
end;
$$;
