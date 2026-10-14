-- 053 — Lentidão (14/10): os HISTÓRICOS saem do aviso em tempo real.
-- Eles sempre mudam junto com a tabela principal (visita da agenda, lote da produção, regra da cobrança), que continua
-- avisando; a tela recarrega o histórico junto (store.ts, COMPANHEIRAS). Menos trabalho para o Realtime do Supabase.
-- Rodar inteiro no SQL Editor. Conferência esperada (última linha): ainda_publicadas = 0.

do $$
declare t text;
begin
  foreach t in array array['agenda_historico', 'producao_historico', 'cobranca_regras_historico'] loop
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

-- Conferência
select count(*) as ainda_publicadas from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename in ('agenda_historico', 'producao_historico', 'cobranca_regras_historico');
