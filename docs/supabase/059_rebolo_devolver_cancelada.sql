-- 059 — Vendas Rebolo: o ADM devolve à vendedora uma venda cancelada por engano (19/10/2026)
--   • Só o ADM. A venda volta como estava antes do cancelamento:
--       - sem contrato assinado anexado → "Aguardando contrato" (a vendedora gera/anexa o contrato);
--       - com contrato assinado (tinha sido devolvida pelo Financeiro) → "Devolvida" e volta a contar na meta,
--         no dia da assinatura (a venda cancelada tinha saído da meta).
--   • A ficha volta para "Venda a efetivar"; fica registrado no histórico da ficha e a vendedora é avisada.
-- Precisa do SQL 044. Pode rodar mais de uma vez. Rodar inteiro no SQL Editor.
-- Conferência no fim (esperado: funcao = true | de_fora_usa = false).

create or replace function public.rebolo_devolver_cancelada(p_venda uuid, p_observacao text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.vendas_ebooks;
  f public.rebolo_fichas;
  v_obs text := nullif(trim(coalesce(p_observacao, '')), '');
  v_contrato boolean;
  v_volta text;
begin
  if public.meu_perfil() is distinct from 'ADM' then raise exception 'Só o ADM devolve uma venda cancelada' using errcode = '42501'; end if;
  select * into v from public.vendas_ebooks where id = p_venda for update;
  if not found or v.canal <> 'Rebolo' then raise exception 'Venda não encontrada'; end if;
  if v.conferencia <> 'Cancelada' then raise exception 'Esta venda não está cancelada'; end if;
  select * into f from public.rebolo_fichas where id = v.ficha_rebolo_id for update;
  if f.id is null then raise exception 'A ficha desta venda não foi encontrada'; end if;
  if f.situacao <> 'Cancelada' then raise exception 'A ficha já está em "%": não dá para devolver esta venda', f.situacao; end if;
  if exists (select 1 from public.vendas_ebooks x where x.ficha_rebolo_id = f.id and x.id <> v.id and x.conferencia <> 'Cancelada') then
    raise exception 'Esta ficha já tem outra venda em andamento';
  end if;

  v_contrato := coalesce(v.anexos ->> 'contratoAssinado', '') <> '';
  v_volta := case when v_contrato then 'Devolvida' else 'Aguardando contrato' end;
  perform set_config('dlg.rebolo_fluxo', '1', true);
  update public.vendas_ebooks
     set conferencia = v_volta,
         conferencia_motivo = case when v_contrato then 'Cancelamento desfeito pelo ADM: confira e reenvie ao Financeiro' end
   where id = v.id;
  update public.rebolo_fichas set situacao = 'Venda a efetivar', venda_id = v.id, ultimo_contato = now() where id = f.id;
  -- com contrato assinado, a venda volta a contar na meta (no dia da assinatura, como antes do cancelamento)
  if v_contrato then
    select * into v from public.vendas_ebooks where id = p_venda;
    perform public.contar_venda_rebolo(v, coalesce((v.assinatura_em at time zone 'America/Sao_Paulo')::date, v.data));
  end if;
  insert into public.rebolo_contatos (ficha_id, vendedora_id, resultado, observacao)
  values (f.id, auth.uid(), 'Reaberta', concat_ws(' • ', format('Venda cancelada devolvida pelo ADM → %s', v_volta), v_obs));
  perform public.notificar(array['rebolo']::public.setor[], 'info', 'Venda devolvida pelo ADM',
    format('%s • %s: o cancelamento foi desfeito. A venda voltou para "%s".', v.responsavel, v.pacote,
           case when v_contrato then 'Devolvidas' else 'A efetivar (contrato)' end), '/rebolo/vendas');
end $$;
revoke all on function public.rebolo_devolver_cancelada(uuid, text) from public, anon;
grant execute on function public.rebolo_devolver_cancelada(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Conferência
select exists (select 1 from pg_proc where proname = 'rebolo_devolver_cancelada') as funcao,
       has_function_privilege('anon', 'public.rebolo_devolver_cancelada(uuid, text)', 'execute') as de_fora_usa;
