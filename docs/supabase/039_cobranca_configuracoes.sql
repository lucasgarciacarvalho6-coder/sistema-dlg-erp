-- =====================================================================
-- 039 — Cobrança › Configurações (Parte 2, etapa 2.1) (07/10/2026)
--
-- 1. Regras de negociação: uma linha por regra (juros por dia, multa, entrada sugerida, parcela mínima,
--    desconto máximo sem aprovação, 1º boleto, quem pode renegociar/ir ao SPC, idade da Terceirizada,
--    metas e a tabela de comissão). Só ADM e Gerência mudam; cada mudança fica no histórico.
-- 2. Escritórios externos (terceirizadas e advogados).
-- 3. Categorias das cobranças: grupo (Cobrança DLG / Registro SPC / Terceirizada / Advogado / Fundo perdido /
--    Fora da cobrança), se conta na inadimplência, se pode ir ao SPC, o escritório e os nomes antigos
--    (de-para da migração: os nomes do sistema antigo que viram esta categoria).
--
-- Cobrança e Financeiro veem; ADM e Gerência alteram; quem é de fora não acessa.
-- As categorias e os escritórios reais entram depois pelo arquivo de importação (fora do Git).
-- Precisa do SQL 036 (texto_busca). Pode rodar mais de uma vez. Rodar no SQL Editor do Supabase.
-- =====================================================================

-- 1. Regras de negociação
create table if not exists public.cobranca_regras (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  valor numeric(14, 4) not null check (valor >= 0),
  atualizado_por uuid references public.colaboradores(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.cobranca_regras_historico (
  id uuid primary key default gen_random_uuid(),
  chave text not null,
  valor_antigo numeric(14, 4),
  valor_novo numeric(14, 4) not null,
  alterado_por uuid references public.colaboradores(id) on delete set null,
  alterado_por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists cobranca_regras_historico_data_idx on public.cobranca_regras_historico (created_at desc);

-- valores iniciais (não sobrescreve o que já foi mudado)
insert into public.cobranca_regras (chave, valor) values
  ('juros_dia', 0.17), ('multa_padrao', 4), ('entrada_sugerida', 200), ('parcela_minima', 100), ('desconto_maximo', 10),
  ('primeiro_boleto_dia', 10), ('primeiro_boleto_corte', 20), ('reneg_min_boletos', 2), ('reneg_min_dias', 61),
  ('terceirizada_dias', 730), ('meta_mensal', 40000), ('meta_spc_dia', 50), ('ciclo_spc_inicio', 12),
  ('comissao_nivel1_ate', 29999.99), ('comissao_nivel2_ate', 35000),
  ('comissao_n1_f1', 1.00), ('comissao_n1_f2', 1.50), ('comissao_n1_f3', 2.00), ('comissao_n1_f4', 2.50),
  ('comissao_n2_f1', 2.00), ('comissao_n2_f2', 2.50), ('comissao_n2_f3', 3.00), ('comissao_n2_f4', 3.50),
  ('comissao_n3_f1', 2.25), ('comissao_n3_f2', 2.75), ('comissao_n3_f3', 3.25), ('comissao_n3_f4', 3.75)
on conflict (chave) do nothing;

-- conferência de cada regra + quem mudou
create or replace function public.cobranca_regra_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_outro numeric;
begin
  if new.chave in ('primeiro_boleto_dia', 'primeiro_boleto_corte', 'ciclo_spc_inicio') and (new.valor < 1 or new.valor > 28 or new.valor <> trunc(new.valor)) then
    raise exception 'O dia precisa ser um número inteiro de 1 a 28.';
  end if;
  if (new.chave = 'desconto_maximo' or new.chave like 'comissao\_n_\_f_') and new.valor > 100 then
    raise exception 'O percentual precisa ficar entre 0 e 100.';
  end if;
  if new.chave in ('reneg_min_boletos', 'reneg_min_dias', 'terceirizada_dias', 'meta_spc_dia') and new.valor <> trunc(new.valor) then
    raise exception 'Esta regra precisa ser um número inteiro.';
  end if;
  if new.chave = 'reneg_min_boletos' and new.valor < 1 then raise exception 'É preciso pelo menos 1 boleto vencido.'; end if;
  -- salvando várias de uma vez (salvar_regras_cobranca), os níveis da comissão são conferidos no fim, juntos
  if coalesce(current_setting('dlg.regras_lote', true), '') = '1' then null;
  elsif new.chave = 'comissao_nivel2_ate' then
    select valor into v_outro from public.cobranca_regras where chave = 'comissao_nivel1_ate';
    if v_outro is not null and new.valor <= v_outro then raise exception 'O nível 2 precisa terminar acima do nível 1.'; end if;
  elsif new.chave = 'comissao_nivel1_ate' then
    select valor into v_outro from public.cobranca_regras where chave = 'comissao_nivel2_ate';
    if v_outro is not null and new.valor >= v_outro then raise exception 'O nível 1 precisa terminar abaixo do nível 2.'; end if;
  end if;
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_cobranca_regra_antes on public.cobranca_regras;
create trigger trg_cobranca_regra_antes before insert or update on public.cobranca_regras for each row execute function public.cobranca_regra_antes();
revoke all on function public.cobranca_regra_antes() from public, anon, authenticated;

create or replace function public.cobranca_regra_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.valor = old.valor then return new; end if;
  insert into public.cobranca_regras_historico (chave, valor_antigo, valor_novo, alterado_por, alterado_por_nome)
  values (new.chave, case when tg_op = 'UPDATE' then old.valor end, new.valor, auth.uid(),
          (select nome from public.colaboradores where id = auth.uid()));
  return new;
end $$;
drop trigger if exists trg_cobranca_regra_historico on public.cobranca_regras;
create trigger trg_cobranca_regra_historico after update on public.cobranca_regras for each row execute function public.cobranca_regra_historico();
revoke all on function public.cobranca_regra_historico() from public, anon, authenticated;

-- salvar várias regras de uma vez (tudo ou nada): {"juros_dia": 0.2, "desconto_maximo": 12, ...}
create or replace function public.salvar_regras_cobranca(p_valores jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v jsonb;
begin
  if not public.pode('cadastros', 'editar') then raise exception 'Só ADM e Gerência mudam as regras da cobrança.' using errcode = '42501'; end if;
  if jsonb_typeof(p_valores) <> 'object' then raise exception 'Valores inválidos.'; end if;
  perform set_config('dlg.regras_lote', '1', true);
  for k, v in select key, value from jsonb_each(p_valores) order by key loop
    if jsonb_typeof(v) <> 'number' then raise exception 'O valor de % precisa ser um número.', k; end if;
    if not exists (select 1 from public.cobranca_regras where chave = k) then raise exception 'Regra desconhecida: %', k; end if;
    update public.cobranca_regras set valor = (v #>> '{}')::numeric where chave = k;
  end loop;
  perform set_config('dlg.regras_lote', '', true);
  if (select valor from public.cobranca_regras where chave = 'comissao_nivel2_ate') <= (select valor from public.cobranca_regras where chave = 'comissao_nivel1_ate') then
    raise exception 'O nível 2 da comissão precisa terminar acima do nível 1.';
  end if;
end $$;
revoke all on function public.salvar_regras_cobranca(jsonb) from public, anon;
grant execute on function public.salvar_regras_cobranca(jsonb) to authenticated;

-- valor de uma regra (para as contas do banco nas próximas etapas)
create or replace function public.regra_cobranca(p_chave text) returns numeric
language sql stable security definer set search_path = public as $$
  select valor from public.cobranca_regras where chave = p_chave
$$;
revoke all on function public.regra_cobranca(text) from public, anon;
grant execute on function public.regra_cobranca(text) to authenticated;

-- 2. Escritórios externos
create table if not exists public.cobranca_escritorios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  tipo text not null check (tipo in ('Terceirizada', 'Advogado')),
  contato text,
  telefone text,
  email text,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists cobranca_escritorios_nome_idx on public.cobranca_escritorios (public.texto_busca(nome));

-- 3. Categorias das cobranças
create table if not exists public.cobranca_categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  grupo text not null check (grupo in ('Cobrança DLG', 'Registro SPC', 'Terceirizada', 'Advogado', 'Fundo perdido', 'Fora da cobrança')),
  conta_inadimplencia boolean not null default true,
  pode_spc boolean not null default true,
  escritorio_id uuid references public.cobranca_escritorios(id) on delete set null,
  nomes_antigos text[] not null default '{}',
  ativa boolean not null default true,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists cobranca_categorias_nome_idx on public.cobranca_categorias (public.texto_busca(nome));

-- arruma os nomes e não deixa o mesmo nome antigo em duas categorias (o de-para da migração precisa ser único)
create or replace function public.cobranca_categoria_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_repetido text;
begin
  new.nome := btrim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  -- sem espaço sobrando e sem repetir o mesmo nome escrito de outro jeito (maiúscula/acento)
  new.nomes_antigos := coalesce((
    select array_agg(n order by n) from (
      select distinct on (public.texto_busca(n)) n
      from (select btrim(regexp_replace(x, '\s+', ' ', 'g')) n from unnest(new.nomes_antigos) x) t
      where n <> ''
      order by public.texto_busca(n), n
    ) d), '{}');
  select b into v_repetido
  from public.cobranca_categorias c, unnest(c.nomes_antigos) a, unnest(new.nomes_antigos) b
  where c.id <> new.id and public.texto_busca(a) = public.texto_busca(b)
  limit 1;
  if v_repetido is not null then raise exception 'O nome antigo "%" já está em outra categoria.', v_repetido; end if;
  if new.escritorio_id is not null and new.grupo not in ('Terceirizada', 'Advogado') then
    raise exception 'Só categorias de Terceirizada ou Advogado têm escritório.';
  end if;
  return new;
end $$;
drop trigger if exists trg_cobranca_categoria_antes on public.cobranca_categorias;
create trigger trg_cobranca_categoria_antes before insert or update on public.cobranca_categorias for each row execute function public.cobranca_categoria_antes();
revoke all on function public.cobranca_categoria_antes() from public, anon, authenticated;

-- 4. Permissões: Cobrança e Financeiro veem; ADM e Gerência alteram; quem é de fora não acessa
do $$
declare t text;
begin
  foreach t in array array['cobranca_regras', 'cobranca_regras_historico', 'cobranca_escritorios', 'cobranca_categorias'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.pode(''cobranca'', ''visualizar'')) or (select public.pode(''financeiro'', ''visualizar'')))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    if t <> 'cobranca_regras_historico' then
      execute format('create policy %I on public.%I for insert to authenticated with check ((select public.pode(''cadastros'', ''editar'')))', t || '_insert', t);
      execute format('create policy %I on public.%I for update to authenticated using ((select public.pode(''cadastros'', ''editar'')))', t || '_update', t);
      if t <> 'cobranca_regras' then
        execute format('create policy %I on public.%I for delete to authenticated using ((select public.pode(''cadastros'', ''editar'')))', t || '_delete', t);
      end if;
      execute format('drop trigger if exists trg_auditoria on public.%I', t);
      execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.fn_auditoria()', t);
      if t <> 'cobranca_regras' then
        execute format('drop trigger if exists trg_updated_at on public.%I', t);
        execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.tocar_updated_at()', t);
      end if;
    end if;
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Conferência (esperado: 27 | true | false)
select
  (select count(*) from public.cobranca_regras) as regras,
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.cobranca_regras'::regclass, 'public.cobranca_regras_historico'::regclass,
     'public.cobranca_escritorios'::regclass, 'public.cobranca_categorias'::regclass)) as com_rls,
  has_table_privilege('anon', 'public.cobranca_categorias', 'select') as de_fora_le;
