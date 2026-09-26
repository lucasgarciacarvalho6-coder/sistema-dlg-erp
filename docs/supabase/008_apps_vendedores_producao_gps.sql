-- =====================================================================
-- 008 — APPS (VENDEDOR EXTERNO E PRODUÇÃO), GPS E VENDAS DE BOOKS  (pode rodar mais de uma vez)
--
--  • Vendedores externos passam a ter login (setor 'externo'): vendedor de CONTRATO
--    (fecha escola) e vendedor de BOOKS (vende aos pais). Cada um vê só o que é dele.
--  • App do vendedor: envia foto do contrato da escola (vai para Operações › Em conferência),
--    documentos, vendas de books e books devolvidos.
--  • GPS: localização registrada enquanto o app está aberto (histórico de 90 dias).
--  • Vendas de books: canal (Interno/Externo) e forma de pagamento. Boleto gera parcelas
--    em aberto (Cobrança acompanha); PIX, dinheiro e cartão ficam registrados como recebidos.
--  • Produção: só lança "Books produzidos" pelo app; a agenda para de criar ordens de produção.
-- =====================================================================

-- 1. Novo setor dos vendedores externos
alter type public.setor add value if not exists 'externo';

-- 2. Vendedores externos: tipo, login e aceite do monitoramento por GPS
alter table public.pj_vendedores add column if not exists tipo text not null default 'Contrato';
alter table public.pj_vendedores add column if not exists email text;
alter table public.pj_vendedores add column if not exists usuario_id uuid references public.colaboradores(id) on delete set null;
alter table public.pj_vendedores add column if not exists gps_aceite_em timestamptz;
do $$ begin
  alter table public.pj_vendedores add constraint pj_vendedores_tipo_check check (tipo in ('Contrato', 'Books'));
exception when duplicate_object then null; end $$;
create unique index if not exists pj_vendedores_usuario on public.pj_vendedores (usuario_id) where usuario_id is not null;

-- id do cadastro PJ do vendedor logado (null para quem não é vendedor externo)
create or replace function public.meu_vendedor_externo() returns uuid
language sql stable security definer set search_path = public as $$
  select v.id from public.pj_vendedores v
  join public.colaboradores c on c.id = v.usuario_id
  where v.usuario_id = auth.uid() and c.status = 'ATIVO' and v.status <> 'Inativo'
  limit 1
$$;

-- o vendedor registra o aceite do monitoramento (LGPD) no próprio cadastro
create or replace function public.aceitar_monitoramento_gps() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.pj_vendedores set gps_aceite_em = coalesce(gps_aceite_em, now()) where id = public.meu_vendedor_externo();
end $$;
revoke all on function public.aceitar_monitoramento_gps() from public, anon;
grant execute on function public.aceitar_monitoramento_gps() to authenticated;

-- vendedores externos não veem os dados de outros vendedores externos
drop policy if exists colaboradores_select on public.colaboradores;
create policy colaboradores_select on public.colaboradores for select to authenticated using (
  id = auth.uid()
  or public.pode('usuarios', 'visualizar')
  or (setor = public.meu_setor() and public.meu_setor()::text <> 'externo')
);

drop policy if exists pj_vendedores_externo_select on public.pj_vendedores;
create policy pj_vendedores_externo_select on public.pj_vendedores for select to authenticated using (usuario_id = auth.uid());

-- 3. Contratos enviados pelo app (fotos das páginas)
alter table public.contratos_escola add column if not exists paginas jsonb not null default '[]'::jsonb; -- caminhos no bucket "contratos"
alter table public.contratos_escola add column if not exists origem text not null default 'Sistema';
drop policy if exists contratos_escola_externo_select on public.contratos_escola;
create policy contratos_escola_externo_select on public.contratos_escola for select to authenticated using (vendedor_id = public.meu_vendedor_externo());
drop policy if exists contratos_escola_externo_insert on public.contratos_escola;
create policy contratos_escola_externo_insert on public.contratos_escola for insert to authenticated
  with check (vendedor_id = public.meu_vendedor_externo() and status = 'Em conferência');

-- o vendedor acompanha as próprias escolas; o vendedor de books escolhe entre as escolas já fotografadas
drop policy if exists agenda_visitas_externo_select on public.agenda_visitas;
create policy agenda_visitas_externo_select on public.agenda_visitas for select to authenticated using (
  public.meu_vendedor_externo() is not null
  and (vendedor_id = public.meu_vendedor_externo() or status in ('Fotografada', 'Fechamento enviado'))
);

-- fotos enviadas pelo app ficam em contratos/externos/<id do usuário>/...
drop policy if exists contratos_externos_insert on storage.objects;
create policy contratos_externos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'contratos'
  and (storage.foldername(name))[1] = 'externos'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.meu_vendedor_externo() is not null
);

-- 4. Documentos enviados pelo app (contrato de venda em papel, comprovante, outros)
create table if not exists public.documentos_externos (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references public.pj_vendedores(id) on delete cascade,
  tipo text not null check (tipo in ('Contrato de venda', 'Comprovante', 'Outro')),
  escola text,
  descricao text,
  paginas jsonb not null default '[]'::jsonb,
  status text not null default 'Recebido' check (status in ('Recebido', 'Conferido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Books devolvidos pelo vendedor (não vendidos → vendas internas)
create table if not exists public.devolucoes_books (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references public.pj_vendedores(id) on delete cascade,
  escola text not null,
  quantidade int not null check (quantidade > 0),
  data date not null default current_date,
  observacao text,
  status text not null default 'Devolvido' check (status in ('Devolvido', 'Recebido na empresa')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['documentos_externos', 'devolucoes_books']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    -- Operações (e ADM/Gerência) veem e conferem; o vendedor vê e envia os próprios
    execute format('create policy %I on public.%I for select to authenticated using (public.pode(''operacional'', ''visualizar'') or public.pode(''cobranca'', ''visualizar'') or vendedor_id = public.meu_vendedor_externo())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (vendedor_id = public.meu_vendedor_externo() or public.pode(''operacional'', ''criar''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.pode(''operacional'', ''editar''))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.pode(''operacional'', ''excluir''))', t || '_delete', t);
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.fn_auditoria()', t);
    execute format('drop trigger if exists trg_updated_at on public.%I', t);
    execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.tocar_updated_at()', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 6. GPS: pontos por onde o vendedor passou (só enquanto o app está aberto)
--    Fora do Realtime de propósito (muitos pontos) e lido sob demanda pela aba GPS.
create table if not exists public.localizacoes (
  id bigint generated always as identity primary key,
  vendedor_id uuid not null references public.pj_vendedores(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  precisao real,
  origem text not null default 'periodico' check (origem in ('abertura', 'periodico', 'acao')),
  descricao text,
  created_at timestamptz not null default now()
);
create index if not exists localizacoes_vendedor_data on public.localizacoes (vendedor_id, created_at desc);
alter table public.localizacoes enable row level security;
drop policy if exists localizacoes_select on public.localizacoes;
create policy localizacoes_select on public.localizacoes for select to authenticated using (public.pode('operacional', 'visualizar'));

-- gravação só por esta função (o vendedor não lê a própria rota); limpa pontos com mais de 90 dias
create or replace function public.registrar_localizacao(p_lat double precision, p_lng double precision, p_precisao real, p_origem text default 'periodico', p_descricao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := public.meu_vendedor_externo();
begin
  if v is null then raise exception 'Somente vendedores externos registram localização' using errcode = '42501'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Coordenada inválida'; end if;
  insert into public.localizacoes (vendedor_id, lat, lng, precisao, origem, descricao)
  values (v, p_lat, p_lng, p_precisao, coalesce(p_origem, 'periodico'), left(p_descricao, 200));
  if random() < 0.02 then delete from public.localizacoes where vendedor_id = v and created_at < now() - interval '90 days'; end if;
end $$;
revoke all on function public.registrar_localizacao(double precision, double precision, real, text, text) from public, anon;
grant execute on function public.registrar_localizacao(double precision, double precision, real, text, text) to authenticated;

-- último ponto e quantidade de pontos de hoje de cada vendedor (cards da aba GPS)
drop view if exists public.vw_ultima_localizacao;
create view public.vw_ultima_localizacao with (security_invoker = true) as
select distinct on (l.vendedor_id) l.vendedor_id, l.lat, l.lng, l.precisao, l.origem, l.descricao, l.created_at,
  (select count(*) from public.localizacoes h where h.vendedor_id = l.vendedor_id and h.created_at >= date_trunc('day', now())) as pontos_hoje
from public.localizacoes l
order by l.vendedor_id, l.created_at desc;

-- 7. Vendas de books: canal, forma de pagamento e dados da família
alter table public.vendas_ebooks add column if not exists canal text not null default 'Interno';
alter table public.vendas_ebooks add column if not exists vendedor_externo_id uuid references public.pj_vendedores(id);
alter table public.vendas_ebooks add column if not exists forma_pagamento text not null default 'Boleto';
alter table public.vendas_ebooks add column if not exists cpf text;
alter table public.vendas_ebooks add column if not exists email text;
alter table public.vendas_ebooks add column if not exists endereco text;
alter table public.vendas_ebooks add column if not exists quantidade int not null default 1;
alter table public.vendas_ebooks add column if not exists primeiro_vencimento date;
alter table public.vendas_ebooks add column if not exists observacao text;
alter table public.vendas_ebooks alter column pacote set default 'Book';
do $$ begin
  alter table public.vendas_ebooks add constraint vendas_ebooks_canal_check check (canal in ('Interno', 'Externo'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.vendas_ebooks add constraint vendas_ebooks_forma_check check (forma_pagamento in ('PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Boleto'));
exception when duplicate_object then null; end $$;
alter table public.titulos add column if not exists forma_pagamento text;

-- o vendedor externo registra e vê as próprias vendas; o Financeiro e o Operacional acompanham todas
drop policy if exists vendas_ebooks_externo_insert on public.vendas_ebooks;
create policy vendas_ebooks_externo_insert on public.vendas_ebooks for insert to authenticated
  with check (canal = 'Externo' and vendedor_externo_id = public.meu_vendedor_externo());
drop policy if exists vendas_ebooks_externo_select on public.vendas_ebooks;
create policy vendas_ebooks_externo_select on public.vendas_ebooks for select to authenticated using (
  vendedor_externo_id = public.meu_vendedor_externo() or public.pode('financeiro', 'visualizar') or public.pode('operacional', 'visualizar')
);
drop policy if exists titulos_financeiro_select on public.titulos;
create policy titulos_financeiro_select on public.titulos for select to authenticated using (public.pode('financeiro', 'visualizar'));

create or replace function public.fluxo_venda_ebook() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  i int;
  n int := greatest(coalesce(new.parcelas, 1), 1);
  v_parcela numeric := round(new.valor / n, 2);
  v_origem text := case when new.canal = 'Externo' then 'Venda externa' else 'Venda interna' end;
begin
  -- meta da equipe interna (vendas externas não entram na meta da Cobrança)
  if new.canal = 'Interno' then
    perform public.lancar('cobranca', 'ebooks_vendidos', new.cobrador_id, coalesce(new.quantidade, 1), coalesce(new.pacote, 'Book') || ' — ' || new.responsavel, new.data);
  end if;

  if new.forma_pagamento = 'Boleto' then
    -- boleto: parcelas mensais em aberto (a Cobrança acompanha os atrasos)
    for i in 1..n loop
      insert into public.titulos (venda_id, cliente, aluno, escola, telefone, parcela, valor, vencimento, cobrador_id, forma_pagamento)
      values (new.id, new.responsavel, new.aluno, new.escola, new.telefone, i || '/' || n,
              case when i = n then new.valor - v_parcela * (n - 1) else v_parcela end,
              (coalesce(new.primeiro_vencimento, new.data) + make_interval(months => i - 1))::date, new.cobrador_id, 'Boleto');
    end loop;
  else
    -- PIX, dinheiro e cartão: recebido na venda (o sistema só registra; a cobrança é feita por fora)
    insert into public.titulos (venda_id, cliente, aluno, escola, telefone, parcela, valor, vencimento, status, data_pagamento, cobrador_id, forma_pagamento)
    values (new.id, new.responsavel, new.aluno, new.escola, new.telefone,
            case when new.forma_pagamento = 'Cartão de crédito' and n > 1 then n || 'x no cartão' else '1/1' end,
            new.valor, new.data, 'Pago', new.data, new.cobrador_id, new.forma_pagamento);
    if new.canal = 'Interno' then
      perform public.lancar('cobranca', 'valor_recebido', new.cobrador_id, new.valor, 'Recebido na venda — ' || new.responsavel, new.data);
    end if;
  end if;

  perform public.notificar(array['cobranca', 'financeiro', 'adm']::public.setor[], 'info', v_origem || ' de book',
    format('%s (%s) • %s • R$ %s', new.responsavel, new.escola, new.forma_pagamento, replace(to_char(new.valor, 'FM9999999990.00'), '.', ',')), '/financeiro/vendas-books');
  return new;
end $$;

-- baixa de título: só entra na meta de "valor recebido" quando há cobrador da equipe interna
create or replace function public.fluxo_baixa_titulo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Pago' and old.status is distinct from 'Pago' then
    new.data_pagamento := coalesce(new.data_pagamento, current_date);
    if new.cobrador_id is not null then
      perform public.lancar('cobranca', 'valor_recebido', new.cobrador_id, new.valor, 'Baixa ' || new.parcela || ' — ' || new.cliente, new.data_pagamento);
    end if;
  end if;
  return new;
end $$;

-- 8. Produção: só "Books produzidos" (lançado pelo app)
insert into public.indicadores (id, setor, label, unidade, meta_diaria_padrao, meta_mensal_padrao)
values ('books', 'producao', 'Books produzidos', 'qtd', 20, 440)
on conflict (id) do update set label = excluded.label;

-- o colaborador pode apagar o PRÓPRIO lançamento manual do dia (corrigir a quantidade)
drop policy if exists lancamentos_delete_proprio on public.lancamentos;
create policy lancamentos_delete_proprio on public.lancamentos for delete to authenticated
  using (colaborador_id = auth.uid() and origem = 'manual' and data = current_date);

-- a agenda não cria mais ordens de produção (a Produção só informa books feitos)
create or replace function public.fluxo_nova_visita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notificar(array['adm', 'gerencia']::public.setor[], 'info', 'Nova visita na agenda',
    format('%s (%s) em %s — %s fichas previstas.', new.escola, new.cidade, to_char(new.data, 'DD/MM/YYYY'), new.fichas_previstas), '/operacional/agenda');
  return new;
end $$;

create or replace function public.fluxo_encerrar_visita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Fotografada' and old.status = 'Agendada' then
    if coalesce(new.fichas_fotografadas, 0) <= 0 then
      raise exception 'Informe quantas fichas foram fotografadas';
    end if;
    perform public.lancar('operacional', 'fichas', public.responsavel_operacional(), new.fichas_fotografadas, 'Visita fotografada: ' || new.escola, new.data);
    insert into public.agenda_historico (visita_id, tipo, descricao, autor)
      values (new.id, 'Visita encerrada', new.fichas_fotografadas || ' fichas fotografadas.', (select nome from public.colaboradores where id = auth.uid()));
    perform public.notificar(array['adm', 'gerencia']::public.setor[], 'sucesso', 'Visita fotografada',
      format('%s: %s fichas. As fotos seguem para os editores.', new.escola, new.fichas_fotografadas), '/operacional/agenda');
  end if;
  return new;
end $$;

-- Conferência
select (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'setor' and e.enumlabel = 'externo') as setor_externo,
       (select count(*) from pg_tables where schemaname = 'public' and tablename in ('documentos_externos', 'devolucoes_books', 'localizacoes')) as tabelas_novas,
       (select count(*) from public.indicadores where id = 'books') as indicador_books;
