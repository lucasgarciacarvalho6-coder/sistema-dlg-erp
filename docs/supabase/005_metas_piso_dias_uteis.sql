-- =====================================================================
-- 005 — METAS POR MÊS COM PISO, DIAS ÚTEIS, FICHAS NA RMC E PARÂMETROS
--        (pode rodar mais de uma vez)
--
--  • Meta e PISO por mês: cada mês pode ter valores diferentes. Mês sem meta própria
--    usa a do último mês definido (e, se não houver, a meta padrão mes = '*').
--  • Piso = mínimo do mês para não dar prejuízo. Piso diário = piso ÷ dias úteis.
--  • Meta diária = meta mensal ÷ dias úteis do mês (ex.: 1.200 ÷ 21 = 57,14)
--  • Dias úteis = segunda a sexta, menos feriados nacionais (inclui Sexta-feira Santa)
--  • Visita fotografada → fichas contam para a coordenação (RMC) do Operacional
--  • Parâmetros do negócio (bonificação, diárias, alimentação) editáveis pelo ADM
-- =====================================================================

-- 1. Domingo de Páscoa (Meeus/Jones/Butcher) — base da Sexta-feira Santa
create or replace function public.pascoa(p_ano int) returns date
language plpgsql immutable as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mes int; dia int;
begin
  a := p_ano % 19; b := p_ano / 100; c := p_ano % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31; dia := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(p_ano, mes, dia);
end $$;

-- 2. É dia útil? (seg–sex e não é feriado nacional)
create or replace function public.eh_dia_util(p_data date) returns boolean
language sql immutable as $$
  select extract(isodow from p_data) between 1 and 5
     and to_char(p_data, 'MM-DD') not in ('01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25')
     and p_data <> public.pascoa(extract(year from p_data)::int) - 2 -- Sexta-feira Santa
$$;

-- 3. Quantidade de dias úteis do mês da data
create or replace function public.dias_uteis_mes(p_data date) returns int
language sql immutable as $$
  select count(*)::int
  from generate_series(date_trunc('month', p_data)::date, (date_trunc('month', p_data) + interval '1 month - 1 day')::date, interval '1 day') d
  where public.eh_dia_util(d::date)
$$;

-- 4. Metas: coluna PISO e coluna MES ('*' = meta padrão; 'YYYY-MM' = meta daquele mês)
alter table public.metas add column if not exists piso numeric not null default 0;
alter table public.metas add column if not exists mes text not null default '*';
do $$ begin
  alter table public.metas add constraint metas_piso_check check (piso >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.metas add constraint metas_mes_check check (mes = '*' or mes ~ '^\d{4}-\d{2}$');
exception when duplicate_object then null; end $$;
-- chave passa a incluir o mês
do $$ begin
  if not exists (
    select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.metas'::regclass and c.contype = 'p' and a.attname = 'mes'
  ) then
    alter table public.metas drop constraint if exists metas_pkey;
    alter table public.metas add constraint metas_pkey primary key (colaborador_id, indicador_id, mes);
  end if;
end $$;

-- 5. Meta que vale para uma data: a do mês, senão a do último mês definido antes, senão a padrão ('*')
create or replace function public.meta_vigente(p_colaborador uuid, p_indicador text, p_data date)
returns table (mensal numeric, piso numeric)
language sql stable security definer set search_path = public as $$
  select m.mensal, m.piso from public.metas m
  where m.colaborador_id = p_colaborador and m.indicador_id = p_indicador
    and (m.mes = '*' or m.mes <= to_char(p_data, 'YYYY-MM'))
  order by (m.mes = '*'), m.mes desc
  limit 1
$$;

-- a diária guardada passa a ser sempre mensal ÷ dias úteis (padrão: mês atual; mensais: o próprio mês)
update public.metas set diaria = round(mensal / nullif(public.dias_uteis_mes(
  case when mes = '*' then current_date else to_date(mes || '-01', 'YYYY-MM-DD') end), 0), 2)
where mensal > 0;

-- visão de metas do mês atual (com piso)
drop view if exists public.vw_metas_colaborador;
create view public.vw_metas_colaborador with (security_invoker = true) as
select c.id as colaborador_id, c.nome, c.setor, i.id as indicador_id, i.label, i.unidade,
  round(coalesce(v.mensal, i.meta_mensal_padrao) / nullif(public.dias_uteis_mes(current_date), 0), 2) as meta_diaria,
  coalesce(v.mensal, i.meta_mensal_padrao) as meta_mensal,
  coalesce(v.piso, 0) as piso_mensal,
  round(coalesce(v.piso, 0) / nullif(public.dias_uteis_mes(current_date), 0), 2) as piso_diario
from public.colaboradores c
join public.indicadores i on i.setor = c.setor
left join lateral public.meta_vigente(c.id, i.id, current_date) v on true
where c.status = 'ATIVO';

-- 6. Coordenação/RMC do Operacional (dona dos contratos e das fichas)
create or replace function public.responsavel_operacional() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.colaboradores
  where setor = 'operacional' and status = 'ATIVO'
  order by (funcao ilike '%rmc%' or funcao ilike '%coorden%') desc, created_at
  limit 1
$$;

-- 7. Visita fotografada → fichas na meta da RMC + fotos para a Produção + histórico
create or replace function public.fluxo_encerrar_visita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Fotografada' and old.status = 'Agendada' then
    if coalesce(new.fichas_fotografadas, 0) <= 0 then
      raise exception 'Informe quantas fichas foram fotografadas';
    end if;
    perform public.lancar('operacional', 'fichas', public.responsavel_operacional(), new.fichas_fotografadas, 'Visita fotografada: ' || new.escola, new.data);
    update public.ordens_producao set fotos = new.fichas_fotografadas, etapa = 'Tratamento'
      where contrato_escola_id = new.contrato_id and etapa = 'Aguardando fotos';
    insert into public.agenda_historico (visita_id, tipo, descricao, autor)
      values (new.id, 'Visita encerrada', new.fichas_fotografadas || ' fichas fotografadas.', (select nome from public.colaboradores where id = auth.uid()));
    perform public.notificar(array['producao', 'adm']::public.setor[], 'sucesso', 'Visita fotografada',
      format('%s: %s fichas. As fotos seguem para tratamento na Produção.', new.escola, new.fichas_fotografadas), '/producao/ordens');
  end if;
  return new;
end $$;

-- fichas já lançadas sem dono passam para a RMC
update public.lancamentos set colaborador_id = public.responsavel_operacional()
where setor = 'operacional' and indicador_id = 'fichas' and colaborador_id is null and public.responsavel_operacional() is not null;

-- 8. Meta de fichas: toda da RMC (1.200 com piso 1.000, só se ainda não tiver meta);
--    fotógrafos do Operacional ficam com meta 0 (não aparecem nos cards de metas individuais)
insert into public.metas (colaborador_id, indicador_id, mes, mensal, piso, diaria)
select public.responsavel_operacional(), 'fichas', '*', 1200, 1000, round(1200.0 / nullif(public.dias_uteis_mes(current_date), 0), 2)
where public.responsavel_operacional() is not null
on conflict (colaborador_id, indicador_id, mes) do nothing;

delete from public.metas m using public.colaboradores c
where c.id = m.colaborador_id and c.setor = 'operacional' and m.indicador_id = 'fichas' and m.mes <> '*'
  and c.id is distinct from public.responsavel_operacional();
insert into public.metas (colaborador_id, indicador_id, mes, mensal, piso, diaria)
select id, 'fichas', '*', 0, 0, 0 from public.colaboradores
where setor = 'operacional' and id is distinct from public.responsavel_operacional()
on conflict (colaborador_id, indicador_id, mes) do update set mensal = 0, piso = 0, diaria = 0, updated_at = now();

-- 9. "Meta diária batida" usa a meta vigente do mês ÷ dias úteis
create or replace function public.fluxo_meta_batida() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_meta numeric;
  v_total numeric;
  v_nome text;
  v_label text;
begin
  if new.colaborador_id is null or new.data <> current_date then return new; end if;
  select coalesce(v.mensal, i.meta_mensal_padrao) / nullif(public.dias_uteis_mes(new.data), 0), i.label into v_meta, v_label
  from public.indicadores i left join lateral public.meta_vigente(new.colaborador_id, i.id, new.data) v on true
  where i.id = new.indicador_id;
  if coalesce(v_meta, 0) <= 0 then return new; end if;
  select sum(quantidade) into v_total from public.lancamentos
  where colaborador_id = new.colaborador_id and indicador_id = new.indicador_id and data = new.data;
  if v_total >= v_meta and v_total - new.quantidade < v_meta then
    select nome into v_nome from public.colaboradores where id = new.colaborador_id;
    perform public.notificar(array['adm', 'gerencia', new.setor]::public.setor[], 'sucesso', 'Meta diária batida 🎯',
      format('%s atingiu a meta diária de %s.', v_nome, lower(v_label)), case when new.setor = 'operacional' then '/operacional/metas' else '/' || new.setor::text end);
  end if;
  return new;
end $$;

-- 10. Parâmetros do negócio (bonificação à escola, diárias, alimentação...) — ADM › Configurações
--     Leitura: qualquer usuário logado (política já existente em empresas). Edição: quem edita cadastros (ADM).
alter table public.empresas add column if not exists parametros jsonb not null default '{}'::jsonb;

-- Conferência: setembro/2026 = 21 dias úteis; RMC encontrada e sua meta/piso de fichas
select public.dias_uteis_mes('2026-09-01') as dias_uteis_setembro,
       (select nome from public.colaboradores where id = public.responsavel_operacional()) as rmc_operacional,
       (select mensal from public.meta_vigente(public.responsavel_operacional(), 'fichas', current_date)) as meta_fichas_rmc,
       (select piso from public.meta_vigente(public.responsavel_operacional(), 'fichas', current_date)) as piso_fichas_rmc;
