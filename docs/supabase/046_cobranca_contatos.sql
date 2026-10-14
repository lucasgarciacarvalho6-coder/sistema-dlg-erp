-- 046 — Cobrança, etapa 2 (14/10, SPEC_COBRANCA v0.6, seções 6.1–6.3): registrar contato, situações e "Para hoje"
-- Igual ao sistema antigo ("Registrar Cobrança"), com as decisões do usuário:
-- - tipo do contato: WhatsApp, Ligação, E-mail, Outro; data (padrão hoje, não pode ser no futuro);
-- - situações que o cobrador escolhe: Contato realizado sem acordo, Aguardando retorno, Pagamento de boleto agendado,
--   Não localizado, Ficha não encontrada SPC;
-- - observação OBRIGATÓRIA em "Contato realizado sem acordo" e "Não localizado";
-- - "Aguardando retorno" exige a data do retorno; "Pagamento de boleto agendado" exige a data do pagamento (hoje ou depois);
-- - só a carteira Cobrança DLG (com Registro SPC) recebe contato; Terceirizada/Advogado/Fundo perdido: só consulta;
-- - dívida com acordo em andamento não muda de situação por contato;
-- - todo contato fica no histórico: não se edita nem se apaga;
-- - "Promessa não cumprida": a data do pagamento agendado passou e a dívida ainda está vencida → aparece sozinha
--   (calculada na hora; não vira "sem acordo").
-- Só ACRESCENTA (tabela, colunas novas, funções e views novas): as telas que estão no ar continuam iguais.
-- Rodar inteiro no SQL Editor. Conferência esperada (última linha): tabela_ok = true, funcao_ok = true, view_ok = true.

begin;

-- 1. Datas da situação atual na própria cobrança
alter table public.cobrancas add column if not exists retorno_em date;
alter table public.cobrancas add column if not exists promessa_em date;
alter table public.cobrancas add column if not exists promessa_valor numeric(12, 2);
alter table public.cobrancas add column if not exists ultimo_contato_em date;

-- 2. Histórico de contatos
create table if not exists public.cobranca_contatos (
  id uuid primary key default gen_random_uuid(),
  cobranca_id uuid not null references public.cobrancas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null check (tipo in ('WhatsApp', 'Ligação', 'E-mail', 'Outro')),
  data date not null,
  situacao text not null,
  situacao_antes text,
  observacao text,
  retorno_em date,
  promessa_em date,
  promessa_valor numeric(12, 2) check (promessa_valor is null or promessa_valor > 0),
  registrado_por uuid references public.colaboradores(id) on delete set null,
  registrado_por_nome text,
  created_at timestamptz not null default now()
);
create index if not exists cobranca_contatos_cobranca_idx on public.cobranca_contatos (cobranca_id, created_at desc);
create index if not exists cobranca_contatos_cliente_idx on public.cobranca_contatos (cliente_id, created_at desc);
create index if not exists cobranca_contatos_data_idx on public.cobranca_contatos (data);

alter table public.cobranca_contatos enable row level security;
drop policy if exists cobranca_contatos_select on public.cobranca_contatos;
create policy cobranca_contatos_select on public.cobranca_contatos for select to authenticated
  using ((select public.pode('cobranca', 'visualizar')) or (select public.pode('financeiro', 'visualizar')));
-- sem insert/update/delete direto: só pela função abaixo (histórico não se mexe)
revoke all on public.cobranca_contatos from anon;
revoke insert, update, delete on public.cobranca_contatos from authenticated;
grant select on public.cobranca_contatos to authenticated;

-- 3. Registrar contato (uma ou mais cobranças do mesmo cliente)
create or replace function public.registrar_contato_cobranca(
  p_cobrancas uuid[], p_tipo text, p_data date, p_situacao text, p_observacao text default null,
  p_retorno date default null, p_promessa date default null, p_promessa_valor numeric default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_nome text;
  v_cliente uuid;
  v_qtd int := 0;
  c record;
begin
  if not (public.pode('cobranca', 'editar') or public.pode('cobranca', 'criar')) then
    raise exception 'Só a Cobrança registra contato.';
  end if;
  if p_cobrancas is null or cardinality(p_cobrancas) = 0 then raise exception 'Escolha a cobrança.'; end if;
  if p_tipo is null or p_tipo not in ('WhatsApp', 'Ligação', 'E-mail', 'Outro') then
    raise exception 'Escolha o tipo do contato (WhatsApp, Ligação, E-mail ou Outro).';
  end if;
  if p_data is null or p_data > current_date then raise exception 'Informe a data do contato (não pode ser no futuro).'; end if;
  if p_situacao is null or p_situacao not in ('Contato realizado sem acordo', 'Aguardando retorno', 'Pagamento de boleto agendado',
                                               'Não localizado', 'Ficha não encontrada SPC') then
    raise exception 'Escolha a situação da cobrança.';
  end if;
  if p_situacao in ('Contato realizado sem acordo', 'Não localizado') and v_obs is null then
    raise exception 'Observação obrigatória para "Cliente não localizado" e "Contato realizado sem acordo".';
  end if;
  if p_situacao = 'Aguardando retorno' and (p_retorno is null or p_retorno < current_date) then
    raise exception 'Informe a data do retorno (hoje ou depois).';
  end if;
  if p_situacao = 'Pagamento de boleto agendado' and (p_promessa is null or p_promessa < current_date) then
    raise exception 'Informe a data do pagamento agendado (hoje ou depois).';
  end if;
  if p_promessa_valor is not null and p_promessa_valor <= 0 then raise exception 'O valor prometido tem que ser maior que zero.'; end if;
  select nome into v_nome from public.colaboradores where id = auth.uid();

  for c in
    select v.id, v.cliente_id, v.carteira, v.vencido, x.situacao
      from public.vw_cobrancas v join public.cobrancas x on x.id = v.id
     where v.id = any (p_cobrancas)
     for update of x
  loop
    if v_cliente is null then v_cliente := c.cliente_id;
    elsif v_cliente <> c.cliente_id then raise exception 'As cobranças têm que ser do mesmo cliente.';
    end if;
    if c.carteira <> 'Cobrança DLG' then
      raise exception 'Esta dívida está na carteira % (a Cobrança só consulta).', c.carteira;
    end if;
    if coalesce(c.vencido, 0) <= 0 then raise exception 'Esta cobrança não tem boleto vencido.'; end if;
    if c.situacao in ('Renegociação feita (aguardando entrada)', 'Entrada confirmada', 'Renegociação efetivada') then
      raise exception 'Esta cobrança tem acordo em andamento (%): o contato não muda a situação.', c.situacao;
    end if;
    insert into public.cobranca_contatos (cobranca_id, cliente_id, tipo, data, situacao, situacao_antes, observacao,
                                          retorno_em, promessa_em, promessa_valor, registrado_por, registrado_por_nome)
    values (c.id, c.cliente_id, p_tipo, p_data, p_situacao, c.situacao, v_obs,
            case when p_situacao = 'Aguardando retorno' then p_retorno end,
            case when p_situacao = 'Pagamento de boleto agendado' then p_promessa end,
            case when p_situacao = 'Pagamento de boleto agendado' then round(p_promessa_valor, 2) end,
            auth.uid(), v_nome);
    update public.cobrancas
       set situacao = p_situacao,
           retorno_em = case when p_situacao = 'Aguardando retorno' then p_retorno end,
           promessa_em = case when p_situacao = 'Pagamento de boleto agendado' then p_promessa end,
           promessa_valor = case when p_situacao = 'Pagamento de boleto agendado' then round(p_promessa_valor, 2) end,
           ultimo_contato_em = greatest(coalesce(ultimo_contato_em, p_data), p_data),
           updated_at = now()
     where id = c.id;
    v_qtd := v_qtd + 1;
  end loop;
  if v_qtd <> cardinality(p_cobrancas) then raise exception 'Cobrança não encontrada.'; end if;
  return v_qtd;
end $$;
revoke all on function public.registrar_contato_cobranca(uuid[], text, date, text, text, date, date, numeric) from public, anon;
grant execute on function public.registrar_contato_cobranca(uuid[], text, date, text, text, date, date, numeric) to authenticated;

-- 4. Situação de hoje de cada cobrança (com a "Promessa não cumprida" calculada na hora)
create or replace view public.vw_cobranca_situacao with (security_invoker = true) as
select v.id as cobranca_id, v.cliente_id, v.carteira, v.vencido, v.conta,
       case when x.situacao = 'Pagamento de boleto agendado' and x.promessa_em < current_date and coalesce(v.vencido, 0) > 0
            then 'Promessa não cumprida' else x.situacao end as situacao,
       x.situacao as situacao_gravada, x.retorno_em, x.promessa_em, x.promessa_valor, x.ultimo_contato_em, x.cobrador_id
  from public.vw_cobrancas v join public.cobrancas x on x.id = v.id;

-- 5. "Para hoje": o que o cobrador precisa fazer hoje (uma linha por cobrança)
create or replace view public.vw_cobranca_para_hoje with (security_invoker = true) as
select s.*, cl.nome as cliente,
       case when s.situacao = 'Promessa não cumprida' then 'Boleto agendado vencido'
            when s.situacao_gravada = 'Pagamento de boleto agendado' and s.promessa_em = current_date then 'Pagamento agendado para hoje'
            when s.situacao_gravada = 'Aguardando retorno' and s.retorno_em < current_date then 'Retorno atrasado'
            when s.situacao_gravada = 'Aguardando retorno' and s.retorno_em = current_date then 'Retorno de hoje' end as pendencia,
       coalesce(case when s.situacao = 'Promessa não cumprida' then s.promessa_em end, s.retorno_em, s.promessa_em) as data_pendencia
  from public.vw_cobranca_situacao s join public.clientes cl on cl.id = s.cliente_id
 where s.carteira = 'Cobrança DLG' and coalesce(s.vencido, 0) > 0
   and (s.situacao = 'Promessa não cumprida'
        or (s.situacao_gravada = 'Pagamento de boleto agendado' and s.promessa_em = current_date)
        or (s.situacao_gravada = 'Aguardando retorno' and s.retorno_em <= current_date));

revoke all on public.vw_cobranca_situacao, public.vw_cobranca_para_hoje from public, anon;
grant select on public.vw_cobranca_situacao, public.vw_cobranca_para_hoje to authenticated, service_role;

commit;
notify pgrst, 'reload schema';

-- Conferência
select
  (select count(*) = 14 from information_schema.columns where table_schema = 'public' and table_name = 'cobranca_contatos') as tabela_ok,
  exists (select 1 from pg_proc where proname = 'registrar_contato_cobranca') as funcao_ok,
  exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'vw_cobranca_para_hoje') as view_ok;
