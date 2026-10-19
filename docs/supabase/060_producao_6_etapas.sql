-- 060 — PRODUÇÃO EM 6 ETAPAS (19/10/2026): sai a etapa "No HD" ("Aguardando revelação" no banco).
--   1 Conferência Operações • 2 Em edição • 3 Conferência Produção • 4 Conferência Beatriz • 5 Revelando • 6 Na caixa
-- • A Beatriz libera → a escola vai direto para "Revelando" (a Revelação já pode soltar as caixas).
-- • As escolas que estão em "No HD" passam para "Revelando".
-- Precisa do 058. Pode rodar mais de uma vez. Rodar inteiro no SQL Editor.
-- ⚠ Rode e publique a tela nova logo em seguida.
-- Conferência no fim (esperado: sobrou_no_hd = 0 | etapas = 6 | funcoes = 2).

-- 1. As escolas em "No HD" vão para "Revelando"
insert into public.producao_historico (lote_id, etapa, acao, descricao, autor)
select id, 'Revelando', 'Etapa ajustada', 'Fluxo novo (6 etapas): a etapa "No HD" saiu; a escola está revelando.', 'Sistema'
from public.producao_lotes where etapa = 'Aguardando revelação';
update public.producao_lotes set etapa = 'Revelando', revelando_em = coalesce(revelando_em, current_date)
where etapa = 'Aguardando revelação';

-- 2. A lista de etapas sem a que saiu
alter table public.producao_lotes drop constraint if exists producao_lotes_etapa_check;
alter table public.producao_lotes add constraint producao_lotes_etapa_check
  check (etapa in ('Aguardando fotos', 'Em edição', 'Análise de qualidade', 'Conferência final', 'Revelando', 'Na caixa'));

-- 3. Os botões das etapas (a Beatriz libera → Revelando; a ação "revelando" não existe mais)
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
    when 'confirmar' then 'Conferência final'
    when 'reprovar_conferencia' then 'Conferência final'
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
  if p_acao in ('enviar_editor', 'reprovar_qualidade') then
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
      set aprovado_qualidade_em = current_date, aprovado_qualidade_por = v_analista.id, etapa = 'Conferência final',
          enviado_conferencia_em = current_date, drive_conferencia = v_drive
      where id = l.id;
    v_etapa := 'Conferência final'; v_acao := 'Conferência Produção aprovada'; v_qtd := l.albuns;
    v_descr := format('%s álbuns conferidos%s e enviados para a Conferência Beatriz%s.', l.albuns, coalesce(' por ' || v_analista.nome, ''), coalesce(' (' || v_drive || ')', ''));
    perform public.notificar(array['adm']::public.setor[], 'info', 'Escola para a Conferência Beatriz',
      format('%s: %s álbuns conferidos pela Produção.', l.escola, l.albuns), '/edicao');

  elsif p_acao = 'reprovar_conferencia' then
    -- (060: sem "No HD") a Beatriz recusa: volta para quem fez a Conferência Produção, que reenvia ao editor para arrumar
    if v_eu.perfil is distinct from 'ADM' then raise exception 'Só o ADM faz a Conferência Beatriz'; end if;
    if coalesce(p_quantidade, 0) <= 0 then raise exception 'Informe quantos álbuns têm problema'; end if;
    if p_quantidade > l.albuns then raise exception 'São só % álbuns nesta escola', l.albuns; end if;
    if v_motivo is null then raise exception 'Informe o motivo'; end if;
    update public.producao_lotes
      set etapa = 'Análise de qualidade', aprovado_qualidade_em = null,
          enviado_conferencia_em = null, drive_conferencia = null
      where id = l.id;
    v_etapa := 'Análise de qualidade'; v_qtd := p_quantidade; v_acao := 'Recusado na Conferência Beatriz';
    v_descr := format('%s álbum(ns) com problema. Motivo: %s • volta para a Conferência Produção reenviar ao editor.', p_quantidade, v_motivo);
    perform public.notificar(array['edicao']::public.setor[], 'alerta', 'Conferência Beatriz recusou',
      format('%s: %s álbum(ns) com problema. Motivo: %s. Reenvie ao editor.', l.escola, p_quantidade, v_motivo), '/edicao');

  elsif p_acao = 'reprovar_qualidade' then
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
    v_acao := 'Reenviado ao editor';
    v_descr := format('%s álbum(ns) de volta para %s. Motivo: %s • nova entrega prevista %s.', p_quantidade, coalesce(v_editor, 'o editor'), v_motivo, to_char(p_prevista, 'DD/MM/YYYY'));

  elsif p_acao = 'confirmar' then
    if v_eu.perfil is distinct from 'ADM' then raise exception 'Só o ADM faz a Conferência Beatriz'; end if;
    if l.aprovado_qualidade_por is not null then
      select * into v_analista from public.colaboradores where id = l.aprovado_qualidade_por;
    elsif p_analista is not null then
      select * into v_analista from public.colaboradores where id = p_analista and setor = 'edicao' and status = 'ATIVO';
      if v_analista.id is null then raise exception 'Quem fez a análise precisa ser da Produção'; end if;
    end if;
    update public.producao_lotes
      set confirmado_em = current_date, confirmado_por = v_eu.id, etapa = 'Revelando', revelando_em = current_date,
          aprovado_qualidade_por = coalesce(v_analista.id, aprovado_qualidade_por)
      where id = l.id;
    v_descr := format('Conferência Beatriz: %s álbuns liberados para a Revelação (revelando)', l.albuns);
    if l.albuns_contados > 0 then
      v_descr := v_descr || ' (já tinham entrado na meta).';
    elsif v_analista.id is not null and l.albuns > 0 then
      -- meta de quem fez a Conferência Produção, no dia em que a Beatriz libera (1 vez por escola)
      perform public.lancar('edicao', 'albuns_entregues', v_analista.id, l.albuns, 'Álbuns entregues: ' || l.escola, current_date);
      update public.producao_lotes set albuns_contados = l.albuns where id = l.id;
      v_descr := v_descr || format('. Contam na meta de %s.', v_analista.nome);
    else
      v_descr := v_descr || ' (sem analista: não entrou na meta).';
    end if;
    v_etapa := 'Revelando'; v_acao := 'Conferência Beatriz aprovada'; v_qtd := l.albuns;
    perform public.notificar(array['edicao']::public.setor[], 'sucesso', 'Conferência Beatriz aprovada',
      format('%s: %s álbuns liberados para a Revelação.', l.escola, l.albuns), '/edicao');

  elsif p_acao = 'na_caixa' then
    update public.producao_lotes set na_caixa_em = current_date, etapa = 'Na caixa' where id = l.id;
    v_etapa := 'Na caixa'; v_acao := 'Na caixa'; v_descr := 'Revelação finalizou: álbuns na caixa (estoque).';
  end if;

  insert into public.producao_historico (lote_id, etapa, acao, quantidade, descricao, autor)
  values (l.id, v_etapa, v_acao, v_qtd, v_descr, v_eu.nome);
end $$;
revoke all on function public.producao_avancar(uuid, text, uuid, int, text, uuid, date, date, text) from public, anon;
grant execute on function public.producao_avancar(uuid, text, uuid, int, text, uuid, date, date, text) to authenticated;

-- 4. Corrigir etapa (só ADM): 6 etapas
create or replace function public.producao_corrigir_etapa(p_lote uuid, p_etapa text, p_editor uuid default null, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
-- (060) 6 etapas: sem "No HD"
declare
  l public.producao_lotes;
  v_etapas text[] := array['Aguardando fotos', 'Em edição', 'Análise de qualidade', 'Conferência final', 'Revelando', 'Na caixa'];
  k int := array_position(v_etapas, p_etapa) - 1; -- 0 = Conferência Operações ... 5 = Na caixa (060: 6 etapas)
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
    enviado_conferencia_em = case when k >= 3 then enviado_conferencia_em end,
    drive_conferencia = case when k >= 3 then drive_conferencia end,
    confirmado_em = case when k >= 4 then confirmado_em end,
    confirmado_por = case when k >= 4 then confirmado_por end,
    revelando_em = case when k >= 4 then coalesce(revelando_em, confirmado_em) end,
    na_caixa_em = case when k >= 5 then na_caixa_em end
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

notify pgrst, 'reload schema';

-- Conferência
select
  (select count(*) from public.producao_lotes where etapa = 'Aguardando revelação') as sobrou_no_hd,
  (select array_length(regexp_split_to_array(substring(pg_get_constraintdef(oid) from 'ARRAY\[(.*)\]'), ','), 1)
     from pg_constraint where conrelid = 'public.producao_lotes'::regclass and conname = 'producao_lotes_etapa_check') as etapas,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('producao_avancar', 'producao_corrigir_etapa')
      and pg_get_functiondef(oid) like '%060%') as funcoes;
