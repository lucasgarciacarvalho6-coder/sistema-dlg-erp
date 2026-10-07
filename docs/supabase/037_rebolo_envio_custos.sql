-- =====================================================================
-- 037 — Vendas Rebolo: acompanhamento do envio + custo mensal das vendedoras (07/10/2026)
--
-- Base do LUCRO/PREJUÍZO de cada vendedora (planilha "REBOLO - BASE PRINCIPAL"):
--   vendido − reserva do boleto − frete − taxa do cartão − álbum − saquinho − comissão − salário com encargos
--
-- 1. Envio (Rebolo › Envios): custo da postagem, previsão de entrega, situação da entrega
--    (Pendente / Cliente recebeu / Não recebeu), boleto enviado e taxa do cartão. Quem lança: a vendedora dona
--    da ficha ou a supervisão do rebolo, pela função salvar_envio_rebolo (os campos não mudam por fora).
-- 2. Custo mensal de cada vendedora (Financeiro): o salário do holerite do mês. Os encargos (35%) o sistema soma.
--    Só o Financeiro (e ADM/Gerência pelas permissões) vê e lança; as vendedoras não veem.
--
-- Pode rodar mais de uma vez. Rodar no SQL Editor do Supabase.
-- =====================================================================

-- 1. Campos do envio na ficha
alter table public.rebolo_fichas add column if not exists custo_postagem numeric(12, 2);
alter table public.rebolo_fichas add column if not exists previsao_entrega date;
alter table public.rebolo_fichas add column if not exists situacao_entrega text;
alter table public.rebolo_fichas add column if not exists entrega_em timestamptz;
alter table public.rebolo_fichas add column if not exists boleto_enviado_em timestamptz;
alter table public.rebolo_fichas add column if not exists taxa_cartao numeric(12, 2);
do $$ begin
  alter table public.rebolo_fichas add constraint rebolo_fichas_custo_postagem_check check (custo_postagem is null or custo_postagem >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.rebolo_fichas add constraint rebolo_fichas_taxa_cartao_check check (taxa_cartao is null or taxa_cartao >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.rebolo_fichas add constraint rebolo_fichas_situacao_entrega_check check (situacao_entrega is null or situacao_entrega in ('Pendente', 'Cliente recebeu', 'Não recebeu'));
exception when duplicate_object then null; end $$;

-- os campos do envio só mudam pela função (o cadastro da ficha não mexe neles)
create or replace function public.rebolo_ficha_envio_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.custo_postagem := null; new.previsao_entrega := null; new.situacao_entrega := null; new.entrega_em := null;
    new.boleto_enviado_em := null; new.taxa_cartao := null;
  elsif coalesce(current_setting('dlg.rebolo_fluxo', true), '') <> '1' then
    new.custo_postagem := old.custo_postagem; new.previsao_entrega := old.previsao_entrega;
    new.situacao_entrega := old.situacao_entrega; new.entrega_em := old.entrega_em;
    new.boleto_enviado_em := old.boleto_enviado_em; new.taxa_cartao := old.taxa_cartao;
  end if;
  return new;
end $$;
drop trigger if exists trg_rebolo_ficha_envio_antes on public.rebolo_fichas;
create trigger trg_rebolo_ficha_envio_antes before insert or update on public.rebolo_fichas for each row execute function public.rebolo_ficha_envio_antes();
revoke all on function public.rebolo_ficha_envio_antes() from public, anon, authenticated;

-- Registrar ou corrigir o envio (o lápis): rastreio obrigatório; o boleto enviado só vale na venda no boleto
-- e a taxa do cartão só na venda no cartão.
create or replace function public.salvar_envio_rebolo(
  p_ficha uuid, p_rastreio text, p_custo_postagem numeric default null, p_previsao date default null,
  p_situacao text default 'Pendente', p_boleto_enviado boolean default false, p_taxa_cartao numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  f public.rebolo_fichas;
  v_forma text;
  v_situacao text := coalesce(nullif(trim(coalesce(p_situacao, '')), ''), 'Pendente');
begin
  f := public.rebolo_ficha_minha(p_ficha);
  if f.situacao <> 'Vendida' then raise exception 'Só vendas aprovadas podem ser enviadas.'; end if;
  if coalesce(trim(p_rastreio), '') = '' then raise exception 'Informe o código de rastreio.'; end if;
  if v_situacao not in ('Pendente', 'Cliente recebeu', 'Não recebeu') then raise exception 'Situação da entrega inválida.'; end if;
  if coalesce(p_custo_postagem, 0) < 0 or coalesce(p_taxa_cartao, 0) < 0 then raise exception 'Os valores não podem ser negativos.'; end if;
  select v.forma_pagamento into v_forma from public.vendas_ebooks v where v.id = f.venda_id;
  update public.rebolo_fichas set
    rastreio = upper(trim(p_rastreio)),
    enviado_em = coalesce(enviado_em, now()),
    custo_postagem = p_custo_postagem,
    previsao_entrega = p_previsao,
    situacao_entrega = v_situacao,
    entrega_em = case when v_situacao = 'Pendente' then null when v_situacao = coalesce(situacao_entrega, 'Pendente') then entrega_em else now() end,
    boleto_enviado_em = case when coalesce(v_forma, '') ilike 'boleto%' and coalesce(p_boleto_enviado, false) then coalesce(boleto_enviado_em, now()) end,
    taxa_cartao = case when coalesce(v_forma, '') ilike 'cart%' then p_taxa_cartao end
  where id = p_ficha;
end $$;
revoke all on function public.salvar_envio_rebolo(uuid, text, numeric, date, text, boolean, numeric) from public, anon;
grant execute on function public.salvar_envio_rebolo(uuid, text, numeric, date, text, boolean, numeric) to authenticated;

-- A tela antiga (só o rastreio) continua funcionando até o site atualizar: o envio entra como "Pendente"
create or replace function public.registrar_envio_rebolo(p_ficha uuid, p_rastreio text) returns void
language plpgsql security definer set search_path = public as $$
declare f public.rebolo_fichas;
begin
  f := public.rebolo_ficha_minha(p_ficha);
  if f.situacao <> 'Vendida' then raise exception 'Só vendas aprovadas podem ser enviadas.'; end if;
  if coalesce(trim(p_rastreio), '') = '' then raise exception 'Informe o código de rastreio.'; end if;
  update public.rebolo_fichas set rastreio = upper(trim(p_rastreio)), enviado_em = now(), situacao_entrega = coalesce(situacao_entrega, 'Pendente') where id = p_ficha;
end $$;
revoke all on function public.registrar_envio_rebolo(uuid, text) from public, anon;
grant execute on function public.registrar_envio_rebolo(uuid, text) to authenticated;

-- 2. Custo mensal de cada vendedora: o salário do holerite (os encargos o sistema soma)
create table if not exists public.rebolo_custos_mes (
  id uuid primary key default gen_random_uuid(),
  vendedora_id uuid not null references public.colaboradores(id) on delete cascade,
  mes text not null check (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  salario numeric(12, 2) not null check (salario >= 0),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendedora_id, mes)
);
alter table public.rebolo_custos_mes enable row level security;
drop policy if exists rebolo_custos_mes_select on public.rebolo_custos_mes;
create policy rebolo_custos_mes_select on public.rebolo_custos_mes for select to authenticated using ((select public.pode('financeiro', 'visualizar')));
drop policy if exists rebolo_custos_mes_insert on public.rebolo_custos_mes;
create policy rebolo_custos_mes_insert on public.rebolo_custos_mes for insert to authenticated with check ((select public.pode('financeiro', 'criar')));
drop policy if exists rebolo_custos_mes_update on public.rebolo_custos_mes;
create policy rebolo_custos_mes_update on public.rebolo_custos_mes for update to authenticated using ((select public.pode('financeiro', 'editar')));
drop policy if exists rebolo_custos_mes_delete on public.rebolo_custos_mes;
create policy rebolo_custos_mes_delete on public.rebolo_custos_mes for delete to authenticated using ((select public.pode('financeiro', 'excluir')));
drop trigger if exists trg_auditoria on public.rebolo_custos_mes;
create trigger trg_auditoria after insert or update or delete on public.rebolo_custos_mes for each row execute function public.fn_auditoria();
drop trigger if exists trg_updated_at on public.rebolo_custos_mes;
create trigger trg_updated_at before update on public.rebolo_custos_mes for each row execute function public.tocar_updated_at();
-- quem é de fora não chega nem perto (SQL 035); a equipe passa pelas regras acima
revoke all on table public.rebolo_custos_mes from public, anon;
grant select, insert, update, delete on table public.rebolo_custos_mes to authenticated;
grant all on table public.rebolo_custos_mes to service_role;
-- a Visão TV atualiza sozinha quando o Financeiro lança
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rebolo_custos_mes') then
    alter publication supabase_realtime add table public.rebolo_custos_mes;
  end if;
end $$;

-- Conferência (esperado: 6 | 1 | true | false)
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'rebolo_fichas'
     and column_name in ('custo_postagem', 'previsao_entrega', 'situacao_entrega', 'entrega_em', 'boleto_enviado_em', 'taxa_cartao')) as campos_envio,
  (select count(*) from pg_proc where proname = 'salvar_envio_rebolo') as funcao_envio,
  (select relrowsecurity from pg_class where oid = 'public.rebolo_custos_mes'::regclass) as custos_com_rls,
  has_table_privilege('anon', 'public.rebolo_custos_mes', 'select') as de_fora_le_custos;
