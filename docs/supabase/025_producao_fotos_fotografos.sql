-- =====================================================================
-- 025 — PRODUÇÃO: QUANTIDADE DE FOTOS DE CADA FOTÓGRAFO NA ESCOLA  (rodar DEPOIS do 024; pode rodar mais de uma vez)
--
--  • Na escola (janela da Produção), a Produção escolhe o fotógrafo e lança quantas fotos ele tirou.
--    Um lançamento por fotógrafo em cada escola: lançar de novo o mesmo fotógrafo troca a quantidade.
--  • A lista para escolher mostra primeiro os fotógrafos da equipe daquela visita (Operações) e depois os outros.
--  • A Produção não enxerga o cadastro dos fotógrafos (telefone, PIX, diária): a função abaixo devolve só o nome,
--    e o nome fica guardado junto com as fotos.
-- =====================================================================

create table if not exists public.producao_fotos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.producao_lotes(id) on delete cascade,
  fotografo_id uuid references public.freelancers(id) on delete set null,
  fotografo_nome text not null,
  quantidade int not null check (quantidade > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists producao_fotos_fotografo on public.producao_fotos (lote_id, fotografo_id);

do $$
declare t text := 'producao_fotos';
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', t || '_select', t);
  execute format('drop policy if exists %I on public.%I', t || '_delete', t);
  execute format('drop trigger if exists trg_auditoria on public.%I', t);
  execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.fn_auditoria()', t);
  execute format('drop trigger if exists trg_updated_at on public.%I', t);
  execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.tocar_updated_at()', t);
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
    execute format('alter publication supabase_realtime add table public.%I', t);
  end if;
end $$;
-- a Produção vê e apaga (lançou errado); lançar e trocar a quantidade só pela função abaixo
create policy producao_fotos_select on public.producao_fotos for select to authenticated using (public.pode('edicao', 'visualizar'));
create policy producao_fotos_delete on public.producao_fotos for delete to authenticated using (public.pode('edicao', 'editar'));

-- Fotógrafos para escolher na escola: só id e nome. Os da equipe da visita vêm primeiro (na_equipe);
-- inativos só aparecem se estavam na equipe daquela visita.
create or replace function public.producao_fotografos(p_lote uuid) returns table (id uuid, nome text, na_equipe boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_equipe text[];
begin
  if not public.pode('edicao', 'visualizar') then raise exception 'Sem permissão para ver os fotógrafos.'; end if;
  select array_remove(string_to_array(coalesce(v.fotografo_ids, ''), ','), '') into v_equipe
  from public.producao_lotes l join public.agenda_visitas v on v.id = l.visita_id
  where l.id = p_lote;
  v_equipe := coalesce(v_equipe, array[]::text[]);
  return query
    select f.id, f.nome, (f.id::text = any(v_equipe)) as na_equipe
    from public.freelancers f
    where f.tipo = 'Fotógrafo' and (f.status = 'Ativo' or f.id::text = any(v_equipe))
    order by (f.id::text = any(v_equipe)) desc, f.nome;
end $$;
revoke all on function public.producao_fotografos(uuid) from public, anon;
grant execute on function public.producao_fotografos(uuid) to authenticated;

-- Lança (ou troca) a quantidade de fotos de um fotógrafo na escola
create or replace function public.producao_salvar_fotos(p_lote uuid, p_fotografo uuid, p_quantidade int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
  v_id uuid;
begin
  if not public.pode('edicao', 'editar') then raise exception 'Sem permissão para lançar as fotos.'; end if;
  if not exists (select 1 from public.producao_lotes where id = p_lote) then raise exception 'Escola não encontrada na Produção.'; end if;
  select f.nome into v_nome from public.freelancers f where f.id = p_fotografo and f.tipo = 'Fotógrafo';
  if v_nome is null then raise exception 'Escolha o fotógrafo.'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Informe a quantidade de fotos (maior que zero).'; end if;
  insert into public.producao_fotos (lote_id, fotografo_id, fotografo_nome, quantidade)
  values (p_lote, p_fotografo, v_nome, p_quantidade)
  on conflict (lote_id, fotografo_id) do update set quantidade = excluded.quantidade, fotografo_nome = excluded.fotografo_nome
  returning producao_fotos.id into v_id;
  return v_id;
end $$;
revoke all on function public.producao_salvar_fotos(uuid, uuid, int) from public, anon;
grant execute on function public.producao_salvar_fotos(uuid, uuid, int) to authenticated;

-- Conferência: tabela criada | funções criadas (2)
select (select count(*) from pg_tables where schemaname = 'public' and tablename = 'producao_fotos') as tabela,
       (select count(*) from pg_proc where proname in ('producao_fotografos', 'producao_salvar_fotos')) as funcoes;
