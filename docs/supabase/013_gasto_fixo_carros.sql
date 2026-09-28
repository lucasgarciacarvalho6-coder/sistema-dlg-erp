-- =====================================================================
-- 013 — GASTO FIXO DOS CARROS (painel do dinheiro de Operações)  (pode rodar mais de uma vez)
--
-- Cada carro tem um gasto fixo por DIA DE VIAGEM, com tudo incluso (motorista, fotógrafos,
-- alimentação...). Fica guardado por mês: {"2026-09": 2500}. O valor vale a partir daquele mês,
-- até mudar de novo, e mudar não altera os meses passados. Dia em que o carro não sai não tem custo.
-- A coordenação preenche em Operações › Dashboard (quem edita o Operacional).
-- =====================================================================

alter table public.veiculos add column if not exists gasto_fixo_mes jsonb not null default '{}'::jsonb;

-- Conferência: deve mostrar 1
select count(*) as coluna_gasto_fixo from information_schema.columns
where table_schema = 'public' and table_name = 'veiculos' and column_name = 'gasto_fixo_mes';
