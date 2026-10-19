-- 057 — Fotos e link lançados pelas OPERAÇÕES (19/10/2026)
--   • A visita encerra como sempre e a escola chega na Produção ("Aguardando fotos"). As fotos são tiradas de dia e
--     enviadas à noite: fica PENDENTE nas Operações lançar o link das fotos (um por escola) e a quantidade de fotos de
--     cada fotógrafo da equipe da visita (só controle; não entra no pagamento).
--   • Ao lançar, a escola fica com "Fotos recebidas" e a Produção vê o link e as quantidades (só para ver).
--   • A Produção só envia ao editor depois que as Operações lançarem as fotos. Corrigir: só enquanto a escola
--     está em "Aguardando fotos".
-- Precisa dos SQLs 020, 025 e 030. Pode rodar mais de uma vez. Rodar inteiro no SQL Editor.
-- ⚠ Rode e publique a tela nova logo em seguida: com este SQL, a Produção não envia ao editor até as Operações lançarem.
-- Conferência no fim (esperado: colunas = 2 | funcoes = 2 | trava = true).

-- 1. O link das fotos da escola e quando/quem lançou
alter table public.producao_lotes add column if not exists fotos_link text;
alter table public.producao_lotes add column if not exists fotos_lancadas_por text;

-- 2. As Operações enxergam as escolas na Produção e as fotos lançadas (para a pendência e para corrigir)
drop policy if exists producao_lotes_operacional_select on public.producao_lotes;
create policy producao_lotes_operacional_select on public.producao_lotes for select to authenticated using ((select public.pode('operacional', 'visualizar')));
drop policy if exists producao_fotos_operacional_select on public.producao_fotos;
create policy producao_fotos_operacional_select on public.producao_fotos for select to authenticated using ((select public.pode('operacional', 'visualizar')));
-- a Produção não apaga mais (só vê)
drop policy if exists producao_fotos_delete on public.producao_fotos;

-- 3. Operações lança (ou corrige) o link e as fotos de cada fotógrafo da equipe da visita
--    p_fotos = [{"fotografo": "<id>", "quantidade": 123}, ...] — todos os fotógrafos da equipe, cada um com mais de 0
create or replace function public.operacoes_lancar_fotos(p_visita uuid, p_link text, p_fotos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.agenda_visitas;
  l public.producao_lotes;
  v_equipe text[];
  v_link text := nullif(trim(coalesce(p_link, '')), '');
  v_autor text := (select nome from public.colaboradores where id = auth.uid());
  v_total int := 0;
  v_falta text;
  f record;
  q int;
begin
  if not public.pode('operacional', 'editar') then raise exception 'Só as Operações lançam as fotos' using errcode = '42501'; end if;
  select * into v from public.agenda_visitas where id = p_visita;
  if v.id is null then raise exception 'Visita não encontrada'; end if;
  select * into l from public.producao_lotes where visita_id = v.id for update;
  if l.id is null then raise exception 'Esta visita ainda não chegou na Produção (encerre a visita primeiro)'; end if;
  if l.etapa <> 'Aguardando fotos' then raise exception 'A escola já foi enviada ao editor: as fotos não podem mais ser mudadas'; end if;
  if v_link is null then raise exception 'Informe o link das fotos da escola'; end if;
  v_equipe := array_remove(string_to_array(coalesce(v.fotografo_ids, ''), ','), '');
  if coalesce(array_length(v_equipe, 1), 0) = 0 then raise exception 'A visita não tem fotógrafo na equipe: complete a equipe primeiro'; end if;
  if jsonb_typeof(coalesce(p_fotos, 'null'::jsonb)) <> 'array' then raise exception 'Informe as fotos de cada fotógrafo'; end if;
  -- só os da equipe da visita
  if exists (select 1 from jsonb_array_elements(p_fotos) j where not (j.value ->> 'fotografo') = any(v_equipe)) then
    raise exception 'Só os fotógrafos da equipe desta visita';
  end if;
  -- todos os da equipe, cada um com a quantidade
  select string_agg(fr.nome, ', ') into v_falta
  from unnest(v_equipe) e(id) left join public.freelancers fr on fr.id::text = e.id
  where not exists (select 1 from jsonb_array_elements(p_fotos) j where j.value ->> 'fotografo' = e.id and coalesce((j.value ->> 'quantidade')::int, 0) > 0);
  if v_falta is not null then raise exception 'Informe a quantidade de fotos de: %', v_falta; end if;

  delete from public.producao_fotos where lote_id = l.id;
  for f in select (j.value ->> 'fotografo')::uuid as id, (j.value ->> 'quantidade')::int as qtd from jsonb_array_elements(p_fotos) j loop
    insert into public.producao_fotos (lote_id, fotografo_id, fotografo_nome, quantidade)
    values (l.id, f.id, coalesce((select nome from public.freelancers where id = f.id), 'Fotógrafo'), f.qtd)
    on conflict (lote_id, fotografo_id) do update set quantidade = excluded.quantidade;
    v_total := v_total + f.qtd;
  end loop;
  q := v_total;
  update public.producao_lotes
     set fotos_link = v_link, fotos_lancadas_por = v_autor, fotos_recebidas_em = coalesce(fotos_recebidas_em, current_date)
   where id = l.id;
  insert into public.producao_historico (lote_id, etapa, acao, quantidade, descricao, autor)
  values (l.id, 'Aguardando fotos', case when l.fotos_link is null then 'Fotos lançadas' else 'Fotos corrigidas' end, q,
          format('Operações: %s fotos de %s fotógrafo(s) • link das fotos registrado.', q, (select count(*) from jsonb_array_elements(p_fotos))), v_autor);
  if l.fotos_link is null then
    perform public.notificar(array['edicao']::public.setor[], 'info', 'Fotos lançadas',
      format('%s: %s fotos e o link lançados pelas Operações. Pode enviar ao editor.', l.escola, q), '/edicao');
  end if;
end $$;
revoke all on function public.operacoes_lancar_fotos(uuid, text, jsonb) from public, anon;
grant execute on function public.operacoes_lancar_fotos(uuid, text, jsonb) to authenticated;

-- 4. A Produção não lança mais as fotos (a função antiga só avisa)
create or replace function public.producao_salvar_fotos(p_lote uuid, p_fotografo uuid, p_quantidade int) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'As fotos de cada fotógrafo e o link agora são lançados pelas Operações (Agenda › visita › Fotos e link)';
end $$;
revoke all on function public.producao_salvar_fotos(uuid, uuid, int) from public, anon;
grant execute on function public.producao_salvar_fotos(uuid, uuid, int) to authenticated;

-- 5. Trava: a escola só sai de "Aguardando fotos" para o editor com as fotos lançadas pelas Operações;
--    e "Fotos recebidas" não é mais marcado à mão pela Produção
create or replace function public.producao_lote_fotos_trava() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.etapa = 'Aguardando fotos' and new.etapa = 'Em edição' and new.fotos_link is null then
    raise exception 'As Operações ainda não lançaram as fotos e o link desta escola: só dá para enviar ao editor depois';
  end if;
  if old.fotos_recebidas_em is null and new.fotos_recebidas_em is not null and new.fotos_link is null then
    raise exception 'As fotos são lançadas pelas Operações (com o link): a escola fica com "Fotos recebidas" sozinha';
  end if;
  return new;
end $$;
drop trigger if exists trg_producao_lote_fotos_trava on public.producao_lotes;
create trigger trg_producao_lote_fotos_trava before update on public.producao_lotes for each row execute function public.producao_lote_fotos_trava();

notify pgrst, 'reload schema';

-- Conferência
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'producao_lotes'
     and column_name in ('fotos_link', 'fotos_lancadas_por')) as colunas,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('operacoes_lancar_fotos', 'producao_lote_fotos_trava')) as funcoes,
  exists (select 1 from pg_trigger where tgname = 'trg_producao_lote_fotos_trava') as trava;
