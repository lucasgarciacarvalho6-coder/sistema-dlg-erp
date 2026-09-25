-- =====================================================================
-- 007 — VEÍCULOS E EQUIPES DE VIAGEM  (pode rodar mais de uma vez)
--
--  • Cadastro de veículos da operação (Controle Operacional › Veículos)
--  • Cada visita da agenda recebe a equipe da viagem: nome da equipe, VEÍCULO,
--    motorista e de 1 a 4 fotógrafos
--  • Mesmas regras de acesso das demais tabelas do Operacional (004)
-- =====================================================================

create table if not exists public.veiculos (
  id uuid primary key default gen_random_uuid(),
  modelo text not null,               -- ex.: Fiat Doblò
  placa text not null,
  ano int,
  cor text,
  lugares int not null default 5 check (lugares between 1 and 30),
  status text not null default 'Disponível' check (status in ('Disponível', 'Em manutenção', 'Inativo')),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists veiculos_placa on public.veiculos (upper(replace(placa, '-', '')));

-- veículo da viagem em cada visita (o texto antigo "carro" continua como apelido)
alter table public.agenda_visitas add column if not exists veiculo_id uuid references public.veiculos(id) on delete set null;

-- no máximo 4 fotógrafos por visita
create or replace function public.validar_equipe_visita() returns trigger
language plpgsql as $$
begin
  if coalesce(array_length(array_remove(string_to_array(coalesce(new.fotografo_ids, ''), ','), ''), 1), 0) > 4 then
    raise exception 'A equipe pode ter no máximo 4 fotógrafos';
  end if;
  return new;
end $$;
drop trigger if exists trg_validar_equipe_visita on public.agenda_visitas;
create trigger trg_validar_equipe_visita before insert or update on public.agenda_visitas
  for each row execute function public.validar_equipe_visita();

-- acesso, auditoria, realtime e updated_at (igual às tabelas do 004)
do $$
declare t text := 'veiculos';
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', t || '_select', t);
  execute format('drop policy if exists %I on public.%I', t || '_insert', t);
  execute format('drop policy if exists %I on public.%I', t || '_update', t);
  execute format('drop policy if exists %I on public.%I', t || '_delete', t);
  execute format('create policy %I on public.%I for select to authenticated using (public.pode(''operacional'', ''visualizar''))', t || '_select', t);
  execute format('create policy %I on public.%I for insert to authenticated with check (public.pode(''operacional'', ''criar''))', t || '_insert', t);
  execute format('create policy %I on public.%I for update to authenticated using (public.pode(''operacional'', ''editar'')) with check (public.pode(''operacional'', ''editar''))', t || '_update', t);
  execute format('create policy %I on public.%I for delete to authenticated using (public.pode(''operacional'', ''excluir''))', t || '_delete', t);

  execute format('drop trigger if exists trg_auditoria on public.%I', t);
  execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.fn_auditoria()', t);
  execute format('drop trigger if exists trg_updated_at on public.%I', t);
  execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.tocar_updated_at()', t);

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
    execute format('alter publication supabase_realtime add table public.%I', t);
  end if;
end $$;

-- Conferência
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'agenda_visitas' and column_name = 'veiculo_id') as coluna_veiculo_na_visita,
       (select count(*) from public.veiculos) as veiculos_cadastrados;
