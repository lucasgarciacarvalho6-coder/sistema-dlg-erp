-- =====================================================================
-- 010 — VENDAS DE BOOKS: ENTRADA + ATÉ 24 PARCELAS  (pode rodar mais de uma vez)
--
-- O schema original limitava a venda a 12 parcelas (erro
-- "new row for relation vendas_ebooks violates check constraint vendas_ebooks_parcelas_check").
-- "parcelas" conta só as parcelas do saldo; a entrada é um título à parte.
-- Máximo: entrada + 24 parcelas no boleto = até 25 pagamentos.
-- =====================================================================

alter table public.vendas_ebooks drop constraint if exists vendas_ebooks_parcelas_check;
alter table public.vendas_ebooks add constraint vendas_ebooks_parcelas_check check (parcelas between 1 and 24);

-- Conferência: deve mostrar "CHECK ((parcelas >= 1) AND (parcelas <= 24))"
select pg_get_constraintdef(oid) as regra_parcelas from pg_constraint where conname = 'vendas_ebooks_parcelas_check';
