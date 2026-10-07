-- =====================================================================
-- 041 — Carteira de cobranças e parcelas (Parte 2, etapa 2.2) (07/10/2026)
--
-- O lugar que vai receber as cobranças do sistema antigo (migração) e, depois, as das vendas novas.
--   1. cobrancas: uma por venda a receber (cliente, categoria, cobrador, situação da cobrança);
--   2. cobranca_parcelas: as parcelas (número, valor, vencimento, multa em R$, quanto já foi baixado);
--      situação Aberta / Parcial / Paga sai sozinha dos pagamentos; Em acordo e Cancelada são marcadas;
--   3. cobranca_pagamentos: cada recebimento (pode ser PARCIAL). Só o Financeiro registra e só o ADM estorna;
--      o recebimento entra na meta de valor recebido do cobrador, e o estorno tira;
--   4. histórico das categorias (cada troca de categoria fica registrada, com quem trocou);
--   5. contas feitas pelo banco com a data de hoje (vw_cobrancas / vw_cobranca_parcelas):
--      juros (regra juros_dia, R$ por dia em cada parcela vencida), multa, valor atualizado, total da dívida,
--      dias de atraso, faixa por dias e por parcelas vencidas, carteira automática (DLG / Terceirizada /
--      Advogado / Fundo perdido; DLG com mais de 730 dias vira Terceirizada), quem pode renegociar e ir ao SPC;
--   6. resumo_cobrancas(): os totais dos cartões (por carteira e faixa), calculados no banco.
--
-- Fica FORA do tempo real e da carga geral: as telas vão buscar no servidor, aos poucos (110 mil parcelas).
-- Cobrança e Financeiro veem; o Financeiro (e ADM) lança e altera; quem é de fora não acessa.
-- Precisa dos SQLs 036 (clientes) e 039 (regras e categorias). Pode rodar mais de uma vez. Rodar no SQL Editor do Supabase.
-- =====================================================================

-- 1. Cobranças
create table if not exists public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  venda_id uuid references public.vendas_ebooks(id) on delete set null,
  origem text not null default 'Lançamento manual' check (origem in ('Venda', 'Migração', 'Lançamento manual')),
  codigo_venda text,          -- nº da venda (o "Venda #" do sistema antigo)
  codigo_sistema_antigo text, -- id da cobrança no sistema antigo: a migração não duplica
  categoria_id uuid not null references public.cobranca_categorias(id) on delete restrict,
  cobrador_id uuid references public.colaboradores(id) on delete set null,
  situacao text not null default 'Aguardando cobrança' check (situacao in (
    'Aguardando cobrança', 'Contato realizado sem acordo', 'Aguardando retorno', 'Pagamento de boleto agendado',
    'Promessa não cumprida', 'Renegociação simulada', 'Renegociação feita (aguardando entrada)', 'Não localizado',
    'Ficha não encontrada SPC', 'Entrada confirmada', 'Renegociação efetivada', 'Acordo quebrado')),
  observacao text,
  dados_antigos jsonb,        -- referência do sistema antigo (só para consulta)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists cobrancas_sistema_antigo_key on public.cobrancas (codigo_sistema_antigo) where codigo_sistema_antigo is not null;
create unique index if not exists cobrancas_venda_key on public.cobrancas (venda_id) where venda_id is not null;
create index if not exists cobrancas_cliente_idx on public.cobrancas (cliente_id);
create index if not exists cobrancas_categoria_idx on public.cobrancas (categoria_id);
create index if not exists cobrancas_cobrador_idx on public.cobrancas (cobrador_id);

create or replace function public.cobranca_antes() returns trigger
language plpgsql set search_path = public as $$
begin
  new.codigo_venda := nullif(btrim(coalesce(new.codigo_venda, '')), '');
  new.codigo_sistema_antigo := nullif(btrim(coalesce(new.codigo_sistema_antigo, '')), '');
  new.observacao := nullif(btrim(coalesce(new.observacao, '')), '');
  return new;
end $$;
revoke all on function public.cobranca_antes() from public, anon, authenticated;
drop trigger if exists trg_cobranca_antes on public.cobrancas;
create trigger trg_cobranca_antes before insert or update on public.cobrancas for each row execute function public.cobranca_antes();

-- 2. Histórico das categorias (preenchido sozinho)
create table if not exists public.cobranca_categorias_historico (
  id uuid primary key default gen_random_uuid(),
  cobranca_id uuid not null references public.cobrancas(id) on delete cascade,
  categoria_anterior_id uuid references public.cobranca_categorias(id) on delete set null,
  categoria_id uuid references public.cobranca_categorias(id) on delete set null,
  alterado_por uuid,
  alterado_por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists cobranca_categorias_historico_idx on public.cobranca_categorias_historico (cobranca_id, created_at);

create or replace function public.cobranca_categoria_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.categoria_id is distinct from old.categoria_id then
    insert into public.cobranca_categorias_historico (cobranca_id, categoria_anterior_id, categoria_id, alterado_por, alterado_por_nome)
    values (new.id, case when tg_op = 'UPDATE' then old.categoria_id end, new.categoria_id, auth.uid(),
            coalesce((select nome from public.colaboradores where id = auth.uid()), case when new.origem = 'Migração' then 'migração' else 'sistema' end));
  end if;
  return null;
end $$;
revoke all on function public.cobranca_categoria_historico() from public, anon, authenticated;
drop trigger if exists trg_cobranca_categoria_historico on public.cobrancas;
create trigger trg_cobranca_categoria_historico after insert or update of categoria_id on public.cobrancas
  for each row execute function public.cobranca_categoria_historico();

-- 3. Parcelas
create table if not exists public.cobranca_parcelas (
  id uuid primary key default gen_random_uuid(),
  cobranca_id uuid not null references public.cobrancas(id) on delete cascade,
  numero int not null check (numero >= 0),         -- 0 = entrada
  total int not null default 1 check (total >= 1), -- "de quantas"
  valor numeric(12, 2) not null check (valor >= 0),
  vencimento date not null,
  multa numeric(12, 2) not null check (multa >= 0), -- R$ do boleto; vazio = regra multa_padrao
  baixado numeric(12, 2) not null default 0 check (baixado >= 0), -- quanto do valor já saiu (pago + desconto)
  situacao text not null default 'Aberta' check (situacao in ('Aberta', 'Parcial', 'Paga', 'Em acordo', 'Cancelada')),
  pago_em date,
  codigo_sistema_antigo text, -- receivable_id do sistema antigo
  titulo_id uuid,             -- título de Contas a Receber de onde veio (etapa 2.3)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (baixado <= valor)
);
create unique index if not exists cobranca_parcelas_antigo_key on public.cobranca_parcelas (cobranca_id, codigo_sistema_antigo) where codigo_sistema_antigo is not null;
create unique index if not exists cobranca_parcelas_titulo_key on public.cobranca_parcelas (titulo_id) where titulo_id is not null;
create index if not exists cobranca_parcelas_cobranca_idx on public.cobranca_parcelas (cobranca_id, vencimento);
create index if not exists cobranca_parcelas_abertas_idx on public.cobranca_parcelas (vencimento) where situacao in ('Aberta', 'Parcial');

-- a situação sai do que foi baixado (Em acordo e Cancelada são marcadas); o "baixado" só muda pelos pagamentos
create or replace function public.cobranca_parcela_antes() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.multa is null then new.multa := coalesce(public.regra_cobranca('multa_padrao'), 0); end if;
  new.codigo_sistema_antigo := nullif(btrim(coalesce(new.codigo_sistema_antigo, '')), '');
  if auth.uid() is not null and current_setting('dlg.cobranca_pagamento', true) is distinct from '1'
     and ((tg_op = 'INSERT' and new.baixado <> 0) or (tg_op = 'UPDATE' and new.baixado is distinct from old.baixado)) then
    raise exception 'O valor baixado da parcela muda só pelos pagamentos (registrar ou estornar).';
  end if;
  if new.situacao in ('Em acordo', 'Cancelada') then return new; end if;
  if new.baixado >= new.valor then
    new.situacao := 'Paga';
    new.pago_em := coalesce(new.pago_em, current_date);
  else
    new.situacao := case when new.baixado > 0 then 'Parcial' else 'Aberta' end;
    new.pago_em := null;
  end if;
  return new;
end $$;
revoke all on function public.cobranca_parcela_antes() from public, anon, authenticated;
drop trigger if exists trg_cobranca_parcela_antes on public.cobranca_parcelas;
create trigger trg_cobranca_parcela_antes before insert or update on public.cobranca_parcelas for each row execute function public.cobranca_parcela_antes();

-- 4. Pagamentos (recebimentos)
create table if not exists public.cobranca_pagamentos (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid not null references public.cobranca_parcelas(id) on delete cascade,
  cobranca_id uuid not null references public.cobrancas(id) on delete cascade,
  valor numeric(12, 2) not null check (valor > 0),          -- o que entrou
  principal numeric(12, 2) not null check (principal >= 0), -- quanto abateu do valor da parcela
  encargos numeric(12, 2) not null default 0 check (encargos >= 0), -- juros e multa recebidos (o que passou do saldo)
  desconto numeric(12, 2) not null default 0 check (desconto >= 0), -- desconto dado ao quitar com menos que o saldo
  data date not null,
  forma text not null check (forma in ('Boleto', 'PIX', 'Dinheiro', 'Cartão', 'Transferência', 'Outro')),
  observacao text,
  origem text not null default 'Sistema' check (origem in ('Sistema', 'Migração')),
  lancamento_id uuid references public.lancamentos(id) on delete set null, -- o "valor recebido" lançado na meta do cobrador
  registrado_por uuid,
  registrado_por_nome text,
  estornado_em timestamptz,
  estornado_por_nome text,
  estorno_motivo text,
  created_at timestamptz not null default now()
);
create index if not exists cobranca_pagamentos_parcela_idx on public.cobranca_pagamentos (parcela_id);
create index if not exists cobranca_pagamentos_cobranca_idx on public.cobranca_pagamentos (cobranca_id, data);
create index if not exists cobranca_pagamentos_data_idx on public.cobranca_pagamentos (data) where estornado_em is null;

-- Registrar um recebimento. Pode ser parcial. Passou do saldo: o resto é juros/multa. Com "quitar", o que faltar vira desconto.
create or replace function public.registrar_pagamento_parcela(
  p_parcela uuid, p_valor numeric, p_data date, p_forma text, p_observacao text default null, p_quitar boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  p public.cobranca_parcelas;
  c public.cobrancas;
  v_saldo numeric(12, 2);
  v_principal numeric(12, 2);
  v_encargos numeric(12, 2) := 0;
  v_desconto numeric(12, 2) := 0;
  v_lanc uuid;
  v_id uuid;
  v_nome text;
begin
  if not public.pode('financeiro', 'editar') then raise exception 'Só o Financeiro registra recebimentos.'; end if;
  p_valor := round(coalesce(p_valor, 0), 2);
  if p_valor <= 0 then raise exception 'Informe o valor recebido.'; end if;
  if p_forma is null or p_forma not in ('Boleto', 'PIX', 'Dinheiro', 'Cartão', 'Transferência', 'Outro') then
    raise exception 'Forma de recebimento inválida (Boleto, PIX, Dinheiro, Cartão, Transferência ou Outro).';
  end if;
  if p_data is null or p_data > current_date then raise exception 'Informe a data do recebimento (não pode ser no futuro).'; end if;
  select * into p from public.cobranca_parcelas where id = p_parcela for update;
  if not found then raise exception 'Parcela não encontrada.'; end if;
  if p.situacao not in ('Aberta', 'Parcial') then raise exception 'Esta parcela está % e não recebe pagamento.', lower(p.situacao); end if;
  select * into c from public.cobrancas where id = p.cobranca_id;
  v_saldo := p.valor - p.baixado;
  if p_valor >= v_saldo then
    v_principal := v_saldo;
    v_encargos := p_valor - v_saldo;
  else
    v_principal := p_valor;
    if p_quitar then v_desconto := v_saldo - p_valor; end if;
  end if;
  select nome into v_nome from public.colaboradores where id = auth.uid();
  if c.cobrador_id is not null then
    insert into public.lancamentos (setor, indicador_id, colaborador_id, quantidade, descricao, data, origem)
    values ('cobranca', 'valor_recebido', c.cobrador_id, p_valor,
            format('Recebido parcela %s/%s — %s', p.numero, p.total, (select nome from public.clientes where id = c.cliente_id)), p_data, 'automatico')
    returning id into v_lanc;
  end if;
  insert into public.cobranca_pagamentos (parcela_id, cobranca_id, valor, principal, encargos, desconto, data, forma, observacao, lancamento_id, registrado_por, registrado_por_nome)
  values (p.id, p.cobranca_id, p_valor, v_principal, v_encargos, v_desconto, p_data, p_forma, nullif(btrim(coalesce(p_observacao, '')), ''), v_lanc, auth.uid(), v_nome)
  returning id into v_id;
  perform set_config('dlg.cobranca_pagamento', '1', true);
  update public.cobranca_parcelas
     set baixado = baixado + v_principal + v_desconto,
         pago_em = case when baixado + v_principal + v_desconto >= valor then p_data end
   where id = p.id;
  perform set_config('dlg.cobranca_pagamento', '', true);
  return v_id;
end $$;
revoke all on function public.registrar_pagamento_parcela(uuid, numeric, date, text, text, boolean) from public, anon;
grant execute on function public.registrar_pagamento_parcela(uuid, numeric, date, text, text, boolean) to authenticated;

-- Estornar um recebimento lançado por engano (só ADM): a parcela volta a ficar em aberto e sai da meta do cobrador
create or replace function public.estornar_pagamento_parcela(p_pagamento uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare pg public.cobranca_pagamentos;
begin
  if not public.pode('financeiro', 'excluir') then raise exception 'Só o ADM estorna recebimentos.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno.'; end if;
  select * into pg from public.cobranca_pagamentos where id = p_pagamento for update;
  if not found then raise exception 'Recebimento não encontrado.'; end if;
  if pg.estornado_em is not null then raise exception 'Este recebimento já foi estornado.'; end if;
  update public.cobranca_pagamentos
     set estornado_em = now(), estorno_motivo = btrim(p_motivo),
         estornado_por_nome = coalesce((select nome from public.colaboradores where id = auth.uid()), 'sistema'),
         lancamento_id = null
   where id = pg.id;
  if pg.lancamento_id is not null then delete from public.lancamentos where id = pg.lancamento_id; end if;
  perform set_config('dlg.cobranca_pagamento', '1', true);
  update public.cobranca_parcelas
     set baixado = greatest(0, baixado - pg.principal - pg.desconto),
         situacao = case when situacao in ('Paga', 'Parcial', 'Aberta') then 'Aberta' else situacao end,
         pago_em = null
   where id = pg.parcela_id;
  perform set_config('dlg.cobranca_pagamento', '', true);
end $$;
revoke all on function public.estornar_pagamento_parcela(uuid, text) from public, anon;
grant execute on function public.estornar_pagamento_parcela(uuid, text) to authenticated;

-- 5. Contas com a data de hoje
create or replace view public.vw_cobranca_parcelas with (security_invoker = true) as
select
  p.*,
  p.valor - p.baixado as saldo,
  (p.situacao in ('Aberta', 'Parcial') and p.vencimento < current_date) as vencida,
  case when p.situacao in ('Aberta', 'Parcial') and p.vencimento < current_date then current_date - p.vencimento else 0 end as dias_atraso,
  case when p.situacao in ('Aberta', 'Parcial') and p.vencimento < current_date then p.multa else 0 end as multa_devida,
  case when p.situacao in ('Aberta', 'Parcial') and p.vencimento < current_date
       then round((current_date - p.vencimento) * r.juros_dia, 2) else 0 end as juros,
  p.valor - p.baixado
    + case when p.situacao in ('Aberta', 'Parcial') and p.vencimento < current_date
           then p.multa + round((current_date - p.vencimento) * r.juros_dia, 2) else 0 end as atualizado
from public.cobranca_parcelas p
cross join (select coalesce(public.regra_cobranca('juros_dia'), 0) as juros_dia) r;

create or replace view public.vw_cobrancas with (security_invoker = true) as
select
  c.id, c.cliente_id, cl.nome as cliente, cl.documento, cl.documento_ok, coalesce(cl.whatsapp, cl.telefone1) as telefone,
  cl.cidade, cl.uf, cl.busca,
  c.venda_id, c.origem, c.codigo_venda, c.codigo_sistema_antigo,
  c.categoria_id, cat.nome as categoria, cat.grupo, cat.conta_inadimplencia, cat.pode_spc, cat.escritorio_id,
  c.cobrador_id, co.nome as cobrador, c.situacao, c.observacao, c.created_at, c.updated_at,
  a.parcelas, a.parcelas_abertas, a.parcelas_vencidas,
  a.valor_total, a.recebido, a.em_aberto, a.vencido, a.a_vencer, a.multa, a.juros,
  a.vencido + a.multa + a.juros as atualizado,
  a.vencido + a.multa + a.juros + a.a_vencer as total_divida,
  a.vencida_desde, a.proximo_vencimento,
  case when a.parcelas_abertas = 0 and a.em_acordo = 0 and a.pagas > 0 then a.ultimo_pagamento end as quitada_em,
  coalesce(current_date - a.vencida_desde, 0) as dias_atraso,
  case when a.vencida_desde is null then null
       when current_date - a.vencida_desde <= 60 then 'Até 60 dias'
       when current_date - a.vencida_desde <= 180 then '61 a 180 dias'
       when current_date - a.vencida_desde <= 360 then '181 a 360 dias'
       else 'Acima de 360 dias' end as faixa_dias,
  case when a.parcelas_vencidas = 0 then null
       when a.parcelas_vencidas <= 2 then '1 a 2'
       when a.parcelas_vencidas <= 4 then '3 a 4'
       when a.parcelas_vencidas <= 6 then '5 a 6'
       when a.parcelas_vencidas <= 12 then '7 a 12'
       when a.parcelas_vencidas <= 24 then '13 a 24'
       else '25 ou mais' end as faixa_parcelas,
  -- carteira automática: pelo grupo da categoria; Cobrança DLG / Registro SPC com mais de 730 dias vai para a Terceirizada
  case when a.parcelas_abertas = 0 and a.em_acordo > 0 then 'Em acordo'
       when a.parcelas_abertas = 0 and a.pagas > 0 then 'Quitada'
       when a.parcelas_abertas = 0 then 'Cancelada'
       when cat.grupo in ('Terceirizada', 'Advogado', 'Fundo perdido', 'Fora da cobrança') then cat.grupo
       when coalesce(current_date - a.vencida_desde, 0) > r.terceirizada_dias then 'Terceirizada'
       else 'Cobrança DLG' end as carteira,
  (cat.grupo in ('Cobrança DLG', 'Registro SPC') and a.parcelas_abertas > 0
     and coalesce(current_date - a.vencida_desde, 0) > r.terceirizada_dias) as fora_da_categoria,
  -- renegociar: carteira DLG (até 730 dias), com o mínimo de boletos vencidos e de dias de atraso das regras
  (cat.grupo in ('Cobrança DLG', 'Registro SPC') and a.vencido > 0
     and current_date - a.vencida_desde <= r.terceirizada_dias
     and a.parcelas_vencidas >= r.reneg_min_boletos and current_date - a.vencida_desde >= r.reneg_min_dias) as pode_renegociar,
  -- ir ao SPC: igual, mas ainda fora do Registro SPC, com categoria que permite e CPF/CNPJ válido
  (cat.grupo = 'Cobrança DLG' and cat.pode_spc and cl.documento_ok and a.vencido > 0
     and current_date - a.vencida_desde <= r.terceirizada_dias
     and a.parcelas_vencidas >= r.reneg_min_boletos and current_date - a.vencida_desde >= r.reneg_min_dias) as pode_ir_spc
from public.cobrancas c
join public.clientes cl on cl.id = c.cliente_id
join public.cobranca_categorias cat on cat.id = c.categoria_id
left join public.colaboradores co on co.id = c.cobrador_id
cross join (select coalesce(public.regra_cobranca('juros_dia'), 0) as juros_dia,
                   coalesce(public.regra_cobranca('terceirizada_dias'), 730) as terceirizada_dias,
                   coalesce(public.regra_cobranca('reneg_min_boletos'), 2) as reneg_min_boletos,
                   coalesce(public.regra_cobranca('reneg_min_dias'), 61) as reneg_min_dias) r
left join lateral (
  select
    count(*) filter (where q.situacao <> 'Cancelada')::int as parcelas,
    count(*) filter (where q.aberta)::int as parcelas_abertas,
    count(*) filter (where q.vencida)::int as parcelas_vencidas,
    count(*) filter (where q.situacao = 'Paga')::int as pagas,
    count(*) filter (where q.situacao = 'Em acordo')::int as em_acordo,
    coalesce(sum(q.valor) filter (where q.situacao <> 'Cancelada'), 0) as valor_total,
    coalesce((select sum(pg.valor) from public.cobranca_pagamentos pg where pg.cobranca_id = c.id and pg.estornado_em is null), 0) as recebido,
    coalesce(sum(q.valor - q.baixado) filter (where q.aberta), 0) as em_aberto,
    coalesce(sum(q.valor - q.baixado) filter (where q.vencida), 0) as vencido,
    coalesce(sum(q.valor - q.baixado) filter (where q.aberta and not q.vencida), 0) as a_vencer,
    coalesce(sum(q.multa) filter (where q.vencida), 0) as multa,
    coalesce(sum(round((current_date - q.vencimento) * r.juros_dia, 2)) filter (where q.vencida), 0) as juros,
    min(q.vencimento) filter (where q.vencida) as vencida_desde,
    min(q.vencimento) filter (where q.aberta and not q.vencida) as proximo_vencimento,
    max(q.pago_em) as ultimo_pagamento
  from (
    select p.*, p.situacao in ('Aberta', 'Parcial') as aberta,
           (p.situacao in ('Aberta', 'Parcial') and p.vencimento < current_date) as vencida
    from public.cobranca_parcelas p
    where p.cobranca_id = c.id
  ) q
) a on true;

-- 6. Totais dos cartões (por carteira e faixa de dias), calculados no banco; opcional: só de um cobrador
create or replace function public.resumo_cobrancas(p_cobrador uuid default null)
returns table (carteira text, faixa_dias text, cobrancas bigint, clientes bigint, vencido numeric, atualizado numeric, total_divida numeric)
language sql stable set search_path = public as $$
  select v.carteira, v.faixa_dias, count(*), count(distinct v.cliente_id), sum(v.vencido), sum(v.atualizado), sum(v.total_divida)
  from public.vw_cobrancas v
  where p_cobrador is null or v.cobrador_id = p_cobrador
  group by v.carteira, v.faixa_dias
$$;
revoke all on function public.resumo_cobrancas(uuid) from public, anon;
grant execute on function public.resumo_cobrancas(uuid) to authenticated;

-- 7. Permissões: Cobrança e Financeiro veem; o Financeiro (e ADM) lança e altera; quem é de fora não acessa.
--    Recebimento e estorno só pelas funções acima. FORA do tempo real (as telas buscam no servidor).
do $$
declare t text;
begin
  foreach t in array array['cobrancas', 'cobranca_parcelas', 'cobranca_pagamentos', 'cobranca_categorias_historico'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.pode(''cobranca'', ''visualizar'')) or (select public.pode(''financeiro'', ''visualizar'')))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    if t in ('cobrancas', 'cobranca_parcelas') then
      execute format('create policy %I on public.%I for insert to authenticated with check ((select public.pode(''financeiro'', ''criar'')))', t || '_insert', t);
      execute format('create policy %I on public.%I for update to authenticated using ((select public.pode(''financeiro'', ''editar''))) with check ((select public.pode(''financeiro'', ''editar'')))', t || '_update', t);
      execute format('create policy %I on public.%I for delete to authenticated using ((select public.pode(''financeiro'', ''excluir'')))', t || '_delete', t);
      execute format('drop trigger if exists trg_updated_at on public.%I', t);
      execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.tocar_updated_at()', t);
      -- auditoria das mudanças (a carga da migração não enche a auditoria)
      execute format('drop trigger if exists trg_auditoria on public.%I', t);
      execute format('create trigger trg_auditoria after update or delete on public.%I for each row execute function public.fn_auditoria()', t);
    elsif t = 'cobranca_pagamentos' then
      execute format('drop trigger if exists trg_auditoria on public.%I', t);
      execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.fn_auditoria()', t);
    end if;
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
revoke all on public.vw_cobrancas, public.vw_cobranca_parcelas from public, anon;
grant select on public.vw_cobrancas, public.vw_cobranca_parcelas to authenticated;
grant select on public.vw_cobrancas, public.vw_cobranca_parcelas to service_role;

notify pgrst, 'reload schema';

-- Conferência (esperado: 4 | true | false | false)
select
  (select count(*) from pg_tables where schemaname = 'public' and tablename in ('cobrancas', 'cobranca_parcelas', 'cobranca_pagamentos', 'cobranca_categorias_historico')) as tabelas,
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.cobrancas'::regclass, 'public.cobranca_parcelas'::regclass,
     'public.cobranca_pagamentos'::regclass, 'public.cobranca_categorias_historico'::regclass)) as com_rls,
  has_table_privilege('anon', 'public.vw_cobrancas', 'select') as de_fora_le,
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('cobrancas', 'cobranca_parcelas')) as no_tempo_real;
