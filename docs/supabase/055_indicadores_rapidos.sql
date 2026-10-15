-- 055 — Lentidão (15/10): Indicadores do Financeiro › Contas a Receber levavam ~3,7 s.
-- O "explain" mostrou duas leituras das ≈110 mil parcelas: uma cobrança por vez (9.300 buscas, 1,8 s)
-- e depois a tabela inteira de novo (1,7 s). Agora as parcelas são lidas UMA vez só e somadas por cobrança;
-- os totais saem dessas somas. MESMOS NÚMEROS, mesma resposta (o sistema no ar não muda nada).
-- Pode rodar mais de uma vez. Rodar inteiro no SQL Editor. Conferência no fim (esperado: rapida = true).

create or replace function public.indicadores_receber(p_mes text default to_char(current_date, 'YYYY-MM')) returns jsonb
language sql stable set search_path = public as $$
  with r as (
    select coalesce(public.regra_cobranca('juros_dia'), 0) as juros_dia,
           coalesce(public.regra_cobranca('terceirizada_dias'), 730) as terceirizada_dias
  ),
  -- as parcelas lidas uma vez: somas por cobrança (as mesmas da vw_cobrancas + as dos totais de parcelas)
  g as materialized (
    select q.cobranca_id,
      count(*) filter (where q.aberta)::int as parcelas_abertas,
      count(*) filter (where q.vencida)::int as parcelas_vencidas,
      count(*) filter (where q.situacao = 'Paga')::int as pagas,
      count(*) filter (where q.situacao = 'Em acordo')::int as qtd_em_acordo,
      coalesce(sum(q.valor - q.baixado) filter (where q.aberta), 0) as em_aberto,
      coalesce(sum(q.valor - q.baixado) filter (where q.vencida), 0) as vencido,
      coalesce(sum(q.multa) filter (where q.vencida), 0) as multa,
      sum(current_date - q.vencimento) filter (where q.vencida and q.cobra_juros) as dias_juros,
      min(q.vencimento) filter (where q.vencida) as vencida_desde,
      -- para os totais de parcelas (antes: a tabela inteira lida de novo)
      coalesce(sum(q.valor - q.baixado) filter (where q.aberta and q.vencimento = current_date), 0) as vence_hoje,
      coalesce(sum(q.valor - q.baixado) filter (where q.situacao = 'Em acordo'), 0) as valor_em_acordo,
      sum(current_date - q.vencimento) filter (where q.vencida) as dias_atraso_soma
    from (
      select p.cobranca_id, p.situacao, p.valor, p.baixado, p.multa, p.vencimento, p.cobra_juros,
             p.situacao in ('Aberta', 'Parcial') as aberta,
             (p.situacao in ('Aberta', 'Parcial') and p.vencimento < current_date) as vencida
      from public.cobranca_parcelas p
    ) q
    group by q.cobranca_id
  ),
  -- cada cobrança com o saldo e a carteira — mesma conta da vw_cobrancas
  c as materialized (
    select x.cliente_id,
           coalesce(g.em_aberto, 0) as em_aberto,
           coalesce(g.vencido, 0) as vencido,
           coalesce(g.vencido, 0) + coalesce(g.multa, 0) + coalesce(round(g.dias_juros * r.juros_dia, 2), 0) as atualizado,
           coalesce(g.parcelas_vencidas, 0) as parcelas_vencidas,
           case when coalesce(g.parcelas_abertas, 0) = 0 and coalesce(g.qtd_em_acordo, 0) > 0 then 'Em acordo'
                when coalesce(g.parcelas_abertas, 0) = 0 and coalesce(g.pagas, 0) > 0 then 'Quitada'
                when coalesce(g.parcelas_abertas, 0) = 0 then 'Cancelada'
                when cat.grupo in ('Terceirizada', 'Advogado', 'Fundo perdido', 'Fora da cobrança') then cat.grupo
                when coalesce(current_date - g.vencida_desde, 0) > r.terceirizada_dias then 'Terceirizada'
                else 'Cobrança DLG' end as carteira,
           cat.conta_inadimplencia
      from public.cobrancas x
      join public.clientes cl on cl.id = x.cliente_id
      join public.cobranca_categorias cat on cat.id = x.categoria_id
      cross join r
      left join g on g.cobranca_id = x.id
  ),
  por_cliente as (
    select case when sum(vencido) > 0 then 'Em atraso' when sum(em_aberto) > 0 then 'Em dia'
                when bool_or(carteira = 'Em acordo') then 'Em acordo' when bool_or(carteira = 'Quitada') then 'Quitado' else 'Cancelado' end as situacao,
           bool_or(vencido > 0 and carteira <> 'Fora da cobrança') as inadimplente
    from c group by cliente_id
  ),
  p as (
    select
      coalesce(sum(vence_hoje), 0) as vence_hoje,
      coalesce(sum(valor_em_acordo), 0) as em_acordo,
      coalesce(sum(parcelas_abertas), 0) as parcelas_abertas,
      coalesce(round(sum(dias_atraso_soma)::numeric / nullif(sum(parcelas_vencidas), 0)), 0) as atraso_medio
    from g
  )
  select jsonb_build_object(
    'em_aberto', (select coalesce(sum(em_aberto), 0) from c),
    'em_atraso', (select coalesce(sum(vencido), 0) from c),
    'atualizado_atraso', (select coalesce(sum(atualizado) filter (where vencido > 0), 0) from c),
    'parcelas_vencidas', (select coalesce(sum(parcelas_vencidas), 0) from c),
    'vence_hoje', p.vence_hoje, 'em_acordo', p.em_acordo, 'parcelas_abertas', p.parcelas_abertas, 'atraso_medio', p.atraso_medio,
    'recebido_mes', (select coalesce(sum(valor), 0) from public.cobranca_pagamentos where estornado_em is null and to_char(data, 'YYYY-MM') = p_mes),
    'recebido_hoje', (select coalesce(sum(valor), 0) from public.cobranca_pagamentos where estornado_em is null and data = current_date),
    'clientes_situacao', (select coalesce(jsonb_object_agg(situacao, n), '{}'::jsonb) from (select situacao, count(*) as n from por_cliente group by situacao) x),
    'clientes_em_atraso', (select count(*) from por_cliente where inadimplente),
    -- taxa de inadimplência: só as categorias que contam na inadimplência
    'taxa_inadimplencia', (select case when sum(em_aberto) filter (where conta_inadimplencia) > 0
                                       then round(100 * sum(vencido) filter (where conta_inadimplencia) / sum(em_aberto) filter (where conta_inadimplencia), 1) else 0 end from c)
  )
  from p
$$;
revoke all on function public.indicadores_receber(text) from public, anon;
grant execute on function public.indicadores_receber(text) to authenticated;

notify pgrst, 'reload schema';

-- Conferência
select pg_get_functiondef('public.indicadores_receber(text)'::regprocedure) like '%dias_atraso_soma%' as rapida;
