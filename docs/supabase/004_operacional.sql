-- =====================================================================
-- 004 — PROCESSO OPERACIONAL (pode rodar mais de uma vez sem problema)
--
--  Vendedor PJ fecha o contrato → Operações importa e confere (Contratos de Escola)
--  → diretora confirma → Agenda Fotográfica → histórico de fichas autorizadas
--  → visita fotografada (meta do Operacional + Produção liberada)
--  → Fechamento (escola diário · vendedor semanal · freelancers semanal)
--  → enviado ao Financeiro (contas a pagar com PIX) → pago → fechamento "Pago".
--
--  Também remove a comissão de 10% da escola sobre e-books (a escola passa a
--  receber só a bonificação por ficha, pelo fechamento).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CADASTROS PJ (sem login no sistema)
-- ---------------------------------------------------------------------
create table if not exists public.pj_vendedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  cidade text,
  uf text default 'PR',
  status text not null default 'Ativo' check (status in ('Ativo', 'Em negociação', 'Inativo')),
  valor_por_ficha numeric(10, 2) not null default 0 check (valor_por_ficha >= 0), -- R$ por aluno fotografado
  pix_nome text,
  pix_chave text,
  pix_banco text,
  ultimo_contato date,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.freelancers (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('Fotógrafo', 'Motorista')),
  nome text not null,
  cidade text,
  uf text default 'PR',
  telefone text,
  status text not null default 'Ativo' check (status in ('Ativo', 'Inativo')),
  nivel text, -- fotógrafo: Iniciante / Profissional
  diaria numeric(10, 2) not null default 0 check (diaria >= 0), -- alimentação (R$ 80) é somada no fechamento
  pix_nome text,
  pix_chave text,
  pix_banco text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Histórico de contatos com vendedores e freelancers
create table if not exists public.historico_contatos (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null,
  data date not null default current_date,
  assunto text not null,
  autor text,
  created_at timestamptz not null default now()
);
create index if not exists historico_contatos_pessoa on public.historico_contatos (pessoa_id, data desc);

-- ---------------------------------------------------------------------
-- 2. CONTRATOS DE ESCOLA, AGENDA E HISTÓRICO
-- ---------------------------------------------------------------------
create table if not exists public.contratos_escola (
  id uuid primary key default gen_random_uuid(),
  escola text not null,
  inep text,
  cidade text,
  uf text default 'PR',
  endereco text,
  telefone text,
  responsavel text,
  vendedor_id uuid references public.pj_vendedores(id),
  fichas_previstas int not null default 0 check (fichas_previstas >= 0),
  data_prevista date,
  bonificacao_por_ficha numeric(10, 2) not null default 0 check (bonificacao_por_ficha >= 0),
  pix_nome text,
  pix_chave text,
  pix_banco text,
  arquivo text, -- caminho no bucket "contratos"
  observacao text,
  status text not null default 'Em conferência' check (status in ('Em conferência', 'Na agenda', 'Cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agenda_visitas (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid references public.contratos_escola(id) on delete set null,
  escola text not null,
  cidade text,
  uf text,
  endereco text,
  telefone text,
  responsavel text,
  vendedor_id uuid references public.pj_vendedores(id),
  data date not null,
  fichas_previstas int not null default 0,
  fichas_confirmadas int not null default 0, -- autorizadas pelos pais
  fichas_fotografadas int not null default 0,
  equipe text,
  carro text,
  fotografo_ids text, -- ids dos freelancers fotógrafos, separados por vírgula
  motorista_id uuid references public.freelancers(id),
  status text not null default 'Agendada' check (status in ('Agendada', 'Fotografada', 'Fechamento enviado', 'Cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agenda_visitas_data on public.agenda_visitas (data);

create table if not exists public.agenda_historico (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null references public.agenda_visitas(id) on delete cascade,
  data date not null default current_date,
  tipo text not null,
  fichas_antes int,
  fichas_depois int,
  descricao text,
  autor text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. FECHAMENTOS E ROTAS
-- ---------------------------------------------------------------------
create table if not exists public.fechamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('escola', 'vendedor', 'freelancer')),
  ref_id uuid not null, -- visita (escola) · vendedor PJ · freelancer
  periodo text not null, -- data da visita (escola) ou segunda-feira da semana (vendedor/freelancer)
  referencia text not null,
  data date,
  quantidade numeric not null default 0, -- fichas bonificadas / fichas do vendedor / dias trabalhados
  valor_unitario numeric(10, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0,
  ajudantes jsonb not null default '[]'::jsonb,
  beneficiarios jsonb not null default '[]'::jsonb, -- [{categoria, nome, valor, pixChave, pixBanco, descricao}]
  total numeric(12, 2) not null default 0,
  pix_nome text,
  pix_chave text,
  pix_banco text,
  observacao text,
  status text not null default 'Rascunho' check (status in ('Rascunho', 'Enviado ao financeiro', 'Pago')),
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo, ref_id, periodo)
);

create table if not exists public.rotas (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid references public.pj_vendedores(id) on delete cascade,
  uf text,
  nome text,
  status text not null default 'Ativa' check (status in ('Ativa', 'Arquivada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rota_cidades (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references public.rotas(id) on delete cascade,
  cidade text not null,
  ordem int not null default 0,
  data_visita date,
  visitada text not null default 'Não' check (visitada in ('Sim', 'Não')),
  fechou text not null default '' check (fechou in ('', 'SIM', 'NÃO')),
  contratos int not null default 0,
  motivo text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contas a pagar recebem os dados PIX e a origem (fechamento)
alter table public.contas_pagar add column if not exists favorecido text;
alter table public.contas_pagar add column if not exists pix_chave text;
alter table public.contas_pagar add column if not exists pix_banco text;
alter table public.contas_pagar add column if not exists fechamento_id uuid references public.fechamentos(id) on delete set null;

-- Ordem de produção ligada ao contrato de escola do Operacional
alter table public.ordens_producao add column if not exists contrato_escola_id uuid references public.contratos_escola(id) on delete set null;

-- ---------------------------------------------------------------------
-- 4. updated_at, RLS (módulo "operacional"), auditoria e realtime
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['pj_vendedores', 'freelancers', 'contratos_escola', 'agenda_visitas', 'fechamentos', 'rotas', 'rota_cidades']
  loop
    execute format('drop trigger if exists trg_updated_at on public.%I', t);
    execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.tocar_updated_at()', t);
  end loop;

  foreach t in array array['pj_vendedores', 'freelancers', 'historico_contatos', 'contratos_escola', 'agenda_visitas', 'agenda_historico', 'fechamentos', 'rotas', 'rota_cidades']
  loop
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

    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. FLUXOS
-- ---------------------------------------------------------------------

-- 5.1 Diretora confirmou → contrato vai para a agenda (atômico, com checagem dos campos obrigatórios)
create or replace function public.confirmar_contrato_escola(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.contratos_escola;
  faltam text[] := '{}';
begin
  if not public.pode('operacional', 'editar') then
    raise exception 'Sem permissão para confirmar contratos' using errcode = '42501';
  end if;
  select * into c from public.contratos_escola where id = p_id for update;
  if not found then raise exception 'Contrato não encontrado'; end if;
  if c.status <> 'Em conferência' then raise exception 'Este contrato já foi enviado para a agenda'; end if;

  if coalesce(trim(c.escola), '') = '' then faltam := faltam || 'Nome da escola'; end if;
  if coalesce(trim(c.cidade), '') = '' then faltam := faltam || 'Cidade'; end if;
  if coalesce(trim(c.endereco), '') = '' then faltam := faltam || 'Endereço'; end if;
  if coalesce(trim(c.telefone), '') = '' then faltam := faltam || 'Telefone'; end if;
  if coalesce(trim(c.responsavel), '') = '' then faltam := faltam || 'Responsável (diretora)'; end if;
  if c.vendedor_id is null then faltam := faltam || 'Vendedor de contrato'; end if;
  if c.fichas_previstas <= 0 then faltam := faltam || 'Fichas previstas'; end if;
  if c.data_prevista is null then faltam := faltam || 'Data agendada'; end if;
  if c.bonificacao_por_ficha <= 0 then faltam := faltam || 'Bonificação por ficha'; end if;
  if array_length(faltam, 1) > 0 then
    raise exception 'Complete antes de enviar para a agenda: %', array_to_string(faltam, ', ');
  end if;

  update public.contratos_escola set status = 'Na agenda' where id = p_id;
  insert into public.agenda_visitas (contrato_id, escola, cidade, uf, endereco, telefone, responsavel, vendedor_id, data, fichas_previstas, status)
  values (c.id, c.escola, c.cidade, c.uf, c.endereco, c.telefone, c.responsavel, c.vendedor_id, c.data_prevista, c.fichas_previstas, 'Agendada');
end $$;
revoke all on function public.confirmar_contrato_escola(uuid) from public, anon;
grant execute on function public.confirmar_contrato_escola(uuid) to authenticated;

-- 5.2 Nova visita → ordem de produção "Aguardando fotos" + aviso
create or replace function public.fluxo_nova_visita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ordens_producao (escola, contrato_escola_id, alunos, etapa, prazo)
  values (new.escola, new.contrato_id, new.fichas_previstas, 'Aguardando fotos', new.data + 30);
  perform public.notificar(array['producao', 'adm', 'gerencia']::public.setor[], 'info', 'Nova visita na agenda',
    format('%s (%s) em %s — %s fichas previstas.', new.escola, new.cidade, to_char(new.data, 'DD/MM/YYYY'), new.fichas_previstas), '/operacional/agenda');
  return new;
end $$;
drop trigger if exists trg_fluxo_nova_visita on public.agenda_visitas;
create trigger trg_fluxo_nova_visita after insert on public.agenda_visitas for each row execute function public.fluxo_nova_visita();

-- 5.3 Histórico com fichas → atualiza as fichas autorizadas da visita
create or replace function public.fluxo_historico_visita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.fichas_depois is not null then
    update public.agenda_visitas set fichas_confirmadas = new.fichas_depois where id = new.visita_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_fluxo_historico_visita on public.agenda_historico;
create trigger trg_fluxo_historico_visita after insert on public.agenda_historico for each row execute function public.fluxo_historico_visita();

-- 5.4 Visita fotografada → meta do Operacional + fotos para a Produção + histórico
create or replace function public.fluxo_encerrar_visita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Fotografada' and old.status = 'Agendada' then
    if coalesce(new.fichas_fotografadas, 0) <= 0 then
      raise exception 'Informe quantas fichas foram fotografadas';
    end if;
    perform public.lancar('operacional', 'fichas', null, new.fichas_fotografadas, 'Visita fotografada: ' || new.escola, new.data);
    update public.ordens_producao set fotos = new.fichas_fotografadas, etapa = 'Tratamento'
      where contrato_escola_id = new.contrato_id and etapa = 'Aguardando fotos';
    insert into public.agenda_historico (visita_id, tipo, descricao, autor)
      values (new.id, 'Visita encerrada', new.fichas_fotografadas || ' fichas fotografadas.', (select nome from public.colaboradores where id = auth.uid()));
    perform public.notificar(array['producao', 'adm']::public.setor[], 'sucesso', 'Visita fotografada',
      format('%s: %s fichas. As fotos seguem para tratamento na Produção.', new.escola, new.fichas_fotografadas), '/producao/ordens');
  end if;
  return new;
end $$;
drop trigger if exists trg_fluxo_encerrar_visita on public.agenda_visitas;
create trigger trg_fluxo_encerrar_visita before update of status on public.agenda_visitas for each row execute function public.fluxo_encerrar_visita();

-- 5.5 Fechamento enviado → uma conta a pagar (PIX) por beneficiário no Financeiro
create or replace function public.fluxo_enviar_fechamento() returns trigger
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if new.status = 'Enviado ao financeiro' and old.status = 'Rascunho' then
    if jsonb_array_length(coalesce(new.beneficiarios, '[]'::jsonb)) = 0 then
      raise exception 'Nada a pagar neste fechamento';
    end if;
    for b in select * from jsonb_to_recordset(new.beneficiarios) as x(categoria text, nome text, valor numeric, "pixChave" text, "pixBanco" text, descricao text)
    loop
      if coalesce(trim(b."pixChave"), '') = '' then
        raise exception 'Informe a chave PIX de: %', b.nome;
      end if;
      insert into public.contas_pagar (descricao, fornecedor, favorecido, categoria, valor, vencimento, status, pix_chave, pix_banco, fechamento_id)
      values (b.descricao, b.nome, b.nome, b.categoria, b.valor, current_date, 'A pagar', b."pixChave", b."pixBanco", new.id);
    end loop;
    new.enviado_em := now();
    if new.tipo = 'escola' then
      update public.agenda_visitas set status = 'Fechamento enviado' where id = new.ref_id;
    end if;
    perform public.notificar(array['financeiro', 'adm']::public.setor[], 'info', 'Fechamento operacional recebido',
      format('%s: %s pagamento(s) PIX para realizar.', new.referencia, jsonb_array_length(new.beneficiarios)), '/financeiro/pagamentos');
  elsif new.status = 'Pago' and old.status is distinct from 'Pago' then
    if exists (select 1 from public.contas_pagar where fechamento_id = new.id and status <> 'Pago') then
      raise exception 'Ainda há pagamentos pendentes neste fechamento';
    end if;
  elsif old.status <> 'Rascunho' and new.status = old.status then
    raise exception 'Fechamento já enviado ao financeiro não pode ser alterado';
  end if;
  return new;
end $$;
drop trigger if exists trg_fluxo_enviar_fechamento on public.fechamentos;
create trigger trg_fluxo_enviar_fechamento before update on public.fechamentos for each row execute function public.fluxo_enviar_fechamento();

-- 5.6 Todas as contas do fechamento pagas → fechamento "Pago" + aviso ao Operacional
create or replace function public.fluxo_conta_fechamento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Pago' and old.status is distinct from 'Pago' and new.fechamento_id is not null
     and not exists (select 1 from public.contas_pagar where fechamento_id = new.fechamento_id and status <> 'Pago') then
    update public.fechamentos set status = 'Pago' where id = new.fechamento_id and status = 'Enviado ao financeiro';
    perform public.notificar(array['operacional', 'adm']::public.setor[], 'sucesso', 'Fechamento pago',
      (select referencia from public.fechamentos where id = new.fechamento_id) || ': todos os pagamentos foram feitos pelo Financeiro.', '/operacional/fechamento');
  end if;
  return new;
end $$;
drop trigger if exists trg_fluxo_conta_fechamento on public.contas_pagar;
create trigger trg_fluxo_conta_fechamento after update of status on public.contas_pagar for each row execute function public.fluxo_conta_fechamento();

-- 5.7 Venda de e-book: SEM comissão de 10% para a escola (ela recebe a bonificação por ficha)
create or replace function public.fluxo_venda_ebook() returns trigger
language plpgsql security definer set search_path = public as $$
declare i int;
begin
  perform public.lancar('cobranca', 'ebooks_vendidos', new.cobrador_id, 1, new.pacote || ' — ' || new.responsavel, new.data);
  for i in 1..new.parcelas loop
    insert into public.titulos (venda_id, cliente, aluno, escola, telefone, parcela, valor, vencimento, cobrador_id)
    values (new.id, new.responsavel, new.aluno, new.escola, new.telefone, i || '/' || new.parcelas,
            round(new.valor / new.parcelas, 2), new.data + (30 * (i - 1)), new.cobrador_id);
  end loop;
  perform public.notificar(array['cobranca', 'adm']::public.setor[], 'info', 'Venda de e-book registrada',
    format('%s para %s (%s). %s parcela(s) em Contas a Receber.', new.pacote, new.responsavel, new.escola, new.parcelas), '/cobranca/titulos');
  return new;
end $$;

-- Conferência: deve listar as 9 tabelas novas
select tablename from pg_tables where schemaname = 'public'
  and tablename in ('pj_vendedores', 'freelancers', 'historico_contatos', 'contratos_escola', 'agenda_visitas', 'agenda_historico', 'fechamentos', 'rotas', 'rota_cidades')
order by tablename;
