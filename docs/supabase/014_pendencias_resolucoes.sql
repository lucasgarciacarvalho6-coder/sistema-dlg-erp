-- =====================================================================
-- 014 — RESOLVER AS PENDÊNCIAS DO DIA (Operações › Controle operacional)  (pode rodar mais de uma vez)
--
-- As pendências são calculadas pelo sistema (contratos, agenda, fechamentos, vendedores, tarefas).
-- Aqui fica o que a coordenação fez com cada uma, com a observação:
--   • Resolvido     → sai da lista; se o problema ainda existir, volta no dia seguinte
--   • Sem sucesso   → sai de hoje e volta amanhã para tentar de novo
--   • Excluída      → sai de vez (aquele item não volta mais)
-- =====================================================================

create table if not exists public.pendencias_resolucoes (
  id uuid primary key default gen_random_uuid(),
  pendencia_id text not null,           -- ex.: vend-<id>, encerrar-<id>, tarefa-<id>
  area text,
  titulo text,
  acao text not null check (acao in ('Resolvido', 'Sem sucesso', 'Excluída')),
  observacao text,
  data date not null default current_date,
  volta_em date,                        -- vazio = não volta (excluída)
  autor text,
  autor_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists pendencias_resolucoes_pendencia on public.pendencias_resolucoes (pendencia_id, created_at desc);

do $$
declare t text := 'pendencias_resolucoes';
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', t || '_select', t);
  execute format('drop policy if exists %I on public.%I', t || '_insert', t);
  execute format('drop policy if exists %I on public.%I', t || '_delete', t);
  execute format('create policy %I on public.%I for select to authenticated using (public.pode(''operacional'', ''visualizar''))', t || '_select', t);
  execute format('create policy %I on public.%I for insert to authenticated with check (public.pode(''operacional'', ''criar''))', t || '_insert', t);
  execute format('create policy %I on public.%I for delete to authenticated using (public.pode(''operacional'', ''excluir''))', t || '_delete', t);
  execute format('drop trigger if exists trg_auditoria on public.%I', t);
  execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.fn_auditoria()', t);
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
    execute format('alter publication supabase_realtime add table public.%I', t);
  end if;
end $$;

-- Conferência: deve mostrar 1
select count(*) as tabela_resolucoes from pg_tables where schemaname = 'public' and tablename = 'pendencias_resolucoes';
