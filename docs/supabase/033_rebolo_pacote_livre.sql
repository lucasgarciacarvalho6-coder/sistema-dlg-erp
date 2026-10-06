-- =====================================================================
-- 033 — REBOLO: ABRIR PACOTE SEM TRAVA  (rodar DEPOIS do 032; pode rodar mais de uma vez)
--
--  Antes (SQL 012 e 031) a vendedora só abria um pacote novo depois de terminar o anterior
--  (completo e todo contatado). Agora (pedido de 06/10/2026) não há trava: ela abre um pacote novo,
--  Padrão (10 álbuns) ou Avulso (1), a qualquer momento, mesmo com outros em andamento.
--  Continua valendo: Padrão até 10 fichas e Avulso 1; cada vendedora só abre pacote para si
--  (a supervisão abre para qualquer uma).
--  ATENÇÃO: não rode de novo o 012 nem o 031 depois deste — eles recriam a trava.
-- =====================================================================

drop trigger if exists trg_rebolo_pacote_antes on public.rebolo_pacotes;
drop function if exists public.rebolo_pacote_antes();

-- Conferência: deve mostrar 0
select count(*) as trava_do_pacote from pg_trigger where tgname = 'trg_rebolo_pacote_antes';
