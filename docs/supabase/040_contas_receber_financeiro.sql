-- =====================================================================
-- 040 — Contas a Receber passa para o Financeiro (07/10/2026)
--
-- Decisão do ADM: todo recebimento e pagamento é do Financeiro. A Cobrança só recebe a inadimplência
-- para renegociar a dívida (o acordo continua sendo criado pela Cobrança).
--
-- Títulos (parcelas):
--   • ver: Cobrança e Financeiro (como já era; o 008 deu a leitura ao Financeiro);
--   • lançar, dar baixa, editar e excluir: SÓ o Financeiro (e ADM/Gerência). A Cobrança deixa de gravar.
-- O acordo da Cobrança continua marcando a parcela "Em acordo" (é o gatilho do banco que faz isso).
-- A baixa continua contando no "valor recebido" do cobrador da parcela.
-- O endereço antigo /cobranca/titulos abre a tela nova (redirecionamento no next.config).
--
-- Pode rodar mais de uma vez. Rodar no SQL Editor do Supabase.
-- =====================================================================

drop policy if exists titulos_insert on public.titulos;
create policy titulos_insert on public.titulos for insert to authenticated
  with check ((select public.pode('financeiro', 'criar')));

drop policy if exists titulos_update on public.titulos;
create policy titulos_update on public.titulos for update to authenticated
  using ((select public.pode('financeiro', 'editar')))
  with check ((select public.pode('financeiro', 'editar')));

drop policy if exists titulos_delete on public.titulos;
create policy titulos_delete on public.titulos for delete to authenticated
  using ((select public.pode('financeiro', 'excluir')));

notify pgrst, 'reload schema';

-- Conferência (esperado: 3 | 0)
select
  count(*) filter (where coalesce(qual, with_check) like '%financeiro%') as gravam_so_financeiro,
  count(*) filter (where coalesce(qual, with_check) like '%cobranca%') as cobranca_ainda_grava
from pg_policies
where schemaname = 'public' and tablename = 'titulos' and policyname in ('titulos_insert', 'titulos_update', 'titulos_delete');
