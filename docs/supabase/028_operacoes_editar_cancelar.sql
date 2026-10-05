-- =====================================================================
-- 028 — OPERAÇÕES: EDITAR E CANCELAR EM TODAS AS FASES  (rodar DEPOIS do 027; pode rodar mais de uma vez)
--
--  • As Operações passam a EXCLUIR dentro do próprio setor (os outros setores continuam como estão).
--    Cadastro com histórico (visitas, contratos, fechamentos...) não é apagado: o banco barra e a tela sugere inativar.
--  • Contrato que já está na agenda: editar o contrato atualiza a visita agendada (só o que mudou).
--  • Agendamento (visita e retorno): editar (data, fichas, dados da escola) e cancelar com motivo.
--    Cancelar a visita devolve o contrato para a conferência (lá ele é reagendado, editado ou excluído).
--    Cancelar um retorno não mexe no contrato.
--  • Visita encerrada (e retorno encerrado): corrigir as fichas fotografadas (meta das Operações + escola na Produção)
--    e desfazer o encerramento (volta para agendada). Bloqueado quando o fechamento já foi para o Financeiro.
--  • Visita com data futura não é encerrada (corrija a data antes).
--  • Lançamento automático da meta (o que vem da visita) só muda pela visita.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Permissão: COLABORADOR das Operações também exclui no próprio setor (mesma regra em src/lib/erp/permissions.ts)
-- ---------------------------------------------------------------------
create or replace function public.pode(p_modulo text, p_acao public.acao) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_perfil public.perfil;
  v_setor public.setor;
begin
  select perfil, setor into v_perfil, v_setor from public.colaboradores where id = auth.uid() and status = 'ATIVO';
  if v_perfil is null then return false; end if;
  if v_perfil = 'ADM' then return true; end if;
  if v_perfil = 'GERENTE' then
    return exists (select 1 from public.permissoes where perfil = 'GERENTE' and modulo = p_modulo and acao = p_acao);
  end if;
  -- COLABORADOR: somente o próprio setor
  if p_modulo <> v_setor::text then return false; end if;
  -- Operações (onde toda informação chega): também exclui dentro do setor
  if v_setor = 'operacional' and p_acao = 'excluir' then return true; end if;
  return exists (select 1 from public.permissoes where perfil = 'COLABORADOR' and modulo = 'setor_proprio' and acao = p_acao);
end $$;

-- lançamento automático (o que vem da visita encerrada) não é apagado pelo colaborador: corrige-se pela visita
drop policy if exists lancamentos_delete on public.lancamentos;
create policy lancamentos_delete on public.lancamentos for delete to authenticated
  using (public.pode(setor::text, 'excluir') and (origem <> 'automatico' or public.meu_perfil() in ('ADM', 'GERENTE')));

-- as Operações também excluem escolas (o ADM e a Gerência continuam pelos Cadastros Centrais)
drop policy if exists escolas_operacional_delete on public.escolas;
create policy escolas_operacional_delete on public.escolas for delete to authenticated using (public.pode('operacional', 'excluir'));

-- ---------------------------------------------------------------------
-- 2. O que tem histórico não é apagado
-- ---------------------------------------------------------------------
-- visita já fotografada: meta, Produção e fechamento dependem dela
create or replace function public.bloquear_exclusao_visita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status in ('Fotografada', 'Fechamento enviado') then
    raise exception 'Visita já fotografada não pode ser excluída (meta, Produção e fechamento dependem dela). Use "Desfazer encerramento" ou "Corrigir fichas".';
  end if;
  return old;
end $$;
drop trigger if exists trg_bloquear_exclusao_visita on public.agenda_visitas;
create trigger trg_bloquear_exclusao_visita before delete on public.agenda_visitas for each row execute function public.bloquear_exclusao_visita();

-- fechamento que já foi para o Financeiro: só o Financeiro devolve
create or replace function public.bloquear_exclusao_fechamento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'Rascunho' then
    raise exception 'Fechamento que já foi para o Financeiro não pode ser excluído. Para corrigir, o Financeiro devolve o fechamento.';
  end if;
  return old;
end $$;
drop trigger if exists trg_bloquear_exclusao_fechamento on public.fechamentos;
create trigger trg_bloquear_exclusao_fechamento before delete on public.fechamentos for each row execute function public.bloquear_exclusao_fechamento();

-- vendedores, fotógrafos, motoristas, veículos e escolas com histórico: inativar em vez de excluir
create or replace function public.bloquear_exclusao_com_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uso text;
  v_inep text;
begin
  if tg_table_name = 'pj_vendedores' then
    v_uso := case
      when exists (select 1 from public.contratos_escola where vendedor_id = old.id) then 'contratos de escola'
      when exists (select 1 from public.agenda_visitas where vendedor_id = old.id) then 'visitas na agenda'
      when exists (select 1 from public.fechamentos where tipo = 'vendedor' and ref_id = old.id) then 'fechamentos'
      when exists (select 1 from public.rotas where vendedor_id = old.id) then 'rotas'
      when exists (select 1 from public.documentos_externos where vendedor_id = old.id) then 'documentos enviados pelo app'
      when exists (select 1 from public.vendas_ebooks where vendedor_externo_id = old.id) then 'vendas de books'
      when exists (select 1 from public.localizacoes where vendedor_id = old.id) then 'localizações do GPS'
      when old.usuario_id is not null then 'acesso ao app'
    end;
  elsif tg_table_name = 'freelancers' then
    v_uso := case
      when exists (select 1 from public.agenda_visitas
                   where motorista_id = old.id or (',' || coalesce(fotografo_ids, '') || ',') like ('%,' || old.id::text || ',%')) then 'visitas na agenda'
      when exists (select 1 from public.fechamentos where tipo = 'freelancer' and ref_id = old.id) then 'fechamentos'
      when exists (select 1 from public.producao_fotos where fotografo_id = old.id) then 'fotos lançadas na Produção'
    end;
  elsif tg_table_name = 'veiculos' then
    v_uso := case when exists (select 1 from public.agenda_visitas where veiculo_id = old.id) then 'visitas na agenda' end;
  elsif tg_table_name = 'escolas' then
    v_inep := nullif(regexp_replace(coalesce(old.inep, ''), '\D', '', 'g'), '');
    v_uso := case
      when exists (select 1 from public.contratos_escola c
                   where public.chave_escola(c.escola, c.cidade, c.uf) = public.chave_escola(old.nome, old.cidade, old.uf)
                      or (v_inep is not null and regexp_replace(coalesce(c.inep, ''), '\D', '', 'g') = v_inep)) then 'contratos'
      when exists (select 1 from public.agenda_visitas v
                   where public.chave_escola(v.escola, v.cidade, v.uf) = public.chave_escola(old.nome, old.cidade, old.uf)) then 'visitas na agenda'
    end;
  end if;
  if v_uso is not null then
    raise exception 'Este cadastro já tem histórico (%): não dá para excluir. Mude a situação para Inativo.', v_uso;
  end if;
  return old;
end $$;
do $$
declare t text;
begin
  foreach t in array array['pj_vendedores', 'freelancers', 'veiculos', 'escolas']
  loop
    execute format('drop trigger if exists trg_bloquear_exclusao_com_historico on public.%I', t);
    execute format('create trigger trg_bloquear_exclusao_com_historico before delete on public.%I for each row execute function public.bloquear_exclusao_com_historico()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Encerrar visita: não encerra com data futura (o resto igual ao 008)
-- ---------------------------------------------------------------------
create or replace function public.fluxo_encerrar_visita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Fotografada' and old.status = 'Agendada' then
    if coalesce(new.fichas_fotografadas, 0) <= 0 then
      raise exception 'Informe quantas fichas foram fotografadas';
    end if;
    if new.data > current_date then
      raise exception 'Esta visita está marcada para % (data futura). Se ela já foi feita, corrija a data em "Editar agendamento" antes de encerrar.', to_char(new.data, 'DD/MM/YYYY');
    end if;
    perform public.lancar('operacional', 'fichas', public.responsavel_operacional(), new.fichas_fotografadas, 'Visita fotografada: ' || new.escola, new.data);
    insert into public.agenda_historico (visita_id, tipo, descricao, autor)
      values (new.id, 'Visita encerrada', new.fichas_fotografadas || ' fichas fotografadas.', (select nome from public.colaboradores where id = auth.uid()));
    perform public.notificar(array['adm', 'gerencia']::public.setor[], 'sucesso', 'Visita fotografada',
      format('%s: %s fichas. As fotos seguem para os editores.', new.escola, new.fichas_fotografadas), '/operacional/agenda');
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 4. Contrato que já está na agenda: o que mudar no contrato vai para a visita agendada
--    (dados da escola e vendedor também no retorno agendado; data e fichas previstas só na visita)
-- ---------------------------------------------------------------------
create or replace function public.fluxo_contrato_atualiza_visita() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v public.agenda_visitas;
  mud text[];
  v_data date;
  v_fichas int;
  v_autor text;
begin
  if new.status <> 'Na agenda' or old.status <> 'Na agenda' then return null; end if;
  for v in select * from public.agenda_visitas where contrato_id = new.id and status = 'Agendada' for update
  loop
    mud := '{}';
    v_data := case when v.retorno_de is null and new.data_prevista is not null and new.data_prevista is distinct from old.data_prevista then new.data_prevista else v.data end;
    v_fichas := case when v.retorno_de is null and new.fichas_previstas is distinct from old.fichas_previstas then new.fichas_previstas else v.fichas_previstas end;
    if v_data is distinct from v.data then mud := mud || format('data %s → %s', to_char(v.data, 'DD/MM/YYYY'), to_char(v_data, 'DD/MM/YYYY')); end if;
    if v_fichas is distinct from v.fichas_previstas then mud := mud || format('fichas previstas %s → %s', v.fichas_previstas, v_fichas); end if;
    if new.escola is distinct from old.escola and new.escola is distinct from v.escola then mud := mud || format('escola: %s', new.escola); end if;
    if (new.cidade is distinct from old.cidade and new.cidade is distinct from v.cidade) or (new.uf is distinct from old.uf and new.uf is distinct from v.uf) then
      mud := mud || format('cidade: %s-%s', new.cidade, new.uf);
    end if;
    if new.endereco is distinct from old.endereco and new.endereco is distinct from v.endereco then mud := mud || format('endereço: %s', coalesce(new.endereco, '—')); end if;
    if new.telefone is distinct from old.telefone and new.telefone is distinct from v.telefone then mud := mud || format('telefone: %s', coalesce(new.telefone, '—')); end if;
    if new.responsavel is distinct from old.responsavel and new.responsavel is distinct from v.responsavel then mud := mud || format('responsável: %s', coalesce(new.responsavel, '—')); end if;
    if new.vendedor_id is distinct from old.vendedor_id and new.vendedor_id is distinct from v.vendedor_id then
      mud := mud || format('vendedor: %s', coalesce((select nome from public.pj_vendedores where id = new.vendedor_id), '—'));
    end if;
    if coalesce(array_length(mud, 1), 0) = 0 then continue; end if;

    update public.agenda_visitas set
      data = v_data,
      fichas_previstas = v_fichas,
      escola = case when new.escola is distinct from old.escola then new.escola else escola end,
      cidade = case when new.cidade is distinct from old.cidade then new.cidade else cidade end,
      uf = case when new.uf is distinct from old.uf then new.uf else uf end,
      endereco = case when new.endereco is distinct from old.endereco then new.endereco else endereco end,
      telefone = case when new.telefone is distinct from old.telefone then new.telefone else telefone end,
      responsavel = case when new.responsavel is distinct from old.responsavel then new.responsavel else responsavel end,
      vendedor_id = case when new.vendedor_id is distinct from old.vendedor_id then new.vendedor_id else vendedor_id end
    where id = v.id;
    v_autor := coalesce(v_autor, (select nome from public.colaboradores where id = auth.uid()));
    insert into public.agenda_historico (visita_id, tipo, descricao, autor)
    values (v.id, 'Atualizado pelo contrato', array_to_string(mud, ' • ') || '.', v_autor);
  end loop;
  return null;
end $$;
drop trigger if exists trg_contrato_atualiza_visita on public.contratos_escola;
create trigger trg_contrato_atualiza_visita after update on public.contratos_escola for each row execute function public.fluxo_contrato_atualiza_visita();

-- ---------------------------------------------------------------------
-- 5. Editar agendamento (visita ou retorno ainda agendado). A visita leva a data, as fichas previstas e os dados
--    da escola para o contrato (o retorno tem data e fichas próprias e não mexe no contrato).
-- ---------------------------------------------------------------------
create or replace function public.editar_agendamento(
  p_visita uuid, p_data date, p_fichas_previstas int, p_fichas_confirmadas int,
  p_escola text, p_cidade text, p_uf text, p_endereco text, p_telefone text, p_responsavel text,
  p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.agenda_visitas;
  v_origem date;
  mud text[] := '{}';
  v_escola text := nullif(trim(coalesce(p_escola, '')), '');
  v_cidade text := nullif(trim(coalesce(p_cidade, '')), '');
  v_uf text := nullif(upper(trim(coalesce(p_uf, ''))), '');
  v_endereco text := nullif(trim(coalesce(p_endereco, '')), '');
  v_telefone text := nullif(trim(coalesce(p_telefone, '')), '');
  v_responsavel text := nullif(trim(coalesce(p_responsavel, '')), '');
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_confirmadas int := coalesce(p_fichas_confirmadas, 0);
  igual boolean;
begin
  if not public.pode('operacional', 'editar') then
    raise exception 'Sem permissão para editar agendamentos' using errcode = '42501';
  end if;
  select * into v from public.agenda_visitas where id = p_visita for update;
  if not found then raise exception 'Visita não encontrada'; end if;
  if v.status <> 'Agendada' then raise exception 'Só dá para editar uma visita agendada (esta está "%")', v.status; end if;
  if p_data is null then raise exception 'Informe a data da visita'; end if;
  if v_escola is null then raise exception 'Informe o nome da escola'; end if;
  if v_cidade is null then raise exception 'Informe a cidade'; end if;
  if coalesce(p_fichas_previstas, 0) <= 0 then raise exception 'Informe as fichas previstas'; end if;
  if v_confirmadas < 0 then raise exception 'Fichas confirmadas inválidas'; end if;
  if v.retorno_de is not null then
    select data into v_origem from public.agenda_visitas where id = v.retorno_de;
    if v_origem is not null and p_data <= v_origem then
      raise exception 'O retorno tem que ser depois da visita de %', to_char(v_origem, 'DD/MM/YYYY');
    end if;
  end if;
  v_uf := coalesce(v_uf, v.uf);

  if p_data is distinct from v.data then mud := mud || format('data %s → %s', to_char(v.data, 'DD/MM/YYYY'), to_char(p_data, 'DD/MM/YYYY')); end if;
  if p_fichas_previstas is distinct from v.fichas_previstas then mud := mud || format('fichas previstas %s → %s', v.fichas_previstas, p_fichas_previstas); end if;
  if v_confirmadas is distinct from v.fichas_confirmadas then mud := mud || format('fichas confirmadas %s → %s', v.fichas_confirmadas, v_confirmadas); end if;
  if v_escola is distinct from v.escola then mud := mud || format('escola: %s → %s', v.escola, v_escola); end if;
  if v_cidade is distinct from v.cidade or v_uf is distinct from v.uf then mud := mud || format('cidade: %s-%s → %s-%s', v.cidade, v.uf, v_cidade, v_uf); end if;
  if v_endereco is distinct from nullif(trim(coalesce(v.endereco, '')), '') then mud := mud || format('endereço: %s', coalesce(v_endereco, '—')); end if;
  if v_telefone is distinct from nullif(trim(coalesce(v.telefone, '')), '') then mud := mud || format('telefone: %s', coalesce(v_telefone, '—')); end if;
  if v_responsavel is distinct from nullif(trim(coalesce(v.responsavel, '')), '') then mud := mud || format('responsável: %s', coalesce(v_responsavel, '—')); end if;
  if coalesce(array_length(mud, 1), 0) = 0 then raise exception 'Nada mudou'; end if;

  update public.agenda_visitas set
    data = p_data, fichas_previstas = p_fichas_previstas, fichas_confirmadas = v_confirmadas,
    escola = v_escola, cidade = v_cidade, uf = v_uf, endereco = v_endereco, telefone = v_telefone, responsavel = v_responsavel
  where id = v.id;
  -- (com fichas_depois, o gatilho do histórico grava as confirmadas na visita: o mesmo número)
  insert into public.agenda_historico (visita_id, tipo, fichas_antes, fichas_depois, descricao, autor)
  values (v.id, 'Agendamento editado',
          case when v_confirmadas is distinct from v.fichas_confirmadas then v.fichas_confirmadas end,
          case when v_confirmadas is distinct from v.fichas_confirmadas then v_confirmadas end,
          array_to_string(mud, ' • ') || '.' || coalesce(' Motivo: ' || v_motivo || '.', ''),
          (select nome from public.colaboradores where id = auth.uid()));

  if v.retorno_de is null and v.contrato_id is not null then
    select (c.data_prevista, c.fichas_previstas, c.escola, c.cidade, c.uf, c.endereco, c.telefone, c.responsavel)
             is not distinct from (p_data, p_fichas_previstas, v_escola, v_cidade, v_uf, v_endereco, v_telefone, v_responsavel)
      into igual from public.contratos_escola c where c.id = v.contrato_id;
    if igual is false then
      update public.contratos_escola set
        data_prevista = p_data, fichas_previstas = p_fichas_previstas,
        escola = v_escola, cidade = v_cidade, uf = v_uf, endereco = v_endereco, telefone = v_telefone, responsavel = v_responsavel
      where id = v.contrato_id;
    end if;
  end if;
end $$;
revoke all on function public.editar_agendamento(uuid, date, int, int, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.editar_agendamento(uuid, date, int, int, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Cancelar agendamento (com motivo). Visita: o contrato volta para a conferência.
--    Retorno: só o retorno é cancelado (a visita de origem pode agendar outro).
-- ---------------------------------------------------------------------
create or replace function public.cancelar_agendamento(p_visita uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.agenda_visitas;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_autor text := (select nome from public.colaboradores where id = auth.uid());
  v_tipo text;
begin
  if not public.pode('operacional', 'editar') then
    raise exception 'Sem permissão para cancelar agendamentos' using errcode = '42501';
  end if;
  if v_motivo is null then raise exception 'Informe o motivo do cancelamento'; end if;
  select * into v from public.agenda_visitas where id = p_visita for update;
  if not found then raise exception 'Visita não encontrada'; end if;
  if v.status <> 'Agendada' then raise exception 'Só dá para cancelar uma visita agendada (esta está "%")', v.status; end if;
  v_tipo := case when v.retorno_de is null then 'Visita cancelada' else 'Retorno cancelado' end;

  update public.agenda_visitas set status = 'Cancelada' where id = v.id;
  insert into public.agenda_historico (visita_id, tipo, descricao, autor) values (v.id, v_tipo, 'Motivo: ' || v_motivo || '.', v_autor);

  if v.retorno_de is not null then
    insert into public.agenda_historico (visita_id, tipo, descricao, autor)
    values (v.retorno_de, 'Retorno cancelado', format('O retorno de %s (%s fichas) foi cancelado. Motivo: %s.', to_char(v.data, 'DD/MM/YYYY'), v.fichas_previstas, v_motivo), v_autor);
  elsif v.contrato_id is not null then
    -- o contrato volta para a conferência: lá ele é reagendado (nova data), editado ou excluído
    update public.contratos_escola
       set status = 'Em conferência',
           observacao = concat_ws(' • ', nullif(trim(observacao), ''), format('Agendamento de %s cancelado: %s', to_char(v.data, 'DD/MM/YYYY'), v_motivo))
     where id = v.contrato_id and status = 'Na agenda'
       and not exists (select 1 from public.agenda_visitas o where o.contrato_id = v.contrato_id and o.id <> v.id and o.status <> 'Cancelada');
  end if;
  perform public.notificar(array['adm', 'gerencia']::public.setor[], 'alerta', v_tipo,
    format('%s (%s): %s', v.escola, to_char(v.data, 'DD/MM/YYYY'), v_motivo), '/operacional/agenda');
end $$;
revoke all on function public.cancelar_agendamento(uuid, text) from public, anon;
grant execute on function public.cancelar_agendamento(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Visita encerrada: corrigir as fichas fotografadas e desfazer o encerramento
-- ---------------------------------------------------------------------
-- segunda-feira da semana (o fechamento semanal do vendedor usa esse dia como período)
create or replace function public.segunda_da_semana(p_data date) returns date
language sql immutable as $$ select p_data - (extract(isodow from p_data)::int - 1) $$;

-- o que impede mexer numa visita encerrada: o fechamento (da escola ou do vendedor na semana) já foi para o Financeiro
create or replace function public.bloqueio_visita_encerrada(v public.agenda_visitas) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if v.status = 'Fechamento enviado' or exists (select 1 from public.fechamentos where tipo = 'escola' and ref_id = v.id and status <> 'Rascunho') then
    return 'O fechamento desta escola já foi para o Financeiro. Peça para o Financeiro devolver o fechamento e tente de novo.';
  end if;
  if v.vendedor_id is not null and exists (
       select 1 from public.fechamentos
       where tipo = 'vendedor' and ref_id = v.vendedor_id and periodo = to_char(public.segunda_da_semana(v.data), 'YYYY-MM-DD') and status <> 'Rascunho') then
    return format('O fechamento semanal do vendedor (semana de %s) já foi para o Financeiro com as fichas desta visita. Peça para o Financeiro devolver esse fechamento e tente de novo.',
                  to_char(public.segunda_da_semana(v.data), 'DD/MM'));
  end if;
  return null;
end $$;
revoke all on function public.bloqueio_visita_encerrada(public.agenda_visitas) from public, anon, authenticated;

-- rascunhos de fechamento feitos com as fichas desta visita (avisa para conferir)
create or replace function public.avisos_rascunho_visita(v public.agenda_visitas, p_escola boolean default true) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  a text[] := '{}';
begin
  if p_escola and exists (select 1 from public.fechamentos where tipo = 'escola' and ref_id = v.id and status = 'Rascunho') then
    a := a || 'Confira o fechamento da escola: o rascunho foi feito com as fichas antigas.'::text;
  end if;
  if v.vendedor_id is not null and exists (
       select 1 from public.fechamentos
       where tipo = 'vendedor' and ref_id = v.vendedor_id and periodo = to_char(public.segunda_da_semana(v.data), 'YYYY-MM-DD') and status = 'Rascunho') then
    a := a || format('Confira o fechamento semanal do vendedor (semana de %s): o rascunho foi feito com as fichas antigas.', to_char(public.segunda_da_semana(v.data), 'DD/MM'));
  end if;
  return nullif(array_to_string(a, ' '), '');
end $$;
revoke all on function public.avisos_rascunho_visita(public.agenda_visitas, boolean) from public, anon, authenticated;

-- o lançamento automático da meta que a visita gerou ao ser encerrada
create or replace function public.lancamento_da_visita(v public.agenda_visitas) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.lancamentos
  where setor = 'operacional' and indicador_id = 'fichas' and origem = 'automatico'
    and data = v.data and descricao = 'Visita fotografada: ' || v.escola and quantidade = v.fichas_fotografadas
  order by created_at
  limit 1
$$;
revoke all on function public.lancamento_da_visita(public.agenda_visitas) from public, anon, authenticated;

-- 7.1 Corrigir fichas fotografadas: a meta das Operações e a escola na Produção acompanham
--     (enquanto os álbuns não entraram na meta da Produção). Devolve um aviso (rascunho de fechamento) ou null.
create or replace function public.corrigir_fichas_visita(p_visita uuid, p_fichas int, p_motivo text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v public.agenda_visitas;
  l public.producao_lotes;
  v_lanc uuid;
  v_bloqueio text;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_autor text := (select nome from public.colaboradores where id = auth.uid());
  v_albuns int;
begin
  if not public.pode('operacional', 'editar') then
    raise exception 'Sem permissão para corrigir visitas' using errcode = '42501';
  end if;
  if v_motivo is null then raise exception 'Informe o motivo da correção'; end if;
  if coalesce(p_fichas, 0) <= 0 then raise exception 'Informe quantas fichas foram fotografadas'; end if;
  select * into v from public.agenda_visitas where id = p_visita for update;
  if not found then raise exception 'Visita não encontrada'; end if;
  if v.status not in ('Fotografada', 'Fechamento enviado') then raise exception 'Só dá para corrigir as fichas de uma visita encerrada'; end if;
  v_bloqueio := public.bloqueio_visita_encerrada(v);
  if v_bloqueio is not null then raise exception '%', v_bloqueio; end if;
  if p_fichas = v.fichas_fotografadas then raise exception 'Nada mudou: a visita já está com % fichas', p_fichas; end if;
  select * into l from public.producao_lotes where visita_id = v.id for update;
  if l.id is not null and l.albuns_contados > 0 then
    raise exception 'A Produção já contou os álbuns desta escola na meta (conferência final): as fichas não mudam mais';
  end if;

  -- meta das Operações
  v_lanc := public.lancamento_da_visita(v);
  if v_lanc is not null then update public.lancamentos set quantidade = p_fichas where id = v_lanc; end if;

  -- escola na Produção (o ajuste de álbuns que a Produção já fez continua)
  if l.id is not null then
    v_albuns := greatest(0, l.albuns + (p_fichas - v.fichas_fotografadas));
    update public.producao_lotes set alunos = p_fichas, albuns = v_albuns where id = l.id;
    insert into public.producao_historico (lote_id, etapa, acao, quantidade, descricao, autor)
    values (l.id, l.etapa, 'Fichas corrigidas', p_fichas,
            format('As Operações corrigiram as fichas fotografadas: %s → %s (álbuns %s → %s). Motivo: %s.', v.fichas_fotografadas, p_fichas, l.albuns, v_albuns, v_motivo), v_autor);
    perform public.notificar(array['edicao']::public.setor[], 'alerta', 'Fichas corrigidas pelas Operações',
      format('%s: %s → %s alunos fotografados (%s).', v.escola, v.fichas_fotografadas, p_fichas, v_motivo), '/edicao');
  end if;

  update public.agenda_visitas set fichas_fotografadas = p_fichas where id = v.id;
  -- (sem fichas_antes/depois: esses campos são das fichas confirmadas)
  insert into public.agenda_historico (visita_id, tipo, descricao, autor)
  values (v.id, 'Fichas corrigidas', format('Fichas fotografadas: %s → %s. Motivo: %s.', v.fichas_fotografadas, p_fichas, v_motivo), v_autor);
  perform public.notificar(array['adm', 'gerencia']::public.setor[], 'info', 'Fichas corrigidas',
    format('%s (%s): %s → %s fichas fotografadas. Motivo: %s', v.escola, to_char(v.data, 'DD/MM/YYYY'), v.fichas_fotografadas, p_fichas, v_motivo), '/operacional/agenda');
  return public.avisos_rascunho_visita(v);
end $$;
revoke all on function public.corrigir_fichas_visita(uuid, int, text) from public, anon;
grant execute on function public.corrigir_fichas_visita(uuid, int, text) to authenticated;

-- 7.2 Desfazer encerramento (encerrou por engano): a visita volta para agendada, as fichas saem da meta,
--     a escola sai da Produção (se ainda aguardava o envio ao editor) e o rascunho do fechamento da escola é apagado.
create or replace function public.desfazer_encerramento(p_visita uuid, p_motivo text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v public.agenda_visitas;
  r public.agenda_visitas;
  l public.producao_lotes;
  v_lanc uuid;
  v_bloqueio text;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_autor text := (select nome from public.colaboradores where id = auth.uid());
  v_aviso text;
begin
  if not public.pode('operacional', 'editar') then
    raise exception 'Sem permissão para desfazer o encerramento' using errcode = '42501';
  end if;
  if v_motivo is null then raise exception 'Informe o motivo'; end if;
  select * into v from public.agenda_visitas where id = p_visita for update;
  if not found then raise exception 'Visita não encontrada'; end if;
  if v.status not in ('Fotografada', 'Fechamento enviado') then raise exception 'Esta visita não está encerrada'; end if;
  v_bloqueio := public.bloqueio_visita_encerrada(v);
  if v_bloqueio is not null then raise exception '%', v_bloqueio; end if;
  select * into r from public.agenda_visitas where retorno_de = v.id and status <> 'Cancelada' order by data limit 1;
  if r.id is not null then
    raise exception 'Esta visita tem retorno em % (%): cancele ou desfaça o retorno antes', to_char(r.data, 'DD/MM/YYYY'), lower(r.status);
  end if;
  select * into l from public.producao_lotes where visita_id = v.id for update;
  if l.id is not null and l.etapa <> 'Aguardando fotos' then
    raise exception 'A Produção já está com esta escola em "%": não dá para desfazer o encerramento. Se o número de fichas está errado, use "Corrigir fichas".', l.etapa;
  end if;
  v_aviso := public.avisos_rascunho_visita(v, false); -- o rascunho da escola é apagado aqui: fica só o aviso do vendedor
  v_lanc := public.lancamento_da_visita(v);

  if v_lanc is not null then delete from public.lancamentos where id = v_lanc; end if;
  if l.id is not null then
    delete from public.producao_lotes where id = l.id;
    perform public.notificar(array['edicao']::public.setor[], 'alerta', 'Escola saiu da Produção',
      format('%s: as Operações desfizeram o encerramento da visita de %s (%s).', v.escola, to_char(v.data, 'DD/MM/YYYY'), v_motivo), '/edicao');
  end if;
  delete from public.fechamentos where tipo = 'escola' and ref_id = v.id and status = 'Rascunho';

  update public.agenda_visitas set status = 'Agendada', fichas_fotografadas = 0 where id = v.id;
  insert into public.agenda_historico (visita_id, tipo, descricao, autor)
  values (v.id, 'Encerramento desfeito', format('A visita voltou para agendada (estava com %s fichas fotografadas). Motivo: %s.', v.fichas_fotografadas, v_motivo), v_autor);
  perform public.notificar(array['adm', 'gerencia']::public.setor[], 'alerta', 'Encerramento desfeito',
    format('%s (%s): a visita voltou para agendada. Motivo: %s', v.escola, to_char(v.data, 'DD/MM/YYYY'), v_motivo), '/operacional/agenda');
  return v_aviso;
end $$;
revoke all on function public.desfazer_encerramento(uuid, text) from public, anon;
grant execute on function public.desfazer_encerramento(uuid, text) to authenticated;

-- Conferência: deve mostrar 5 | 7 | 1
select (select count(*) from pg_proc where proname in ('editar_agendamento', 'cancelar_agendamento', 'corrigir_fichas_visita', 'desfazer_encerramento', 'fluxo_contrato_atualiza_visita')) as funcoes_novas,
       (select count(*) from pg_trigger where tgname in ('trg_bloquear_exclusao_visita', 'trg_bloquear_exclusao_fechamento', 'trg_contrato_atualiza_visita', 'trg_bloquear_exclusao_com_historico')) as gatilhos_novos,
       (select count(*) from pg_policies where policyname = 'escolas_operacional_delete') as escolas_excluir;
