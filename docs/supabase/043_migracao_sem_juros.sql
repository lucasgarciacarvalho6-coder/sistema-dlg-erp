-- =====================================================================
-- 043 — Dívidas migradas sem juros: "como estão no documento de exportação" (Parte 7, migração) (08/10/2026)
--
-- Decisão do usuário (08/10/2026): as cobranças que vêm do sistema antigo entram com os valores do documento de exportação
-- (em aberto, vencimento e a multa do boleto quando houver; sem multa no documento = R$ 0), SEM somar os juros de
-- R$ 0,17 por dia. Os juros continuam valendo para as dívidas novas do sistema (vendas, lançamentos, renegociações).
--   • cobranca_parcelas.cobra_juros (padrão sim): a carga da migração grava "não";
--   • as contas do banco (vw_cobranca_parcelas, vw_cobrancas e as listas por cliente) só somam juros onde cobra_juros.
--
-- Precisa dos SQLs 041 e 042. Pode rodar mais de uma vez. Rodar no SQL Editor do Supabase.
-- =====================================================================

alter table public.cobranca_parcelas add column if not exists cobra_juros boolean not null default true;

drop view if exists public.vw_inadimplentes;
drop view if exists public.vw_cobranca_clientes;
drop view if exists public.vw_cobrancas;
drop view if exists public.vw_cobranca_parcelas;

create view public.vw_cobranca_parcelas with (security_invoker = true) as
select
  p.*,
  p.valor - p.baixado as saldo,
  (p.situacao in ('Aberta', 'Parcial') and p.vencimento < current_date) as vencida,
  case when p.situacao in ('Aberta', 'Parcial') and p.vencimento < current_date then current_date - p.vencimento else 0 end as dias_atraso,
  case when p.situacao in ('Aberta', 'Parcial') and p.vencimento < current_date then p.multa else 0 end as multa_devida,
  case when p.situacao in ('Aberta', 'Parcial') and p.vencimento < current_date and p.cobra_juros
       then round((current_date - p.vencimento) * r.juros_dia, 2) else 0 end as juros,
  p.valor - p.baixado
    + case when p.situacao in ('Aberta', 'Parcial') and p.vencimento < current_date
           then p.multa + case when p.cobra_juros then round((current_date - p.vencimento) * r.juros_dia, 2) else 0 end else 0 end as atualizado
from public.cobranca_parcelas p
cross join (select coalesce(public.regra_cobranca('juros_dia'), 0) as juros_dia) r;

create view public.vw_cobrancas with (security_invoker = true) as
select
  c.id, c.cliente_id, cl.nome as cliente, cl.documento, cl.documento_ok, coalesce(cl.whatsapp, cl.telefone1) as telefone,
  cl.cidade, cl.uf, cl.busca,
  c.venda_id, c.origem, c.codigo_venda, c.codigo_sistema_antigo, c.referencia, c.conta,
  c.categoria_id, cat.nome as categoria, cat.grupo, cat.conta_inadimplencia, cat.pode_spc, cat.escritorio_id,
  c.cobrador_id, co.nome as cobrador, c.situacao, c.observacao, c.created_at, c.updated_at,
  a.parcelas, a.parcelas_abertas, a.parcelas_vencidas, a.pagas as parcelas_pagas,
  a.valor_total, a.recebido, a.em_aberto, a.vencido, a.a_vencer, a.multa, a.juros,
  a.vencido + a.multa + a.juros as atualizado,
  a.vencido + a.multa + a.juros + a.a_vencer as total_divida,
  a.vencida_desde, a.proximo_vencimento,
  case when a.parcelas_abertas = 0 and a.em_acordo = 0 and a.pagas > 0 then a.ultimo_pagamento end as quitada_em,
  coalesce(current_date - a.vencida_desde, 0) as dias_atraso,
  case when a.vencida_desde is null then null
       when current_date - a.vencida_desde <= 60 then 'Até 60 dias'
       when current_date - a.vencida_desde <= 180 then '61 a 180 dias'
       when current_date - a.vencida_desde <= 360 then '181 a 360 dias'
       else 'Acima de 360 dias' end as faixa_dias,
  case when a.parcelas_vencidas = 0 then null
       when a.parcelas_vencidas <= 2 then '1 a 2'
       when a.parcelas_vencidas <= 4 then '3 a 4'
       when a.parcelas_vencidas <= 6 then '5 a 6'
       when a.parcelas_vencidas <= 12 then '7 a 12'
       when a.parcelas_vencidas <= 24 then '13 a 24'
       else '25 ou mais' end as faixa_parcelas,
  -- carteira automática: pelo grupo da categoria; Cobrança DLG / Registro SPC com mais de 730 dias vai para a Terceirizada
  case when a.parcelas_abertas = 0 and a.em_acordo > 0 then 'Em acordo'
       when a.parcelas_abertas = 0 and a.pagas > 0 then 'Quitada'
       when a.parcelas_abertas = 0 then 'Cancelada'
       when cat.grupo in ('Terceirizada', 'Advogado', 'Fundo perdido', 'Fora da cobrança') then cat.grupo
       when coalesce(current_date - a.vencida_desde, 0) > r.terceirizada_dias then 'Terceirizada'
       else 'Cobrança DLG' end as carteira,
  (cat.grupo in ('Cobrança DLG', 'Registro SPC') and a.parcelas_abertas > 0
     and coalesce(current_date - a.vencida_desde, 0) > r.terceirizada_dias) as fora_da_categoria,
  -- renegociar: carteira DLG (até 730 dias), com o mínimo de boletos vencidos e de dias de atraso das regras
  (cat.grupo in ('Cobrança DLG', 'Registro SPC') and a.vencido > 0
     and current_date - a.vencida_desde <= r.terceirizada_dias
     and a.parcelas_vencidas >= r.reneg_min_boletos and current_date - a.vencida_desde >= r.reneg_min_dias) as pode_renegociar,
  -- ir ao SPC: igual, mas ainda fora do Registro SPC, com categoria que permite e CPF/CNPJ válido
  (cat.grupo = 'Cobrança DLG' and cat.pode_spc and cl.documento_ok and a.vencido > 0
     and current_date - a.vencida_desde <= r.terceirizada_dias
     and a.parcelas_vencidas >= r.reneg_min_boletos and current_date - a.vencida_desde >= r.reneg_min_dias) as pode_ir_spc
from public.cobrancas c
join public.clientes cl on cl.id = c.cliente_id
join public.cobranca_categorias cat on cat.id = c.categoria_id
left join public.colaboradores co on co.id = c.cobrador_id
cross join (select coalesce(public.regra_cobranca('juros_dia'), 0) as juros_dia,
                   coalesce(public.regra_cobranca('terceirizada_dias'), 730) as terceirizada_dias,
                   coalesce(public.regra_cobranca('reneg_min_boletos'), 2) as reneg_min_boletos,
                   coalesce(public.regra_cobranca('reneg_min_dias'), 61) as reneg_min_dias) r
left join lateral (
  select
    count(*) filter (where q.situacao <> 'Cancelada')::int as parcelas,
    count(*) filter (where q.aberta)::int as parcelas_abertas,
    count(*) filter (where q.vencida)::int as parcelas_vencidas,
    count(*) filter (where q.situacao = 'Paga')::int as pagas,
    count(*) filter (where q.situacao = 'Em acordo')::int as em_acordo,
    coalesce(sum(q.valor) filter (where q.situacao <> 'Cancelada'), 0) as valor_total,
    coalesce((select sum(pg.valor) from public.cobranca_pagamentos pg where pg.cobranca_id = c.id and pg.estornado_em is null), 0) as recebido,
    coalesce(sum(q.valor - q.baixado) filter (where q.aberta), 0) as em_aberto,
    coalesce(sum(q.valor - q.baixado) filter (where q.vencida), 0) as vencido,
    coalesce(sum(q.valor - q.baixado) filter (where q.aberta and not q.vencida), 0) as a_vencer,
    coalesce(sum(q.multa) filter (where q.vencida), 0) as multa,
    -- juros = R$ por dia × soma dos dias de atraso das parcelas vencidas que cobram juros (as migradas não cobram)
    coalesce(round(sum(current_date - q.vencimento) filter (where q.vencida and q.cobra_juros) * r.juros_dia, 2), 0) as juros,
    min(q.vencimento) filter (where q.vencida) as vencida_desde,
    min(q.vencimento) filter (where q.aberta and not q.vencida) as proximo_vencimento,
    max(q.pago_em) as ultimo_pagamento
  from (
    select p.*, p.situacao in ('Aberta', 'Parcial') as aberta,
           (p.situacao in ('Aberta', 'Parcial') and p.vencimento < current_date) as vencida
    from public.cobranca_parcelas p
    where p.cobranca_id = c.id
  ) q
) a on true;

-- Financeiro › Contas a Receber: um nome por linha (todas as cobranças da pessoa)
create view public.vw_cobranca_clientes with (security_invoker = true) as
select
  v.cliente_id, max(v.cliente) as cliente, max(v.documento) as documento, bool_or(v.documento_ok) as documento_ok,
  max(v.telefone) as telefone, max(v.cidade) as cidade, max(v.uf) as uf,
  max(v.busca) || ' ' || coalesce(string_agg(public.texto_busca(v.referencia), ' '), '') as busca,
  string_agg(distinct v.referencia, ' | ') as referencias,
  count(*)::int as cobrancas, sum(v.parcelas)::int as parcelas, sum(v.parcelas_pagas)::int as parcelas_pagas,
  sum(v.parcelas_vencidas)::int as parcelas_vencidas,
  sum(v.valor_total) as valor_total, sum(v.recebido) as recebido, sum(v.em_aberto) as em_aberto, sum(v.vencido) as vencido,
  sum(v.atualizado) as atualizado, sum(v.total_divida) as total_divida,
  min(v.vencida_desde) as vencida_desde, min(v.proximo_vencimento) as proximo_vencimento,
  least(min(v.vencida_desde), min(v.proximo_vencimento)) as vence_primeiro,
  max(v.dias_atraso) as dias_atraso,
  array_agg(distinct v.carteira) as carteiras,
  array_agg(distinct v.conta) as contas,
  array_remove(array_agg(distinct v.cobrador), null) as cobradores,
  case when sum(v.vencido) > 0 then 'Em atraso' when sum(v.em_aberto) > 0 then 'Em dia'
       when bool_or(v.carteira = 'Em acordo') then 'Em acordo' when bool_or(v.carteira = 'Quitada') then 'Quitado' else 'Cancelado' end as situacao,
  case when sum(v.vencido) > 0 then 1 when sum(v.em_aberto) > 0 then 2
       when bool_or(v.carteira = 'Em acordo') then 3 when bool_or(v.carteira = 'Quitada') then 4 else 5 end as ordem
from public.vw_cobrancas v
group by v.cliente_id;

-- Cobrança › Inadimplência: só quem tem parcela vencida e não paga (fora o que não é cobrança de cliente)
create view public.vw_inadimplentes with (security_invoker = true) as
select
  v.cliente_id, max(v.cliente) as cliente, max(v.documento) as documento, bool_or(v.documento_ok) as documento_ok,
  max(v.telefone) as telefone, max(v.cidade) as cidade, max(v.uf) as uf,
  max(v.busca) || ' ' || coalesce(string_agg(public.texto_busca(v.referencia), ' '), '') as busca,
  string_agg(distinct v.referencia, ' | ') as referencias,
  count(*)::int as cobrancas, sum(v.parcelas_vencidas)::int as parcelas_vencidas,
  sum(v.vencido) as vencido, sum(v.multa) as multa, sum(v.juros) as juros, sum(v.atualizado) as atualizado,
  sum(v.total_divida) as total_divida,
  min(v.vencida_desde) as vencida_desde, max(v.dias_atraso) as dias_atraso,
  array_agg(distinct v.carteira) as carteiras,
  array_agg(distinct v.conta) as contas,
  array_agg(distinct v.faixa_dias) as faixas,
  array_remove(array_agg(distinct v.cobrador_id), null) as cobradores_ids,
  array_remove(array_agg(distinct v.cobrador), null) as cobradores,
  bool_or(v.pode_renegociar) as pode_renegociar, bool_or(v.pode_ir_spc) as pode_ir_spc
from public.vw_cobrancas v
where v.vencido > 0 and v.carteira <> 'Fora da cobrança'
group by v.cliente_id;

revoke all on public.vw_cobranca_parcelas, public.vw_cobrancas, public.vw_cobranca_clientes, public.vw_inadimplentes from public, anon;
grant select on public.vw_cobranca_parcelas, public.vw_cobrancas, public.vw_cobranca_clientes, public.vw_inadimplentes to authenticated, service_role;

notify pgrst, 'reload schema';

-- Conferência (esperado: true | 4 | false)
select
  exists (select 1 from information_schema.columns where table_name = 'cobranca_parcelas' and column_name = 'cobra_juros') as tem_cobra_juros,
  (select count(*) from pg_views where schemaname = 'public' and viewname in ('vw_cobranca_parcelas', 'vw_cobrancas', 'vw_cobranca_clientes', 'vw_inadimplentes')) as views,
  has_table_privilege('anon', 'public.vw_cobrancas', 'select') as de_fora_le;
