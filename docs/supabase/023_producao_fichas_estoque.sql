-- =====================================================================
-- 023 — PRODUÇÃO: FICHAS DOS ALUNOS E ESTOQUE (CAIXAS)  (rodar DEPOIS do 022; pode rodar mais de uma vez)
--
--  • Fichas: em cada escola da Produção, a lista dos alunos (código, nome, quantidade de fotos), digitada à mão.
--  • Caixas: a REVELAÇÃO solta as caixas no app dela (escola, álbuns, pôster/brindes, observação).
--    Cada caixa conta na meta da Revelação (álbuns revelados), como o lançamento de antes.
--    A escola passa para "Revelando" na 1ª caixa e para "Na caixa" quando as caixas somam todos os álbuns.
--  • Conferência: a Produção confere cada caixa (álbuns e pôster/brindes); confirmou → a caixa vai para o ESTOQUE
--    e o comprovante é impresso (logo, cidade, escola, caixa nº, álbuns, data).
-- =====================================================================

-- 1. Fichas dos alunos
create table if not exists public.producao_fichas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.producao_lotes(id) on delete cascade,
  codigo text not null,
  nome text not null,
  qtd_fotos int not null default 0 check (qtd_fotos >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists producao_fichas_codigo on public.producao_fichas (lote_id, lower(trim(codigo)));

-- 2. Caixas da Revelação
create table if not exists public.producao_caixas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.producao_lotes(id) on delete cascade,
  numero int not null, -- Caixa 1, 2, 3... da escola
  data date not null default current_date, -- dia em que a Revelação soltou
  albuns int not null check (albuns > 0),
  posteres int not null default 0 check (posteres >= 0), -- pôster/brindes
  observacao text,
  registrado_por uuid references public.colaboradores(id) on delete set null,
  lancamento_id uuid, -- álbuns revelados (meta da Revelação)
  status text not null default 'Aguardando conferência' check (status in ('Aguardando conferência', 'Em estoque')),
  conferido_albuns int,
  conferido_posteres int,
  conferencia_obs text,
  conferido_por uuid references public.colaboradores(id) on delete set null,
  conferido_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lote_id, numero)
);
create index if not exists producao_caixas_status on public.producao_caixas (status);

-- 3. Acesso, auditoria, updated_at e realtime
do $$
declare t text;
begin
  foreach t in array array['producao_fichas', 'producao_caixas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.fn_auditoria()', t);
    execute format('drop trigger if exists trg_updated_at on public.%I', t);
    execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.tocar_updated_at()', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
-- fichas: a Produção cadastra, corrige e exclui (erro de digitação)
create policy producao_fichas_select on public.producao_fichas for select to authenticated using (public.pode('edicao', 'visualizar'));
create policy producao_fichas_insert on public.producao_fichas for insert to authenticated with check (public.pode('edicao', 'criar'));
create policy producao_fichas_update on public.producao_fichas for update to authenticated using (public.pode('edicao', 'editar')) with check (public.pode('edicao', 'editar'));
create policy producao_fichas_delete on public.producao_fichas for delete to authenticated using (public.pode('edicao', 'editar'));
-- caixas: a Produção e a Revelação veem; mudam só pelas funções abaixo
create policy producao_caixas_select on public.producao_caixas for select to authenticated
  using (public.pode('edicao', 'visualizar') or public.pode('producao', 'visualizar'));
-- a Revelação enxerga as escolas que já estão com ela (para escolher a escola da caixa)
drop policy if exists producao_lotes_revelacao_select on public.producao_lotes;
create policy producao_lotes_revelacao_select on public.producao_lotes for select to authenticated
  using (public.pode('producao', 'visualizar') and etapa in ('Aguardando revelação', 'Revelando', 'Na caixa'));

-- 4. A Revelação solta uma caixa (conta na meta dela: álbuns revelados)
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
  select coalesce(sum(albuns), 0) into v_total from public.producao_caixas where lote_id = l.id;
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

-- 5. Caixa registrada errado (ainda sem conferência): a Revelação ou o ADM apaga (sai da meta junto)
create or replace function public.producao_excluir_caixa(p_caixa uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.producao_caixas;
begin
  if not public.pode('producao', 'editar') then
    raise exception 'Sem permissão para apagar caixas' using errcode = '42501';
  end if;
  select * into c from public.producao_caixas where id = p_caixa for update;
  if not found then raise exception 'Caixa não encontrada'; end if;
  if c.status <> 'Aguardando conferência' then raise exception 'Esta caixa já foi conferida e está no estoque: não dá para apagar'; end if;
  delete from public.lancamentos where id = c.lancamento_id;
  delete from public.producao_caixas where id = c.id;
  insert into public.producao_historico (lote_id, etapa, acao, quantidade, descricao, autor)
  select c.lote_id, l.etapa, 'Caixa apagada', c.albuns, format('Caixa %s (%s álbuns) apagada pela Revelação.', c.numero, c.albuns),
         (select nome from public.colaboradores where id = auth.uid())
  from public.producao_lotes l where l.id = c.lote_id;
end $$;
revoke all on function public.producao_excluir_caixa(uuid) from public, anon;
grant execute on function public.producao_excluir_caixa(uuid) to authenticated;

-- 6. A Produção confere a caixa: confirmou → vai para o ESTOQUE (o comprovante sai na tela)
create or replace function public.producao_conferir_caixa(p_caixa uuid, p_albuns int, p_posteres int default 0, p_observacao text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.producao_caixas;
  v_obs text := nullif(trim(coalesce(p_observacao, '')), '');
begin
  if not public.pode('edicao', 'editar') then
    raise exception 'Sem permissão para conferir caixas' using errcode = '42501';
  end if;
  select * into c from public.producao_caixas where id = p_caixa for update;
  if not found then raise exception 'Caixa não encontrada'; end if;
  if c.status <> 'Aguardando conferência' then raise exception 'Esta caixa já foi conferida'; end if;
  if coalesce(p_albuns, -1) < 0 or coalesce(p_posteres, -1) < 0 then raise exception 'Informe quantidades válidas (0 ou mais)'; end if;
  if (p_albuns <> c.albuns or p_posteres <> c.posteres) and v_obs is null then
    raise exception 'A conferência não bate com o informado pela Revelação: escreva a observação';
  end if;
  update public.producao_caixas
    set status = 'Em estoque', conferido_albuns = p_albuns, conferido_posteres = p_posteres, conferencia_obs = v_obs,
        conferido_por = auth.uid(), conferido_em = current_date
    where id = c.id;
  insert into public.producao_historico (lote_id, etapa, acao, quantidade, descricao, autor)
  select c.lote_id, l.etapa, 'Caixa conferida', p_albuns,
         format('Caixa %s conferida: %s álbuns%s • em estoque%s', c.numero, p_albuns,
           case when p_posteres > 0 then format(' + %s pôster/brindes', p_posteres) else '' end,
           case when v_obs is not null then '. Obs.: ' || v_obs else '' end),
         (select nome from public.colaboradores where id = auth.uid())
  from public.producao_lotes l where l.id = c.lote_id;
end $$;
revoke all on function public.producao_conferir_caixa(uuid, int, int, text) from public, anon;
grant execute on function public.producao_conferir_caixa(uuid, int, int, text) to authenticated;

-- Conferência: deve mostrar 2 | 3
select (select count(*) from pg_tables where schemaname = 'public' and tablename in ('producao_fichas', 'producao_caixas')) as tabelas,
       (select count(*) from pg_proc where proname in ('producao_registrar_caixa', 'producao_excluir_caixa', 'producao_conferir_caixa')) as funcoes;
