-- 052 — Lentidão (14/10): Painel da Cobrança mais leve (era 2,8 s por vez em produção).
-- A meta SPC calculava a carteira inteira (todas as parcelas) só para saber a situação de quem foi trabalhado no ciclo:
-- agora lê a situação direto da cobrança ("promessa não cumprida" cai no mesmo grupo "Pagamento", então o resultado é igual).
-- O resto da função é igual ao 049. Rodar inteiro no SQL Editor. Conferência esperada (última linha): painel_ok = true.

begin;

-- 3. painel da Cobrança (mês 'AAAA-MM'; cobrador opcional — sem ele, o setor todo)
create or replace function public.painel_cobranca(p_mes text, p_cobrador uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ini date := to_date(p_mes || '-01', 'YYYY-MM-DD');
  v_fim date := (to_date(p_mes || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  v_n1 numeric := coalesce(public.regra_cobranca('comissao_nivel1_ate'), 30000);
  v_n2 numeric := coalesce(public.regra_cobranca('comissao_nivel2_ate'), 35000);
  v_dia int := coalesce(public.regra_cobranca('ciclo_spc_inicio'), 12)::int;
  v_meta_dia numeric := coalesce(public.regra_cobranca('meta_spc_dia'), 50);
  v_total numeric;
  v_nivel int;
  v_ciclo_ini date;
  v_ciclo_fim date;
  v_hoje date := current_date;
  v_res jsonb;
begin
  if not (public.pode('cobranca', 'visualizar') or public.pode('financeiro', 'visualizar')) then raise exception 'Sem acesso.'; end if;

  -- comissão
  select coalesce(sum(entrada_confirmada_valor), 0) into v_total
    from public.cobranca_acordos
   where estava_spc and situacao in ('Entrada confirmada', 'Efetivada') and entrada_recebida_em between v_ini and v_fim
     and (p_cobrador is null or cobrador_id = p_cobrador);
  v_nivel := case when v_total <= v_n1 then 1 when v_total <= v_n2 then 2 else 3 end;

  with base as (
    select a.*, case when a.parcelas_vencidas_congeladas <= 0 then 4 when a.parcelas_vencidas_congeladas <= 2 then 1
                     when a.parcelas_vencidas_congeladas <= 4 then 2 when a.parcelas_vencidas_congeladas <= 6 then 3 else 4 end as faixa
      from public.cobranca_acordos a
     where a.estava_spc and (p_cobrador is null or a.cobrador_id = p_cobrador)
  ), faixas as (
    select f.faixa,
           coalesce(public.regra_cobranca(format('comissao_n%s_f%s', v_nivel, f.faixa)), 0) as pct,
           coalesce(sum(b.entrada) filter (where b.situacao = 'Aguardando entrada'), 0) as a_confirmar,
           count(b.id) filter (where b.situacao = 'Aguardando entrada') as qtd_a_confirmar,
           coalesce(sum(b.entrada_confirmada_valor) filter (where b.situacao in ('Entrada confirmada', 'Efetivada') and b.entrada_recebida_em between v_ini and v_fim), 0) as confirmada,
           count(b.id) filter (where b.situacao in ('Entrada confirmada', 'Efetivada') and b.entrada_recebida_em between v_ini and v_fim) as qtd_confirmada
      from generate_series(1, 4) f(faixa) left join base b on b.faixa = f.faixa
     group by f.faixa
  )
  select jsonb_build_object(
    'nivel', v_nivel, 'total_confirmado', v_total, 'nivel1_ate', v_n1, 'nivel2_ate', v_n2,
    'falta_proximo', case v_nivel when 1 then v_n1 - v_total + 0.01 when 2 then v_n2 - v_total + 0.01 else 0 end,
    'faixas', jsonb_agg(jsonb_build_object('faixa', faixa, 'pct', pct, 'a_confirmar', a_confirmar, 'qtd_a_confirmar', qtd_a_confirmar,
                                           'estimada', round(a_confirmar * pct / 100, 2), 'confirmada', confirmada, 'qtd_confirmada', qtd_confirmada,
                                           'gerada', round(confirmada * pct / 100, 2)) order by faixa))
    into v_res from faixas;

  -- meta SPC: ciclo do dia 12 ao dia 11 que contém hoje (ou o do mês escolhido)
  v_ciclo_ini := case when p_mes = to_char(v_hoje, 'YYYY-MM') and extract(day from v_hoje) < v_dia
                      then (date_trunc('month', v_hoje) - interval '1 month')::date + (v_dia - 1)
                      else v_ini + (v_dia - 1) end;
  v_ciclo_fim := (v_ciclo_ini + interval '1 month')::date - 1;
  with trabalhados as (
    select distinct on (k.cliente_id) k.cliente_id, c.situacao
      from public.cobranca_contatos k
      join public.cobrancas c on c.id = k.cobranca_id
      join public.cobranca_categorias cat on cat.id = c.categoria_id
     where k.data between v_ciclo_ini and v_ciclo_fim and cat.grupo = 'Cobrança DLG'
       and (p_cobrador is null or c.cobrador_id = p_cobrador)
     order by k.cliente_id, k.created_at desc
  )
  select v_res || jsonb_build_object('meta_spc', jsonb_build_object(
    'inicio', v_ciclo_ini, 'fim', v_ciclo_fim, 'dias_uteis', public.dias_uteis(v_ciclo_ini, v_ciclo_fim),
    'dias_ate_hoje', public.dias_uteis(v_ciclo_ini, least(v_hoje, v_ciclo_fim)), 'meta_dia', v_meta_dia,
    'alvo', v_meta_dia * public.dias_uteis(v_ciclo_ini, v_ciclo_fim),
    'esperado_hoje', v_meta_dia * public.dias_uteis(v_ciclo_ini, least(v_hoje, v_ciclo_fim)),
    'trabalhados', (select count(*) from trabalhados),
    'desfechos', coalesce((select jsonb_object_agg(d, n) from (
       select case when situacao in ('Renegociação feita (aguardando entrada)', 'Entrada confirmada', 'Renegociação efetivada') then 'Renegociação'
                   when situacao = 'Renegociação simulada' then 'Reneg. simulada'
                   when situacao in ('Pagamento de boleto agendado', 'Promessa não cumprida') then 'Pagamento'
                   when situacao = 'Contato realizado sem acordo' then 'Contato s/ acordo'
                   when situacao = 'Aguardando retorno' then 'Aguardando retorno'
                   when situacao = 'Não localizado' then 'Não localizado'
                   when situacao = 'Ficha não encontrada SPC' then 'Ficha não encontrada'
                   else 'Demais' end as d, count(*) as n
         from trabalhados group by 1) x), '{}'::jsonb)))
    into v_res;

  -- indicadores do mês
  select v_res || jsonb_build_object('indicadores', jsonb_build_object(
    'clientes_contatados', (select count(distinct k.cliente_id) from public.cobranca_contatos k join public.cobrancas c on c.id = k.cobranca_id
                             where k.data between v_ini and v_fim and (p_cobrador is null or c.cobrador_id = p_cobrador)),
    'contatos', (select count(*) from public.cobranca_contatos k join public.cobrancas c on c.id = k.cobranca_id
                  where k.data between v_ini and v_fim and (p_cobrador is null or c.cobrador_id = p_cobrador)),
    'acordos_fechados', (select count(*) from public.cobranca_acordos a where (a.fechado_em at time zone 'America/Sao_Paulo')::date between v_ini and v_fim
                          and a.situacao <> 'Simulada' and (p_cobrador is null or a.cobrador_id = p_cobrador)),
    'entradas_confirmadas', (select count(*) from public.cobranca_acordos a where a.situacao in ('Entrada confirmada', 'Efetivada')
                              and a.entrada_recebida_em between v_ini and v_fim and (p_cobrador is null or a.cobrador_id = p_cobrador)),
    'efetivadas', (select count(*) from public.cobranca_acordos a where a.situacao = 'Efetivada'
                    and (a.efetivado_em at time zone 'America/Sao_Paulo')::date between v_ini and v_fim and (p_cobrador is null or a.cobrador_id = p_cobrador)),
    'por_situacao', coalesce((select jsonb_object_agg(situacao, n) from (
        select s.situacao, count(*) as n from public.vw_cobranca_situacao s
         where s.carteira = 'Cobrança DLG' and coalesce(s.vencido, 0) > 0 and (p_cobrador is null or s.cobrador_id = p_cobrador)
         group by 1) x), '{}'::jsonb),
    'aguardando_entrada_valor', (select coalesce(sum(entrada), 0) from public.cobranca_acordos a where a.situacao = 'Aguardando entrada'
                                  and (p_cobrador is null or a.cobrador_id = p_cobrador)),
    'entradas_vencidas', (select count(*) from public.cobranca_acordos a where a.situacao = 'Aguardando entrada' and a.entrada_prazo < v_hoje
                           and (p_cobrador is null or a.cobrador_id = p_cobrador))))
    into v_res;
  return v_res;
end $$;
revoke all on function public.painel_cobranca(text, uuid) from public, anon;
grant execute on function public.painel_cobranca(text, uuid) to authenticated;

commit;
notify pgrst, 'reload schema';

-- Conferência
select exists (select 1 from pg_proc where proname = 'painel_cobranca') as painel_ok;
