-- =====================================================================
-- 030 — PRODUÇÃO: ETAPA "PRONTO PARA CONFERÊNCIA BEATRIZ"  (rodar DEPOIS do 029; pode rodar mais de uma vez)
--
--  • Etapa nova entre a Análise de qualidade e a Conferência final:
--      Aguardando fotos → Em edição → Análise de qualidade → Pronto para conferência Beatriz →
--      Conferência final → Aguardando revelação → Revelando → Na caixa
--  • Aprovar a análise de qualidade leva a escola para "Pronto para conferência Beatriz".
--  • Botão novo "Enviado para a conferência" (ação 'enviar_conferencia', drive opcional) → "Conferência final".
--    O aviso ao ADM ("Escola pronta para a conferência final") sai no envio, e não mais na aprovação.
--  • Meta e bônus não mudam: os álbuns contam para quem aprovou a análise, no dia da conferência final.
--  • As escolas que já estão em "Conferência final" continuam lá.
--  ⚠ Rode junto com a publicação do sistema: depois deste SQL a tela antiga não aprova a análise de qualidade.
-- =====================================================================

alter table public.producao_lotes add column if not exists enviado_conferencia_em date;
alter table public.producao_lotes add column if not exists drive_conferencia text;

-- 1. Lista de etapas com a nova (troca a trava do 020, seja qual for o nome dela)
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.producao_lotes'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%etapa%'
  loop
    execute format('alter table public.producao_lotes drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.producao_lotes add constraint producao_lotes_etapa_check
  check (etapa in ('Aguardando fotos', 'Em edição', 'Análise de qualidade', 'Pronto para conferência Beatriz', 'Conferência final',
                   'Aguardando revelação', 'Revelando', 'Na caixa'));

-- 2. Botões das etapas (troca a do 022: aprovar → Pronto para conferência Beatriz; ação nova enviar_conferencia)
create or replace function public.producao_avancar(p_lote uuid, p_acao text, p_editor uuid default null, p_quantidade int default null,
                                                   p_motivo text default null, p_analista uuid default null,
                                                   p_data date default null, p_prevista date default null, p_drive text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.producao_lotes;
  v_eu public.colaboradores;
  v_analista public.colaboradores;
  v_precisa text := case p_acao
    when 'fotos' then 'Aguardando fotos'
    when 'enviar_editor' then 'Aguardando fotos'
    when 'editor_devolveu' then 'Em edição'
    when 'aprovar_qualidade' then 'Análise de qualidade'
    when 'reprovar_qualidade' then 'Análise de qualidade'
    when 'enviar_conferencia' then 'Pronto para conferência Beatriz'
    when 'confirmar' then 'Conferência final'
    when 'reprovar_conferencia' then 'Conferência final'
    when 'revelando' then 'Aguardando revelação'
    when 'na_caixa' then 'Revelando'
  end;
  v_editor text;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_drive text := nullif(trim(coalesce(p_drive, '')), '');
  v_data date := coalesce(p_data, current_date);
  v_etapa text;
  v_acao text;
  v_qtd int;
  v_descr text;
begin
  if not public.pode('edicao', 'editar') then
    raise exception 'Sem permissão para mexer na Produção' using errcode = '42501';
  end if;
  if v_precisa is null then raise exception 'Ação desconhecida: %', p_acao; end if;
  select * into v_eu from public.colaboradores where id = auth.uid();
  select * into l from public.producao_lotes where id = p_lote for update;
  if not found then raise exception 'Escola não encontrada na Produção'; end if;
  if l.etapa <> v_precisa then raise exception 'Esta escola está em "%": atualize a tela', l.etapa; end if;
  v_editor := (select nome from public.editores where id = l.editor_id);
  -- prazo do editor: obrigatório ao enviar e ao devolver álbuns reprovados
  if p_acao in ('enviar_editor', 'reprovar_qualidade', 'reprovar_conferencia') then
    if p_prevista is null then raise exception 'Informe a data prevista da entrega do editor'; end if;
    if p_prevista < current_date then raise exception 'A data prevista da entrega não pode ser antes de hoje'; end if;
  end if;

  if p_acao = 'fotos' then
    if l.fotos_recebidas_em is not null then raise exception 'As fotos já foram marcadas como recebidas'; end if;
    update public.producao_lotes set fotos_recebidas_em = current_date where id = l.id;
    v_etapa := 'Aguardando fotos'; v_acao := 'Fotos recebidas'; v_descr := 'Fotos recebidas dos fotógrafos.';

  elsif p_acao = 'enviar_editor' then
    select nome into v_editor from public.editores where id = p_editor and status = 'Ativo';
    if v_editor is null then raise exception 'Escolha o editor'; end if;
    update public.producao_lotes
      set editor_id = p_editor, enviado_editor_em = current_date, devolvido_editor_em = null,
          fotos_recebidas_em = coalesce(fotos_recebidas_em, current_date), etapa = 'Em edição',
          entrega_prevista = p_prevista, drive_envio = v_drive, drive_devolucao = null, atraso_avisado = null
      where id = l.id;
    v_etapa := 'Em edição'; v_acao := 'Enviado ao editor';
    v_descr := format('Fotos enviadas para %s%s • entrega prevista %s.', v_editor, coalesce(' (' || v_drive || ')', ''), to_char(p_prevista, 'DD/MM/YYYY'));

  elsif p_acao = 'editor_devolveu' then
    if v_data > current_date then raise exception 'A data do recebimento não pode ser depois de hoje'; end if;
    if l.enviado_editor_em is not null and v_data < l.enviado_editor_em then
      raise exception 'A data do recebimento não pode ser antes do envio (%)', to_char(l.enviado_editor_em, 'DD/MM/YYYY');
    end if;
    update public.producao_lotes set devolvido_editor_em = v_data, drive_devolucao = v_drive, etapa = 'Análise de qualidade' where id = l.id;
    v_etapa := 'Análise de qualidade'; v_acao := 'Editor devolveu';
    v_descr := format('%s devolveu os álbuns montados em %s%s%s.', coalesce(v_editor, 'O editor'), to_char(v_data, 'DD/MM/YYYY'),
      coalesce(' (' || v_drive || ')', ''),
      case when l.entrega_prevista is not null and v_data > l.entrega_prevista then format(' • %s dia(s) depois do previsto', v_data - l.entrega_prevista) else '' end);

  elsif p_acao = 'aprovar_qualidade' then
    -- quem é da Produção aprova por si; o ADM/Gerência escolhe quem fez a análise (a meta é dela)
    if v_eu.setor = 'edicao' then
      v_analista := v_eu;
    elsif p_analista is not null then
      select * into v_analista from public.colaboradores where id = p_analista and setor = 'edicao' and status = 'ATIVO';
      if v_analista.id is null then raise exception 'Quem fez a análise precisa ser da Produção'; end if;
    elsif exists (select 1 from public.colaboradores where setor = 'edicao' and status = 'ATIVO') then
      raise exception 'Escolha quem fez a análise de qualidade';
    end if;
    update public.producao_lotes
      set aprovado_qualidade_em = current_date, aprovado_qualidade_por = v_analista.id, etapa = 'Pronto para conferência Beatriz',
          enviado_conferencia_em = null, drive_conferencia = null
      where id = l.id;
    v_etapa := 'Pronto para conferência Beatriz'; v_acao := 'Aprovado na análise de qualidade'; v_qtd := l.albuns;
    v_descr := format('%s álbuns aprovados%s. Pronto para enviar para a conferência.', l.albuns, coalesce(' por ' || v_analista.nome, ''));

  elsif p_acao = 'enviar_conferencia' then
    update public.producao_lotes
      set enviado_conferencia_em = current_date, drive_conferencia = v_drive, etapa = 'Conferência final'
      where id = l.id;
    v_etapa := 'Conferência final'; v_acao := 'Enviado para a conferência'; v_qtd := l.albuns;
    v_descr := format('%s álbuns enviados para a conferência final%s.', l.albuns, coalesce(' (' || v_drive || ')', ''));
    perform public.notificar(array['adm']::public.setor[], 'info', 'Escola pronta para a conferência final',
      format('%s: %s álbuns enviados para a conferência.', l.escola, l.albuns), '/edicao');

  elsif p_acao in ('reprovar_qualidade', 'reprovar_conferencia') then
    if p_acao = 'reprovar_conferencia' and v_eu.perfil is distinct from 'ADM' then raise exception 'Só o ADM faz a conferência final'; end if;
    if coalesce(p_quantidade, 0) <= 0 then raise exception 'Informe quantos álbuns voltam para o editor'; end if;
    if p_quantidade > l.albuns then raise exception 'São só % álbuns nesta escola', l.albuns; end if;
    if v_motivo is null then raise exception 'Informe o motivo'; end if;
    update public.producao_lotes
      set etapa = 'Em edição', voltas = voltas + 1, reprovados = reprovados + p_quantidade,
          enviado_editor_em = current_date, devolvido_editor_em = null, drive_devolucao = null,
          entrega_prevista = p_prevista, atraso_avisado = null,
          aprovado_qualidade_em = null, aprovado_qualidade_por = null,
          enviado_conferencia_em = null, drive_conferencia = null
      where id = l.id;
    v_etapa := 'Em edição'; v_qtd := p_quantidade;
    v_acao := case when p_acao = 'reprovar_qualidade' then 'Reprovado na análise de qualidade' else 'Reprovado na conferência final' end;
    v_descr := format('%s álbum(ns) de volta para %s. Motivo: %s • nova entrega prevista %s.', p_quantidade, coalesce(v_editor, 'o editor'), v_motivo, to_char(p_prevista, 'DD/MM/YYYY'));
    if p_acao = 'reprovar_conferencia' then
      perform public.notificar(array['edicao']::public.setor[], 'alerta', 'Conferência final devolveu ao editor',
        format('%s: %s álbum(ns) com erro. Motivo: %s', l.escola, p_quantidade, v_motivo), '/edicao');
    end if;

  elsif p_acao = 'confirmar' then
    if v_eu.perfil is distinct from 'ADM' then raise exception 'Só o ADM faz a conferência final'; end if;
    if l.aprovado_qualidade_por is not null then
      select * into v_analista from public.colaboradores where id = l.aprovado_qualidade_por;
    elsif p_analista is not null then
      select * into v_analista from public.colaboradores where id = p_analista and setor = 'edicao' and status = 'ATIVO';
      if v_analista.id is null then raise exception 'Quem fez a análise precisa ser da Produção'; end if;
    end if;
    update public.producao_lotes
      set confirmado_em = current_date, confirmado_por = v_eu.id, etapa = 'Aguardando revelação',
          aprovado_qualidade_por = coalesce(v_analista.id, aprovado_qualidade_por)
      where id = l.id;
    v_descr := format('%s álbuns liberados para a Revelação', l.albuns);
    if l.albuns_contados > 0 then
      v_descr := v_descr || ' (já tinham entrado na meta).';
    elsif v_analista.id is not null and l.albuns > 0 then
      -- meta de quem aprovou a análise de qualidade, no dia da conferência final (1 vez por escola)
      perform public.lancar('edicao', 'albuns_entregues', v_analista.id, l.albuns, 'Álbuns entregues: ' || l.escola, current_date);
      update public.producao_lotes set albuns_contados = l.albuns where id = l.id;
      v_descr := v_descr || format('. Contam na meta de %s.', v_analista.nome);
    else
      v_descr := v_descr || ' (sem analista: não entrou na meta).';
    end if;
    v_etapa := 'Aguardando revelação'; v_acao := 'Conferência final aprovada'; v_qtd := l.albuns;
    perform public.notificar(array['edicao']::public.setor[], 'sucesso', 'Conferência final aprovada',
      format('%s: %s álbuns liberados para a Revelação.', l.escola, l.albuns), '/edicao');

  elsif p_acao = 'revelando' then
    update public.producao_lotes set revelando_em = current_date, etapa = 'Revelando' where id = l.id;
    v_etapa := 'Revelando'; v_acao := 'Revelando'; v_descr := 'A Revelação pegou o HD para revelar.';

  elsif p_acao = 'na_caixa' then
    update public.producao_lotes set na_caixa_em = current_date, etapa = 'Na caixa' where id = l.id;
    v_etapa := 'Na caixa'; v_acao := 'Na caixa'; v_descr := 'Álbuns revelados e na caixa.';
  end if;

  insert into public.producao_historico (lote_id, etapa, acao, quantidade, descricao, autor)
  values (l.id, v_etapa, v_acao, v_qtd, v_descr, v_eu.nome);
end $$;
revoke all on function public.producao_avancar(uuid, text, uuid, int, text, uuid, date, date, text) from public, anon;
grant execute on function public.producao_avancar(uuid, text, uuid, int, text, uuid, date, date, text) to authenticated;

-- 3. Corrigir etapa (só ADM): igual ao 022, com a etapa nova (as posições das etapas seguintes andam 1)
create or replace function public.producao_corrigir_etapa(p_lote uuid, p_etapa text, p_editor uuid default null, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.producao_lotes;
  v_etapas text[] := array['Aguardando fotos', 'Em edição', 'Análise de qualidade', 'Pronto para conferência Beatriz', 'Conferência final',
                           'Aguardando revelação', 'Revelando', 'Na caixa'];
  k int := array_position(v_etapas, p_etapa) - 1; -- 0 = Aguardando fotos ... 7 = Na caixa
  v_editor uuid;
  v_editor_nome text;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if public.meu_perfil() is distinct from 'ADM' then raise exception 'Só o ADM corrige a etapa'; end if;
  if k is null then raise exception 'Etapa inválida'; end if;
  select * into l from public.producao_lotes where id = p_lote for update;
  if not found then raise exception 'Escola não encontrada na Produção'; end if;
  if p_editor is not null and not exists (select 1 from public.editores where id = p_editor) then raise exception 'Editor não encontrado'; end if;
  v_editor := case when k >= 1 then coalesce(p_editor, l.editor_id) end;
  if l.etapa = p_etapa and v_editor is not distinct from l.editor_id then raise exception 'Nada mudou'; end if;

  update public.producao_lotes set
    etapa = p_etapa,
    editor_id = v_editor,
    enviado_editor_em = case when k >= 1 then enviado_editor_em end,
    entrega_prevista = case when k >= 1 then entrega_prevista end,
    drive_envio = case when k >= 1 then drive_envio end,
    devolvido_editor_em = case when k >= 2 then devolvido_editor_em end,
    drive_devolucao = case when k >= 2 then drive_devolucao end,
    aprovado_qualidade_em = case when k >= 3 then aprovado_qualidade_em end,
    aprovado_qualidade_por = case when k >= 3 then aprovado_qualidade_por end,
    enviado_conferencia_em = case when k >= 4 then enviado_conferencia_em end,
    drive_conferencia = case when k >= 4 then drive_conferencia end,
    confirmado_em = case when k >= 5 then confirmado_em end,
    confirmado_por = case when k >= 5 then confirmado_por end,
    revelando_em = case when k >= 6 then revelando_em end,
    na_caixa_em = case when k >= 7 then na_caixa_em end
  where id = l.id;

  -- o editor só aparece no histórico quando mudou
  v_editor_nome := case when v_editor is distinct from l.editor_id then (select nome from public.editores where id = v_editor) end;
  insert into public.producao_historico (lote_id, etapa, acao, descricao, autor)
  values (l.id, p_etapa, 'Etapa corrigida',
          format('%s → %s%s%s', l.etapa, p_etapa, coalesce(' • editor ' || v_editor_nome, ''), coalesce('. ' || v_motivo, '')),
          (select nome from public.colaboradores where id = auth.uid()));
end $$;
revoke all on function public.producao_corrigir_etapa(uuid, text, uuid, text) from public, anon;
grant execute on function public.producao_corrigir_etapa(uuid, text, uuid, text) to authenticated;

-- Conferência: deve mostrar 2 | true
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'producao_lotes'
          and column_name in ('enviado_conferencia_em', 'drive_conferencia')) as colunas_novas,
       (select pg_get_constraintdef(oid) ilike '%Pronto para conferência Beatriz%' from pg_constraint
         where conrelid = 'public.producao_lotes'::regclass and conname = 'producao_lotes_etapa_check') as etapa_nova;
