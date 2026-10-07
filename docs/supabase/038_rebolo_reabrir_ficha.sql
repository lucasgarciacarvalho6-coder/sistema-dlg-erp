-- =====================================================================
-- 038 — Vendas Rebolo: conserta o "Reabrir ficha" (descarte → Em negociação / Tentar de novo) (07/10/2026)
--
-- Erro na tela: "Função do banco não encontrada" ao reabrir uma ficha descartada. A tela chama
-- reabrir_ficha_rebolo(ficha, situação, observação), criada no SQL 031; no banco ficou só a versão antiga
-- (só a ficha). Este SQL cria SÓ essa função — não mexe na trava do pacote (o SQL 033 tirou a trava e
-- rodar o 031 de novo voltaria com ela).
--
-- Pode rodar mais de uma vez. Rodar no SQL Editor do Supabase.
-- =====================================================================

-- a versão antiga (só a ficha) sai, para não ficarem duas com o mesmo nome
drop function if exists public.reabrir_ficha_rebolo(uuid);

-- Reabrir descarte: a dona ou a supervisão; volta para "Em negociação" ou "Tentar de novo" (a observação fica no histórico)
create or replace function public.reabrir_ficha_rebolo(p_ficha uuid, p_situacao text default 'Em negociação', p_observacao text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  f public.rebolo_fichas;
  v_obs text := nullif(trim(coalesce(p_observacao, '')), '');
begin
  f := public.rebolo_ficha_minha(p_ficha); -- só a dona da ficha ou a supervisão
  if f.situacao <> 'Descarte' then raise exception 'Só fichas em descarte podem ser reabertas.'; end if;
  if coalesce(p_situacao, '') not in ('Em negociação', 'Tentar de novo') then raise exception 'Escolha para onde a ficha volta: Em negociação ou Tentar de novo.'; end if;
  update public.rebolo_fichas set situacao = p_situacao, motivo_descarte = null, ultimo_contato = now() where id = p_ficha;
  insert into public.rebolo_contatos (ficha_id, vendedora_id, resultado, observacao)
  values (p_ficha, auth.uid(), 'Reaberta', concat_ws(' • ', format('Descarte (%s) reaberto → %s', coalesce(f.motivo_descarte, 'sem motivo'), p_situacao), v_obs));
end $$;
revoke all on function public.reabrir_ficha_rebolo(uuid, text, text) from public, anon;
grant execute on function public.reabrir_ficha_rebolo(uuid, text, text) to authenticated;

-- o site enxerga a função nova na hora
notify pgrst, 'reload schema';

-- Conferência (esperado: 1 | p_ficha uuid, p_situacao text, p_observacao text | true | false)
select
  (select count(*) from pg_proc where proname = 'reabrir_ficha_rebolo') as versoes,
  (select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'reabrir_ficha_rebolo' limit 1) as parametros,
  (select has_function_privilege('authenticated', oid, 'execute') from pg_proc where proname = 'reabrir_ficha_rebolo' limit 1) as equipe_usa,
  (select has_function_privilege('anon', oid, 'execute') from pg_proc where proname = 'reabrir_ficha_rebolo' limit 1) as de_fora_usa;
