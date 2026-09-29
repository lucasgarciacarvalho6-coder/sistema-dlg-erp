-- =====================================================================
-- 016 — RETORNO DA VISITA (Operações › Agenda Fotográfica)  (pode rodar mais de uma vez)
--
-- Ao encerrar a visita (ou depois, na visita encerrada), a coordenação informa se haverá retorno:
-- quantas fichas ficaram e a data. O retorno entra na agenda como uma visita nova
-- (mesma escola, endereço, responsável, vendedor e contrato) e segue o fluxo normal:
-- equipe → confirmação de fichas → encerrar (entra na meta) → fechamento.
-- =====================================================================

alter table public.agenda_visitas add column if not exists retorno_de uuid references public.agenda_visitas(id) on delete set null;
create index if not exists agenda_visitas_retorno_de on public.agenda_visitas (retorno_de);

create or replace function public.agendar_retorno(p_visita uuid, p_fichas int, p_data date) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v public.agenda_visitas;
  ja public.agenda_visitas;
  nova uuid;
  autor text := (select nome from public.colaboradores where id = auth.uid());
begin
  if not public.pode('operacional', 'editar') then
    raise exception 'Sem permissão para agendar retorno' using errcode = '42501';
  end if;
  select * into v from public.agenda_visitas where id = p_visita for update;
  if not found then raise exception 'Visita não encontrada'; end if;
  if v.status not in ('Fotografada', 'Fechamento enviado') then raise exception 'Só dá para agendar o retorno de uma visita encerrada'; end if;
  if coalesce(p_fichas, 0) <= 0 then raise exception 'Informe quantas fichas ficaram para o retorno'; end if;
  if p_data is null then raise exception 'Informe a data do retorno'; end if;
  if p_data <= v.data then raise exception 'A data do retorno tem que ser depois da visita'; end if;
  select * into ja from public.agenda_visitas where retorno_de = p_visita and status <> 'Cancelada' limit 1;
  if found then raise exception 'Esta visita já tem retorno agendado para %', to_char(ja.data, 'DD/MM/YYYY'); end if;

  insert into public.agenda_visitas (contrato_id, escola, cidade, uf, endereco, telefone, responsavel, vendedor_id, data, fichas_previstas, status, retorno_de)
  values (v.contrato_id, v.escola, v.cidade, v.uf, v.endereco, v.telefone, v.responsavel, v.vendedor_id, p_data, p_fichas, 'Agendada', v.id)
  returning id into nova;

  insert into public.agenda_historico (visita_id, tipo, descricao, autor)
  values (v.id, 'Retorno agendado', format('%s fichas para o retorno em %s.', p_fichas, to_char(p_data, 'DD/MM/YYYY')), autor);
  insert into public.agenda_historico (visita_id, tipo, descricao, autor)
  values (nova, 'Retorno', format('Retorno da visita de %s: %s fichas que ficaram para o retorno.', to_char(v.data, 'DD/MM/YYYY'), p_fichas), autor);
  return nova;
end $$;
revoke all on function public.agendar_retorno(uuid, int, date) from public, anon;
grant execute on function public.agendar_retorno(uuid, int, date) to authenticated;

-- Conferência: deve mostrar 1 | 1
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'agenda_visitas' and column_name = 'retorno_de') as coluna_retorno,
       (select count(*) from pg_proc where proname = 'agendar_retorno') as funcao_retorno;
