-- =====================================================================
-- 006 — CANCELAR E EXCLUIR CONTRATO DE ESCOLA  (pode rodar mais de uma vez)
--
--  • Cancelar: contrato vira "Cancelado", a visita da agenda vira "Cancelada" e a ordem
--    da Produção que ainda aguardava fotos é removida. Fica no histórico (aba Cancelados).
--  • Excluir: apaga o contrato, a visita, o histórico da visita e a ordem "Aguardando fotos".
--    Serve para erro de digitação / contrato importado em duplicidade.
--  • Os dois são BLOQUEADOS se a escola já foi fotografada (fichas, fechamento e pagamentos
--    dependem da visita).
--  • Permissão: quem pode EDITAR no Operacional (coordenação/RMC) e o ADM.
-- =====================================================================

create or replace function public.contrato_ja_fotografado(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agenda_visitas where contrato_id = p_id and status in ('Fotografada', 'Fechamento enviado'))
$$;

-- 1. Cancelar
create or replace function public.cancelar_contrato_escola(p_id uuid, p_motivo text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.contratos_escola;
  v_autor text;
begin
  if not public.pode('operacional', 'editar') then
    raise exception 'Sem permissão para cancelar contratos' using errcode = '42501';
  end if;
  select * into c from public.contratos_escola where id = p_id for update;
  if not found then raise exception 'Contrato não encontrado'; end if;
  if c.status = 'Cancelado' then raise exception 'Este contrato já está cancelado'; end if;
  if public.contrato_ja_fotografado(p_id) then
    raise exception 'Esta escola já foi fotografada: o contrato não pode ser cancelado (fichas e pagamentos dependem dele)';
  end if;
  select nome into v_autor from public.colaboradores where id = auth.uid();

  update public.contratos_escola
     set status = 'Cancelado',
         observacao = concat_ws(' • ', nullif(trim(observacao), ''), 'Cancelado' || coalesce(nullif(': ' || trim(p_motivo), ': '), ''))
   where id = p_id;
  insert into public.agenda_historico (visita_id, tipo, descricao, autor)
    select id, 'Visita cancelada', 'Contrato cancelado' || coalesce(nullif(': ' || trim(p_motivo), ': '), '') || '.', v_autor
    from public.agenda_visitas where contrato_id = p_id and status = 'Agendada';
  update public.agenda_visitas set status = 'Cancelada' where contrato_id = p_id and status = 'Agendada';
  delete from public.ordens_producao where contrato_escola_id = p_id and etapa = 'Aguardando fotos';

  if c.status = 'Na agenda' then
    perform public.notificar(array['producao', 'adm', 'gerencia']::public.setor[], 'alerta', 'Visita cancelada',
      format('%s: contrato cancelado, a visita saiu da agenda.', c.escola), '/operacional/agenda');
  end if;
end $$;
revoke all on function public.cancelar_contrato_escola(uuid, text) from public, anon;
grant execute on function public.cancelar_contrato_escola(uuid, text) to authenticated;

-- 2. Excluir (devolve o caminho do arquivo no bucket "contratos" para o sistema apagar a foto/PDF)
create or replace function public.excluir_contrato_escola(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.contratos_escola;
begin
  if not public.pode('operacional', 'editar') then
    raise exception 'Sem permissão para excluir contratos' using errcode = '42501';
  end if;
  select * into c from public.contratos_escola where id = p_id for update;
  if not found then raise exception 'Contrato não encontrado'; end if;
  if public.contrato_ja_fotografado(p_id) then
    raise exception 'Esta escola já foi fotografada: o contrato não pode ser excluído (fichas e pagamentos dependem dele)';
  end if;

  delete from public.ordens_producao where contrato_escola_id = p_id and etapa = 'Aguardando fotos';
  delete from public.agenda_visitas where contrato_id = p_id; -- o histórico da visita sai junto (cascade)
  delete from public.contratos_escola where id = p_id; -- a auditoria (trigger do 004) registra a exclusão
  return c.arquivo;
end $$;
revoke all on function public.excluir_contrato_escola(uuid) from public, anon;
grant execute on function public.excluir_contrato_escola(uuid) to authenticated;

-- 3. Quem edita o Operacional pode apagar a foto/PDF do contrato excluído
drop policy if exists contratos_arquivos_delete on storage.objects;
create policy contratos_arquivos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'contratos' and public.pode('operacional', 'editar'));

-- Conferência: as duas funções devem aparecer
select proname from pg_proc where proname in ('cancelar_contrato_escola', 'excluir_contrato_escola') order by proname;
