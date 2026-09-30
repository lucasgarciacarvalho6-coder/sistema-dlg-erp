-- =====================================================================
-- 021 — PRODUÇÃO: BOTÕES DAS ETAPAS  (rodar DEPOIS do 020; pode rodar mais de uma vez)
--
--  • Cada escola anda pelas etapas só por estas funções (a tela não edita direto):
--      fotos recebidas → enviar ao editor → editor devolveu → análise de qualidade (aprova ou reprova X álbuns)
--      → conferência final (SÓ O ADM: aprova ou devolve ao editor) → Revelando (pegou o HD) → Na caixa.
--  • Meta: na conferência final, os álbuns entram na meta de quem aprovou a análise de qualidade,
--    no dia da confirmação, 1 vez por escola (coluna albuns_contados).
--  • Álbuns e pôsteres podem ser ajustados até entrarem na meta (pôster não conta).
--  • O ADM corrige a etapa de uma escola (as trazidas de antes do controle ou um clique errado).
-- =====================================================================

alter table public.producao_lotes add column if not exists albuns_contados int not null default 0;

-- 1. Botões das etapas
create or replace function public.producao_avancar(p_lote uuid, p_acao text, p_editor uuid default null, p_quantidade int default null,
                                                   p_motivo text default null, p_analista uuid default null) returns void
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
    when 'revelando' then 'Aguardando revelação'
    when 'na_caixa' then 'Revelando'
  end;
  v_editor text;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
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

  if p_acao = 'fotos' then
    if l.fotos_recebidas_em is not null then raise exception 'As fotos já foram marcadas como recebidas'; end if;
    update public.producao_lotes set fotos_recebidas_em = current_date where id = l.id;
    v_etapa := 'Aguardando fotos'; v_acao := 'Fotos recebidas'; v_descr := 'Fotos recebidas dos fotógrafos.';

  elsif p_acao = 'enviar_editor' then
    select nome into v_editor from public.editores where id = p_editor and status = 'Ativo';
    if v_editor is null then raise exception 'Escolha o editor'; end if;
    update public.producao_lotes
      set editor_id = p_editor, enviado_editor_em = current_date, devolvido_editor_em = null,
          fotos_recebidas_em = coalesce(fotos_recebidas_em, current_date), etapa = 'Em edição'
      where id = l.id;
    v_etapa := 'Em edição'; v_acao := 'Enviado ao editor'; v_descr := format('Fotos enviadas para %s.', v_editor);

  elsif p_acao = 'editor_devolveu' then
    update public.producao_lotes set devolvido_editor_em = current_date, etapa = 'Análise de qualidade' where id = l.id;
    v_etapa := 'Análise de qualidade'; v_acao := 'Editor devolveu';
    v_descr := format('%s devolveu os álbuns montados.', coalesce(v_editor, 'O editor'));

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
      set aprovado_qualidade_em = current_date, aprovado_qualidade_por = v_analista.id, etapa = 'Conferência final'
      where id = l.id;
    v_etapa := 'Conferência final'; v_acao := 'Aprovado na análise de qualidade'; v_qtd := l.albuns;
    v_descr := format('%s álbuns aprovados%s.', l.albuns, coalesce(' por ' || v_analista.nome, ''));
    perform public.notificar(array['adm']::public.setor[], 'info', 'Escola pronta para a conferência final',
      format('%s: %s álbuns aprovados na análise de qualidade.', l.escola, l.albuns), '/edicao');

  elsif p_acao in ('reprovar_qualidade', 'reprovar_conferencia') then
    if p_acao = 'reprovar_conferencia' and v_eu.perfil is distinct from 'ADM' then raise exception 'Só o ADM faz a conferência final'; end if;
    if coalesce(p_quantidade, 0) <= 0 then raise exception 'Informe quantos álbuns voltam para o editor'; end if;
    if p_quantidade > l.albuns then raise exception 'São só % álbuns nesta escola', l.albuns; end if;
    if v_motivo is null then raise exception 'Informe o motivo'; end if;
    update public.producao_lotes
      set etapa = 'Em edição', voltas = voltas + 1, reprovados = reprovados + p_quantidade,
          enviado_editor_em = current_date, devolvido_editor_em = null, aprovado_qualidade_em = null, aprovado_qualidade_por = null
      where id = l.id;
    v_etapa := 'Em edição'; v_qtd := p_quantidade;
    v_acao := case when p_acao = 'reprovar_qualidade' then 'Reprovado na análise de qualidade' else 'Reprovado na conferência final' end;
    v_descr := format('%s álbum(ns) de volta para %s. Motivo: %s', p_quantidade, coalesce(v_editor, 'o editor'), v_motivo);
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
revoke all on function public.producao_avancar(uuid, text, uuid, int, text, uuid) from public, anon;
grant execute on function public.producao_avancar(uuid, text, uuid, int, text, uuid) to authenticated;

-- 2. Álbuns (contam na meta), pôsteres (não contam) e observação
create or replace function public.producao_ajustar(p_lote uuid, p_albuns int, p_posteres int, p_observacao text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.producao_lotes;
  v_obs text := coalesce(trim(p_observacao), '');
  v_mudou boolean;
begin
  if not public.pode('edicao', 'editar') then
    raise exception 'Sem permissão para mexer na Produção' using errcode = '42501';
  end if;
  select * into l from public.producao_lotes where id = p_lote for update;
  if not found then raise exception 'Escola não encontrada na Produção'; end if;
  if coalesce(p_albuns, -1) < 0 or coalesce(p_posteres, -1) < 0 then raise exception 'Informe quantidades válidas (0 ou mais)'; end if;
  if l.albuns_contados > 0 and p_albuns <> l.albuns then
    raise exception 'Os álbuns desta escola já entraram na meta: a quantidade não muda mais';
  end if;
  v_mudou := p_albuns <> l.albuns or p_posteres <> l.posteres;
  if not v_mudou and v_obs = coalesce(l.observacao, '') then raise exception 'Nada mudou'; end if;

  update public.producao_lotes set albuns = p_albuns, posteres = p_posteres, observacao = nullif(v_obs, '') where id = l.id;
  insert into public.producao_historico (lote_id, etapa, acao, quantidade, descricao, autor)
  values (l.id, l.etapa,
          case when v_mudou then 'Quantidade ajustada' else 'Observação' end,
          case when v_mudou then p_albuns end,
          case when v_mudou
            then format('%s álbuns + %s pôster → %s álbuns + %s pôster.%s', l.albuns, l.posteres, p_albuns, p_posteres, case when v_obs <> '' then ' Obs.: ' || v_obs else '' end)
            else coalesce(nullif(v_obs, ''), 'Observação apagada.')
          end,
          (select nome from public.colaboradores where id = auth.uid()));
end $$;
revoke all on function public.producao_ajustar(uuid, int, int, text) from public, anon;
grant execute on function public.producao_ajustar(uuid, int, int, text) to authenticated;

-- 3. Só o ADM: coloca a escola na etapa certa. As datas das etapas seguintes são apagadas;
--    os álbuns que já entraram na meta não contam de novo.
create or replace function public.producao_corrigir_etapa(p_lote uuid, p_etapa text, p_editor uuid default null, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.producao_lotes;
  v_etapas text[] := array['Aguardando fotos', 'Em edição', 'Análise de qualidade', 'Conferência final', 'Aguardando revelação', 'Revelando', 'Na caixa'];
  k int := array_position(v_etapas, p_etapa) - 1; -- 0 = Aguardando fotos ... 6 = Na caixa
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
    devolvido_editor_em = case when k >= 2 then devolvido_editor_em end,
    aprovado_qualidade_em = case when k >= 3 then aprovado_qualidade_em end,
    aprovado_qualidade_por = case when k >= 3 then aprovado_qualidade_por end,
    confirmado_em = case when k >= 4 then confirmado_em end,
    confirmado_por = case when k >= 4 then confirmado_por end,
    revelando_em = case when k >= 5 then revelando_em end,
    na_caixa_em = case when k >= 6 then na_caixa_em end
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

-- Conferência: deve mostrar 1 | 3
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'producao_lotes' and column_name = 'albuns_contados') as coluna_contados,
       (select count(*) from pg_proc where proname in ('producao_avancar', 'producao_ajustar', 'producao_corrigir_etapa')) as funcoes_etapas;
