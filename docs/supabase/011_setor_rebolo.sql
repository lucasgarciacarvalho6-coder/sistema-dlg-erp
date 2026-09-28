-- =====================================================================
-- 011 — NOVO SETOR "VENDAS REBOLO"  (pode rodar mais de uma vez)
--
-- Só cria o setor. Fica num arquivo separado porque o Postgres só deixa USAR
-- um valor novo de enum depois que ele foi salvo. Rode este, depois o 012.
-- =====================================================================

alter type public.setor add value if not exists 'rebolo';

-- Conferência: deve mostrar 1
select count(*) as setor_rebolo from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'setor' and e.enumlabel = 'rebolo';
