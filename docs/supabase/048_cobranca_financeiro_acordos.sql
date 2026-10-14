-- 048 — Cobrança, etapa 4 (14/10, SPEC_COBRANCA v0.6, seção 6.5): o Financeiro confere a entrada e efetiva o acordo
-- Igual à "Confirmação de Entradas de Renegociação" do sistema antigo, sem Conta Azul dentro do sistema:
-- 1. CONFIRMAR: valor e forma da entrada têm que ser EXATAMENTE os do acordo (se não, o Financeiro devolve ao cobrador);
--    informa a data real do recebimento. Acordo "Entrada confirmada". Quitação à vista: confirmar já efetiva.
-- 2. DEVOLVER AO COBRADOR (motivo obrigatório): entrada diferente do combinado → o acordo volta a ser simulação e aparece
--    no "Para hoje" do cobrador para refazer.
-- 3. REVERTER A CONFIRMAÇÃO (motivo obrigatório): antes de efetivar, volta para "Aguardando entrada".
-- 4. EFETIVAR (o Financeiro já gerou os boletos no Conta Azul, por fora): as parcelas em aberto da dívida ficam "Em acordo"
--    e nasce a cobrança do acordo (mesma conta/CNPJ, categoria e cobrador) com a entrada já paga e as parcelas novas.
-- 5. ACORDO QUEBRADO (entrada não paga, motivo obrigatório): a dívida antiga continua como estava; nova tentativa = nova versão.
-- 6. BOLETOS ENVIADOS ao cliente: o Financeiro marca (com a data).
-- A meta/comissão do cobrador (etapa 5) lê os acordos confirmados; o pagamento da entrada aqui não gera lançamento de meta.
-- Só ACRESCENTA (colunas, funções, view); a única mudança é aceitar a origem "Acordo" nas cobranças.
-- Rodar inteiro no SQL Editor. Conferência esperada (última linha): funcoes = 6, view_ok = true, origem_ok = true.

begin;

alter table public.cobrancas drop constraint if exists cobrancas_origem_check;
alter table public.cobrancas add constraint cobrancas_origem_check check (origem in ('Venda', 'Migração', 'Lançamento manual', 'Acordo'));
alter table public.cobrancas add column if not exists acordo_origem_id uuid references public.cobranca_acordos(id) on delete set null;
alter table public.cobranca_parcelas add column if not exists cobranca_acordo_id uuid references public.cobranca_acordos(id) on delete set null;

alter table public.cobranca_acordos add column if not exists entrada_confirmada_valor numeric(12, 2);
alter table public.cobranca_acordos add column if not exists entrada_confirmada_forma text;
alter table public.cobranca_acordos add column if not exists entrada_recebida_em date;
alter table public.cobranca_acordos add column if not exists confirmado_em timestamptz;
alter table public.cobranca_acordos add column if not exists confirmado_por_nome text;
alter table public.cobranca_acordos add column if not exists efetivado_em timestamptz;
alter table public.cobranca_acordos add column if not exists efetivado_por_nome text;
alter table public.cobranca_acordos add column if not exists cobranca_nova_id uuid references public.cobrancas(id) on delete set null;
alter table public.cobranca_acordos add column if not exists boletos_enviados_em date;
alter table public.cobranca_acordos add column if not exists motivo text;
alter table public.cobranca_acordos add column if not exists devolvido_em timestamptz;

create or replace function public.acordo_evento(p_acao text, p_extra jsonb default '{}') returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_array(jsonb_build_object('em', now(), 'por', (select nome from public.colaboradores where id = auth.uid()), 'acao', p_acao) || p_extra)
$$;

-- 4. Efetivar (interna: usada pelo confirmar à vista e pelo efetivar)
create or replace function public.efetivar_acordo_interno(p_acordo uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a public.cobranca_acordos;
  c public.cobrancas;
  v_nova uuid;
  v_parc uuid;
  v_nome text;
  i int;
  v_valor numeric(12, 2);
begin
  select * into a from public.cobranca_acordos where id = p_acordo for update;
  select * into c from public.cobrancas where id = a.cobranca_id for update;
  select nome into v_nome from public.colaboradores where id = auth.uid();
  -- a dívida antiga fica "Em acordo" (o que estava em aberto)
  update public.cobranca_parcelas set situacao = 'Em acordo', cobranca_acordo_id = a.id
   where cobranca_id = c.id and situacao in ('Aberta', 'Parcial');
  -- a cobrança do acordo: mesma conta, categoria e cobrador
  insert into public.cobrancas (cliente_id, origem, codigo_venda, categoria_id, cobrador_id, conta, referencia, observacao, acordo_origem_id, situacao)
  values (c.cliente_id, 'Acordo', c.codigo_venda, c.categoria_id, c.cobrador_id, c.conta,
          concat_ws(' • ', format('Acordo v%s', a.versao), nullif(c.referencia, '')), a.observacao, a.id, 'Aguardando cobrança')
  returning id into v_nova;
  perform set_config('dlg.cobranca_pagamento', '1', true);
  if a.entrada > 0 then
    insert into public.cobranca_parcelas (cobranca_id, numero, total, valor, vencimento, multa, cobra_juros, cobranca_acordo_id)
    values (v_nova, 0, greatest(a.parcelas_qtd, 1), a.entrada, a.entrada_recebida_em, 0, false, a.id)
    returning id into v_parc;
    insert into public.cobranca_pagamentos (parcela_id, cobranca_id, valor, principal, encargos, desconto, data, forma, observacao, registrado_por, registrado_por_nome)
    values (v_parc, v_nova, a.entrada, a.entrada, 0, 0, a.entrada_recebida_em, a.entrada_confirmada_forma,
            format('Entrada do acordo v%s (confirmada pelo Financeiro)', a.versao), auth.uid(), v_nome);
    update public.cobranca_parcelas set baixado = valor, pago_em = a.entrada_recebida_em where id = v_parc;
  end if;
  for i in 1 .. a.parcelas_qtd loop
    v_valor := case when i = a.parcelas_qtd then a.valor_prazo - a.parcela_valor * (a.parcelas_qtd - 1) else a.parcela_valor end;
    insert into public.cobranca_parcelas (cobranca_id, numero, total, valor, vencimento, cobranca_acordo_id)
    values (v_nova, i, a.parcelas_qtd, v_valor, (a.primeiro_vencimento + make_interval(months => i - 1))::date, a.id);
  end loop;
  perform set_config('dlg.cobranca_pagamento', '', true);
  update public.cobranca_acordos
     set situacao = 'Efetivada', efetivado_em = now(), efetivado_por_nome = v_nome, cobranca_nova_id = v_nova,
         historico = historico || public.acordo_evento('Renegociação efetivada'), updated_at = now()
   where id = a.id;
  update public.cobrancas set situacao = 'Renegociação efetivada', updated_at = now() where id = c.id;
  return v_nova;
end $$;
revoke all on function public.efetivar_acordo_interno(uuid) from public, anon, authenticated;

-- ações do Financeiro
create or replace function public.financeiro_acordo(p_acordo uuid, p_acao text, p_valor numeric default null, p_forma text default null,
                                                    p_data date default null, p_motivo text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  a public.cobranca_acordos;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not public.pode('financeiro', 'editar') then raise exception 'Só o Financeiro confere a entrada do acordo.'; end if;
  select * into a from public.cobranca_acordos where id = p_acordo for update;
  if a.id is null then raise exception 'Acordo não encontrado.'; end if;
  if p_acao in ('devolver', 'reverter', 'quebrar') and (v_motivo is null or length(v_motivo) < 8) then
    raise exception 'Informe o motivo (pelo menos 8 letras).';
  end if;

  if p_acao = 'confirmar' then
    if a.situacao <> 'Aguardando entrada' then raise exception 'Este acordo está "%": não confirma entrada.', a.situacao; end if;
    if a.entrada <= 0 then raise exception 'Este acordo não tem entrada.'; end if;
    if p_valor is null or round(p_valor, 2) <> a.entrada then
      raise exception 'O valor recebido tem que ser exatamente % (o combinado). Diferente disso: devolva ao cobrador.', to_char(a.entrada, 'FM999G999G990D00');
    end if;
    if p_forma is null or p_forma <> a.entrada_forma then
      raise exception 'A forma tem que ser % (a combinada). Diferente disso: devolva ao cobrador.', a.entrada_forma;
    end if;
    if p_data is null or p_data > current_date then raise exception 'Informe a data real do recebimento (não pode ser no futuro).'; end if;
    update public.cobranca_acordos
       set situacao = 'Entrada confirmada', entrada_confirmada_valor = round(p_valor, 2), entrada_confirmada_forma = p_forma,
           entrada_recebida_em = p_data, confirmado_em = now(), confirmado_por_nome = (select nome from public.colaboradores where id = auth.uid()),
           historico = historico || public.acordo_evento('Entrada confirmada pelo Financeiro', jsonb_build_object('valor', p_valor, 'forma', p_forma, 'data', p_data)),
           updated_at = now()
     where id = a.id;
    update public.cobrancas set situacao = 'Entrada confirmada', updated_at = now() where id = a.cobranca_id;
    if a.quitacao_a_vista then perform public.efetivar_acordo_interno(a.id); return 'Entrada confirmada e quitação à vista efetivada.'; end if;
    return 'Entrada confirmada.';

  elsif p_acao = 'devolver' then
    if a.situacao <> 'Aguardando entrada' then raise exception 'Só devolve acordo aguardando a entrada.'; end if;
    update public.cobranca_acordos
       set situacao = 'Simulada', motivo = v_motivo, devolvido_em = now(), retorno_em = current_date, fechado_em = null,
           historico = historico || public.acordo_evento('Devolvido ao cobrador pelo Financeiro', jsonb_build_object('motivo', v_motivo)), updated_at = now()
     where id = a.id;
    update public.cobrancas set situacao = 'Renegociação simulada', retorno_em = current_date, updated_at = now() where id = a.cobranca_id;
    return 'Acordo devolvido ao cobrador.';

  elsif p_acao = 'reverter' then
    if a.situacao <> 'Entrada confirmada' then raise exception 'Só reverte entrada confirmada e ainda não efetivada.'; end if;
    update public.cobranca_acordos
       set situacao = 'Aguardando entrada', entrada_confirmada_valor = null, entrada_confirmada_forma = null, entrada_recebida_em = null,
           confirmado_em = null, confirmado_por_nome = null, motivo = v_motivo,
           historico = historico || public.acordo_evento('Confirmação revertida', jsonb_build_object('motivo', v_motivo)), updated_at = now()
     where id = a.id;
    update public.cobrancas set situacao = 'Renegociação feita (aguardando entrada)', updated_at = now() where id = a.cobranca_id;
    return 'Confirmação revertida.';

  elsif p_acao = 'efetivar' then
    if a.situacao <> 'Entrada confirmada' then raise exception 'Só efetiva acordo com a entrada confirmada.'; end if;
    perform public.efetivar_acordo_interno(a.id);
    return 'Renegociação efetivada: parcelas novas criadas.';

  elsif p_acao = 'quebrar' then
    if a.situacao <> 'Aguardando entrada' then raise exception 'Só marca como quebrado acordo aguardando a entrada.'; end if;
    update public.cobranca_acordos
       set situacao = 'Quebrada', motivo = v_motivo,
           historico = historico || public.acordo_evento('Acordo quebrado (entrada não paga)', jsonb_build_object('motivo', v_motivo)), updated_at = now()
     where id = a.id;
    update public.cobrancas set situacao = 'Acordo quebrado', retorno_em = null, updated_at = now() where id = a.cobranca_id;
    return 'Acordo quebrado registrado.';

  elsif p_acao = 'boletos_enviados' then
    if a.situacao <> 'Efetivada' then raise exception 'Só marca boletos enviados de acordo efetivado.'; end if;
    update public.cobranca_acordos
       set boletos_enviados_em = case when boletos_enviados_em is null then coalesce(p_data, current_date) end,
           historico = historico || public.acordo_evento(case when boletos_enviados_em is null then 'Boletos enviados ao cliente' else 'Envio de boletos desmarcado' end),
           updated_at = now()
     where id = a.id;
    return 'Envio dos boletos atualizado.';
  end if;
  raise exception 'Ação inválida.';
end $$;
revoke all on function public.financeiro_acordo(uuid, text, numeric, text, date, text) from public, anon;
grant execute on function public.financeiro_acordo(uuid, text, numeric, text, date, text) to authenticated;

-- a tela do Financeiro (uma linha por acordo fechado)
create or replace view public.vw_acordos_financeiro with (security_invoker = true) as
select a.id, a.cobranca_id, a.cliente_id, cl.nome as cliente, cl.documento, coalesce(cl.whatsapp, cl.telefone1) as telefone,
       c.codigo_venda, a.conta, a.versao, a.situacao, a.total_divida, a.desconto, a.entrada, a.entrada_prazo, a.entrada_forma,
       case when a.pagador_tipo = 'Titular' then cl.nome else a.pagador_nome end as pagador, a.pagador_documento,
       a.parcelas_qtd, a.parcela_valor, a.forma_pagamento, a.primeiro_vencimento, a.quitacao_a_vista, a.total_a_pagar, a.valor_prazo,
       a.observacao, a.criado_por_nome, a.fechado_em, a.ficha_impressoes, a.entrada_confirmada_valor, a.entrada_recebida_em,
       a.confirmado_por_nome, a.efetivado_em, a.cobranca_nova_id, a.boletos_enviados_em, a.motivo, a.estava_spc,
       (a.situacao = 'Aguardando entrada' and a.entrada_prazo < current_date) as entrada_vencida
  from public.cobranca_acordos a
  join public.clientes cl on cl.id = a.cliente_id
  join public.cobrancas c on c.id = a.cobranca_id
 where a.situacao in ('Aguardando entrada', 'Entrada confirmada', 'Efetivada', 'Quebrada');
revoke all on public.vw_acordos_financeiro from public, anon;
grant select on public.vw_acordos_financeiro to authenticated, service_role;

commit;
notify pgrst, 'reload schema';

-- Conferência
select
  (select count(*) from pg_proc where proname in ('financeiro_acordo', 'efetivar_acordo_interno', 'acordo_evento', 'salvar_acordo_cobranca',
                                                  'registrar_impressao_ficha_acordo', 'registrar_contato_cobranca')) as funcoes,
  exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'vw_acordos_financeiro') as view_ok,
  (select pg_get_constraintdef(oid) like '%Acordo%' from pg_constraint where conname = 'cobrancas_origem_check') as origem_ok;
