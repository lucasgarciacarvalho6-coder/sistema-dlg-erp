-- =====================================================================
-- 034 — REBOLO: NÚMERO DO PACOTE POR VENDEDORA  (rodar DEPOIS do 033; pode rodar mais de uma vez)
--
--  Antes: uma sequência só para todas (P266, P267... intercalando as vendedoras).
--  Agora (pedido de 06/10/2026): cada vendedora tem a SUA sequência e continua de onde parou
--  (parou no 278 → próximo 279; outra parou no 80 → próximo 81). O número PODE repetir entre
--  vendedoras: a etiqueta sai com o nome dela e o material fica separado por caixa.
--   • o próximo número de cada uma fica em rebolo_numeracao (a supervisão ajusta em Rebolo › Pacotes);
--   • sem número informado: continua do último pacote dela; vendedora nova começa no P1;
--   • número que ela já usou é pulado; os pacotes que já existem ficam com o número que têm.
--  Depois deste, rode o arquivo com o próximo número de cada vendedora (importacao/).
-- =====================================================================

-- 1. O número só não pode repetir na MESMA vendedora (sai a sequência única para todas)
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.rebolo_pacotes'::regclass and con.contype = 'u'
      and con.conkey = array[(select attnum from pg_attribute where attrelid = 'public.rebolo_pacotes'::regclass and attname = 'numero')]
  loop
    execute format('alter table public.rebolo_pacotes drop constraint %I', c);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'rebolo_pacotes_vendedora_numero_key') then
    alter table public.rebolo_pacotes add constraint rebolo_pacotes_vendedora_numero_key unique (vendedora_id, numero);
  end if;
end $$;
alter table public.rebolo_pacotes alter column numero drop default;

-- 2. Próximo número de cada vendedora
create table if not exists public.rebolo_numeracao (
  id uuid primary key default gen_random_uuid(),
  vendedora_id uuid not null unique references public.colaboradores(id) on delete cascade,
  proximo int not null check (proximo >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rebolo_numeracao enable row level security;
drop policy if exists rebolo_numeracao_select on public.rebolo_numeracao;
create policy rebolo_numeracao_select on public.rebolo_numeracao for select to authenticated
  using (public.pode('rebolo', 'visualizar'));
-- (sem insert/update direto: muda só pelo pacote novo e pela função da supervisão)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rebolo_numeracao') then
    alter publication supabase_realtime add table public.rebolo_numeracao;
  end if;
end $$;

-- 3. Pacote novo: recebe o próximo número DA VENDEDORA (dona do pacote) e o contador dela anda 1
create or replace function public.rebolo_pacote_numero() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform pg_advisory_xact_lock(hashtext('rebolo_pacote:' || new.vendedora_id::text)); -- dois pacotes ao mesmo tempo não pegam o mesmo número
  select proximo into v_n from public.rebolo_numeracao where vendedora_id = new.vendedora_id;
  if v_n is null then
    select coalesce(max(numero), 0) + 1 into v_n from public.rebolo_pacotes where vendedora_id = new.vendedora_id;
  end if;
  while exists (select 1 from public.rebolo_pacotes where vendedora_id = new.vendedora_id and numero = v_n) loop
    v_n := v_n + 1; -- número que ela já usou
  end loop;
  new.numero := v_n;
  insert into public.rebolo_numeracao (vendedora_id, proximo) values (new.vendedora_id, v_n + 1)
  on conflict (vendedora_id) do update set proximo = excluded.proximo, updated_at = now();
  return new;
end $$;
drop trigger if exists trg_rebolo_pacote_numero on public.rebolo_pacotes;
create trigger trg_rebolo_pacote_numero before insert on public.rebolo_pacotes for each row execute function public.rebolo_pacote_numero();

-- 4. A supervisão (ADM, Gerência ou supervisora do rebolo) ajusta o próximo número de uma vendedora
create or replace function public.definir_proximo_pacote_rebolo(p_vendedora uuid, p_proximo int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_supervisao_rebolo() then raise exception 'Só a supervisão ajusta a numeração dos pacotes.' using errcode = '42501'; end if;
  if p_proximo is null or p_proximo < 1 then raise exception 'Informe um número a partir de 1.'; end if;
  if not exists (select 1 from public.colaboradores where id = p_vendedora) then raise exception 'Vendedora não encontrada.'; end if;
  if exists (select 1 from public.rebolo_pacotes where vendedora_id = p_vendedora and numero = p_proximo) then
    raise exception 'Esta vendedora já tem o pacote P%. Escolha outro número.', p_proximo;
  end if;
  insert into public.rebolo_numeracao (vendedora_id, proximo) values (p_vendedora, p_proximo)
  on conflict (vendedora_id) do update set proximo = excluded.proximo, updated_at = now();
end $$;
revoke all on function public.definir_proximo_pacote_rebolo(uuid, int) from public, anon;
grant execute on function public.definir_proximo_pacote_rebolo(uuid, int) to authenticated;

-- Conferência: deve mostrar 1 | 1 | 0
select (select count(*) from pg_trigger where tgname = 'trg_rebolo_pacote_numero') as numero_por_vendedora,
       (select count(*) from pg_constraint where conname = 'rebolo_pacotes_vendedora_numero_key') as unico_por_vendedora,
       (select count(*) from pg_constraint con where con.conrelid = 'public.rebolo_pacotes'::regclass and con.contype = 'u'
          and con.conkey = array[(select attnum from pg_attribute where attrelid = 'public.rebolo_pacotes'::regclass and attname = 'numero')]) as unico_geral;
