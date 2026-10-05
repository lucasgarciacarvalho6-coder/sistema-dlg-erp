-- =====================================================================
-- 029 — ESTOQUE DE ÁLBUNS E CARGAS DOS VENDEDORES DE BOOKS  (rodar DEPOIS do 028; pode rodar mais de uma vez)
--
--  • O estoque é por escola: cada caixa que a Produção conferiu ("Em estoque") é o que a empresa tem.
--  • SÓ O FINANCEIRO (e o ADM / Gerência) mexe: monta a carga do vendedor de books (caixas de várias escolas),
--    acerta na volta e encaminha ao Rebolo o que voltou. A Produção só vê, para conferir se bate.
--  • Carga: vendedor + caixas → "Em venda" (sem prazo: o vendedor roda 40, 50, 60 dias)
--    → acerto na volta, por escola: álbuns e pôsteres/brindes vendidos e que voltaram.
--    A diferença (levados − vendidos − voltaram) fica registrada.
--  • O que voltou fica na escola "aguardando Rebolo" até o Financeiro encaminhar (o Rebolo não precisa confirmar).
--  • Enquanto em venda: trocar o vendedor, pôr/tirar caixas ou cancelar a carga. Acerto errado: desfazer o acerto.
--  • As tabelas só mudam pelas funções abaixo (a tela não grava direto).
-- =====================================================================

-- 1. A caixa ganha duas situações: "Em carga" (saiu com o vendedor) e "Acertada" (a carga voltou e foi acertada)
alter table public.producao_caixas drop constraint if exists producao_caixas_status_check;
alter table public.producao_caixas add constraint producao_caixas_status_check
  check (status in ('Aguardando conferência', 'Em estoque', 'Em carga', 'Acertada'));

-- 2. Tabelas
create sequence if not exists public.estoque_cargas_numero;

create table if not exists public.estoque_cargas (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique default nextval('public.estoque_cargas_numero'), -- Carga 1, 2, 3...
  vendedor_id uuid not null references public.pj_vendedores(id),
  vendedor text not null, -- nome do vendedor (fica no histórico)
  rota text,
  observacao text,
  data_saida date not null default current_date,
  status text not null default 'Em venda' check (status in ('Em venda', 'Encerrada', 'Cancelada')),
  criada_por text,
  acerto_em date,
  acerto_por text,
  acerto_obs text,
  cancelada_em date,
  cancelada_por text,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists estoque_cargas_status on public.estoque_cargas (status);

-- caixas da carga (álbuns e pôsteres conferidos de cada caixa, no dia da saída)
create table if not exists public.estoque_carga_caixas (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references public.estoque_cargas(id) on delete cascade,
  caixa_id uuid not null references public.producao_caixas(id),
  lote_id uuid not null references public.producao_lotes(id),
  albuns int not null check (albuns >= 0),
  posteres int not null default 0 check (posteres >= 0),
  created_at timestamptz not null default now(),
  unique (carga_id, caixa_id)
);
create index if not exists estoque_carga_caixas_lote on public.estoque_carga_caixas (lote_id);

-- acerto da carga, por escola
create table if not exists public.estoque_carga_acertos (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references public.estoque_cargas(id) on delete cascade,
  lote_id uuid not null references public.producao_lotes(id),
  albuns_levados int not null,
  posteres_levados int not null,
  albuns_vendidos int not null check (albuns_vendidos >= 0),
  albuns_voltaram int not null check (albuns_voltaram >= 0),
  posteres_vendidos int not null check (posteres_vendidos >= 0),
  posteres_voltaram int not null check (posteres_voltaram >= 0),
  albuns_diferenca int not null,
  posteres_diferenca int not null,
  observacao text,
  created_at timestamptz not null default now(),
  unique (carga_id, lote_id)
);
create index if not exists estoque_carga_acertos_lote on public.estoque_carga_acertos (lote_id);

-- o que voltou e foi encaminhado ao Rebolo
create table if not exists public.estoque_envios_rebolo (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.producao_lotes(id),
  albuns int not null check (albuns >= 0),
  posteres int not null default 0 check (posteres >= 0),
  data date not null default current_date,
  observacao text,
  autor text,
  created_at timestamptz not null default now(),
  check (albuns + posteres > 0)
);
create index if not exists estoque_envios_rebolo_lote on public.estoque_envios_rebolo (lote_id);

-- extrato de cada escola (o que aconteceu, quando e quem fez)
create table if not exists public.estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.producao_lotes(id) on delete cascade,
  carga_id uuid references public.estoque_cargas(id) on delete set null,
  tipo text not null,
  albuns int not null default 0,
  posteres int not null default 0,
  descricao text,
  autor text,
  created_at timestamptz not null default now()
);
create index if not exists estoque_movimentos_lote on public.estoque_movimentos (lote_id, created_at);

-- 3. Acesso: o Financeiro e a Produção veem; ninguém grava direto (só pelas funções). Auditoria, updated_at e realtime.
do $$
declare t text;
begin
  foreach t in array array['estoque_cargas', 'estoque_carga_caixas', 'estoque_carga_acertos', 'estoque_envios_rebolo', 'estoque_movimentos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.pode(''financeiro'', ''visualizar'') or public.pode(''edicao'', ''visualizar''))', t || '_select', t);
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.fn_auditoria()', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
drop trigger if exists trg_updated_at on public.estoque_cargas;
create trigger trg_updated_at before update on public.estoque_cargas for each row execute function public.tocar_updated_at();

-- o Financeiro passa a ver as caixas, as escolas da Produção e os vendedores (para montar a carga)
drop policy if exists producao_caixas_financeiro_select on public.producao_caixas;
create policy producao_caixas_financeiro_select on public.producao_caixas for select to authenticated using (public.pode('financeiro', 'visualizar'));
drop policy if exists producao_lotes_financeiro_select on public.producao_lotes;
create policy producao_lotes_financeiro_select on public.producao_lotes for select to authenticated using (public.pode('financeiro', 'visualizar'));
drop policy if exists pj_vendedores_financeiro_select on public.pj_vendedores;
create policy pj_vendedores_financeiro_select on public.pj_vendedores for select to authenticated using (public.pode('financeiro', 'visualizar'));

-- 4. Ajudantes (uso interno das funções)
-- extrato: uma linha por escola com as caixas da carga (antes de apagar, quando a caixa sai da carga)
create or replace function public.estoque_mov_caixas(p_carga uuid, p_caixas uuid[], p_tipo text, p_autor text, p_texto text) returns void
language sql security definer set search_path = public as $$
  insert into public.estoque_movimentos (lote_id, carga_id, tipo, albuns, posteres, descricao, autor)
  select k.lote_id, p_carga, p_tipo, sum(k.albuns), sum(k.posteres),
         format('Carga %s • %s • caixa(s) %s', c.numero, c.vendedor, string_agg(x.numero::text, ', ' order by x.numero)) || coalesce(' • ' || p_texto, ''),
         p_autor
  from public.estoque_carga_caixas k
  join public.producao_caixas x on x.id = k.caixa_id
  join public.estoque_cargas c on c.id = k.carga_id
  where k.carga_id = p_carga and k.caixa_id = any(p_caixas)
  group by k.lote_id, c.numero, c.vendedor
$$;
revoke all on function public.estoque_mov_caixas(uuid, uuid[], text, text, text) from public, anon, authenticated;

-- caixas escolhidas: todas existem e estão no estoque (trava as linhas)
create or replace function public.estoque_conferir_caixas(p_caixas uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_fora text;
begin
  perform 1 from public.producao_caixas where id = any(p_caixas) for update;
  if (select count(*) from public.producao_caixas where id = any(p_caixas)) <> coalesce(array_length(p_caixas, 1), 0) then
    raise exception 'Alguma caixa não foi encontrada: atualize a tela';
  end if;
  select string_agg(format('%s (caixa %s)', l.escola, x.numero), ', ' order by l.escola, x.numero) into v_fora
    from public.producao_caixas x join public.producao_lotes l on l.id = x.lote_id
   where x.id = any(p_caixas) and x.status <> 'Em estoque';
  if v_fora is not null then raise exception 'Estas caixas não estão no estoque: %', v_fora; end if;
end $$;
revoke all on function public.estoque_conferir_caixas(uuid[]) from public, anon, authenticated;

-- 5. Montar a carga: vendedor de books + caixas (de várias escolas) → "Em venda". Devolve o id da carga.
create or replace function public.estoque_criar_carga(p_vendedor uuid, p_caixas uuid[], p_rota text default null, p_observacao text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  vd public.pj_vendedores;
  v_caixas uuid[] := array(select distinct x from unnest(coalesce(p_caixas, '{}'::uuid[])) x);
  v_id uuid;
  v_autor text := (select nome from public.colaboradores where id = auth.uid());
begin
  if not public.pode('financeiro', 'editar') then raise exception 'Só o Financeiro monta a carga' using errcode = '42501'; end if;
  select * into vd from public.pj_vendedores where id = p_vendedor;
  if vd.id is null or vd.tipo is distinct from 'Books' then raise exception 'Escolha o vendedor de books da carga'; end if;
  if coalesce(array_length(v_caixas, 1), 0) = 0 then raise exception 'Escolha as caixas da carga'; end if;
  perform public.estoque_conferir_caixas(v_caixas);

  insert into public.estoque_cargas (vendedor_id, vendedor, rota, observacao, criada_por)
  values (vd.id, vd.nome, nullif(trim(coalesce(p_rota, '')), ''), nullif(trim(coalesce(p_observacao, '')), ''), v_autor)
  returning id into v_id;
  insert into public.estoque_carga_caixas (carga_id, caixa_id, lote_id, albuns, posteres)
  select v_id, x.id, x.lote_id, coalesce(x.conferido_albuns, x.albuns), coalesce(x.conferido_posteres, x.posteres, 0)
  from public.producao_caixas x where x.id = any(v_caixas);
  update public.producao_caixas set status = 'Em carga' where id = any(v_caixas);
  perform public.estoque_mov_caixas(v_id, v_caixas, 'Saiu na carga', v_autor, null);
  return v_id;
end $$;
revoke all on function public.estoque_criar_carga(uuid, uuid[], text, text) from public, anon;
grant execute on function public.estoque_criar_carga(uuid, uuid[], text, text) to authenticated;

-- 6. Carga em venda: trocar o vendedor, pôr/tirar caixas, mudar a rota e a observação
create or replace function public.estoque_editar_carga(p_carga uuid, p_vendedor uuid default null, p_adicionar uuid[] default null, p_remover uuid[] default null,
                                                      p_rota text default null, p_observacao text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.estoque_cargas;
  vd public.pj_vendedores;
  v_autor text := (select nome from public.colaboradores where id = auth.uid());
  v_rem uuid[];
  v_add uuid[];
begin
  if not public.pode('financeiro', 'editar') then raise exception 'Só o Financeiro mexe na carga' using errcode = '42501'; end if;
  select * into c from public.estoque_cargas where id = p_carga for update;
  if c.id is null then raise exception 'Carga não encontrada'; end if;
  if c.status <> 'Em venda' then raise exception 'Só dá para mudar uma carga em venda (esta está "%")', c.status; end if;

  if p_vendedor is not null and p_vendedor <> c.vendedor_id then
    select * into vd from public.pj_vendedores where id = p_vendedor;
    if vd.id is null or vd.tipo is distinct from 'Books' then raise exception 'Escolha o vendedor de books da carga'; end if;
    update public.estoque_cargas set vendedor_id = vd.id, vendedor = vd.nome where id = c.id;
    insert into public.estoque_movimentos (lote_id, carga_id, tipo, descricao, autor)
    select distinct k.lote_id, c.id, 'Vendedor trocado', format('Carga %s: %s → %s', c.numero, c.vendedor, vd.nome), v_autor
    from public.estoque_carga_caixas k where k.carga_id = c.id;
  end if;

  -- tirar caixas: voltam para o estoque
  v_rem := array(select distinct x from unnest(coalesce(p_remover, '{}'::uuid[])) x
                 where exists (select 1 from public.estoque_carga_caixas k where k.carga_id = c.id and k.caixa_id = x));
  if coalesce(array_length(v_rem, 1), 0) > 0 then
    perform public.estoque_mov_caixas(c.id, v_rem, 'Voltou ao estoque', v_autor, 'tirada(s) da carga');
    delete from public.estoque_carga_caixas where carga_id = c.id and caixa_id = any(v_rem);
    update public.producao_caixas set status = 'Em estoque' where id = any(v_rem) and status = 'Em carga';
  end if;

  -- pôr caixas
  v_add := array(select distinct x from unnest(coalesce(p_adicionar, '{}'::uuid[])) x
                 where not exists (select 1 from public.estoque_carga_caixas k where k.carga_id = c.id and k.caixa_id = x));
  if coalesce(array_length(v_add, 1), 0) > 0 then
    perform public.estoque_conferir_caixas(v_add);
    insert into public.estoque_carga_caixas (carga_id, caixa_id, lote_id, albuns, posteres)
    select c.id, x.id, x.lote_id, coalesce(x.conferido_albuns, x.albuns), coalesce(x.conferido_posteres, x.posteres, 0)
    from public.producao_caixas x where x.id = any(v_add);
    update public.producao_caixas set status = 'Em carga' where id = any(v_add);
    perform public.estoque_mov_caixas(c.id, v_add, 'Saiu na carga', v_autor, 'colocada(s) na carga');
  end if;

  if not exists (select 1 from public.estoque_carga_caixas where carga_id = c.id) then
    raise exception 'A carga ficaria sem caixas: use "Cancelar carga"';
  end if;
  update public.estoque_cargas set
    rota = case when p_rota is null then rota else nullif(trim(p_rota), '') end,
    observacao = case when p_observacao is null then observacao else nullif(trim(p_observacao), '') end
  where id = c.id;
end $$;
revoke all on function public.estoque_editar_carga(uuid, uuid, uuid[], uuid[], text, text) from public, anon;
grant execute on function public.estoque_editar_carga(uuid, uuid, uuid[], uuid[], text, text) to authenticated;

-- 7. Cancelar a carga (feita por engano): as caixas voltam para o estoque
create or replace function public.estoque_cancelar_carga(p_carga uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.estoque_cargas;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_autor text := (select nome from public.colaboradores where id = auth.uid());
  v_caixas uuid[];
begin
  if not public.pode('financeiro', 'editar') then raise exception 'Só o Financeiro mexe na carga' using errcode = '42501'; end if;
  if v_motivo is null then raise exception 'Informe o motivo do cancelamento'; end if;
  select * into c from public.estoque_cargas where id = p_carga for update;
  if c.id is null then raise exception 'Carga não encontrada'; end if;
  if c.status <> 'Em venda' then raise exception 'Só dá para cancelar uma carga em venda (esta está "%")', c.status; end if;
  v_caixas := array(select caixa_id from public.estoque_carga_caixas where carga_id = c.id);
  perform public.estoque_mov_caixas(c.id, v_caixas, 'Carga cancelada', v_autor, 'voltou para o estoque • motivo: ' || v_motivo);
  update public.producao_caixas set status = 'Em estoque' where id = any(v_caixas) and status = 'Em carga';
  update public.estoque_cargas set status = 'Cancelada', cancelada_em = current_date, cancelada_por = v_autor, motivo_cancelamento = v_motivo where id = c.id;
end $$;
revoke all on function public.estoque_cancelar_carga(uuid, text) from public, anon;
grant execute on function public.estoque_cancelar_carga(uuid, text) to authenticated;

-- 8. Acerto na volta, por escola: [{"lote": id, "albuns_vendidos": n, "albuns_voltaram": n,
--    "posteres_vendidos": n, "posteres_voltaram": n, "observacao": "..."}]. A diferença fica registrada.
create or replace function public.estoque_acertar_carga(p_carga uuid, p_escolas jsonb, p_observacao text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.estoque_cargas;
  e record;
  a jsonb;
  av int; ar int; pv int; pr int;
  v_obs text;
  v_texto text;
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

  for e in select k.lote_id, l.escola, sum(k.albuns)::int as albuns, sum(k.posteres)::int as posteres
           from public.estoque_carga_caixas k join public.producao_lotes l on l.id = k.lote_id
           where k.carga_id = c.id group by k.lote_id, l.escola order by l.escola
  loop
    select j.value into a from jsonb_array_elements(p_escolas) j where j.value ->> 'lote' = e.lote_id::text limit 1;
    if a is null then raise exception 'Informe o acerto de %', e.escola; end if;
    av := (a ->> 'albuns_vendidos')::int; ar := (a ->> 'albuns_voltaram')::int;
    pv := coalesce((a ->> 'posteres_vendidos')::int, 0); pr := coalesce((a ->> 'posteres_voltaram')::int, 0);
    if av is null or ar is null or least(av, ar, pv, pr) < 0 then raise exception '%: informe os álbuns vendidos e os que voltaram (0 ou mais)', e.escola; end if;
    if av + ar > e.albuns then raise exception '%: vendidos + voltaram (% álbuns) passa do que foi levado (%)', e.escola, av + ar, e.albuns; end if;
    if pv + pr > e.posteres then raise exception '%: vendidos + voltaram (% pôsteres/brindes) passa do que foi levado (%)', e.escola, pv + pr, e.posteres; end if;
    v_obs := nullif(trim(coalesce(a ->> 'observacao', '')), '');

    insert into public.estoque_carga_acertos (carga_id, lote_id, albuns_levados, posteres_levados, albuns_vendidos, albuns_voltaram,
                                              posteres_vendidos, posteres_voltaram, albuns_diferenca, posteres_diferenca, observacao)
    values (c.id, e.lote_id, e.albuns, e.posteres, av, ar, pv, pr, e.albuns - av - ar, e.posteres - pv - pr, v_obs);
    insert into public.estoque_movimentos (lote_id, carga_id, tipo, albuns, posteres, descricao, autor)
    select e.lote_id, c.id, m.tipo, m.alb, m.pos, m.txt, v_autor
    from (values ('Vendidos', av, pv, v_texto), ('Voltaram', ar, pr, v_texto || ' • aguardando o Rebolo')) m(tipo, alb, pos, txt)
    where m.alb + m.pos > 0;
    if e.albuns - av - ar > 0 or e.posteres - pv - pr > 0 then
      insert into public.estoque_movimentos (lote_id, carga_id, tipo, albuns, posteres, descricao, autor)
      values (e.lote_id, c.id, 'Diferença', e.albuns - av - ar, e.posteres - pv - pr, v_texto || coalesce(' • ' || v_obs, ''), v_autor);
    end if;
  end loop;

  update public.producao_caixas set status = 'Acertada' where id in (select caixa_id from public.estoque_carga_caixas where carga_id = c.id);
  update public.estoque_cargas set status = 'Encerrada', acerto_em = current_date, acerto_por = v_autor, acerto_obs = nullif(trim(coalesce(p_observacao, '')), '') where id = c.id;
end $$;
revoke all on function public.estoque_acertar_carga(uuid, jsonb, text) from public, anon;
grant execute on function public.estoque_acertar_carga(uuid, jsonb, text) to authenticated;

-- 9. Acerto errado: desfazer (a carga volta para "Em venda"). Não deixa se o que voltou já foi para o Rebolo.
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
  -- sem este acerto, o que já foi encaminhado ao Rebolo não pode passar do que voltou
  select string_agg(l.escola, ', ' order by l.escola) into v_bloq
  from public.estoque_carga_acertos a join public.producao_lotes l on l.id = a.lote_id
  where a.carga_id = c.id
    and ((select coalesce(sum(x.albuns_voltaram), 0) from public.estoque_carga_acertos x where x.lote_id = a.lote_id) - a.albuns_voltaram
           < (select coalesce(sum(r.albuns), 0) from public.estoque_envios_rebolo r where r.lote_id = a.lote_id)
      or (select coalesce(sum(x.posteres_voltaram), 0) from public.estoque_carga_acertos x where x.lote_id = a.lote_id) - a.posteres_voltaram
           < (select coalesce(sum(r.posteres), 0) from public.estoque_envios_rebolo r where r.lote_id = a.lote_id));
  if v_bloq is not null then
    raise exception 'O que voltou desta carga já foi encaminhado ao Rebolo (%): desfaça o envio ao Rebolo antes', v_bloq;
  end if;

  insert into public.estoque_movimentos (lote_id, carga_id, tipo, descricao, autor)
  select a.lote_id, c.id, 'Acerto desfeito', format('Carga %s • %s • motivo: %s', c.numero, c.vendedor, v_motivo), v_autor
  from public.estoque_carga_acertos a where a.carga_id = c.id;
  delete from public.estoque_carga_acertos where carga_id = c.id;
  update public.producao_caixas set status = 'Em carga' where id in (select caixa_id from public.estoque_carga_caixas where carga_id = c.id);
  update public.estoque_cargas set status = 'Em venda', acerto_em = null, acerto_por = null, acerto_obs = null where id = c.id;
end $$;
revoke all on function public.estoque_desfazer_acerto(uuid, text) from public, anon;
grant execute on function public.estoque_desfazer_acerto(uuid, text) to authenticated;

-- 10. Encaminhar ao Rebolo o que voltou (o Rebolo pega as caixas e tenta vender; não precisa confirmar)
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
  select coalesce(sum(albuns_voltaram), 0), coalesce(sum(posteres_voltaram), 0) into v_av, v_pv from public.estoque_carga_acertos where lote_id = l.id;
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

-- envio ao Rebolo registrado errado: desfazer (volta a ficar aguardando)
create or replace function public.estoque_desfazer_envio_rebolo(p_envio uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.estoque_envios_rebolo;
begin
  if not public.pode('financeiro', 'editar') then raise exception 'Só o Financeiro mexe nos envios ao Rebolo' using errcode = '42501'; end if;
  select * into r from public.estoque_envios_rebolo where id = p_envio for update;
  if r.id is null then raise exception 'Envio não encontrado'; end if;
  delete from public.estoque_envios_rebolo where id = r.id;
  insert into public.estoque_movimentos (lote_id, tipo, albuns, posteres, descricao, autor)
  values (r.lote_id, 'Envio ao Rebolo desfeito', r.albuns, r.posteres, format('Envio de %s desfeito: voltou a ficar aguardando o Rebolo', to_char(r.data, 'DD/MM/YYYY')),
          (select nome from public.colaboradores where id = auth.uid()));
end $$;
revoke all on function public.estoque_desfazer_envio_rebolo(uuid) from public, anon;
grant execute on function public.estoque_desfazer_envio_rebolo(uuid) to authenticated;

-- 11. Vendedor com carga não é excluído (mesma função do SQL 028, com as cargas)
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
      when exists (select 1 from public.estoque_cargas where vendedor_id = old.id) then 'cargas de álbuns'
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

-- Conferência: deve mostrar 5 | 7
select (select count(*) from pg_tables where schemaname = 'public'
          and tablename in ('estoque_cargas', 'estoque_carga_caixas', 'estoque_carga_acertos', 'estoque_envios_rebolo', 'estoque_movimentos')) as tabelas,
       (select count(*) from pg_proc where proname in ('estoque_criar_carga', 'estoque_editar_carga', 'estoque_cancelar_carga', 'estoque_acertar_carga',
                                                       'estoque_desfazer_acerto', 'estoque_enviar_rebolo', 'estoque_desfazer_envio_rebolo')) as funcoes;
