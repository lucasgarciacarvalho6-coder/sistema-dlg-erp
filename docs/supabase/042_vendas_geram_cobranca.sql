-- =====================================================================
-- 042 — Vendas geram a cobrança na carteira nova + telas buscam no servidor (Parte 2, etapas 2.3 e 2.4) (08/10/2026)
--
-- Conta de cada dívida: "CA Beatriz" (a conta ativa: vendas novas e lançamentos) ou "CA Diogo" (conta congelada:
-- só as cobranças antigas que vêm da migração). Fora isso, tudo igual: mesma equipe, mesmas regras, telas juntas.
-- A empresa tem venda EXTERNA e venda do REBOLO. Quando o Financeiro confere a venda (e na venda antiga "interna"),
-- o sistema agora cria a COBRANÇA e as PARCELAS nas tabelas do SQL 041 (antes criava os "títulos"):
--   • o cliente é achado pelo CPF/CNPJ (ou nome + telefone, sem documento) ou cadastrado na hora;
--   • categoria: Rebolo → "Receita de Vendas Online (Rebolo)"; as outras → "Receita de Recordação Escolar";
--   • entrada e venda à vista/cartão já entram como recebidas (com o "valor recebido" na meta, como antes);
--     boleto (e PIX/dinheiro parcelado) vira parcelas em aberto, todo mês, com a multa padrão das regras.
-- Os títulos que já existem em Contas a Receber são COPIADOS para a carteira nova (não duplica se rodar de novo).
-- "Negociar" da Cobrança passa a valer para a cobrança: as parcelas vencidas ficam "Em acordo"; se o ADM rejeitar
-- o acordo, elas voltam a ficar em aberto. Só negocia quem pode (regras: boletos vencidos e dias de atraso).
-- Para as telas (sem baixar tudo): uma linha por cliente (Contas a Receber e Inadimplência), indicadores do mês,
-- parcelas por venda (Vendas de Books) e o lançamento manual de uma cobrança pelo Financeiro.
--
-- Precisa do SQL 041. Pode rodar mais de uma vez. Rodar no SQL Editor do Supabase.
-- =====================================================================

-- 1. Campos novos
alter table public.cobrancas add column if not exists referencia text; -- "aluno • escola • pacote" (aparece na lista)
alter table public.cobrancas add column if not exists conta text not null default 'CA Beatriz';
alter table public.cobrancas drop constraint if exists cobrancas_conta_check;
alter table public.cobrancas add constraint cobrancas_conta_check check (conta in ('CA Beatriz', 'CA Diogo'));
alter table public.cobranca_parcelas add column if not exists acordo_id uuid references public.acordos(id) on delete set null;
alter table public.acordos add column if not exists cobranca_id uuid references public.cobrancas(id) on delete set null;
create index if not exists cobranca_parcelas_acordo_idx on public.cobranca_parcelas (acordo_id) where acordo_id is not null;

-- 2. Contas com a data de hoje (refeitas com a referência e as parcelas pagas) + uma linha por cliente
drop view if exists public.vw_inadimplentes;
drop view if exists public.vw_cobranca_clientes;
drop view if exists public.vw_cobrancas;

create view public.vw_cobrancas with (security_invoker = true) as
select
  c.id, c.cliente_id, cl.nome as cliente, cl.documento, cl.documento_ok, coalesce(cl.whatsapp, cl.telefone1) as telefone,
  cl.cidade, cl.uf, cl.busca,
  c.venda_id, c.origem, c.codigo_venda, c.codigo_sistema_antigo, c.referencia, c.conta,
  c.categoria_id, cat.nome as categoria, cat.grupo, cat.conta_inadimplencia, cat.pode_spc, cat.escritorio_id,
  c.cobrador_id, co.nome as cobrador, c.situacao, c.observacao, c.created_at, c.updated_at,
  a.parcelas, a.parcelas_abertas, a.parcelas_vencidas, a.pagas as parcelas_pagas,
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
    -- juros = R$ por dia × soma dos dias de atraso das parcelas vencidas (uma conta só: rápido com 110 mil parcelas)
    coalesce(round(sum(current_date - q.vencimento) filter (where q.vencida) * r.juros_dia, 2), 0) as juros,
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

-- Financeiro › Contas a Receber: um nome por linha (todas as cobranças da pessoa)
create view public.vw_cobranca_clientes with (security_invoker = true) as
select
  v.cliente_id, max(v.cliente) as cliente, max(v.documento) as documento, bool_or(v.documento_ok) as documento_ok,
  max(v.telefone) as telefone, max(v.cidade) as cidade, max(v.uf) as uf,
  max(v.busca) || ' ' || coalesce(string_agg(public.texto_busca(v.referencia), ' '), '') as busca,
  string_agg(distinct v.referencia, ' | ') as referencias,
  count(*)::int as cobrancas, sum(v.parcelas)::int as parcelas, sum(v.parcelas_pagas)::int as parcelas_pagas,
  sum(v.parcelas_vencidas)::int as parcelas_vencidas,
  sum(v.valor_total) as valor_total, sum(v.recebido) as recebido, sum(v.em_aberto) as em_aberto, sum(v.vencido) as vencido,
  sum(v.atualizado) as atualizado, sum(v.total_divida) as total_divida,
  min(v.vencida_desde) as vencida_desde, min(v.proximo_vencimento) as proximo_vencimento,
  least(min(v.vencida_desde), min(v.proximo_vencimento)) as vence_primeiro,
  max(v.dias_atraso) as dias_atraso,
  array_agg(distinct v.carteira) as carteiras,
  array_agg(distinct v.conta) as contas,
  array_remove(array_agg(distinct v.cobrador), null) as cobradores,
  case when sum(v.vencido) > 0 then 'Em atraso' when sum(v.em_aberto) > 0 then 'Em dia'
       when bool_or(v.carteira = 'Em acordo') then 'Em acordo' when bool_or(v.carteira = 'Quitada') then 'Quitado' else 'Cancelado' end as situacao,
  case when sum(v.vencido) > 0 then 1 when sum(v.em_aberto) > 0 then 2
       when bool_or(v.carteira = 'Em acordo') then 3 when bool_or(v.carteira = 'Quitada') then 4 else 5 end as ordem
from public.vw_cobrancas v
group by v.cliente_id;

-- Cobrança › Inadimplência: só quem tem parcela vencida e não paga (fora o que não é cobrança de cliente)
create view public.vw_inadimplentes with (security_invoker = true) as
select
  v.cliente_id, max(v.cliente) as cliente, max(v.documento) as documento, bool_or(v.documento_ok) as documento_ok,
  max(v.telefone) as telefone, max(v.cidade) as cidade, max(v.uf) as uf,
  max(v.busca) || ' ' || coalesce(string_agg(public.texto_busca(v.referencia), ' '), '') as busca,
  string_agg(distinct v.referencia, ' | ') as referencias,
  count(*)::int as cobrancas, sum(v.parcelas_vencidas)::int as parcelas_vencidas,
  sum(v.vencido) as vencido, sum(v.multa) as multa, sum(v.juros) as juros, sum(v.atualizado) as atualizado,
  sum(v.total_divida) as total_divida,
  min(v.vencida_desde) as vencida_desde, max(v.dias_atraso) as dias_atraso,
  array_agg(distinct v.carteira) as carteiras,
  array_agg(distinct v.conta) as contas,
  array_agg(distinct v.faixa_dias) as faixas,
  array_remove(array_agg(distinct v.cobrador_id), null) as cobradores_ids,
  array_remove(array_agg(distinct v.cobrador), null) as cobradores,
  bool_or(v.pode_renegociar) as pode_renegociar, bool_or(v.pode_ir_spc) as pode_ir_spc
from public.vw_cobrancas v
where v.vencido > 0 and v.carteira <> 'Fora da cobrança'
group by v.cliente_id;

revoke all on public.vw_cobrancas, public.vw_cobranca_clientes, public.vw_inadimplentes from public, anon;
grant select on public.vw_cobrancas, public.vw_cobranca_clientes, public.vw_inadimplentes to authenticated, service_role;

-- 3. Cliente e categoria da venda
-- o mesmo nome escrito com ou sem acento, maiúscula ou espaço a mais
create or replace function public.nome_comparavel(p text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(public.texto_busca(coalesce(p, '')), '\s+', ' ', 'g'))
$$;
revoke all on function public.nome_comparavel(text) from public, anon;
grant execute on function public.nome_comparavel(text) to authenticated;

create or replace function public.cobranca_cliente_da_venda(v public.vendas_ebooks) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_doc text := regexp_replace(coalesce(v.cpf, ''), '\D', '', 'g');
  v_tel text := regexp_replace(coalesce(nullif(v.whatsapp, ''), v.telefone, ''), '\D', '', 'g');
  v_uf text := case when upper(btrim(coalesce(v.uf, ''))) ~ '^[A-Z]{2}$' then upper(btrim(v.uf)) end;
  v_id uuid;
begin
  if length(v_doc) not in (11, 14) then v_doc := null; end if;
  if v_doc is not null then
    select id into v_id from public.clientes where documento = v_doc;
  elsif length(v_tel) >= 10 then
    -- sem documento: o mesmo nome com o mesmo telefone é a mesma pessoa
    select id into v_id from public.clientes
     where documento is null and public.nome_comparavel(nome) = public.nome_comparavel(v.responsavel)
       and v_tel in (regexp_replace(coalesce(telefone1, ''), '\D', '', 'g'), regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'))
     limit 1;
  end if;
  if v_id is null then
    insert into public.clientes (nome, documento, telefone1, whatsapp, email, rua, bairro, cep, cidade, uf, origem)
    values (coalesce(nullif(regexp_replace(btrim(v.responsavel), '\s+', ' ', 'g'), ''), 'CLIENTE SEM NOME'), v_doc, nullif(v.telefone, ''), nullif(v.whatsapp, ''),
            nullif(v.email, ''), nullif(v.endereco, ''), nullif(v.bairro, ''), nullif(v.cep, ''), nullif(v.cidade, ''), v_uf,
            case v.canal when 'Rebolo' then 'Rebolo' when 'Externo' then 'Vendedor externo' else 'Cadastro manual' end)
    returning id into v_id;
  else
    -- completa o que estiver vazio no cadastro (não troca o que já existe)
    update public.clientes set
      telefone1 = coalesce(telefone1, nullif(v.telefone, '')), whatsapp = coalesce(whatsapp, nullif(v.whatsapp, '')),
      email = coalesce(email, nullif(v.email, '')), rua = coalesce(rua, nullif(v.endereco, '')), bairro = coalesce(bairro, nullif(v.bairro, '')),
      cep = coalesce(cep, nullif(v.cep, '')), cidade = coalesce(cidade, nullif(v.cidade, '')), uf = coalesce(uf, v_uf)
    where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.cobranca_cliente_da_venda(public.vendas_ebooks) from public, anon, authenticated;

create or replace function public.cobranca_categoria_da_venda(p_canal text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.cobranca_categorias
   where ativa and public.texto_busca(nome) = public.texto_busca(case when p_canal = 'Rebolo' then 'Receita de Vendas Online (Rebolo)' else 'Receita de Recordação Escolar' end);
  if v_id is null then
    select id into v_id from public.cobranca_categorias where ativa and grupo = 'Cobrança DLG' order by nome limit 1;
  end if;
  if v_id is null then raise exception 'Cadastre as categorias da Cobrança (Cobrança › Configurações) antes de conferir vendas.'; end if;
  return v_id;
end $$;
revoke all on function public.cobranca_categoria_da_venda(text) from public, anon, authenticated;

-- recebimento que entra junto com a venda (entrada, à vista, cartão); o "valor recebido" vai para a meta como antes
create or replace function public.cobranca_recebimento_da_venda(p_parcela uuid, p_cobranca uuid, p_valor numeric, p_data date,
  p_forma_venda text, p_cobrador uuid, p_descricao text, p_observacao text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_lanc uuid;
begin
  if p_cobrador is not null then
    insert into public.lancamentos (setor, indicador_id, colaborador_id, quantidade, descricao, data, origem)
    values ('cobranca', 'valor_recebido', p_cobrador, p_valor, p_descricao, p_data, 'automatico') returning id into v_lanc;
  end if;
  insert into public.cobranca_pagamentos (parcela_id, cobranca_id, valor, principal, data, forma, observacao, lancamento_id, registrado_por, registrado_por_nome)
  values (p_parcela, p_cobranca, p_valor, p_valor, p_data,
          case when p_forma_venda in ('Boleto', 'PIX', 'Dinheiro') then p_forma_venda when p_forma_venda like 'Cartão%' then 'Cartão' else 'Outro' end,
          p_observacao, v_lanc, auth.uid(), coalesce((select nome from public.colaboradores where id = auth.uid()), 'na venda'));
end $$;
revoke all on function public.cobranca_recebimento_da_venda(uuid, uuid, numeric, date, text, uuid, text, text) from public, anon, authenticated;

-- 4. Venda → cobrança + parcelas (mesma regra dos títulos: entrada e à vista/cartão pagos; boleto em aberto)
create or replace function public.gerar_cobranca_venda(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v public.vendas_ebooks;
  v_cob uuid;
  v_par uuid;
  n int;
  i int;
  restante numeric;
  parcela numeric;
  primeiro date;
  aberto boolean;
  v_meta uuid;
begin
  select * into v from public.vendas_ebooks where id = p_id;
  if not found then return null; end if;
  select id into v_cob from public.cobrancas where venda_id = p_id;
  if v_cob is not null then return v_cob; end if;
  if exists (select 1 from public.titulos where venda_id = p_id) then return null; end if; -- venda antiga: vem pela cópia dos títulos
  n := greatest(coalesce(v.parcelas, 1), 1);
  restante := v.valor - coalesce(v.entrada, 0);
  primeiro := coalesce(v.primeiro_vencimento, v.data);
  v_meta := case when v.canal in ('Interno', 'Rebolo') then v.cobrador_id end;

  insert into public.cobrancas (cliente_id, venda_id, origem, codigo_venda, categoria_id, cobrador_id, referencia)
  values (public.cobranca_cliente_da_venda(v), v.id, 'Venda', nullif(btrim(coalesce(v.numero_ficha, '')), ''), public.cobranca_categoria_da_venda(v.canal),
          v.cobrador_id, nullif(concat_ws(' • ', nullif(btrim(v.aluno), ''), nullif(btrim(v.escola), ''), nullif(btrim(v.pacote), '')), ''))
  returning id into v_cob;

  perform set_config('dlg.cobranca_pagamento', '1', true);
  if coalesce(v.entrada, 0) > 0 then
    insert into public.cobranca_parcelas (cobranca_id, numero, total, valor, vencimento, multa, baixado, pago_em)
    values (v_cob, 0, n, v.entrada, v.data, 0, v.entrada, v.data) returning id into v_par;
    perform public.cobranca_recebimento_da_venda(v_par, v_cob, v.entrada, v.data, v.forma_pagamento, v_meta, 'Entrada — ' || v.responsavel, 'Entrada da venda');
  end if;
  if restante > 0 then
    aberto := v.forma_pagamento = 'Boleto' or (v.forma_pagamento in ('PIX', 'Dinheiro') and (n > 1 or primeiro > v.data));
    if aberto then
      parcela := round(restante / n, 2);
      for i in 1..n loop
        insert into public.cobranca_parcelas (cobranca_id, numero, total, valor, vencimento)
        values (v_cob, i, n, case when i = n then restante - parcela * (n - 1) else parcela end, (primeiro + make_interval(months => i - 1))::date);
      end loop;
    else
      insert into public.cobranca_parcelas (cobranca_id, numero, total, valor, vencimento, multa, baixado, pago_em)
      values (v_cob, 1, 1, restante, v.data, 0, restante, v.data) returning id into v_par;
      perform public.cobranca_recebimento_da_venda(v_par, v_cob, restante, v.data, v.forma_pagamento, v_meta, 'Recebido na venda — ' || v.responsavel,
        case when v.forma_pagamento = 'Cartão de crédito' and n > 1 then n || 'x no cartão' end);
    end if;
  end if;
  perform set_config('dlg.cobranca_pagamento', '', true);
  return v_cob;
end $$;
revoke all on function public.gerar_cobranca_venda(uuid) from public, anon, authenticated;

-- quem já chamava "gerar os títulos" (conferência do Financeiro, venda antiga interna) passa a gerar a cobrança
create or replace function public.gerar_titulos_venda(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.gerar_cobranca_venda(p_id);
end $$;
revoke all on function public.gerar_titulos_venda(uuid) from public, anon, authenticated;

-- 5. Cópia dos títulos de Contas a Receber para a carteira nova (uma cobrança por venda; os lançados à mão, uma por nome)
create or replace function public.copiar_titulos_para_cobrancas() returns table (cobrancas_novas int, parcelas_novas int)
language plpgsql security definer set search_path = public as $$
declare
  t record;
  v public.vendas_ebooks;
  v_cob uuid;
  v_cli uuid;
  v_par uuid;
  v_num int;
  v_tot int;
  n_cob int := 0;
  n_par int := 0;
begin
  perform set_config('dlg.cobranca_pagamento', '1', true);
  for t in select ti.* from public.titulos ti
            where not exists (select 1 from public.cobranca_parcelas p where p.titulo_id = ti.id)
            order by ti.venda_id nulls last, ti.vencimento, ti.created_at loop
    v_cob := null;
    if t.venda_id is not null then
      select id into v_cob from public.cobrancas where venda_id = t.venda_id;
      if v_cob is null then
        select * into v from public.vendas_ebooks where id = t.venda_id;
        insert into public.cobrancas (cliente_id, venda_id, origem, codigo_venda, categoria_id, cobrador_id, referencia)
        values (public.cobranca_cliente_da_venda(v), v.id, 'Venda', nullif(btrim(coalesce(v.numero_ficha, '')), ''), public.cobranca_categoria_da_venda(v.canal),
                v.cobrador_id, nullif(concat_ws(' • ', nullif(btrim(v.aluno), ''), nullif(btrim(v.escola), ''), nullif(btrim(v.pacote), '')), ''))
        returning id into v_cob;
        n_cob := n_cob + 1;
      end if;
    else
      select id into v_cli from public.clientes where documento is null and public.nome_comparavel(nome) = public.nome_comparavel(t.cliente) order by created_at limit 1;
      if v_cli is null then
        insert into public.clientes (nome, telefone1, origem)
        values (coalesce(nullif(regexp_replace(btrim(t.cliente), '\s+', ' ', 'g'), ''), 'CLIENTE SEM NOME'), nullif(t.telefone, ''), 'Cadastro manual')
        returning id into v_cli;
      end if;
      select id into v_cob from public.cobrancas where cliente_id = v_cli and venda_id is null and dados_antigos ->> 'copiado_de' = 'titulos' limit 1;
      if v_cob is null then
        insert into public.cobrancas (cliente_id, origem, categoria_id, cobrador_id, referencia, dados_antigos)
        values (v_cli, 'Lançamento manual', public.cobranca_categoria_da_venda(null), t.cobrador_id,
                nullif(concat_ws(' • ', nullif(btrim(t.aluno), ''), nullif(btrim(t.escola), '')), ''), '{"copiado_de": "titulos"}'::jsonb)
        returning id into v_cob;
        n_cob := n_cob + 1;
      end if;
    end if;
    -- "2/3" → parcela 2 de 3; "Entrada" → 0; "3x no cartão" ou outro texto → 1 de 1
    if t.parcela ~ '^\d+/\d+$' then
      v_num := split_part(t.parcela, '/', 1)::int; v_tot := greatest(split_part(t.parcela, '/', 2)::int, 1);
    elsif t.parcela = 'Entrada' then
      v_num := 0; v_tot := 1;
    else
      v_num := 1; v_tot := 1;
    end if;
    insert into public.cobranca_parcelas (cobranca_id, numero, total, valor, vencimento, multa, baixado, situacao, pago_em, titulo_id, acordo_id)
    values (v_cob, v_num, v_tot, t.valor, t.vencimento, case when t.status = 'Pago' then 0 end,
            case when t.status = 'Pago' then t.valor else 0 end,
            case t.status when 'Em acordo' then 'Em acordo' when 'Cancelado' then 'Cancelada' else 'Aberta' end,
            t.data_pagamento, t.id,
            case when t.status = 'Em acordo' then (select id from public.acordos where titulo_id = t.id order by created_at desc limit 1) end)
    returning id into v_par;
    if t.status = 'Pago' and t.valor > 0 then
      -- já contou na meta quando foi pago: aqui só registra o recebimento (sem lançar de novo)
      insert into public.cobranca_pagamentos (parcela_id, cobranca_id, valor, principal, data, forma, observacao, origem, registrado_por_nome)
      values (v_par, v_cob, t.valor, t.valor, coalesce(t.data_pagamento, t.vencimento),
              case when t.forma_pagamento in ('Boleto', 'PIX', 'Dinheiro') then t.forma_pagamento when t.forma_pagamento like 'Cartão%' then 'Cartão' else 'Outro' end,
              'Copiado de Contas a Receber', 'Migração', 'cópia de Contas a Receber');
    end if;
    update public.acordos set cobranca_id = v_cob where titulo_id = t.id and cobranca_id is null;
    n_par := n_par + 1;
  end loop;
  perform set_config('dlg.cobranca_pagamento', '', true);
  return query select n_cob, n_par;
end $$;
revoke all on function public.copiar_titulos_para_cobrancas() from public, anon, authenticated;

-- 6. Acordo: as parcelas vencidas da cobrança ficam "Em acordo"; rejeitado pelo ADM, voltam a ficar em aberto
create or replace function public.fluxo_acordo() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.titulo_id is not null then
    update public.titulos set status = 'Em acordo' where id = new.titulo_id;
  end if;
  if new.cobranca_id is not null then
    select pode_renegociar into c from public.vw_cobrancas where id = new.cobranca_id;
    if not found then raise exception 'Cobrança não encontrada.'; end if;
    if not coalesce(c.pode_renegociar, false) then
      raise exception 'Esta cobrança ainda não pode ser renegociada: precisa de % boletos vencidos e % dias de atraso, na Cobrança DLG.',
        coalesce(public.regra_cobranca('reneg_min_boletos'), 2)::int, coalesce(public.regra_cobranca('reneg_min_dias'), 61)::int;
    end if;
    update public.cobranca_parcelas set situacao = 'Em acordo', acordo_id = new.id
     where cobranca_id = new.cobranca_id and situacao in ('Aberta', 'Parcial') and vencimento < current_date;
  end if;
  perform public.pedir_aprovacao('Acordo de cobrança', 'cobranca', format('%s: %sx de %s', new.cliente, new.parcelas, new.valor_acordo), new.valor_acordo, 'acordos', new.id);
  return new;
end $$;

create or replace function public.acordo_rejeitado_reabre() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Rejeitado' and old.status is distinct from 'Rejeitado' then
    update public.cobranca_parcelas set situacao = 'Aberta', acordo_id = null where acordo_id = new.id and situacao = 'Em acordo';
  end if;
  return null;
end $$;
revoke all on function public.acordo_rejeitado_reabre() from public, anon, authenticated;
drop trigger if exists trg_acordo_rejeitado on public.acordos;
create trigger trg_acordo_rejeitado after update of status on public.acordos for each row execute function public.acordo_rejeitado_reabre();

-- 7. Lançamento manual de uma cobrança pelo Financeiro (valor dividido em parcelas, todo mês)
create or replace function public.lancar_cobranca(p_cliente uuid, p_categoria uuid, p_cobrador uuid, p_referencia text,
  p_valor numeric, p_parcelas int, p_primeiro_vencimento date, p_observacao text default null, p_conta text default 'CA Beatriz') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cob uuid;
  v_parcela numeric;
  i int;
begin
  if not public.pode('financeiro', 'criar') then raise exception 'Só o Financeiro lança cobranças.'; end if;
  p_valor := round(coalesce(p_valor, 0), 2);
  if p_valor <= 0 then raise exception 'Informe o valor.'; end if;
  if coalesce(p_parcelas, 0) < 1 or p_parcelas > 120 then raise exception 'Informe de 1 a 120 parcelas.'; end if;
  if p_primeiro_vencimento is null then raise exception 'Informe o 1º vencimento.'; end if;
  if not exists (select 1 from public.clientes where id = p_cliente) then raise exception 'Escolha o cliente.'; end if;
  if not exists (select 1 from public.cobranca_categorias where id = p_categoria and ativa) then raise exception 'Escolha a categoria.'; end if;
  if coalesce(p_conta, '') not in ('CA Beatriz', 'CA Diogo') then raise exception 'Escolha a conta (CA Beatriz ou CA Diogo).'; end if;
  insert into public.cobrancas (cliente_id, origem, categoria_id, cobrador_id, referencia, observacao, conta)
  values (p_cliente, 'Lançamento manual', p_categoria, p_cobrador, nullif(btrim(coalesce(p_referencia, '')), ''), nullif(btrim(coalesce(p_observacao, '')), ''), p_conta)
  returning id into v_cob;
  v_parcela := round(p_valor / p_parcelas, 2);
  for i in 1..p_parcelas loop
    insert into public.cobranca_parcelas (cobranca_id, numero, total, valor, vencimento)
    values (v_cob, i, p_parcelas, case when i = p_parcelas then p_valor - v_parcela * (p_parcelas - 1) else v_parcela end,
            (p_primeiro_vencimento + make_interval(months => i - 1))::date);
  end loop;
  return v_cob;
end $$;
revoke all on function public.lancar_cobranca(uuid, uuid, uuid, text, numeric, int, date, text, text) from public, anon;
grant execute on function public.lancar_cobranca(uuid, uuid, uuid, text, numeric, int, date, text, text) to authenticated;

-- excluir: não deixa sumir recebimento (estorne antes); a carga e a correção pelo SQL Editor passam
create or replace function public.cobranca_antes_excluir() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and exists (
    select 1 from public.cobranca_pagamentos where (case when tg_table_name = 'cobrancas' then cobranca_id else parcela_id end) = old.id and estornado_em is null
  ) then
    raise exception 'Tem recebimento registrado: estorne os recebimentos antes de excluir.';
  end if;
  return old;
end $$;
revoke all on function public.cobranca_antes_excluir() from public, anon, authenticated;
drop trigger if exists trg_cobranca_antes_excluir on public.cobrancas;
create trigger trg_cobranca_antes_excluir before delete on public.cobrancas for each row execute function public.cobranca_antes_excluir();
drop trigger if exists trg_cobranca_antes_excluir on public.cobranca_parcelas;
create trigger trg_cobranca_antes_excluir before delete on public.cobranca_parcelas for each row execute function public.cobranca_antes_excluir();

-- 8. Números para as telas, calculados no banco
create or replace function public.indicadores_receber(p_mes text default to_char(current_date, 'YYYY-MM')) returns jsonb
language sql stable set search_path = public as $$
  with c as materialized (
    select cliente_id, em_aberto, vencido, atualizado, parcelas_vencidas, carteira, conta_inadimplencia from public.vw_cobrancas
  ),
  por_cliente as (
    select case when sum(vencido) > 0 then 'Em atraso' when sum(em_aberto) > 0 then 'Em dia'
                when bool_or(carteira = 'Em acordo') then 'Em acordo' when bool_or(carteira = 'Quitada') then 'Quitado' else 'Cancelado' end as situacao,
           bool_or(vencido > 0 and carteira <> 'Fora da cobrança') as inadimplente
    from c group by cliente_id
  ),
  p as (
    select
      coalesce(sum(valor - baixado) filter (where situacao in ('Aberta', 'Parcial') and vencimento = current_date), 0) as vence_hoje,
      coalesce(sum(valor - baixado) filter (where situacao = 'Em acordo'), 0) as em_acordo,
      count(*) filter (where situacao in ('Aberta', 'Parcial')) as parcelas_abertas,
      coalesce(round(avg(current_date - vencimento) filter (where situacao in ('Aberta', 'Parcial') and vencimento < current_date)), 0) as atraso_medio
    from public.cobranca_parcelas
  )
  select jsonb_build_object(
    'em_aberto', (select coalesce(sum(em_aberto), 0) from c),
    'em_atraso', (select coalesce(sum(vencido), 0) from c),
    'atualizado_atraso', (select coalesce(sum(atualizado) filter (where vencido > 0), 0) from c),
    'parcelas_vencidas', (select coalesce(sum(parcelas_vencidas), 0) from c),
    'vence_hoje', p.vence_hoje, 'em_acordo', p.em_acordo, 'parcelas_abertas', p.parcelas_abertas, 'atraso_medio', p.atraso_medio,
    'recebido_mes', (select coalesce(sum(valor), 0) from public.cobranca_pagamentos where estornado_em is null and to_char(data, 'YYYY-MM') = p_mes),
    'recebido_hoje', (select coalesce(sum(valor), 0) from public.cobranca_pagamentos where estornado_em is null and data = current_date),
    'clientes_situacao', (select coalesce(jsonb_object_agg(situacao, n), '{}'::jsonb) from (select situacao, count(*) as n from por_cliente group by situacao) x),
    'clientes_em_atraso', (select count(*) from por_cliente where inadimplente),
    -- taxa de inadimplência: só as categorias que contam na inadimplência
    'taxa_inadimplencia', (select case when sum(em_aberto) filter (where conta_inadimplencia) > 0
                                       then round(100 * sum(vencido) filter (where conta_inadimplencia) / sum(em_aberto) filter (where conta_inadimplencia), 1) else 0 end from c)
  )
  from p
$$;
revoke all on function public.indicadores_receber(text) from public, anon;
grant execute on function public.indicadores_receber(text) to authenticated;

-- Financeiro › Vendas de Books: o que cada venda do mês já recebeu, tem em aberto e em atraso
create or replace function public.resumo_vendas_mes(p_mes text) returns table (
  venda_id uuid, parcelas int, parcelas_pagas int, parcelas_vencidas int, recebido numeric, em_aberto numeric, vencido numeric
) language sql stable set search_path = public as $$
  select v.venda_id, v.parcelas, v.parcelas_pagas, v.parcelas_vencidas, v.recebido, v.em_aberto, v.vencido
  from public.vw_cobrancas v
  join public.vendas_ebooks ve on ve.id = v.venda_id
  where to_char(ve.data, 'YYYY-MM') = p_mes
$$;
revoke all on function public.resumo_vendas_mes(text) from public, anon;
grant execute on function public.resumo_vendas_mes(text) to authenticated;

-- 9. Copia agora os títulos que já existem
select * from public.copiar_titulos_para_cobrancas();

notify pgrst, 'reload schema';

-- Conferência (esperado: 0 | true | true | 3 views | false | CA Beatriz)
select
  (select count(*) from public.titulos t where not exists (select 1 from public.cobranca_parcelas p where p.titulo_id = t.id)) as titulos_sem_copia,
  (select prosrc like '%gerar_cobranca_venda%' from pg_proc where proname = 'gerar_titulos_venda') as vendas_geram_cobranca,
  exists (select 1 from information_schema.columns where table_name = 'acordos' and column_name = 'cobranca_id') as acordo_por_cobranca,
  (select count(*) from pg_views where schemaname = 'public' and viewname in ('vw_cobrancas', 'vw_cobranca_clientes', 'vw_inadimplentes')) as views,
  has_table_privilege('anon', 'public.vw_inadimplentes', 'select') as de_fora_le,
  (select column_default from information_schema.columns where table_name = 'cobrancas' and column_name = 'conta') as conta_padrao;
