-- =====================================================================
-- 018 — FINANCEIRO DEVOLVE O FECHAMENTO PARA A OPERAÇÕES  (pode rodar mais de uma vez)
--
-- Em Financeiro › Pagamentos Operacionais, quando um pagamento vier errado (PIX, fichas, valor...),
-- o Financeiro devolve o fechamento com o motivo:
--   • todos os pagamentos daquele fechamento saem da lista (e as aprovações pendentes deles);
--   • o fechamento volta para "Rascunho" com o motivo, para a Operações corrigir e reenviar;
--   • a visita da escola volta para "Fotografada"; a Operações recebe o aviso.
-- Não devolve se algum PIX do fechamento já foi pago (ninguém recebe duas vezes).
-- =====================================================================

alter table public.fechamentos add column if not exists devolucao_motivo text;
alter table public.fechamentos add column if not exists devolvido_em timestamptz;
alter table public.fechamentos add column if not exists devolvido_por text;

create or replace function public.devolver_fechamento(p_conta uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c public.contas_pagar;
  f public.fechamentos;
  autor text := (select nome from public.colaboradores where id = auth.uid());
begin
  if not public.pode('financeiro', 'editar') then
    raise exception 'Sem permissão para devolver pagamentos' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo da devolução'; end if;
  select * into c from public.contas_pagar where id = p_conta;
  if not found then raise exception 'Pagamento não encontrado'; end if;
  if c.fechamento_id is null then raise exception 'Este pagamento não veio de um fechamento da Operações'; end if;
  select * into f from public.fechamentos where id = c.fechamento_id for update;
  if not found then raise exception 'Fechamento não encontrado'; end if;
  if f.status <> 'Enviado ao financeiro' then raise exception 'Este fechamento não está no Financeiro'; end if;
  if exists (select 1 from public.contas_pagar where fechamento_id = f.id and status = 'Pago') then
    raise exception 'Já existe PIX pago neste fechamento: não dá para devolver';
  end if;

  delete from public.aprovacoes
   where ref_tabela = 'contas_pagar' and status = 'Pendente'
     and ref_id in (select id from public.contas_pagar where fechamento_id = f.id);
  delete from public.contas_pagar where fechamento_id = f.id;
  update public.fechamentos
     set status = 'Rascunho', devolucao_motivo = trim(p_motivo), devolvido_em = now(), devolvido_por = autor
   where id = f.id;
  if f.tipo = 'escola' then
    update public.agenda_visitas set status = 'Fotografada' where id = f.ref_id and status = 'Fechamento enviado';
  end if;
  perform public.notificar(array['operacional', 'adm']::public.setor[], 'alerta', 'Fechamento devolvido pelo Financeiro',
    format('%s: %s', f.referencia, trim(p_motivo)), '/operacional/fechamento');
  return f.id;
end $$;
revoke all on function public.devolver_fechamento(uuid, text) from public, anon;
grant execute on function public.devolver_fechamento(uuid, text) to authenticated;

-- Conferência: deve mostrar 3 | 1
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'fechamentos'
          and column_name in ('devolucao_motivo', 'devolvido_em', 'devolvido_por')) as colunas_devolucao,
       (select count(*) from pg_proc where proname = 'devolver_fechamento') as funcao_devolver;
