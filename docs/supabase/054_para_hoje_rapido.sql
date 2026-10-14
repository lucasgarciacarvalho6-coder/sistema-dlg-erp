-- 054 — Lentidão (14/10): "Para hoje" da Cobrança passava do tempo limite (8 s) e era cancelada.
-- O diagnóstico mostrou: média 2,2 s, pico 5 s nas que terminavam, e as mais lentas canceladas.
-- Causa: a lista calculava o saldo de TODAS as ≈9.300 cobranças (somando as ≈110 mil parcelas) e só depois
-- olhava quais estavam com retorno/promessa/renegociação. Agora ela separa primeiro essas poucas cobranças
-- (pela situação gravada) e só soma as parcelas delas. O RESULTADO É O MESMO: mesmas colunas, mesmas linhas.
-- Rodar inteiro no SQL Editor. Conferência no fim (esperado: view_ok = true).

create or replace view public.vw_cobranca_para_hoje with (security_invoker = true) as
with alvo as (
  -- só as situações que podem gerar pendência (toda pendência depende de uma delas)
  select x.id
    from public.cobrancas x
   where x.situacao in ('Pagamento de boleto agendado', 'Aguardando retorno', 'Renegociação simulada',
                        'Renegociação feita (aguardando entrada)')
), s as materialized (
  select s.*
    from alvo
    join public.vw_cobranca_situacao s on s.cobranca_id = alvo.id
)
select s.*, cl.nome as cliente,
       case when s.situacao = 'Promessa não cumprida' then 'Boleto agendado vencido'
            when s.situacao_gravada = 'Pagamento de boleto agendado' and s.promessa_em = current_date then 'Pagamento agendado para hoje'
            when s.situacao_gravada = 'Aguardando retorno' and s.retorno_em < current_date then 'Retorno atrasado'
            when s.situacao_gravada = 'Aguardando retorno' and s.retorno_em = current_date then 'Retorno de hoje'
            when s.situacao_gravada = 'Renegociação simulada' and s.retorno_em <= current_date then 'Retorno da simulação'
            when s.situacao_gravada = 'Renegociação feita (aguardando entrada)' then 'Entrada de renegociação vencida' end as pendencia,
       coalesce(case when s.situacao = 'Promessa não cumprida' then s.promessa_em end,
                case when s.situacao_gravada = 'Renegociação feita (aguardando entrada)' then ac.entrada_prazo end,
                s.retorno_em, s.promessa_em) as data_pendencia
  from s
  join public.clientes cl on cl.id = s.cliente_id
  left join public.cobranca_acordos ac on ac.cobranca_id = s.cobranca_id and ac.situacao = 'Aguardando entrada'
 where s.carteira = 'Cobrança DLG' and coalesce(s.vencido, 0) > 0
   and (s.situacao = 'Promessa não cumprida'
        or (s.situacao_gravada = 'Pagamento de boleto agendado' and s.promessa_em = current_date)
        or (s.situacao_gravada in ('Aguardando retorno', 'Renegociação simulada') and s.retorno_em <= current_date)
        or (s.situacao_gravada = 'Renegociação feita (aguardando entrada)' and ac.entrada_prazo < current_date));
grant select on public.vw_cobranca_para_hoje to authenticated, service_role;

notify pgrst, 'reload schema';

-- Conferência
select exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'vw_cobranca_para_hoje') as view_ok;
