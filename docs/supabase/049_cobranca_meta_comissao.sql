-- 049 — Cobrança, etapa 5 (14/10, SPEC_COBRANCA v0.6, seção 8): meta, indicadores e comissão, IGUAL ao sistema antigo
-- 1. META EM R$ do cobrador = entradas CONFIRMADAS pelo Financeiro das dívidas que estavam em Registro SPC no acordo,
--    na data real do recebimento. O lançamento de meta nasce quando o Financeiro confirma e some se ele reverter.
--    O pagamento de parcela deixa de lançar meta (era assim no SQL 045). Os lançamentos antigos ficam como estão.
-- 2. COMISSÃO: % sobre a entrada confirmada (só SPC). Faixa pelas parcelas vencidas congeladas no acordo
--    (1–2 · 3–4 · 5–6 · acima de 6); nível do mês pelo total confirmado no mês (Nível 1 até R$ 30.000,00 · Nível 2 até
--    R$ 35.000,00 · Nível 3 acima), retroativo para o mês todo. Estimada = acordos aguardando a entrada.
-- 3. META SPC: clientes elegíveis ÚNICOS trabalhados (com contato) no ciclo dia 12 → dia 11, alvo de 50 por dia útil
--    (segunda a sexta, sem feriados nacionais), com a distribuição por desfecho.
-- 4. Indicadores do mês: clientes contatados, acordos fechados, efetividade (acordos ÷ clientes contatados; simulação não conta).
-- Rodar inteiro no SQL Editor. Conferência esperada (última linha): nivel1 = 30000, painel_ok = true.

begin;

-- 0. Nível 1 vai até R$ 30.000,00 (decisão de 14/10)
update public.cobranca_regras set valor = 30000 where chave = 'comissao_nivel1_ate' and valor = 29999.99;

-- 1a. o pagamento de parcela não lança mais meta (resto igual ao 045)
create or replace function public.registrar_pagamento_parcela(
  p_parcela uuid, p_valor numeric, p_data date, p_forma text, p_observacao text default null, p_quitar boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  p public.cobranca_parcelas;
  v_saldo numeric(12, 2);
  v_principal numeric(12, 2);
  v_encargos numeric(12, 2) := 0;
  v_desconto numeric(12, 2) := 0;
  v_id uuid;
  v_nome text;
begin
  if not public.pode('financeiro', 'editar') then raise exception 'Só o Financeiro registra recebimentos.'; end if;
  p_valor := round(coalesce(p_valor, 0), 2);
  if p_valor <= 0 then raise exception 'Informe o valor recebido.'; end if;
  if p_forma is null or p_forma not in ('Boleto', 'PIX', 'Dinheiro', 'Cartão', 'Transferência', 'Outro') then
    raise exception 'Forma de recebimento inválida (Boleto, PIX, Dinheiro, Cartão, Transferência ou Outro).';
  end if;
  if p_data is null or p_data > current_date then raise exception 'Informe a data do recebimento (não pode ser no futuro).'; end if;
  select * into p from public.cobranca_parcelas where id = p_parcela for update;
  if not found then raise exception 'Parcela não encontrada.'; end if;
  if p.situacao not in ('Aberta', 'Parcial') then raise exception 'Esta parcela está % e não recebe pagamento.', lower(p.situacao); end if;
  v_saldo := p.valor - p.baixado;
  if p_valor >= v_saldo then
    v_principal := v_saldo;
    v_encargos := p_valor - v_saldo;
  else
    v_principal := p_valor;
    if p_quitar then v_desconto := v_saldo - p_valor; end if;
  end if;
  select nome into v_nome from public.colaboradores where id = auth.uid();
  insert into public.cobranca_pagamentos (parcela_id, cobranca_id, valor, principal, encargos, desconto, data, forma, observacao, lancamento_id, registrado_por, registrado_por_nome)
  values (p.id, p.cobranca_id, p_valor, v_principal, v_encargos, v_desconto, p_data, p_forma, nullif(btrim(coalesce(p_observacao, '')), ''), null, auth.uid(), v_nome)
  returning id into v_id;
  perform set_config('dlg.cobranca_pagamento', '1', true);
  update public.cobranca_parcelas
     set baixado = baixado + v_principal + v_desconto,
         pago_em = case when baixado + v_principal + v_desconto >= valor then p_data end
   where id = p.id;
  perform set_config('dlg.cobranca_pagamento', '', true);
  return v_id;
end $$;
revoke all on function public.registrar_pagamento_parcela(uuid, numeric, date, text, text, boolean) from public, anon;
grant execute on function public.registrar_pagamento_parcela(uuid, numeric, date, text, text, boolean) to authenticated;

-- 1b. entrada confirmada (SPC) = lançamento da meta do cobrador; reverteu = some
alter table public.cobranca_acordos add column if not exists meta_lancamento_id uuid references public.lancamentos(id) on delete set null;

create or replace function public.acordo_meta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.situacao = 'Entrada confirmada' and old.situacao = 'Aguardando entrada'
     and new.estava_spc and new.cobrador_id is not null and new.meta_lancamento_id is null then
    insert into public.lancamentos (setor, indicador_id, colaborador_id, quantidade, descricao, data, origem)
    values ('cobranca', 'valor_recebido', new.cobrador_id, new.entrada_confirmada_valor,
            format('Entrada do acordo v%s — %s', new.versao, (select nome from public.clientes where id = new.cliente_id)),
            new.entrada_recebida_em, 'automatico')
    returning id into new.meta_lancamento_id;
  elsif new.situacao = 'Aguardando entrada' and old.situacao = 'Entrada confirmada' then
    new.meta_lancamento_id := null; -- o lançamento é apagado depois de gravar (abaixo)
  end if;
  return new;
end $$;
revoke all on function public.acordo_meta() from public, anon, authenticated;
drop trigger if exists trg_acordo_meta on public.cobranca_acordos;
create trigger trg_acordo_meta before update of situacao on public.cobranca_acordos for each row execute function public.acordo_meta();

create or replace function public.acordo_meta_apagar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.meta_lancamento_id is not null and new.meta_lancamento_id is null then
    delete from public.lancamentos where id = old.meta_lancamento_id;
  end if;
  return null;
end $$;
revoke all on function public.acordo_meta_apagar() from public, anon, authenticated;
drop trigger if exists trg_acordo_meta_apagar on public.cobranca_acordos;
create trigger trg_acordo_meta_apagar after update of situacao on public.cobranca_acordos for each row execute function public.acordo_meta_apagar();

-- 2. dias úteis (segunda a sexta, sem feriados nacionais)
create or replace function public.pascoa(p_ano int) returns date
language plpgsql immutable as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mes int; dia int;
begin
  a := p_ano % 19; b := p_ano / 100; c := p_ano % 100; d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31; dia := (h + l - 7 * m + 114) % 31 + 1;
  return make_date(p_ano, mes, dia);
end $$;

create or replace function public.feriado_nacional(p_dia date) returns boolean
language sql immutable as $$
  select to_char(p_dia, 'MM-DD') in ('01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25')
      or p_dia = public.pascoa(extract(year from p_dia)::int) - 2
$$;

create or replace function public.dias_uteis(p_inicio date, p_fim date) returns int
language sql immutable as $$
  select count(*)::int from generate_series(p_inicio, p_fim, interval '1 day') g(d)
   where extract(isodow from g.d) < 6 and not public.feriado_nacional(g.d::date)
$$;

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
    select distinct on (k.cliente_id) k.cliente_id, s.situacao
      from public.cobranca_contatos k
      join public.vw_cobranca_situacao s on s.cobranca_id = k.cobranca_id
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
select (select valor from public.cobranca_regras where chave = 'comissao_nivel1_ate') as nivel1,
       exists (select 1 from pg_proc where proname = 'painel_cobranca') as painel_ok;
