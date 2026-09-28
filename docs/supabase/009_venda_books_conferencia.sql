-- =====================================================================
-- 009 — VENDA DE BOOKS PELO APP COM CONTRATO, ASSINATURA E CONFERÊNCIA DO FINANCEIRO
--        (pode rodar mais de uma vez)
--
--  • O vendedor de books fotografa o "Contrato de Compra" (a IA lê e preenche), o cliente
--    assina no app, e ele anexa documento (frente e verso) e a promissória.
--  • A venda externa chega ao Financeiro como "Aguardando conferência" e SÓ gera os títulos
--    (parcelas) quando o Financeiro confere. Se faltar algo, o Financeiro devolve com o motivo
--    e o vendedor corrige no app.
--  • Venda interna (equipe da empresa) continua gerando os títulos na hora.
-- =====================================================================

-- 1. Campos do contrato de compra
alter table public.vendas_ebooks alter column aluno drop not null; -- o contrato identifica a criança pelo nº da ficha
alter table public.vendas_ebooks add column if not exists numero_ficha text;
alter table public.vendas_ebooks add column if not exists modelo text;
alter table public.vendas_ebooks add column if not exists qtd_maletas int not null default 0;
alter table public.vendas_ebooks add column if not exists qtd_fotos int not null default 0;
alter table public.vendas_ebooks add column if not exists qtd_molduras int not null default 0;
alter table public.vendas_ebooks add column if not exists rg text;
alter table public.vendas_ebooks add column if not exists data_nascimento date;
alter table public.vendas_ebooks add column if not exists whatsapp text;
alter table public.vendas_ebooks add column if not exists referencias jsonb not null default '[]'::jsonb; -- [{nome, telefone}]
alter table public.vendas_ebooks add column if not exists bairro text;
alter table public.vendas_ebooks add column if not exists cep text;
alter table public.vendas_ebooks add column if not exists cidade text;
alter table public.vendas_ebooks add column if not exists nome_pai text;
alter table public.vendas_ebooks add column if not exists nome_mae text;
alter table public.vendas_ebooks add column if not exists entrada numeric(12, 2) not null default 0;
alter table public.vendas_ebooks add column if not exists forma_parcelamento text; -- como está escrito no contrato
-- anexos: {"contrato": [caminhos], "docFrente": caminho, "docVerso": caminho, "recibo": caminho} no bucket "contratos"
alter table public.vendas_ebooks add column if not exists anexos jsonb not null default '{}'::jsonb;
alter table public.vendas_ebooks add column if not exists assinatura text; -- imagem da assinatura feita no app
alter table public.vendas_ebooks add column if not exists assinatura_em timestamptz;
alter table public.vendas_ebooks add column if not exists assinatura_lat double precision;
alter table public.vendas_ebooks add column if not exists assinatura_lng double precision;
-- conferência do Financeiro (vendas internas já nascem conferidas)
alter table public.vendas_ebooks add column if not exists conferencia text not null default 'Conferida';
alter table public.vendas_ebooks add column if not exists conferencia_motivo text;
alter table public.vendas_ebooks add column if not exists conferido_por uuid references public.colaboradores(id);
alter table public.vendas_ebooks add column if not exists conferido_em timestamptz;
do $$ begin
  alter table public.vendas_ebooks add constraint vendas_ebooks_conferencia_check check (conferencia in ('Aguardando conferência', 'Conferida', 'Devolvida'));
exception when duplicate_object then null; end $$;

-- 2. O vendedor corrige e reenvia a PRÓPRIA venda devolvida pelo Financeiro
drop policy if exists vendas_ebooks_externo_update on public.vendas_ebooks;
create policy vendas_ebooks_externo_update on public.vendas_ebooks for update to authenticated
  using (vendedor_externo_id = public.meu_vendedor_externo() and conferencia = 'Devolvida')
  with check (vendedor_externo_id = public.meu_vendedor_externo() and conferencia = 'Aguardando conferência');

-- a venda externa sempre entra aguardando conferência
drop policy if exists vendas_ebooks_externo_insert on public.vendas_ebooks;
create policy vendas_ebooks_externo_insert on public.vendas_ebooks for insert to authenticated
  with check (canal = 'Externo' and vendedor_externo_id = public.meu_vendedor_externo() and conferencia = 'Aguardando conferência');

-- o Financeiro abre as fotos (contrato, documento, promissória, assinatura)
drop policy if exists contratos_financeiro_select on storage.objects;
create policy contratos_financeiro_select on storage.objects for select to authenticated
  using (bucket_id = 'contratos' and public.pode('financeiro', 'visualizar'));

-- 3. Títulos (parcelas) de uma venda — idempotente
--    entrada → título pago • cartão → pago (a operadora repassa) • boleto → parcelas em aberto
--    PIX/dinheiro → pago se à vista; parcelado ou com vencimento futuro → parcelas em aberto
create or replace function public.gerar_titulos_venda(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.vendas_ebooks;
  n int;
  restante numeric;
  parcela numeric;
  i int;
  primeiro date;
  aberto boolean;
begin
  select * into v from public.vendas_ebooks where id = p_id;
  if not found or exists (select 1 from public.titulos where venda_id = p_id) then return; end if;
  n := greatest(coalesce(v.parcelas, 1), 1);
  restante := v.valor - coalesce(v.entrada, 0);
  primeiro := coalesce(v.primeiro_vencimento, v.data);

  if coalesce(v.entrada, 0) > 0 then
    insert into public.titulos (venda_id, cliente, aluno, escola, telefone, parcela, valor, vencimento, status, data_pagamento, cobrador_id, forma_pagamento)
    values (v.id, v.responsavel, v.aluno, v.escola, v.telefone, 'Entrada', v.entrada, v.data, 'Pago', v.data, v.cobrador_id, v.forma_pagamento);
    if v.canal = 'Interno' then
      perform public.lancar('cobranca', 'valor_recebido', v.cobrador_id, v.entrada, 'Entrada — ' || v.responsavel, v.data);
    end if;
  end if;
  if restante <= 0 then return; end if;

  aberto := v.forma_pagamento = 'Boleto'
    or (v.forma_pagamento in ('PIX', 'Dinheiro') and (n > 1 or primeiro > v.data));

  if aberto then
    parcela := round(restante / n, 2);
    for i in 1..n loop
      insert into public.titulos (venda_id, cliente, aluno, escola, telefone, parcela, valor, vencimento, cobrador_id, forma_pagamento)
      values (v.id, v.responsavel, v.aluno, v.escola, v.telefone, i || '/' || n,
              case when i = n then restante - parcela * (n - 1) else parcela end,
              (primeiro + make_interval(months => i - 1))::date, v.cobrador_id, v.forma_pagamento);
    end loop;
  else
    insert into public.titulos (venda_id, cliente, aluno, escola, telefone, parcela, valor, vencimento, status, data_pagamento, cobrador_id, forma_pagamento)
    values (v.id, v.responsavel, v.aluno, v.escola, v.telefone,
            case when v.forma_pagamento = 'Cartão de crédito' and n > 1 then n || 'x no cartão' else '1/1' end,
            restante, v.data, 'Pago', v.data, v.cobrador_id, v.forma_pagamento);
    if v.canal = 'Interno' then
      perform public.lancar('cobranca', 'valor_recebido', v.cobrador_id, restante, 'Recebido na venda — ' || v.responsavel, v.data);
    end if;
  end if;
end $$;
revoke all on function public.gerar_titulos_venda(uuid) from public, anon, authenticated;

-- 4. Nova venda: interna gera títulos na hora; externa espera a conferência do Financeiro
create or replace function public.fluxo_venda_ebook() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.canal = 'Interno' then
    perform public.lancar('cobranca', 'ebooks_vendidos', new.cobrador_id, coalesce(new.quantidade, 1), coalesce(new.pacote, 'Book') || ' — ' || new.responsavel, new.data);
    perform public.gerar_titulos_venda(new.id);
    perform public.notificar(array['cobranca', 'financeiro', 'adm']::public.setor[], 'info', 'Venda interna de book',
      format('%s (%s) • %s • R$ %s', new.responsavel, new.escola, new.forma_pagamento, replace(to_char(new.valor, 'FM9999999990.00'), '.', ',')), '/financeiro/vendas-books');
  else
    perform public.notificar(array['financeiro', 'adm']::public.setor[], 'aprovacao', 'Venda externa para conferir',
      format('%s (%s) • R$ %s — confira contrato, assinatura, documento e promissória.', new.responsavel, new.escola, replace(to_char(new.valor, 'FM9999999990.00'), '.', ',')), '/financeiro/conferencia');
  end if;
  return new;
end $$;

-- 5. Conferência pelo Financeiro: conferir (gera os títulos) ou devolver ao vendedor com o motivo
create or replace function public.conferir_venda_book(p_id uuid, p_acao text, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v public.vendas_ebooks;
begin
  if not public.pode('financeiro', 'editar') then
    raise exception 'Sem permissão para conferir vendas' using errcode = '42501';
  end if;
  select * into v from public.vendas_ebooks where id = p_id for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  if v.conferencia <> 'Aguardando conferência' then raise exception 'Esta venda não está aguardando conferência'; end if;

  if p_acao = 'conferir' then
    update public.vendas_ebooks set conferencia = 'Conferida', conferencia_motivo = null, conferido_por = auth.uid(), conferido_em = now() where id = p_id;
    perform public.gerar_titulos_venda(p_id);
  elsif p_acao = 'devolver' then
    if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo da devolução'; end if;
    update public.vendas_ebooks set conferencia = 'Devolvida', conferencia_motivo = trim(p_motivo), conferido_por = auth.uid(), conferido_em = now() where id = p_id;
  else
    raise exception 'Ação inválida';
  end if;
end $$;
revoke all on function public.conferir_venda_book(uuid, text, text) from public, anon;
grant execute on function public.conferir_venda_book(uuid, text, text) to authenticated;

-- Conferência
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'vendas_ebooks' and column_name in ('numero_ficha', 'anexos', 'assinatura', 'conferencia')) as colunas_novas,
       (select count(*) from pg_proc where proname in ('gerar_titulos_venda', 'conferir_venda_book')) as funcoes_novas;
