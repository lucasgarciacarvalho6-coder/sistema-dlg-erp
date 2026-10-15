-- 056 — Acerto da carga (15/10): o que NÃO vendeu tem 2 destinos, escolhidos no acerto de cada escola:
--   • "Voltar para o estoque": vira uma caixa da escola ("Volta da carga nº X"), já conferida e EM ESTOQUE
--     (conta no estoque e no "Na caixa" da Visão TV, e pode sair em outra carga). Não conta como álbum revelado.
--   • "Enviar para o Rebolo": encaminha na hora (avisa o Rebolo) e não aparece mais no estoque.
-- O que já foi acertado antes continua "aguardando Rebolo" (botão de encaminhar de sempre). Acerto sem destino
-- (a tela antiga, até a Vercel publicar) faz como antes. Desfazer o acerto desfaz também a caixa da volta e o envio
-- automático ao Rebolo (bloqueia se a caixa da volta já saiu em outra carga).
-- Precisa do SQL 029. Pode rodar mais de uma vez. Rodar inteiro no SQL Editor.
-- Conferência no fim (esperado: colunas = 3 | funcoes = 5).

-- 1. Colunas novas
alter table public.producao_caixas add column if not exists origem_carga_id uuid references public.estoque_cargas(id) on delete set null;
alter table public.producao_caixas drop constraint if exists producao_caixas_albuns_check;
alter table public.producao_caixas add constraint producao_caixas_albuns_check check (albuns > 0 or (origem_carga_id is not null and albuns >= 0));
alter table public.estoque_carga_acertos add column if not exists destino text;
alter table public.estoque_carga_acertos drop constraint if exists estoque_carga_acertos_destino_check;
alter table public.estoque_carga_acertos add constraint estoque_carga_acertos_destino_check check (destino is null or destino in ('Estoque', 'Rebolo'));
alter table public.estoque_envios_rebolo add column if not exists carga_id uuid references public.estoque_cargas(id) on delete set null;

-- 2. Acerto na volta, agora com o destino do que voltou
create or replace function public.estoque_acertar_carga(p_carga uuid, p_escolas jsonb, p_observacao text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.estoque_cargas;
  e record;
  a jsonb;
  av int; ar int; pv int; pr int;
  v_obs text;
  v_texto text;
  v_destino text;
  v_num int;
  v_autor text := (select nome from public.colaboradores where id = auth.uid());
begin
  if not public.pode('financeiro', 'editar') then raise exception 'Só o Financeiro faz o acerto' using errcode = '42501'; end if;
  select * into c from public.estoque_cargas where id = p_carga for update;
  if c.id is null then raise exception 'Carga não encontrada'; end if;
  if c.status <> 'Em venda' then raise exception 'Só dá para acertar uma carga em venda (esta está "%")', c.status; end if;
  if jsonb_typeof(coalesce(p_escolas, 'null'::jsonb)) <> 'array' then raise exception 'Informe o acerto de cada escola'; end if;
  if exists (select 1 from jsonb_array_elements(p_escolas) j
             where not exists (select 1 from public.estoque_carga_caixas k where k.carga_id = c.id and k.lote_id::text = j.value ->> 'lote')) then
    raise exception 'Tem escola no acerto que não está nesta carga: atualize a tela';
  end if;
  v_texto := format('Carga %s • %s', c.numero, c.vendedor);

  for e in select k.lote_id, l.escola, l.cidade, sum(k.albuns)::int as albuns, sum(k.posteres)::int as posteres
           from public.estoque_carga_caixas k join public.producao_lotes l on l.id = k.lote_id
           where k.carga_id = c.id group by k.lote_id, l.escola, l.cidade order by l.escola
  loop
    select j.value into a from jsonb_array_elements(p_escolas) j where j.value ->> 'lote' = e.lote_id::text limit 1;
    if a is null then raise exception 'Informe o acerto de %', e.escola; end if;
    av := (a ->> 'albuns_vendidos')::int; ar := (a ->> 'albuns_voltaram')::int;
    pv := coalesce((a ->> 'posteres_vendidos')::int, 0); pr := coalesce((a ->> 'posteres_voltaram')::int, 0);
    if av is null or ar is null or least(av, ar, pv, pr) < 0 then raise exception '%: informe os álbuns vendidos e os que voltaram (0 ou mais)', e.escola; end if;
    if av + ar > e.albuns then raise exception '%: vendidos + voltaram (% álbuns) passa do que foi levado (%)', e.escola, av + ar, e.albuns; end if;
    if pv + pr > e.posteres then raise exception '%: vendidos + voltaram (% pôsteres/brindes) passa do que foi levado (%)', e.escola, pv + pr, e.posteres; end if;
    v_obs := nullif(trim(coalesce(a ->> 'observacao', '')), '');
    v_destino := nullif(trim(coalesce(a ->> 'destino', '')), '');
    if v_destino is not null and v_destino not in ('Estoque', 'Rebolo') then raise exception '%: destino inválido', e.escola; end if;
    if ar + pr = 0 then v_destino := null; end if; -- nada voltou: sem destino

    insert into public.estoque_carga_acertos (carga_id, lote_id, albuns_levados, posteres_levados, albuns_vendidos, albuns_voltaram,
                                              posteres_vendidos, posteres_voltaram, albuns_diferenca, posteres_diferenca, observacao, destino)
    values (c.id, e.lote_id, e.albuns, e.posteres, av, ar, pv, pr, e.albuns - av - ar, e.posteres - pv - pr, v_obs, v_destino);
    insert into public.estoque_movimentos (lote_id, carga_id, tipo, albuns, posteres, descricao, autor)
    select e.lote_id, c.id, m.tipo, m.alb, m.pos, m.txt, v_autor
    from (values ('Vendidos', av, pv, v_texto),
                 ('Voltaram', ar, pr, v_texto || case v_destino when 'Estoque' then ' • voltou para o estoque'
                                                                 when 'Rebolo' then ' • enviado para o Rebolo'
                                                                 else ' • aguardando o Rebolo' end)) m(tipo, alb, pos, txt)
    where m.alb + m.pos > 0;
    if e.albuns - av - ar > 0 or e.posteres - pv - pr > 0 then
      insert into public.estoque_movimentos (lote_id, carga_id, tipo, albuns, posteres, descricao, autor)
      values (e.lote_id, c.id, 'Diferença', e.albuns - av - ar, e.posteres - pv - pr, v_texto || coalesce(' • ' || v_obs, ''), v_autor);
    end if;

    if v_destino = 'Estoque' then
      -- o que voltou vira uma caixa da escola, já conferida e em estoque (não é revelação: sem meta)
      select coalesce(max(numero), 0) + 1 into v_num from public.producao_caixas where lote_id = e.lote_id;
      insert into public.producao_caixas (lote_id, numero, data, albuns, posteres, observacao, status,
                                          conferido_albuns, conferido_posteres, conferencia_obs, conferido_por, conferido_em, origem_carga_id)
      values (e.lote_id, v_num, current_date, ar, pr, format('Volta da carga nº %s • %s', c.numero, c.vendedor), 'Em estoque',
              ar, pr, 'Volta da carga (acerto do Financeiro)', auth.uid(), current_date, c.id);
      insert into public.estoque_movimentos (lote_id, carga_id, tipo, albuns, posteres, descricao, autor)
      values (e.lote_id, c.id, 'Voltou ao estoque', ar, pr, format('%s • caixa %s', v_texto, v_num), v_autor);
    elsif v_destino = 'Rebolo' then
      insert into public.estoque_envios_rebolo (lote_id, albuns, posteres, observacao, autor, carga_id)
      values (e.lote_id, ar, pr, format('Volta da carga nº %s', c.numero), v_autor, c.id);
      insert into public.estoque_movimentos (lote_id, carga_id, tipo, albuns, posteres, descricao, autor)
      values (e.lote_id, c.id, 'Enviado ao Rebolo', ar, pr, v_texto || ' • direto no acerto', v_autor);
      perform public.notificar(array['rebolo']::public.setor[], 'info', 'Álbuns para o Rebolo',
        format('%s (%s): %s álbuns%s voltaram da carga nº %s e foram encaminhados ao Rebolo.', e.escola, e.cidade, ar,
               case when pr > 0 then format(' e %s pôsteres/brindes', pr) else '' end, c.numero), '/rebolo');
    end if;
  end loop;

  update public.producao_caixas set status = 'Acertada' where id in (select caixa_id from public.estoque_carga_caixas where carga_id = c.id);
  update public.estoque_cargas set status = 'Encerrada', acerto_em = current_date, acerto_por = v_autor, acerto_obs = nullif(trim(coalesce(p_observacao, '')), '') where id = c.id;
end $$;
revoke all on function public.estoque_acertar_carga(uuid, jsonb, text) from public, anon;
grant execute on function public.estoque_acertar_carga(uuid, jsonb, text) to authenticated;

-- 3. Desfazer o acerto: desfaz também a caixa da volta e o envio automático ao Rebolo
create or replace function public.estoque_desfazer_acerto(p_carga uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.estoque_cargas;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_autor text := (select nome from public.colaboradores where id = auth.uid());
  v_bloq text;
begin
  if not public.pode('financeiro', 'editar') then raise exception 'Só o Financeiro mexe no acerto' using errcode = '42501'; end if;
  if v_motivo is null then raise exception 'Informe o motivo'; end if;
  select * into c from public.estoque_cargas where id = p_carga for update;
  if c.id is null then raise exception 'Carga não encontrada'; end if;
  if c.status <> 'Encerrada' then raise exception 'Esta carga não foi acertada'; end if;
  -- a caixa da volta já saiu em outra carga: não dá para desfazer
  select string_agg(distinct l.escola, ', ') into v_bloq
  from public.producao_caixas x join public.producao_lotes l on l.id = x.lote_id
  where x.origem_carga_id = c.id
    and (x.status <> 'Em estoque' or exists (select 1 from public.estoque_carga_caixas k where k.caixa_id = x.id));
  if v_bloq is not null then
    raise exception 'O que voltou para o estoque desta carga já saiu em outra carga (%): desfaça aquela carga antes', v_bloq;
  end if;
  -- sem este acerto, o que já foi encaminhado ao Rebolo à mão não pode passar do que voltou "aguardando"
  select string_agg(l.escola, ', ' order by l.escola) into v_bloq
  from public.estoque_carga_acertos a join public.producao_lotes l on l.id = a.lote_id
  where a.carga_id = c.id
    and ((select coalesce(sum(x.albuns_voltaram), 0) from public.estoque_carga_acertos x
           where x.lote_id = a.lote_id and x.carga_id <> c.id and x.destino is distinct from 'Estoque')
           < (select coalesce(sum(r.albuns), 0) from public.estoque_envios_rebolo r where r.lote_id = a.lote_id and r.carga_id is distinct from c.id)
      or (select coalesce(sum(x.posteres_voltaram), 0) from public.estoque_carga_acertos x
           where x.lote_id = a.lote_id and x.carga_id <> c.id and x.destino is distinct from 'Estoque')
           < (select coalesce(sum(r.posteres), 0) from public.estoque_envios_rebolo r where r.lote_id = a.lote_id and r.carga_id is distinct from c.id));
  if v_bloq is not null then
    raise exception 'O que voltou desta carga já foi encaminhado ao Rebolo (%): desfaça o envio ao Rebolo antes', v_bloq;
  end if;

  insert into public.estoque_movimentos (lote_id, carga_id, tipo, descricao, autor)
  select a.lote_id, c.id, 'Acerto desfeito', format('Carga %s • %s • motivo: %s', c.numero, c.vendedor, v_motivo), v_autor
  from public.estoque_carga_acertos a where a.carga_id = c.id;
  delete from public.producao_caixas where origem_carga_id = c.id;
  delete from public.estoque_envios_rebolo where carga_id = c.id;
  delete from public.estoque_carga_acertos where carga_id = c.id;
  update public.producao_caixas set status = 'Em carga' where id in (select caixa_id from public.estoque_carga_caixas where carga_id = c.id);
  update public.estoque_cargas set status = 'Em venda', acerto_em = null, acerto_por = null, acerto_obs = null where id = c.id;
end $$;
revoke all on function public.estoque_desfazer_acerto(uuid, text) from public, anon;
grant execute on function public.estoque_desfazer_acerto(uuid, text) to authenticated;

-- 4. Encaminhar ao Rebolo (botão de sempre): só o que voltou "aguardando" (não o que voltou para o estoque)
create or replace function public.estoque_enviar_rebolo(p_lote uuid, p_albuns int, p_posteres int default 0, p_observacao text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.producao_lotes;
  v_av int;
  v_pv int;
  v_id uuid;
  v_autor text := (select nome from public.colaboradores where id = auth.uid());
  v_obs text := nullif(trim(coalesce(p_observacao, '')), '');
begin
  if not public.pode('financeiro', 'editar') then raise exception 'Só o Financeiro encaminha ao Rebolo' using errcode = '42501'; end if;
  select * into l from public.producao_lotes where id = p_lote for update;
  if l.id is null then raise exception 'Escola não encontrada'; end if;
  if coalesce(p_albuns, -1) < 0 or coalesce(p_posteres, -1) < 0 or coalesce(p_albuns, 0) + coalesce(p_posteres, 0) = 0 then
    raise exception 'Informe quantos álbuns (e pôsteres/brindes) vão para o Rebolo';
  end if;
  select coalesce(sum(albuns_voltaram), 0), coalesce(sum(posteres_voltaram), 0) into v_av, v_pv
    from public.estoque_carga_acertos where lote_id = l.id and destino is distinct from 'Estoque';
  v_av := v_av - (select coalesce(sum(albuns), 0) from public.estoque_envios_rebolo where lote_id = l.id);
  v_pv := v_pv - (select coalesce(sum(posteres), 0) from public.estoque_envios_rebolo where lote_id = l.id);
  if p_albuns > v_av or p_posteres > v_pv then
    raise exception 'Esta escola tem só % álbuns e % pôsteres/brindes aguardando o Rebolo', v_av, v_pv;
  end if;
  insert into public.estoque_envios_rebolo (lote_id, albuns, posteres, observacao, autor) values (l.id, p_albuns, p_posteres, v_obs, v_autor) returning id into v_id;
  insert into public.estoque_movimentos (lote_id, tipo, albuns, posteres, descricao, autor)
  values (l.id, 'Enviado ao Rebolo', p_albuns, p_posteres, coalesce(v_obs, 'O Rebolo pega as caixas e tenta vender'), v_autor);
  perform public.notificar(array['rebolo']::public.setor[], 'info', 'Álbuns para o Rebolo',
    format('%s (%s): %s álbuns%s voltaram das cargas e foram encaminhados ao Rebolo.', l.escola, l.cidade, p_albuns,
           case when p_posteres > 0 then format(' e %s pôsteres/brindes', p_posteres) else '' end), '/rebolo');
  return v_id;
end $$;
revoke all on function public.estoque_enviar_rebolo(uuid, int, int, text) from public, anon;
grant execute on function public.estoque_enviar_rebolo(uuid, int, int, text) to authenticated;

-- 5. Envio automático do acerto não se desfaz sozinho (é desfeito junto com o acerto)
create or replace function public.estoque_desfazer_envio_rebolo(p_envio uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.estoque_envios_rebolo;
begin
  if not public.pode('financeiro', 'editar') then raise exception 'Só o Financeiro mexe nos envios ao Rebolo' using errcode = '42501'; end if;
  select * into r from public.estoque_envios_rebolo where id = p_envio for update;
  if r.id is null then raise exception 'Envio não encontrado'; end if;
  if r.carga_id is not null then
    raise exception 'Este envio foi feito no acerto da carga: para mudar, desfaça o acerto da carga';
  end if;
  delete from public.estoque_envios_rebolo where id = r.id;
  insert into public.estoque_movimentos (lote_id, tipo, albuns, posteres, descricao, autor)
  values (r.lote_id, 'Envio ao Rebolo desfeito', r.albuns, r.posteres, format('Envio de %s desfeito: voltou a ficar aguardando o Rebolo', to_char(r.data, 'DD/MM/YYYY')),
          (select nome from public.colaboradores where id = auth.uid()));
end $$;
revoke all on function public.estoque_desfazer_envio_rebolo(uuid) from public, anon;
grant execute on function public.estoque_desfazer_envio_rebolo(uuid) to authenticated;

-- 6. A Revelação: a caixa da volta não soma como álbum revelado (resto igual ao 024)
create or replace function public.producao_registrar_caixa(p_lote uuid, p_albuns int, p_posteres int default 0,
                                                           p_observacao text default null, p_data date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.producao_lotes;
  v_eu public.colaboradores;
  v_data date := coalesce(p_data, current_date);
  v_num int;
  v_lanc uuid;
  v_caixa uuid;
  v_total int;
  v_autor text;
begin
  if not public.pode('producao', 'criar') then
    raise exception 'Sem permissão para registrar caixas' using errcode = '42501';
  end if;
  select * into v_eu from public.colaboradores where id = auth.uid();
  v_autor := v_eu.nome;
  select * into l from public.producao_lotes where id = p_lote for update;
  if not found then raise exception 'Escola não encontrada'; end if;
  if l.etapa not in ('Aguardando revelação', 'Revelando', 'Na caixa') then
    raise exception 'Esta escola ainda não foi liberada para a Revelação (está em "%")', l.etapa;
  end if;
  if coalesce(p_albuns, 0) <= 0 then raise exception 'Informe quantos álbuns tem na caixa'; end if;
  if coalesce(p_posteres, 0) < 0 then raise exception 'Pôster/brindes não pode ser negativo'; end if;
  if v_data > current_date then raise exception 'A data não pode ser depois de hoje'; end if;

  perform public.producao_cor_da_cidade(l.cidade, l.uf); -- cor do comprovante (1ª caixa da cidade ganha a cor)
  select coalesce(max(numero), 0) + 1 into v_num from public.producao_caixas where lote_id = l.id;
  -- álbuns revelados: meta de quem soltou a caixa (se for da Revelação)
  insert into public.lancamentos (setor, indicador_id, colaborador_id, quantidade, descricao, data, origem)
  values ('producao', 'books', case when v_eu.setor = 'producao' then v_eu.id end, p_albuns, format('Caixa %s — %s', v_num, l.escola), v_data, 'automatico')
  returning id into v_lanc;
  insert into public.producao_caixas (lote_id, numero, data, albuns, posteres, observacao, registrado_por, lancamento_id)
  values (l.id, v_num, v_data, p_albuns, coalesce(p_posteres, 0), nullif(trim(coalesce(p_observacao, '')), ''), v_eu.id, v_lanc)
  returning id into v_caixa;

  insert into public.producao_historico (lote_id, etapa, acao, quantidade, descricao, autor)
  values (l.id, l.etapa, 'Caixa da Revelação', p_albuns,
          format('Caixa %s: %s álbuns%s. Aguardando a conferência da Produção.', v_num, p_albuns, case when coalesce(p_posteres, 0) > 0 then format(' + %s pôster/brindes', p_posteres) else '' end), v_autor);

  -- 1ª caixa: a escola está sendo revelada
  if l.etapa = 'Aguardando revelação' then
    update public.producao_lotes set etapa = 'Revelando', revelando_em = coalesce(revelando_em, v_data) where id = l.id;
    insert into public.producao_historico (lote_id, etapa, acao, descricao, autor)
    values (l.id, 'Revelando', 'Revelando', 'A Revelação começou a soltar as caixas.', v_autor);
    l.etapa := 'Revelando';
  end if;
  -- as caixas somam todos os álbuns: revelado
  select coalesce(sum(albuns), 0) into v_total from public.producao_caixas where lote_id = l.id and origem_carga_id is null; -- 056: a caixa da volta de carga não é revelação
  if l.etapa = 'Revelando' and v_total >= l.albuns then
    update public.producao_lotes set etapa = 'Na caixa', na_caixa_em = current_date where id = l.id;
    insert into public.producao_historico (lote_id, etapa, acao, descricao, autor)
    values (l.id, 'Na caixa', 'Na caixa', format('Todos os álbuns revelados: %s em %s caixa(s).', v_total, v_num), v_autor);
  end if;

  perform public.notificar(array['edicao']::public.setor[], 'info', 'Caixa para conferir',
    format('%s: caixa %s com %s álbuns. Confira no Estoque.', l.escola, v_num, p_albuns), '/edicao/estoque');
  return v_caixa;
end $$;
revoke all on function public.producao_registrar_caixa(uuid, int, int, text, date) from public, anon;
grant execute on function public.producao_registrar_caixa(uuid, int, int, text, date) to authenticated;

notify pgrst, 'reload schema';

-- Conferência
select
  (select count(*) from information_schema.columns where table_schema = 'public'
     and ((table_name = 'producao_caixas' and column_name = 'origem_carga_id')
       or (table_name = 'estoque_carga_acertos' and column_name = 'destino')
       or (table_name = 'estoque_envios_rebolo' and column_name = 'carga_id'))) as colunas,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('estoque_acertar_carga', 'estoque_desfazer_acerto', 'estoque_enviar_rebolo', 'estoque_desfazer_envio_rebolo', 'producao_registrar_caixa')
     and (pg_get_functiondef(oid) like '%destino%' or pg_get_functiondef(oid) like '%origem_carga_id%' or pg_get_functiondef(oid) like '%r.carga_id is not null%')) as funcoes;
