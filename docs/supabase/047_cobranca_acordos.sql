-- 047 — Cobrança, etapa 3 (14/10, SPEC_COBRANCA v0.6, seções 6.4 e 6.6): simulação e acordo, IGUAL ao sistema antigo
-- ("Dados Atualizados do Contrato" → "Simular Renegociação"), com as decisões do usuário:
-- - a conta: total da dívida (vencidos com juros e multa + a vencer) − desconto (% ou R$) − entrada = valor a prazo;
--   parcela = valor a prazo ÷ nº de parcelas (ou nº = valor a prazo ÷ valor desejado, para cima); entrada cobre tudo = à vista;
-- - nada trava por regra do setor (parcela mínima, entrada, elegibilidade, desconto): o sistema só AVISA na tela;
-- - entrada: PIX, Cartão ou Dinheiro; prazo para pagar a entrada (o cobrador escolhe); quem paga: titular ou outra pessoa
--   (nome + CPF/CNPJ);
-- - simulação: salva com a data de retorno (situação "Renegociação simulada"); acordo fechado: "Renegociação feita
--   (aguardando entrada)" e vai para o Financeiro; a ficha do acordo é impressa e entregue ao Financeiro (conta as impressões);
-- - o acordo guarda a fotografia da dívida no dia e CONGELA as parcelas vencidas e se estava em Registro SPC (comissão);
-- - editar: "só a data da entrada" (mantém tudo) ou "recalcular" (juros de hoje);
-- - a dívida fica no mesmo CNPJ (conta) da cobrança.
-- As parcelas antigas NÃO mudam aqui (isso é na efetivação pelo Financeiro, etapa 4).
-- Só ACRESCENTA (tabelas, funções, views novas e a view "Para hoje" com 2 pendências a mais): as telas no ar continuam iguais.
-- Rodar inteiro no SQL Editor. Conferência esperada (última linha): tabela_ok = true, condicoes = 9, funcoes_ok = true.

begin;

-- 1. Acordos (versões de renegociação de uma cobrança)
create table if not exists public.cobranca_acordos (
  id uuid primary key default gen_random_uuid(),
  cobranca_id uuid not null references public.cobrancas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  versao int not null default 1,
  situacao text not null check (situacao in ('Simulada', 'Aguardando entrada', 'Entrada confirmada', 'Efetivada', 'Quebrada', 'Cancelada')),
  conta text,
  -- fotografia da dívida no dia do cálculo
  data_calculo date not null,
  parcelas_snapshot jsonb not null default '[]',
  valor_original_atraso numeric(12, 2) not null,
  multa numeric(12, 2) not null,
  juros numeric(12, 2) not null,
  atualizado numeric(12, 2) not null,
  a_vencer numeric(12, 2) not null,
  total_divida numeric(12, 2) not null,
  -- condições
  desconto_tipo text not null default '%' check (desconto_tipo in ('%', 'R$')),
  desconto_informado numeric(12, 2) not null default 0,
  desconto numeric(12, 2) not null default 0,
  valor_apos_desconto numeric(12, 2) not null,
  entrada numeric(12, 2) not null default 0,
  entrada_prazo date,
  entrada_forma text check (entrada_forma in ('PIX', 'Cartão', 'Dinheiro')),
  pagador_tipo text not null default 'Titular' check (pagador_tipo in ('Titular', 'Outra pessoa')),
  pagador_nome text,
  pagador_documento text,
  valor_prazo numeric(12, 2) not null,
  simular_por text not null default 'Parcelas' check (simular_por in ('Parcelas', 'Valor')),
  parcelas_qtd int not null default 0 check (parcelas_qtd >= 0),
  parcela_valor numeric(12, 2) not null default 0,
  forma_pagamento text check (forma_pagamento in ('Pix', 'Boleto', 'Cartão', 'Transferência', 'Dinheiro')),
  primeiro_vencimento date,
  quitacao_a_vista boolean not null default false,
  total_a_pagar numeric(12, 2) not null,
  observacao text,
  retorno_em date,
  -- congelados para a comissão (seção 8.4)
  parcelas_vencidas_congeladas int not null,
  categoria_grupo_congelado text not null,
  estava_spc boolean not null,
  -- quem e quando
  cobrador_id uuid references public.colaboradores(id) on delete set null,
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_por_nome text,
  fechado_em timestamptz,
  ficha_impressa_em timestamptz,
  ficha_impressoes int not null default 0,
  historico jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cobranca_acordos_cobranca_idx on public.cobranca_acordos (cobranca_id, versao desc);
create index if not exists cobranca_acordos_situacao_idx on public.cobranca_acordos (situacao);
-- só 1 acordo aberto (simulado ou em andamento) por cobrança
create unique index if not exists cobranca_acordos_um_aberto on public.cobranca_acordos (cobranca_id)
  where situacao in ('Simulada', 'Aguardando entrada', 'Entrada confirmada');

alter table public.cobranca_acordos enable row level security;
drop policy if exists cobranca_acordos_select on public.cobranca_acordos;
create policy cobranca_acordos_select on public.cobranca_acordos for select to authenticated
  using ((select public.pode('cobranca', 'visualizar')) or (select public.pode('financeiro', 'visualizar')));
revoke all on public.cobranca_acordos from anon;
revoke insert, update, delete on public.cobranca_acordos from authenticated;
grant select on public.cobranca_acordos to authenticated;

-- 2. Tabela de condições por faixa (sugestão na simulação — do sistema antigo; o ADM muda em Configurações)
create table if not exists public.cobranca_condicoes_faixa (
  faixa int not null check (faixa in (2, 3, 4)),     -- 2: 61–180 dias · 3: 181–360 · 4: acima de 360
  condicao int not null check (condicao in (1, 2, 3)),
  entrada_pct numeric(6, 2) not null check (entrada_pct between 0 and 100),
  desc_juros_pct numeric(6, 2) not null check (desc_juros_pct between 0 and 100),
  desc_principal_pct numeric(6, 2) not null check (desc_principal_pct between 0 and 100),
  primary key (faixa, condicao)
);
insert into public.cobranca_condicoes_faixa values
  (2, 1, 100, 0, 0), (2, 2, 70, 0, 0), (2, 3, 50, 0, 0),
  (3, 1, 70, 0, 0), (3, 2, 50, 0, 0), (3, 3, 30, 0, 0),
  (4, 1, 50, 100, 0), (4, 2, 30, 100, 10), (4, 3, 20, 100, 20)
on conflict do nothing;
insert into public.cobranca_regras (chave, valor) values ('reneg_intervalo_ofertas', 3) on conflict (chave) do nothing;
alter table public.cobranca_condicoes_faixa enable row level security;
drop policy if exists cobranca_condicoes_select on public.cobranca_condicoes_faixa;
create policy cobranca_condicoes_select on public.cobranca_condicoes_faixa for select to authenticated
  using ((select public.pode('cobranca', 'visualizar')) or (select public.pode('financeiro', 'visualizar')));
drop policy if exists cobranca_condicoes_update on public.cobranca_condicoes_faixa;
create policy cobranca_condicoes_update on public.cobranca_condicoes_faixa for update to authenticated
  using ((select public.pode('cadastros', 'editar'))) with check ((select public.pode('cadastros', 'editar')));
revoke all on public.cobranca_condicoes_faixa from anon;
grant select, update on public.cobranca_condicoes_faixa to authenticated;

-- 3. Salvar simulação / fechar acordo (o banco refaz a conta com a dívida de hoje)
--    p_modo: 'simular' (salva a simulação com a data de retorno) | 'fechar' (acordo fechado → Financeiro)
--            | 'data' (acordo já fechado: só muda o prazo da entrada) | 'recalcular' (acordo já fechado: refaz com os juros de hoje)
create or replace function public.salvar_acordo_cobranca(p_cobranca uuid, p_modo text, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v record;
  a public.cobranca_acordos;
  v_nome text;
  v_desc_tipo text := coalesce(p_dados ->> 'desconto_tipo', '%');
  v_desc_inf numeric := round(coalesce((p_dados ->> 'desconto')::numeric, 0), 2);
  v_entrada numeric := round(coalesce((p_dados ->> 'entrada')::numeric, 0), 2);
  v_prazo_entrada date := nullif(p_dados ->> 'entrada_prazo', '')::date;
  v_forma_entrada text := nullif(p_dados ->> 'entrada_forma', '');
  v_pagador text := coalesce(nullif(p_dados ->> 'pagador_tipo', ''), 'Titular');
  v_pag_nome text := nullif(btrim(coalesce(p_dados ->> 'pagador_nome', '')), '');
  v_pag_doc text := nullif(regexp_replace(coalesce(p_dados ->> 'pagador_documento', ''), '\D', '', 'g'), '');
  v_simular text := coalesce(nullif(p_dados ->> 'simular_por', ''), 'Parcelas');
  v_qtd int := coalesce((p_dados ->> 'parcelas_qtd')::int, 1);
  v_valor_desejado numeric := round(coalesce((p_dados ->> 'valor_desejado')::numeric, 0), 2);
  v_forma text := coalesce(nullif(p_dados ->> 'forma_pagamento', ''), 'Boleto');
  v_primeiro date := nullif(p_dados ->> 'primeiro_vencimento', '')::date;
  v_retorno date := nullif(p_dados ->> 'retorno_em', '')::date;
  v_obs text := nullif(btrim(coalesce(p_dados ->> 'observacao', '')), '');
  v_desconto numeric;
  v_apos numeric;
  v_aprazo numeric;
  v_avista boolean;
  v_parcela numeric := 0;
  v_id uuid;
  v_snap jsonb;
  v_evento jsonb;
begin
  if not (public.pode('cobranca', 'editar') or public.pode('cobranca', 'criar')) then raise exception 'Só a Cobrança faz renegociação.'; end if;
  if p_modo is null or p_modo not in ('simular', 'fechar', 'data', 'recalcular') then raise exception 'Ação inválida.'; end if;
  select nome into v_nome from public.colaboradores where id = auth.uid();
  select * into a from public.cobranca_acordos
   where cobranca_id = p_cobranca and situacao in ('Simulada', 'Aguardando entrada', 'Entrada confirmada') for update;

  -- só a data da entrada (acordo já fechado): mantém juros, multa, entrada, parcelas e valor da parcela
  if p_modo = 'data' then
    if a.id is null or a.situacao <> 'Aguardando entrada' then raise exception 'Só dá para mudar a data da entrada de um acordo aguardando a entrada.'; end if;
    if v_prazo_entrada is null or v_prazo_entrada < current_date then raise exception 'Informe o prazo para pagar a entrada (hoje ou depois).'; end if;
    update public.cobranca_acordos
       set entrada_prazo = v_prazo_entrada, updated_at = now(),
           historico = historico || jsonb_build_array(jsonb_build_object('em', now(), 'por', v_nome, 'acao', 'Data da entrada alterada',
                                                                          'de', a.entrada_prazo, 'para', v_prazo_entrada))
     where id = a.id;
    return a.id;
  end if;
  if p_modo = 'recalcular' and (a.id is null or a.situacao <> 'Aguardando entrada') then
    raise exception 'Só dá para recalcular um acordo aguardando a entrada.';
  end if;
  if a.situacao = 'Entrada confirmada' then raise exception 'A entrada deste acordo já foi confirmada pelo Financeiro: não muda mais.'; end if;
  if p_modo in ('simular', 'fechar') and a.situacao = 'Aguardando entrada' then
    raise exception 'Esta cobrança já tem acordo fechado: use "Editar renegociação".';
  end if;

  select c.id, c.cliente_id, c.conta, c.carteira, c.grupo, c.vencido, c.multa, c.juros, c.atualizado, c.a_vencer, c.total_divida,
         c.parcelas_vencidas, x.situacao
    into v
    from public.vw_cobrancas c join public.cobrancas x on x.id = c.id where c.id = p_cobranca;
  if v.id is null then raise exception 'Cobrança não encontrada.'; end if;
  if v.carteira <> 'Cobrança DLG' then raise exception 'Esta dívida está na carteira % (a Cobrança só consulta).', v.carteira; end if;
  if coalesce(v.vencido, 0) <= 0 then raise exception 'Esta cobrança não tem boleto vencido.'; end if;

  -- validações que não são regra do setor (sem elas o acordo não existe)
  if v_desc_tipo not in ('%', 'R$') then raise exception 'Desconto inválido.'; end if;
  if v_desc_inf < 0 or (v_desc_tipo = '%' and v_desc_inf > 100) then raise exception 'O desconto vai de 0 a 100%%.'; end if;
  if v_entrada < 0 then raise exception 'A entrada não pode ser negativa.'; end if;
  if v_entrada > 0 and v_forma_entrada is null then raise exception 'Escolha a forma de pagamento da entrada (PIX, Cartão ou Dinheiro).'; end if;
  if v_entrada > 0 and (v_prazo_entrada is null or v_prazo_entrada < current_date) then raise exception 'Informe o prazo para pagar a entrada (hoje ou depois).'; end if;
  if v_pagador not in ('Titular', 'Outra pessoa') then raise exception 'Escolha quem paga a entrada.'; end if;
  if v_entrada > 0 and v_pagador = 'Outra pessoa' and (v_pag_nome is null or v_pag_doc is null or not public.documento_valido(v_pag_doc)) then
    raise exception 'Informe o nome e um CPF/CNPJ válido de quem vai pagar a entrada.';
  end if;
  if v_simular not in ('Parcelas', 'Valor') then raise exception 'Escolha como simular.'; end if;
  if v_forma not in ('Pix', 'Boleto', 'Cartão', 'Transferência', 'Dinheiro') then raise exception 'Forma de pagamento da renegociação inválida.'; end if;
  if p_modo = 'simular' and (v_retorno is null or v_retorno < current_date) then raise exception 'Informe a data do retorno do cliente (hoje ou depois).'; end if;

  -- a conta (igual ao sistema antigo)
  v_desconto := case when v_desc_tipo = '%' then round(v.total_divida * v_desc_inf / 100, 2) else least(v.total_divida, v_desc_inf) end;
  v_apos := greatest(0, round(v.total_divida - v_desconto, 2));
  v_aprazo := greatest(0, round(v_apos - v_entrada, 2));
  v_avista := v_entrada > 0 and v_aprazo <= 0.01;
  if v_avista then
    v_qtd := 0; v_aprazo := 0;
  else
    if v_simular = 'Valor' then
      if v_valor_desejado <= 0 then raise exception 'Informe o valor desejado da parcela.'; end if;
      v_qtd := greatest(1, ceil(v_aprazo / v_valor_desejado)::int);
    end if;
    if v_qtd is null or v_qtd < 1 then raise exception 'Informe o número de parcelas.'; end if;
    if v_primeiro is null then raise exception 'Informe o vencimento do primeiro boleto.'; end if;
    v_parcela := round(v_aprazo / v_qtd, 2);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('numero', p.numero, 'total', p.total, 'vencimento', p.vencimento, 'valor', p.valor,
                                               'em_aberto', p.saldo, 'dias_atraso', p.dias_atraso, 'multa', p.multa_devida, 'juros', p.juros,
                                               'atualizado', p.atualizado, 'vencida', p.vencida) order by p.vencimento, p.numero), '[]')
    into v_snap
    from public.vw_cobranca_parcelas p where p.cobranca_id = p_cobranca and p.situacao in ('Aberta', 'Parcial');

  v_evento := jsonb_build_object('em', now(), 'por', v_nome,
    'acao', case p_modo when 'simular' then 'Simulação salva' when 'fechar' then 'Acordo fechado' else 'Acordo recalculado' end);

  if a.id is not null then
    -- simulação existente: atualiza; "recalcular" refaz o acordo fechado com os juros de hoje
    update public.cobranca_acordos set
      situacao = case when p_modo = 'simular' then 'Simulada' else 'Aguardando entrada' end,
      conta = v.conta, data_calculo = current_date, parcelas_snapshot = v_snap,
      valor_original_atraso = v.vencido, multa = v.multa, juros = v.juros, atualizado = v.atualizado, a_vencer = v.a_vencer, total_divida = v.total_divida,
      desconto_tipo = v_desc_tipo, desconto_informado = v_desc_inf, desconto = v_desconto, valor_apos_desconto = v_apos,
      entrada = v_entrada, entrada_prazo = v_prazo_entrada, entrada_forma = case when v_entrada > 0 then v_forma_entrada end,
      pagador_tipo = v_pagador, pagador_nome = case when v_pagador = 'Outra pessoa' then v_pag_nome end,
      pagador_documento = case when v_pagador = 'Outra pessoa' then v_pag_doc end,
      valor_prazo = v_aprazo, simular_por = v_simular, parcelas_qtd = v_qtd, parcela_valor = v_parcela,
      forma_pagamento = case when v_avista then null else v_forma end, primeiro_vencimento = case when v_avista then null else v_primeiro end,
      quitacao_a_vista = v_avista, total_a_pagar = v_aprazo + v_entrada, observacao = v_obs,
      retorno_em = case when p_modo = 'simular' then v_retorno end,
      parcelas_vencidas_congeladas = v.parcelas_vencidas, categoria_grupo_congelado = v.grupo, estava_spc = (v.grupo = 'Registro SPC'),
      fechado_em = case when p_modo = 'simular' then null else coalesce(fechado_em, now()) end,
      historico = historico || jsonb_build_array(v_evento), updated_at = now()
    where id = a.id
    returning id into v_id;
  else
    insert into public.cobranca_acordos (
      cobranca_id, cliente_id, versao, situacao, conta, data_calculo, parcelas_snapshot,
      valor_original_atraso, multa, juros, atualizado, a_vencer, total_divida,
      desconto_tipo, desconto_informado, desconto, valor_apos_desconto, entrada, entrada_prazo, entrada_forma,
      pagador_tipo, pagador_nome, pagador_documento, valor_prazo, simular_por, parcelas_qtd, parcela_valor,
      forma_pagamento, primeiro_vencimento, quitacao_a_vista, total_a_pagar, observacao, retorno_em,
      parcelas_vencidas_congeladas, categoria_grupo_congelado, estava_spc, cobrador_id, criado_por, criado_por_nome, fechado_em, historico)
    values (
      p_cobranca, v.cliente_id,
      coalesce((select max(versao) from public.cobranca_acordos where cobranca_id = p_cobranca), 0) + 1,
      case when p_modo = 'simular' then 'Simulada' else 'Aguardando entrada' end, v.conta, current_date, v_snap,
      v.vencido, v.multa, v.juros, v.atualizado, v.a_vencer, v.total_divida,
      v_desc_tipo, v_desc_inf, v_desconto, v_apos, v_entrada, v_prazo_entrada, case when v_entrada > 0 then v_forma_entrada end,
      v_pagador, case when v_pagador = 'Outra pessoa' then v_pag_nome end, case when v_pagador = 'Outra pessoa' then v_pag_doc end,
      v_aprazo, v_simular, v_qtd, v_parcela,
      case when v_avista then null else v_forma end, case when v_avista then null else v_primeiro end, v_avista, v_aprazo + v_entrada, v_obs,
      case when p_modo = 'simular' then v_retorno end,
      v.parcelas_vencidas, v.grupo, (v.grupo = 'Registro SPC'),
      (select cobrador_id from public.cobrancas where id = p_cobranca), auth.uid(), v_nome,
      case when p_modo = 'simular' then null else now() end, jsonb_build_array(v_evento))
    returning id into v_id;
  end if;

  update public.cobrancas
     set situacao = case when p_modo = 'simular' then 'Renegociação simulada' else 'Renegociação feita (aguardando entrada)' end,
         retorno_em = case when p_modo = 'simular' then v_retorno end, promessa_em = null, promessa_valor = null, updated_at = now()
   where id = p_cobranca;
  return v_id;
end $$;
revoke all on function public.salvar_acordo_cobranca(uuid, text, jsonb) from public, anon;
grant execute on function public.salvar_acordo_cobranca(uuid, text, jsonb) to authenticated;

-- 4. Ficha impressa (o cobrador imprime e entrega ao Financeiro): conta as impressões
create or replace function public.registrar_impressao_ficha_acordo(p_acordo uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not (public.pode('cobranca', 'visualizar') or public.pode('financeiro', 'visualizar')) then raise exception 'Sem acesso.'; end if;
  update public.cobranca_acordos
     set ficha_impressoes = ficha_impressoes + 1, ficha_impressa_em = coalesce(ficha_impressa_em, now()), updated_at = now()
   where id = p_acordo and situacao in ('Aguardando entrada', 'Entrada confirmada', 'Efetivada')
  returning ficha_impressoes into v_n;
  if v_n is null then raise exception 'A ficha só sai de acordo fechado.'; end if;
  return v_n;
end $$;
revoke all on function public.registrar_impressao_ficha_acordo(uuid) from public, anon;
grant execute on function public.registrar_impressao_ficha_acordo(uuid) to authenticated;

-- 5. "Para hoje" com as pendências da renegociação (mesmas colunas + no fim)
create or replace view public.vw_cobranca_para_hoje with (security_invoker = true) as
select s.*, cl.nome as cliente,
       case when s.situacao = 'Promessa não cumprida' then 'Boleto agendado vencido'
            when s.situacao_gravada = 'Pagamento de boleto agendado' and s.promessa_em = current_date then 'Pagamento agendado para hoje'
            when s.situacao_gravada = 'Aguardando retorno' and s.retorno_em < current_date then 'Retorno atrasado'
            when s.situacao_gravada = 'Aguardando retorno' and s.retorno_em = current_date then 'Retorno de hoje'
            when s.situacao_gravada = 'Renegociação simulada' and s.retorno_em <= current_date then 'Retorno da simulação'
            when s.situacao_gravada = 'Renegociação feita (aguardando entrada)' then 'Entrada de renegociação vencida' end as pendencia,
       coalesce(case when s.situacao = 'Promessa não cumprida' then s.promessa_em end,
                case when s.situacao_gravada = 'Renegociação feita (aguardando entrada)' then ac.entrada_prazo end,
                s.retorno_em, s.promessa_em) as data_pendencia
  from public.vw_cobranca_situacao s
  join public.clientes cl on cl.id = s.cliente_id
  left join public.cobranca_acordos ac on ac.cobranca_id = s.cobranca_id and ac.situacao = 'Aguardando entrada'
 where s.carteira = 'Cobrança DLG' and coalesce(s.vencido, 0) > 0
   and (s.situacao = 'Promessa não cumprida'
        or (s.situacao_gravada = 'Pagamento de boleto agendado' and s.promessa_em = current_date)
        or (s.situacao_gravada in ('Aguardando retorno', 'Renegociação simulada') and s.retorno_em <= current_date)
        or (s.situacao_gravada = 'Renegociação feita (aguardando entrada)' and ac.entrada_prazo < current_date));
grant select on public.vw_cobranca_para_hoje to authenticated, service_role;

commit;
notify pgrst, 'reload schema';

-- Conferência
select
  exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cobranca_acordos') as tabela_ok,
  (select count(*) from public.cobranca_condicoes_faixa) as condicoes,
  (exists (select 1 from pg_proc where proname = 'salvar_acordo_cobranca')
   and exists (select 1 from pg_proc where proname = 'registrar_impressao_ficha_acordo')) as funcoes_ok;
