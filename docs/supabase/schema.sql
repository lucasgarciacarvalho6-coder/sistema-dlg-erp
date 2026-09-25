-- =====================================================================
-- DLG PHOTOS ERP — SCHEMA SUPABASE (PostgreSQL)
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- Espelha o núcleo mockado do front-end (src/lib/erp/*).
--
-- Conteúdo:
--  0. Configuração (fuso horário, extensões)
--  1. Tipos (enums)
--  2. Tabelas (núcleo, cadastros, setores, sistema)
--  3. Funções de segurança (pode(), meu_perfil(), meu_setor())
--  4. RLS — políticas por módulo e por ação
--  5. Fluxos entre setores (triggers)
--  6. Auditoria automática
--  7. Views para dashboards
--  8. Realtime
--  9. Storage (arquivos)
-- 10. Dados iniciais (indicadores e permissões)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. CONFIGURAÇÃO
-- ---------------------------------------------------------------------
-- Datas do ERP no horário de Brasília (evita "virar o dia" às 21h UTC)
alter database postgres set timezone to 'America/Sao_Paulo';
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TIPOS
-- ---------------------------------------------------------------------
create type public.setor as enum ('adm', 'gerencia', 'operacional', 'vendas', 'producao', 'financeiro', 'cobranca');
create type public.perfil as enum ('ADM', 'GERENTE', 'COLABORADOR');
create type public.acao as enum ('visualizar', 'criar', 'editar', 'excluir', 'exportar');
create type public.status_colaborador as enum ('ATIVO', 'INATIVO');

-- ---------------------------------------------------------------------
-- 2. TABELAS
-- ---------------------------------------------------------------------

-- 2.1 Núcleo: empresa, colaboradores, permissões, indicadores e metas
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  email text,
  telefone text,
  cidade text,
  uf text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.filiais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  nome text not null,
  tipo text not null default 'Filial' check (tipo in ('Matriz', 'Filial', 'Base operacional')),
  cnpj text,
  cidade text,
  uf text default 'PR',
  status text not null default 'Ativa' check (status in ('Ativa', 'Inativa')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um colaborador = um usuário do Supabase Auth (mesmo id)
create table public.colaboradores (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null unique,
  cpf text,
  telefone text,
  funcao text not null,
  setor public.setor not null,
  perfil public.perfil not null default 'COLABORADOR', -- definido automaticamente pelo setor (trigger)
  status public.status_colaborador not null default 'ATIVO',
  data_admissao date default current_date,
  filial_id uuid references public.filiais(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.colaboradores (setor, status);

-- Presença da linha = permitido. ADM não precisa de linhas (acesso total).
-- Para COLABORADOR, use modulo = 'setor_proprio'.
create table public.permissoes (
  perfil public.perfil not null check (perfil <> 'ADM'),
  modulo text not null,
  acao public.acao not null,
  primary key (perfil, modulo, acao)
);

create table public.indicadores (
  id text primary key,
  setor public.setor not null,
  label text not null,
  unidade text not null check (unidade in ('qtd', 'brl')),
  meta_diaria_padrao numeric not null default 0,
  meta_mensal_padrao numeric not null default 0,
  unique (id, setor)
);

create table public.metas (
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  indicador_id text not null references public.indicadores(id),
  diaria numeric not null default 0 check (diaria >= 0),
  mensal numeric not null default 0 check (mensal >= 0),
  updated_at timestamptz not null default now(),
  primary key (colaborador_id, indicador_id)
);

-- Produção de cada setor: alimenta metas diárias/mensais e o painel do ADM
create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  setor public.setor not null,
  indicador_id text not null,
  colaborador_id uuid references public.colaboradores(id) on delete set null,
  quantidade numeric not null check (quantidade > 0),
  descricao text not null default '',
  data date not null default current_date,
  origem text not null default 'manual' check (origem in ('manual', 'automatico')),
  autor_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (indicador_id, setor) references public.indicadores(id, setor)
);
create index on public.lancamentos (setor, indicador_id, data);
create index on public.lancamentos (colaborador_id, data);

-- 2.2 Cadastros centrais (núcleo compartilhado)
create table public.escolas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade text not null,
  uf text not null default 'PR',
  inep text unique,
  responsavel text,
  telefone text,
  status text not null default 'Ativa' check (status in ('Ativa', 'Inativa')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null check (categoria in ('E-book', 'Combo', 'Impresso')),
  preco numeric(12, 2) not null check (preco >= 0),
  status text not null default 'Ativo' check (status in ('Ativo', 'Inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text,
  telefone text,
  status text not null default 'Ativo' check (status in ('Ativo', 'Inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.estoque (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  unidade text not null default 'Unidade',
  quantidade numeric not null default 0 check (quantidade >= 0),
  minimo numeric not null default 0 check (minimo >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.3 Vendas
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  escola text not null,
  cidade text not null,
  uf text default 'PR',
  contato text,
  telefone text,
  alunos int default 0,
  vendedora_id uuid references public.colaboradores(id),
  etapa text not null default 'Novo' check (etapa in ('Novo', 'Contato feito', 'Visita agendada', 'Proposta', 'Negociação', 'Convertido', 'Perdido')),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  escola_id uuid references public.escolas(id),
  escola text not null,
  cidade text not null,
  uf text default 'PR',
  vendedora_id uuid not null references public.colaboradores(id),
  alunos int not null default 0 check (alunos >= 0),
  comissao_pct numeric(5, 2) not null default 10 check (comissao_pct between 0 and 100),
  data date not null default current_date,
  status text not null default 'Ativo' check (status in ('Ativo', 'Em agendamento', 'Finalizado', 'Cancelado')),
  observacao text,
  lead_id uuid references public.leads(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.4 Operacional
create table public.tarefas_operacionais (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  escola text,
  cidade text,
  responsavel_id uuid references public.colaboradores(id),
  prioridade text not null default 'Média' check (prioridade in ('Alta', 'Média', 'Baixa')),
  prazo date,
  status text not null default 'Pendente' check (status in ('Pendente', 'Em andamento', 'Concluída')),
  contrato_id uuid references public.contratos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.5 Produção
create table public.ordens_producao (
  id uuid primary key default gen_random_uuid(),
  escola text not null,
  contrato_id uuid references public.contratos(id) on delete set null,
  alunos int default 0,
  fotos int default 0,
  etapa text not null default 'Aguardando fotos'
    check (etapa in ('Aguardando fotos', 'Tratamento', 'Diagramação', 'E-book gerado', 'Revisão de qualidade', 'Concluído')),
  responsavel_id uuid references public.colaboradores(id),
  prazo date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.qualidade (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid references public.ordens_producao(id) on delete cascade,
  ordem text, -- nome da escola (desnormalizado para exibição)
  tipo text not null check (tipo in ('Retrabalho', 'Perda', 'Não conformidade', 'Aprovado')),
  descricao text not null,
  quantidade int default 0,
  responsavel_id uuid references public.colaboradores(id),
  data date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.6 Cobrança
create table public.vendas_ebooks (
  id uuid primary key default gen_random_uuid(),
  responsavel text not null,
  aluno text not null,
  escola text not null,
  telefone text,
  produto_id uuid references public.produtos(id),
  pacote text not null,
  valor numeric(12, 2) not null check (valor > 0),
  parcelas int not null default 1 check (parcelas between 1 and 12),
  cobrador_id uuid references public.colaboradores(id),
  data date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.titulos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid references public.vendas_ebooks(id) on delete cascade,
  cliente text not null,
  aluno text,
  escola text,
  telefone text,
  parcela text not null default '1/1',
  valor numeric(12, 2) not null check (valor >= 0),
  vencimento date not null,
  status text not null default 'Aberto' check (status in ('Aberto', 'Pago', 'Em acordo', 'Cancelado')),
  data_pagamento date,
  cobrador_id uuid references public.colaboradores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.titulos (status, vencimento);

create table public.acordos (
  id uuid primary key default gen_random_uuid(),
  cliente text not null,
  escola text,
  telefone text,
  titulo_id uuid references public.titulos(id) on delete set null,
  valor_original numeric(12, 2) not null,
  valor_acordo numeric(12, 2) not null,
  parcelas int not null default 1,
  primeiro_vencimento date,
  status text not null default 'Aguardando aprovação' check (status in ('Aguardando aprovação', 'Ativo', 'Rejeitado', 'Quitado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.7 Financeiro
create table public.contas_pagar (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  fornecedor_id uuid references public.fornecedores(id),
  fornecedor text,
  categoria text not null,
  valor numeric(12, 2) not null check (valor > 0),
  vencimento date not null,
  status text not null default 'A pagar' check (status in ('A pagar', 'Aguardando aprovação', 'Pago', 'Rejeitada')),
  data_pagamento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comissoes (
  id uuid primary key default gen_random_uuid(),
  escola text not null,
  venda_id uuid references public.vendas_ebooks(id) on delete cascade,
  referencia text,
  base_calculo numeric(12, 2) not null default 0,
  percentual numeric(5, 2) not null default 10,
  valor numeric(12, 2) not null,
  vencimento date,
  status text not null default 'A pagar' check (status in ('A pagar', 'Pago')),
  data_pagamento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.8 Gerência
create table public.aprovacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  setor_origem public.setor not null,
  descricao text not null,
  valor numeric(12, 2) default 0,
  ref_tabela text not null check (ref_tabela in ('acordos', 'contas_pagar')),
  ref_id uuid not null,
  solicitante_id uuid references public.colaboradores(id),
  solicitante text,
  status text not null default 'Pendente' check (status in ('Pendente', 'Aprovado', 'Rejeitado')),
  decidido_por uuid references public.colaboradores(id),
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.9 Sistema: notificações e auditoria
create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  setores public.setor[] not null, -- destinatários (ADM e Gerência veem todas)
  tipo text not null check (tipo in ('info', 'alerta', 'sucesso', 'aprovacao')),
  titulo text not null,
  descricao text not null,
  link text default '',
  created_at timestamptz not null default now()
);
create index on public.notificacoes using gin (setores);

create table public.notificacao_leituras (
  notificacao_id uuid references public.notificacoes(id) on delete cascade,
  colaborador_id uuid references public.colaboradores(id) on delete cascade default auth.uid(),
  lida_em timestamptz not null default now(),
  primary key (notificacao_id, colaborador_id)
);

create table public.auditoria (
  id bigint generated always as identity primary key,
  data timestamptz not null default now(),
  tipo text not null check (tipo in ('LOGIN', 'LOGIN_FALHOU', 'LOGOUT', 'ACESSO', 'CRIAR', 'EDITAR', 'EXCLUIR', 'SENHA', 'SISTEMA')),
  tabela text,
  registro_id text,
  usuario_id uuid,
  usuario_nome text,
  setor public.setor,
  descricao text,
  dados_antes jsonb,
  dados_depois jsonb,
  ip text
);
create index on public.auditoria (data desc);
create index on public.auditoria (usuario_id, data desc);

-- updated_at automático
create or replace function public.tocar_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['empresas', 'filiais', 'colaboradores', 'escolas', 'produtos', 'fornecedores', 'estoque', 'leads', 'contratos',
    'tarefas_operacionais', 'ordens_producao', 'qualidade', 'vendas_ebooks', 'titulos', 'acordos', 'contas_pagar', 'comissoes', 'aprovacoes', 'metas']
  loop
    execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.tocar_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. FUNÇÕES DE SEGURANÇA
-- ---------------------------------------------------------------------
create or replace function public.meu_perfil() returns public.perfil
language sql stable security definer set search_path = public as $$
  select perfil from public.colaboradores where id = auth.uid() and status = 'ATIVO'
$$;

create or replace function public.meu_setor() returns public.setor
language sql stable security definer set search_path = public as $$
  select setor from public.colaboradores where id = auth.uid() and status = 'ATIVO'
$$;

-- Mesma regra de src/lib/erp/permissions.ts → pode()
create or replace function public.pode(p_modulo text, p_acao public.acao) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_perfil public.perfil;
  v_setor public.setor;
begin
  select perfil, setor into v_perfil, v_setor from public.colaboradores where id = auth.uid() and status = 'ATIVO';
  if v_perfil is null then return false; end if;
  if v_perfil = 'ADM' then return true; end if;
  if v_perfil = 'GERENTE' then
    return exists (select 1 from public.permissoes where perfil = 'GERENTE' and modulo = p_modulo and acao = p_acao);
  end if;
  -- COLABORADOR: somente o próprio setor
  return p_modulo = v_setor::text
     and exists (select 1 from public.permissoes where perfil = 'COLABORADOR' and modulo = 'setor_proprio' and acao = p_acao);
end $$;

create or replace function public.ip_requisicao() returns text
language sql stable as $$
  select coalesce(split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1), 'n/d')
$$;

-- Perfil sempre derivado do setor + ninguém além do ADM cria/promove para 'adm'
create or replace function public.definir_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.perfil := case new.setor when 'adm' then 'ADM'::public.perfil when 'gerencia' then 'GERENTE'::public.perfil else 'COLABORADOR'::public.perfil end;
  if new.setor = 'adm' and auth.uid() is not null and public.meu_perfil() is distinct from 'ADM' then
    raise exception 'Somente o ADM pode cadastrar usuários no setor ADM';
  end if;
  return new;
end $$;
create trigger trg_definir_perfil before insert or update of setor on public.colaboradores
for each row execute function public.definir_perfil();

-- ---------------------------------------------------------------------
-- 4. RLS — ROW LEVEL SECURITY
-- "Esconder um menu não protege um dado": estas políticas valem para a API.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['empresas', 'filiais', 'colaboradores', 'permissoes', 'indicadores', 'metas', 'lancamentos', 'escolas', 'produtos',
    'fornecedores', 'estoque', 'leads', 'contratos', 'tarefas_operacionais', 'ordens_producao', 'qualidade', 'vendas_ebooks', 'titulos',
    'acordos', 'contas_pagar', 'comissoes', 'aprovacoes', 'notificacoes', 'notificacao_leituras', 'auditoria']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 4.1 Tabelas de setor: módulo = setor dono da tabela
do $$
declare r record;
begin
  for r in select * from (values
    ('leads', 'vendas'), ('contratos', 'vendas'),
    ('tarefas_operacionais', 'operacional'),
    ('ordens_producao', 'producao'), ('qualidade', 'producao'),
    ('vendas_ebooks', 'cobranca'), ('titulos', 'cobranca'), ('acordos', 'cobranca'),
    ('contas_pagar', 'financeiro'), ('comissoes', 'financeiro'),
    ('aprovacoes', 'gerencia')
  ) as x(tabela, modulo)
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.pode(%L, ''visualizar''))', r.tabela || '_select', r.tabela, r.modulo);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.pode(%L, ''criar''))', r.tabela || '_insert', r.tabela, r.modulo);
    execute format('create policy %I on public.%I for update to authenticated using (public.pode(%L, ''editar'')) with check (public.pode(%L, ''editar''))', r.tabela || '_update', r.tabela, r.modulo, r.modulo);
    execute format('create policy %I on public.%I for delete to authenticated using (public.pode(%L, ''excluir''))', r.tabela || '_delete', r.tabela, r.modulo);
  end loop;
end $$;

-- 4.2 Cadastros centrais: leitura para qualquer colaborador ativo; escrita pelo módulo "cadastros"
do $$
declare t text;
begin
  foreach t in array array['empresas', 'filiais', 'escolas', 'produtos', 'fornecedores', 'estoque']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.meu_perfil() is not null)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.pode(''cadastros'', ''criar''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.pode(''cadastros'', ''editar''))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.pode(''cadastros'', ''excluir''))', t || '_delete', t);
  end loop;
end $$;
-- Produção também mantém a matéria-prima
create policy estoque_producao_insert on public.estoque for insert to authenticated with check (public.pode('producao', 'criar'));
create policy estoque_producao_update on public.estoque for update to authenticated using (public.pode('producao', 'editar'));

-- 4.3 Colaboradores
create policy colaboradores_select on public.colaboradores for select to authenticated using (
  id = auth.uid()
  or public.pode('usuarios', 'visualizar')
  or setor = public.meu_setor() -- a equipe do próprio setor (dashboards de metas)
);
create policy colaboradores_insert on public.colaboradores for insert to authenticated with check (public.pode('usuarios', 'criar'));
create policy colaboradores_update on public.colaboradores for update to authenticated using (public.pode('usuarios', 'editar')) with check (public.pode('usuarios', 'editar'));
create policy colaboradores_delete on public.colaboradores for delete to authenticated using (public.pode('usuarios', 'excluir') and id <> auth.uid());

-- 4.4 Permissões e indicadores: todos leem, só o ADM altera
create policy permissoes_select on public.permissoes for select to authenticated using (true);
create policy permissoes_admin on public.permissoes for all to authenticated using (public.meu_perfil() = 'ADM') with check (public.meu_perfil() = 'ADM');
create policy indicadores_select on public.indicadores for select to authenticated using (true);
create policy indicadores_admin on public.indicadores for all to authenticated using (public.meu_perfil() = 'ADM') with check (public.meu_perfil() = 'ADM');

-- 4.5 Metas
create policy metas_select on public.metas for select to authenticated using (
  public.pode('metas', 'visualizar')
  or colaborador_id = auth.uid()
  or exists (select 1 from public.colaboradores c where c.id = metas.colaborador_id and c.setor = public.meu_setor())
);
create policy metas_write on public.metas for all to authenticated using (public.pode('metas', 'editar')) with check (public.pode('metas', 'editar'));

-- 4.6 Lançamentos (produção). Colaborador comum só lança para si mesmo; lançamentos não são editáveis.
create policy lancamentos_select on public.lancamentos for select to authenticated using (public.pode(setor::text, 'visualizar'));
create policy lancamentos_insert on public.lancamentos for insert to authenticated with check (
  public.pode(setor::text, 'criar')
  and origem = 'manual'
  and (public.meu_perfil() <> 'COLABORADOR' or colaborador_id = auth.uid())
);
create policy lancamentos_delete on public.lancamentos for delete to authenticated using (public.pode(setor::text, 'excluir'));

-- 4.7 Notificações: ADM/Gerência veem todas; os demais, as do próprio setor
create policy notificacoes_select on public.notificacoes for select to authenticated using (
  public.meu_perfil() in ('ADM', 'GERENTE') or public.meu_setor() = any (setores)
);
create policy leituras_select on public.notificacao_leituras for select to authenticated using (colaborador_id = auth.uid());
create policy leituras_insert on public.notificacao_leituras for insert to authenticated with check (colaborador_id = auth.uid());

-- 4.8 Auditoria: somente leitura (gravação só por triggers/RPC)
create policy auditoria_select on public.auditoria for select to authenticated using (public.pode('auditoria', 'visualizar'));

-- ---------------------------------------------------------------------
-- 5. FLUXOS ENTRE SETORES (triggers)  — equivalentes a src/lib/erp/fluxos.ts
-- ---------------------------------------------------------------------
create or replace function public.lancar(p_setor public.setor, p_indicador text, p_colaborador uuid, p_qtd numeric, p_descricao text, p_data date)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.lancamentos (setor, indicador_id, colaborador_id, quantidade, descricao, data, origem)
  values (p_setor, p_indicador, p_colaborador, p_qtd, coalesce(p_descricao, ''), coalesce(p_data, current_date), 'automatico');
end $$;

create or replace function public.notificar(p_setores public.setor[], p_tipo text, p_titulo text, p_descricao text, p_link text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notificacoes (setores, tipo, titulo, descricao, link) values (p_setores, p_tipo, p_titulo, p_descricao, p_link);
end $$;

create or replace function public.pedir_aprovacao(p_tipo text, p_setor public.setor, p_descricao text, p_valor numeric, p_tabela text, p_ref uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.aprovacoes (tipo, setor_origem, descricao, valor, ref_tabela, ref_id, solicitante_id, solicitante)
  values (p_tipo, p_setor, p_descricao, p_valor, p_tabela, p_ref, auth.uid(), (select nome from public.colaboradores where id = auth.uid()));
  perform public.notificar(array['gerencia', 'adm']::public.setor[], 'aprovacao', 'Aprovação pendente', p_tipo || ': ' || p_descricao, '/gerencia/aprovacoes');
end $$;

-- 5.1 CONTRATO (Vendas) → meta da vendedora + tarefa Operacional + ordem de Produção + aviso ao ADM
create or replace function public.fluxo_contrato() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.lancar('vendas', 'contratos', new.vendedora_id, 1, 'Contrato: ' || new.escola, new.data);
  insert into public.tarefas_operacionais (titulo, escola, cidade, prioridade, prazo, status, contrato_id)
  values ('Agendar sessão fotográfica', new.escola, new.cidade, 'Alta', new.data + 7, 'Pendente', new.id);
  insert into public.ordens_producao (escola, contrato_id, alunos, etapa, prazo)
  values (new.escola, new.id, new.alunos, 'Aguardando fotos', new.data + 30);
  perform public.notificar(array['operacional', 'producao', 'adm', 'gerencia']::public.setor[], 'info', 'Novo contrato fechado',
    format('%s (%s) — %s alunos. Sessão fotográfica e ordem de produção criadas.', new.escola, new.cidade, new.alunos), '/operacional/tarefas');
  return new;
end $$;
create trigger trg_fluxo_contrato after insert on public.contratos for each row execute function public.fluxo_contrato();

-- 5.2 VENDA DE E-BOOK (Cobrança) → meta do cobrador + parcelas a receber + comissão da escola (Financeiro)
create or replace function public.fluxo_venda_ebook() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  i int;
  v_pct numeric;
begin
  perform public.lancar('cobranca', 'ebooks_vendidos', new.cobrador_id, 1, new.pacote || ' — ' || new.responsavel, new.data);
  for i in 1..new.parcelas loop
    insert into public.titulos (venda_id, cliente, aluno, escola, telefone, parcela, valor, vencimento, cobrador_id)
    values (new.id, new.responsavel, new.aluno, new.escola, new.telefone, i || '/' || new.parcelas,
            round(new.valor / new.parcelas, 2), new.data + (30 * (i - 1)), new.cobrador_id);
  end loop;
  select comissao_pct into v_pct from public.contratos where escola = new.escola order by data desc limit 1;
  v_pct := coalesce(v_pct, 10);
  insert into public.comissoes (escola, venda_id, referencia, base_calculo, percentual, valor, vencimento)
  values (new.escola, new.id, new.pacote || ' — ' || new.aluno, new.valor, v_pct, round(new.valor * v_pct / 100, 2), new.data + 30);
  perform public.notificar(array['financeiro', 'adm']::public.setor[], 'info', 'Venda de e-book registrada',
    format('%s para %s (%s). %s parcela(s) e comissão gerada.', new.pacote, new.responsavel, new.escola, new.parcelas), '/financeiro/comissoes');
  return new;
end $$;
create trigger trg_fluxo_venda_ebook after insert on public.vendas_ebooks for each row execute function public.fluxo_venda_ebook();

-- 5.3 BAIXA DE TÍTULO → valor recebido (meta da Cobrança + faturamento do ADM + entrada no caixa)
create or replace function public.fluxo_baixa_titulo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Pago' and old.status is distinct from 'Pago' then
    new.data_pagamento := coalesce(new.data_pagamento, current_date);
    perform public.lancar('cobranca', 'valor_recebido', new.cobrador_id, new.valor, 'Baixa ' || new.parcela || ' — ' || new.cliente, new.data_pagamento);
  end if;
  return new;
end $$;
create trigger trg_fluxo_baixa_titulo before update of status on public.titulos for each row execute function public.fluxo_baixa_titulo();

-- 5.4 ACORDO → título "Em acordo" + aprovação da Gerência
create or replace function public.fluxo_acordo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.titulo_id is not null then
    update public.titulos set status = 'Em acordo' where id = new.titulo_id;
  end if;
  perform public.pedir_aprovacao('Acordo de cobrança', 'cobranca', format('%s: %sx de %s', new.cliente, new.parcelas, new.valor_acordo), new.valor_acordo, 'acordos', new.id);
  return new;
end $$;
create trigger trg_fluxo_acordo after insert on public.acordos for each row execute function public.fluxo_acordo();

-- 5.5 CONTA A PAGAR ≥ R$ 5.000 → aprovação da Gerência
create or replace function public.conta_exige_aprovacao() returns trigger
language plpgsql as $$
begin
  if new.valor >= 5000 then new.status := 'Aguardando aprovação'; end if;
  return new;
end $$;
create trigger trg_conta_exige_aprovacao before insert on public.contas_pagar for each row execute function public.conta_exige_aprovacao();

create or replace function public.fluxo_conta_aprovacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Aguardando aprovação' then
    perform public.pedir_aprovacao('Conta a pagar', 'financeiro', new.descricao || ' — ' || coalesce(new.fornecedor, ''), new.valor, 'contas_pagar', new.id);
  end if;
  return new;
end $$;
create trigger trg_fluxo_conta_aprovacao after insert on public.contas_pagar for each row execute function public.fluxo_conta_aprovacao();

-- 5.6 PAGAMENTO (contas e comissões) → meta do Financeiro + saída no caixa
create or replace function public.fluxo_pagamento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Pago' and old.status is distinct from 'Pago' then
    if tg_table_name = 'contas_pagar' and old.status <> 'A pagar' then
      raise exception 'Conta precisa estar "A pagar" (aprovada) para ser paga';
    end if;
    new.data_pagamento := coalesce(new.data_pagamento, current_date);
    -- to_jsonb: contas_pagar não tem "escola" e comissoes não tem "descricao"
    perform public.lancar('financeiro', 'contas_processadas',
      case when public.meu_setor() = 'financeiro' then auth.uid() end, 1,
      case when tg_table_name = 'comissoes' then 'Comissão paga: ' || (to_jsonb(new) ->> 'escola') else 'Conta paga: ' || (to_jsonb(new) ->> 'descricao') end,
      new.data_pagamento);
  end if;
  return new;
end $$;
create trigger trg_fluxo_pagamento before update of status on public.contas_pagar for each row execute function public.fluxo_pagamento();
create trigger trg_fluxo_pagamento before update of status on public.comissoes for each row execute function public.fluxo_pagamento();

-- 5.7 DECISÃO DE APROVAÇÃO → atualiza o registro de origem + meta da Gerência + aviso ao setor
create or replace function public.fluxo_decisao() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_aprovado boolean;
begin
  if old.status = 'Pendente' and new.status in ('Aprovado', 'Rejeitado') then
    v_aprovado := new.status = 'Aprovado';
    new.decidido_por := auth.uid();
    new.decidido_em := now();
    if new.ref_tabela = 'acordos' then
      update public.acordos set status = case when v_aprovado then 'Ativo' else 'Rejeitado' end where id = new.ref_id;
    elsif new.ref_tabela = 'contas_pagar' then
      update public.contas_pagar set status = case when v_aprovado then 'A pagar' else 'Rejeitada' end where id = new.ref_id;
    end if;
    perform public.lancar('gerencia', 'aprovacoes', case when public.meu_setor() = 'gerencia' then auth.uid() end, 1,
      new.tipo || case when v_aprovado then ' aprovado' else ' rejeitado' end, current_date);
    perform public.notificar(array[new.setor_origem, 'adm']::public.setor[], case when v_aprovado then 'sucesso' else 'alerta' end,
      new.tipo || case when v_aprovado then ' aprovado' else ' rejeitado' end, new.descricao,
      case when new.ref_tabela = 'acordos' then '/cobranca/acordos' else '/financeiro/contas-pagar' end);
  elsif old.status <> 'Pendente' and new.status is distinct from old.status then
    raise exception 'Aprovação já decidida';
  end if;
  return new;
end $$;
create trigger trg_fluxo_decisao before update of status on public.aprovacoes for each row execute function public.fluxo_decisao();

-- 5.8 ORDEM DE PRODUÇÃO → "E-book gerado" lança meta do editor; "Concluído" libera a Cobrança
create or replace function public.fluxo_ordem() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.etapa is distinct from old.etapa then
    if new.etapa = 'E-book gerado' then
      perform public.lancar('producao', 'ebooks_gerados', new.responsavel_id, 1, 'E-book: ' || new.escola, current_date);
    elsif new.etapa = 'Concluído' then
      perform public.notificar(array['cobranca', 'adm']::public.setor[], 'sucesso', 'E-books liberados para venda',
        'Produção da escola ' || new.escola || ' concluída. Cobrança já pode ofertar aos pais.', '/cobranca/vendas-ebooks');
    end if;
  end if;
  return new;
end $$;
create trigger trg_fluxo_ordem after update of etapa on public.ordens_producao for each row execute function public.fluxo_ordem();

-- 5.9 ESTOQUE abaixo do mínimo → alerta Produção e ADM
create or replace function public.fluxo_estoque() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.quantidade < new.minimo and (tg_op = 'INSERT' or old.quantidade >= old.minimo) then
    perform public.notificar(array['producao', 'adm']::public.setor[], 'alerta', 'Estoque baixo',
      format('%s: %s %s (mínimo %s).', new.item, new.quantidade, new.unidade, new.minimo), '/producao/materia-prima');
  end if;
  return new;
end $$;
create trigger trg_fluxo_estoque after insert or update of quantidade, minimo on public.estoque for each row execute function public.fluxo_estoque();

-- 5.10 META DIÁRIA BATIDA → avisa ADM, Gerência e o setor
create or replace function public.fluxo_meta_batida() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_meta numeric;
  v_total numeric;
  v_nome text;
  v_label text;
begin
  if new.colaborador_id is null or new.data <> current_date then return new; end if;
  select coalesce(m.diaria, i.meta_diaria_padrao), i.label into v_meta, v_label
  from public.indicadores i left join public.metas m on m.indicador_id = i.id and m.colaborador_id = new.colaborador_id
  where i.id = new.indicador_id;
  if coalesce(v_meta, 0) <= 0 then return new; end if;
  select sum(quantidade) into v_total from public.lancamentos
  where colaborador_id = new.colaborador_id and indicador_id = new.indicador_id and data = new.data;
  if v_total >= v_meta and v_total - new.quantidade < v_meta then
    select nome into v_nome from public.colaboradores where id = new.colaborador_id;
    perform public.notificar(array['adm', 'gerencia', new.setor]::public.setor[], 'sucesso', 'Meta diária batida 🎯',
      format('%s atingiu a meta diária de %s.', v_nome, lower(v_label)), '/' || new.setor::text);
  end if;
  return new;
end $$;
create trigger trg_fluxo_meta_batida after insert on public.lancamentos for each row execute function public.fluxo_meta_batida();

-- ---------------------------------------------------------------------
-- 6. AUDITORIA AUTOMÁTICA (alterações e exclusões com usuário, data/hora e IP)
-- ---------------------------------------------------------------------
create or replace function public.fn_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_nome text;
  v_setor public.setor;
begin
  select nome, setor into v_nome, v_setor from public.colaboradores where id = auth.uid();
  insert into public.auditoria (tipo, tabela, registro_id, usuario_id, usuario_nome, setor, descricao, dados_antes, dados_depois, ip)
  values (
    case tg_op when 'INSERT' then 'CRIAR' when 'UPDATE' then 'EDITAR' else 'EXCLUIR' end,
    tg_table_name,
    coalesce(v_depois ->> 'id', v_antes ->> 'id', v_depois ->> 'colaborador_id', v_antes ->> 'colaborador_id'),
    auth.uid(),
    coalesce(v_nome, 'sistema'),
    v_setor,
    lower(tg_op) || ' em ' || tg_table_name,
    v_antes,
    v_depois,
    public.ip_requisicao()
  );
  return null; -- trigger AFTER: o retorno é ignorado
end $$;

do $$
declare t text;
begin
  foreach t in array array['empresas', 'filiais', 'colaboradores', 'permissoes', 'metas', 'lancamentos', 'escolas', 'produtos', 'fornecedores',
    'estoque', 'leads', 'contratos', 'tarefas_operacionais', 'ordens_producao', 'qualidade', 'vendas_ebooks', 'titulos', 'acordos',
    'contas_pagar', 'comissoes', 'aprovacoes']
  loop
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.fn_auditoria()', t);
  end loop;
end $$;

-- Eventos de sessão chamados pelo front-end: supabase.rpc('registrar_evento', {...})
create or replace function public.registrar_evento(p_tipo text, p_descricao text, p_setor public.setor default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_tipo not in ('LOGIN', 'LOGIN_FALHOU', 'LOGOUT', 'ACESSO', 'SENHA') then
    raise exception 'Tipo de evento inválido';
  end if;
  if auth.uid() is null and p_tipo <> 'LOGIN_FALHOU' then
    raise exception 'Não autenticado';
  end if;
  insert into public.auditoria (tipo, usuario_id, usuario_nome, setor, descricao, ip)
  select p_tipo, auth.uid(), coalesce(c.nome, 'anônimo'), coalesce(p_setor, c.setor), left(p_descricao, 500), public.ip_requisicao()
  from (select 1) x left join public.colaboradores c on c.id = auth.uid();
end $$;
revoke all on function public.registrar_evento(text, text, public.setor) from public;
grant execute on function public.registrar_evento(text, text, public.setor) to anon, authenticated;

-- Funções internas não devem ser chamadas diretamente pela API
revoke execute on function public.lancar(public.setor, text, uuid, numeric, text, date) from public, anon, authenticated;
revoke execute on function public.notificar(public.setor[], text, text, text, text) from public, anon, authenticated;
revoke execute on function public.pedir_aprovacao(text, public.setor, text, numeric, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. VIEWS PARA DASHBOARDS (security_invoker = respeitam o RLS de quem consulta)
-- ---------------------------------------------------------------------
create view public.vw_producao_diaria with (security_invoker = true) as
select setor, indicador_id, colaborador_id, data, sum(quantidade) as total, count(*) as registros
from public.lancamentos
group by setor, indicador_id, colaborador_id, data;

create view public.vw_titulos with (security_invoker = true) as
select t.*,
  case when t.status = 'Aberto' and t.vencimento < current_date then 'Atrasado' else t.status end as situacao,
  greatest(0, current_date - t.vencimento) as dias_atraso
from public.titulos t;

create view public.vw_metas_colaborador with (security_invoker = true) as
select c.id as colaborador_id, c.nome, c.setor, i.id as indicador_id, i.label, i.unidade,
  coalesce(m.diaria, i.meta_diaria_padrao) as meta_diaria,
  coalesce(m.mensal, i.meta_mensal_padrao) as meta_mensal
from public.colaboradores c
join public.indicadores i on i.setor = c.setor
left join public.metas m on m.colaborador_id = c.id and m.indicador_id = i.id
where c.status = 'ATIVO';

-- ---------------------------------------------------------------------
-- 8. REALTIME (dashboard do ADM atualizando sozinho)
-- O Realtime respeita o RLS: cada usuário só recebe o que pode ver.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.lancamentos, public.notificacoes, public.aprovacoes, public.ordens_producao,
  public.titulos, public.contratos, public.vendas_ebooks, public.tarefas_operacionais,
  public.leads, public.acordos, public.contas_pagar, public.comissoes, public.qualidade,
  public.escolas, public.produtos, public.fornecedores, public.estoque, public.filiais, public.empresas,
  public.colaboradores, public.metas, public.permissoes;
-- (auditoria fica fora de propósito: cada navegação gera um log e recarregaria todas as telas)

-- ---------------------------------------------------------------------
-- 9. STORAGE (contratos digitalizados e e-books)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('contratos', 'contratos', false),
  ('ebooks', 'ebooks', false)
on conflict (id) do nothing;

create policy contratos_leitura on storage.objects for select to authenticated
  using (bucket_id = 'contratos' and (public.pode('vendas', 'visualizar') or public.pode('operacional', 'visualizar')));
create policy contratos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'contratos' and (public.pode('vendas', 'criar') or public.pode('operacional', 'criar')));
create policy ebooks_leitura on storage.objects for select to authenticated
  using (bucket_id = 'ebooks' and (public.pode('producao', 'visualizar') or public.pode('cobranca', 'visualizar')));
create policy ebooks_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'ebooks' and public.pode('producao', 'criar'));

-- ---------------------------------------------------------------------
-- 10. DADOS INICIAIS
-- ---------------------------------------------------------------------
insert into public.indicadores (id, setor, label, unidade, meta_diaria_padrao, meta_mensal_padrao) values
  ('aprovacoes',         'gerencia',    'Aprovações analisadas',  'qtd', 3,    60),
  ('fichas',             'operacional', 'Fichas fotografadas',    'qtd', 20,   440),
  ('contratos',          'vendas',      'Contratos fechados',     'qtd', 1,    20),
  ('visitas',            'vendas',      'Escolas visitadas',      'qtd', 4,    80),
  ('fotos_editadas',     'producao',    'Fotos editadas',         'qtd', 300,  6600),
  ('ebooks_gerados',     'producao',    'E-books gerados',        'qtd', 2,    40),
  ('contas_processadas', 'financeiro',  'Pagamentos processados', 'qtd', 5,    110),
  ('ebooks_vendidos',    'cobranca',    'E-books vendidos',       'qtd', 6,    130),
  ('valor_recebido',     'cobranca',    'Valor recebido',         'brl', 1500, 33000);

-- Matriz padrão (igual a src/lib/erp/permissions.ts → MATRIZ_PADRAO)
insert into public.permissoes (perfil, modulo, acao)
select 'GERENTE'::public.perfil, m, a::public.acao
from unnest(array['gerencia', 'operacional', 'vendas', 'producao', 'financeiro', 'cobranca']) m,
     unnest(array['visualizar', 'criar', 'editar', 'excluir', 'exportar']) a;

insert into public.permissoes (perfil, modulo, acao) values
  ('GERENTE', 'adm', 'visualizar'), ('GERENTE', 'adm', 'exportar'),
  ('GERENTE', 'usuarios', 'visualizar'),
  ('GERENTE', 'permissoes', 'visualizar'),
  ('GERENTE', 'metas', 'visualizar'), ('GERENTE', 'metas', 'editar'),
  ('GERENTE', 'cadastros', 'visualizar'), ('GERENTE', 'cadastros', 'criar'), ('GERENTE', 'cadastros', 'editar'), ('GERENTE', 'cadastros', 'exportar'),
  ('GERENTE', 'relatorios', 'visualizar'), ('GERENTE', 'relatorios', 'exportar'),
  ('GERENTE', 'auditoria', 'visualizar'), ('GERENTE', 'auditoria', 'exportar'),
  ('COLABORADOR', 'setor_proprio', 'visualizar'), ('COLABORADOR', 'setor_proprio', 'criar'),
  ('COLABORADOR', 'setor_proprio', 'editar'), ('COLABORADOR', 'setor_proprio', 'exportar');

insert into public.empresas (nome, cnpj, email, uf) values ('DLG Photos', '00.000.000/0001-00', 'contato@dlgphotos.com', 'PR');

insert into public.produtos (nome, categoria, preco) values
  ('E-book Digital', 'E-book', 89.90),
  ('E-book + Álbum Impresso', 'Combo', 189.90),
  ('Pacote Completo (E-book + Álbum + Quadro)', 'Combo', 249.90),
  ('Foto Avulsa 20x25', 'Impresso', 19.90);

-- ---------------------------------------------------------------------
-- 11. FOTOS DE PERFIL (igual a 003_fotos_perfil.sql)
-- ---------------------------------------------------------------------
alter table public.colaboradores add column if not exists foto_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Arquivo de cada um: avatares/<id do colaborador>.jpg
drop policy if exists avatares_leitura on storage.objects;
drop policy if exists avatares_envio on storage.objects;
drop policy if exists avatares_troca on storage.objects;
drop policy if exists avatares_remocao on storage.objects;

create policy avatares_leitura on storage.objects for select to authenticated
  using (bucket_id = 'avatares');
create policy avatares_envio on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (name = auth.uid()::text || '.jpg' or public.pode('usuarios', 'editar')));
create policy avatares_troca on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and (name = auth.uid()::text || '.jpg' or public.pode('usuarios', 'editar')));
create policy avatares_remocao on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (name = auth.uid()::text || '.jpg' or public.pode('usuarios', 'editar')));

-- O colaborador comum não pode editar o próprio cadastro (setor, status...),
-- então a foto é gravada por esta função, que só mexe na coluna foto_url.
create or replace function public.definir_foto(p_colaborador uuid, p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_colaborador is distinct from auth.uid() and not public.pode('usuarios', 'editar') then
    raise exception 'Sem permissão para alterar a foto deste colaborador' using errcode = '42501';
  end if;
  if p_url is not null and p_url not like '%/storage/v1/object/public/avatares/%' then
    raise exception 'URL de foto inválida';
  end if;
  update public.colaboradores set foto_url = p_url where id = p_colaborador;
end $$;

revoke all on function public.definir_foto(uuid, text) from public, anon;
grant execute on function public.definir_foto(uuid, text) to authenticated;

-- =====================================================================
-- PRIMEIRO ADMINISTRADOR
-- 1) Authentication > Users > Add user (e-mail + senha, marque "Auto Confirm")
-- 2) Rode (troque o e-mail e o nome):
--
-- insert into public.colaboradores (id, nome, email, funcao, setor)
-- select id, 'Lucas W. Garcia', email, 'Diretor(a)', 'adm'
-- from auth.users where email = 'admin@dlgphotos.com';
--
-- Os demais colaboradores são criados pelo ADM na tela /adm/colaboradores
-- (Edge Function "criar-colaborador", ver docs/SUPABASE_PROMPT.md).
-- =====================================================================
