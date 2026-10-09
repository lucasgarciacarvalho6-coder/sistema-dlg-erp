-- =====================================================================
-- 044 — VENDA DO REBOLO CONTA NA META NO DIA DA ASSINATURA DO CONTRATO (pedido de 09/10/2026)
--  "as vendas podem aparecer mesmo que não tenham sido confirmadas pelo Financeiro: assim que o cliente
--   assina o documento ela já pode ser contabilizada e aparecer no painel e no dashboard das metas"
--
--  • A venda conta (valor vendido + books vendidos) assim que a vendedora anexa o contrato assinado,
--    NO DIA DA ASSINATURA (horário de Brasília). Não espera mais o Financeiro conferir.
--  • A conferência do Financeiro só gera os boletos (conta só a venda que ainda não tinha contado).
--  • Cada lançamento da meta fica ligado à venda (lancamentos.venda_id): a mesma venda nunca conta duas vezes.
--  • Venda cancelada sai da meta; devolvida pelo Financeiro continua contando (foi assinada);
--    se a vendedora corrigir o valor/produto (Editar venda, SQL 032), a meta acompanha.
--  • As vendas que JÁ estão com o contrato anexado (no Financeiro ou devolvidas) e ainda não contaram passam a
--    contar agora, no dia em que o contrato foi anexado (pelo histórico de alterações). O que já contou não muda.
-- Rodar DEPOIS do 012 e do 032. Pode rodar mais de uma vez.
-- =====================================================================

-- 1. a meta ligada à venda (apagar a venda apaga o lançamento dela)
alter table public.lancamentos add column if not exists venda_id uuid references public.vendas_ebooks(id) on delete cascade;
create index if not exists lancamentos_venda_idx on public.lancamentos (venda_id) where venda_id is not null;
-- só o sistema (as funções do fluxo da venda) liga um lançamento a uma venda: pelo app ninguém grava nem troca venda_id
create or replace function public.lancamento_venda_protegida() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and new.venda_id is distinct from (case when tg_op = 'UPDATE' then old.venda_id end) then
    raise exception 'A meta ligada a uma venda é lançada só pelo sistema.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_lancamento_venda_protegida on public.lancamentos;
create trigger trg_lancamento_venda_protegida before insert or update on public.lancamentos for each row execute function public.lancamento_venda_protegida();

-- 2. "hoje" no horário de Brasília (o servidor do banco usa UTC: depois das 21h já seria amanhã)
create or replace function public.hoje_brasil() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- 3. conta a venda na meta (uma vez só): p_data = dia em que conta (padrão: o dia da venda)
drop function if exists public.contar_venda_rebolo(public.vendas_ebooks);
create or replace function public.contar_venda_rebolo(v public.vendas_ebooks, p_data date default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_data date := coalesce(p_data, v.data);
  v_desc text := coalesce(v.pacote, 'Book') || ' — ' || v.responsavel;
begin
  if exists (select 1 from public.lancamentos where venda_id = v.id) then return; end if;
  insert into public.lancamentos (setor, indicador_id, colaborador_id, quantidade, descricao, data, origem, venda_id)
  values ('rebolo', 'books_vendidos', v.cobrador_id, coalesce(v.quantidade, 1), v_desc, v_data, 'automatico', v.id);
  if coalesce(v.valor, 0) > 0 then
    insert into public.lancamentos (setor, indicador_id, colaborador_id, quantidade, descricao, data, origem, venda_id)
    values ('rebolo', 'valor_vendido', v.cobrador_id, v.valor, v_desc, v_data, 'automatico', v.id);
  end if;
end $$;
revoke all on function public.contar_venda_rebolo(public.vendas_ebooks, date) from public, anon, authenticated;

-- 4. a vendedora anexa o contrato assinado (conta na meta NA HORA) ou cancela a venda (sai da meta)
create or replace function public.atualizar_venda_rebolo(p_venda uuid, p_acao text, p_contrato text default null, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v public.vendas_ebooks;
begin
  select * into v from public.vendas_ebooks where id = p_venda for update;
  if not found or v.canal <> 'Rebolo' then raise exception 'Venda não encontrada'; end if;
  if v.cobrador_id <> auth.uid() and not public.eh_supervisao_rebolo() then raise exception 'Esta venda é de outra vendedora' using errcode = '42501'; end if;
  if v.conferencia not in ('Aguardando contrato', 'Devolvida') then raise exception 'Esta venda já está com o Financeiro.'; end if;
  perform set_config('dlg.rebolo_fluxo', '1', true);
  if p_acao = 'cancelar' then
    update public.vendas_ebooks set conferencia = 'Cancelada', conferencia_motivo = nullif(trim(coalesce(p_motivo, '')), '') where id = p_venda;
    update public.rebolo_fichas set situacao = 'Cancelada' where id = v.ficha_rebolo_id;
    delete from public.lancamentos where venda_id = p_venda; -- cancelada não conta
  elsif p_acao = 'enviar' then
    if coalesce(p_contrato, '') = '' or p_contrato not like 'rebolo/%' then raise exception 'Anexe o contrato assinado.'; end if;
    update public.vendas_ebooks
       set anexos = jsonb_build_object('contratoAssinado', p_contrato), conferencia = 'Aguardando conferência', conferencia_motivo = null,
           assinatura_em = coalesce(assinatura_em, now())
     where id = p_venda;
    -- contrato assinado = venda feita: conta na meta hoje (devolvida e reenviada não conta de novo)
    perform public.contar_venda_rebolo(v, public.hoje_brasil());
    perform public.notificar(array['financeiro', 'adm']::public.setor[], 'aprovacao', 'Venda do rebolo para conferir',
      format('%s • %s • R$ %s', v.responsavel, v.pacote, replace(to_char(v.valor, 'FM9999999990.00'), '.', ',')), '/financeiro/conferencia');
  else
    raise exception 'Ação inválida';
  end if;
end $$;
revoke all on function public.atualizar_venda_rebolo(uuid, text, text, text) from public, anon;
grant execute on function public.atualizar_venda_rebolo(uuid, text, text, text) to authenticated;

-- 5. conferência pelo Financeiro: gera os boletos; a venda do Rebolo já contou na assinatura
--    (a que ainda não tinha contado — de antes deste SQL — conta agora, no dia da assinatura)
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
    if v.canal = 'Rebolo' then
      perform public.contar_venda_rebolo(v, coalesce((v.assinatura_em at time zone 'America/Sao_Paulo')::date, v.data));
      perform set_config('dlg.rebolo_fluxo', '1', true);
      update public.rebolo_fichas set situacao = 'Vendida' where id = v.ficha_rebolo_id;
      perform public.notificar(array['rebolo']::public.setor[], 'sucesso', 'Venda aprovada pelo Financeiro', v.responsavel || ' — pronta para envio.', '/rebolo/envios');
    end if;
  elsif p_acao = 'devolver' then
    if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo da devolução'; end if;
    update public.vendas_ebooks set conferencia = 'Devolvida', conferencia_motivo = trim(p_motivo), conferido_por = auth.uid(), conferido_em = now() where id = p_id;
    if v.canal = 'Rebolo' then
      perform public.notificar(array['rebolo']::public.setor[], 'alerta', 'Venda devolvida pelo Financeiro', v.responsavel || ': ' || trim(p_motivo), '/rebolo/vendas');
    end if;
  else
    raise exception 'Ação inválida';
  end if;
end $$;
revoke all on function public.conferir_venda_book(uuid, text, text) from public, anon;
grant execute on function public.conferir_venda_book(uuid, text, text) to authenticated;

-- 6. editar a venda (SQL 032) agora acerta a meta de uma venda devolvida que já contou
create or replace function public.editar_venda_rebolo(p_venda uuid, p_dados jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.vendas_ebooks;
  v_pacote text := trim(coalesce(p_dados->>'pacote', ''));
  v_valor numeric(12, 2) := nullif(trim(coalesce(p_dados->>'valor', '')), '')::numeric;
  v_forma text := trim(coalesce(p_dados->>'forma_pagamento', ''));
  v_parcelas int := coalesce(nullif(trim(coalesce(p_dados->>'parcelas', '')), '')::int, 1);
  v_parcelamento text := nullif(trim(coalesce(p_dados->>'forma_parcelamento', '')), '');
  v_venc date := nullif(trim(coalesce(p_dados->>'primeiro_vencimento', '')), '')::date;
  v_nome text := upper(trim(coalesce(p_dados->>'responsavel', '')));
  v_cpf text := trim(coalesce(p_dados->>'cpf', ''));
  v_whats text := nullif(trim(coalesce(p_dados->>'whatsapp', '')), '');
  v_antes text;
  v_depois text;
begin
  if not public.pode('rebolo', 'editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into v from public.vendas_ebooks where id = p_venda for update;
  if not found or v.canal <> 'Rebolo' then raise exception 'Venda não encontrada'; end if;
  if v.cobrador_id <> auth.uid() and not public.eh_supervisao_rebolo() then raise exception 'Esta venda é de outra vendedora' using errcode = '42501'; end if;
  if v.conferencia not in ('Aguardando contrato', 'Devolvida') then
    raise exception 'Só dá para editar a venda a efetivar ou devolvida (esta está: %).', v.conferencia;
  end if;

  if v_pacote = '' then raise exception 'Escolha o produto.'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor da venda.'; end if;
  if v_forma not in ('PIX', 'Cartão de crédito', 'Boleto') then raise exception 'Forma de pagamento inválida.'; end if;
  if v_forma = 'PIX' then v_parcelas := 1; v_parcelamento := 'À vista'; end if;
  if v_parcelas not between 1 and 24 then raise exception 'Número de parcelas inválido.'; end if;
  if v_forma = 'Boleto' and v_venc is null then raise exception 'Informe o 1º vencimento do boleto.'; end if;
  if v_nome = '' then raise exception 'Informe o nome do comprador.'; end if;
  if length(regexp_replace(v_cpf, '\D', '', 'g')) <> 11 then raise exception 'Informe o CPF do comprador (11 dígitos).'; end if;

  update public.vendas_ebooks set
    pacote = v_pacote,
    valor = v_valor,
    forma_pagamento = v_forma,
    parcelas = v_parcelas,
    forma_parcelamento = v_parcelamento,
    primeiro_vencimento = case when v_forma = 'Boleto' then v_venc end,
    responsavel = v_nome,
    cpf = v_cpf,
    rg = nullif(trim(coalesce(p_dados->>'rg', '')), ''),
    whatsapp = v_whats,
    telefone = coalesce(v_whats, telefone),
    observacao = nullif(trim(coalesce(p_dados->>'observacao', '')), '')
  where id = p_venda;

  -- (044) a venda devolvida já contou na assinatura: a meta acompanha o valor e o nome novos
  update public.lancamentos
     set quantidade = case when indicador_id = 'valor_vendido' then v_valor else quantidade end,
         descricao = v_pacote || ' — ' || v_nome
   where venda_id = p_venda;

  -- histórico da ficha: o que mudou no negócio (ou só os dados do comprador)
  v_antes := concat_ws(' • ', v.pacote, v.forma_pagamento, v.forma_parcelamento, 'R$ ' || replace(to_char(v.valor, 'FM9999999990.00'), '.', ','));
  v_depois := concat_ws(' • ', v_pacote, v_forma, v_parcelamento, 'R$ ' || replace(to_char(v_valor, 'FM9999999990.00'), '.', ','));
  insert into public.rebolo_contatos (ficha_id, vendedora_id, resultado, observacao)
  values (v.ficha_rebolo_id, auth.uid(), 'Venda editada',
          case when v_antes = v_depois then 'Dados do comprador corrigidos' else v_antes || ' → ' || v_depois end);
end $$;
revoke all on function public.editar_venda_rebolo(uuid, jsonb) from public, anon;
grant execute on function public.editar_venda_rebolo(uuid, jsonb) to authenticated;

-- 7. vendas que JÁ estão com o contrato anexado e ainda não contaram: contam agora, no dia em que o contrato foi
--    anexado (a 1ª vez que a venda foi para "Aguardando conferência", pelo histórico de alterações)
do $$
declare r public.vendas_ebooks; v_assinou timestamptz;
begin
  for r in
    select v.* from public.vendas_ebooks v
     where v.canal = 'Rebolo' and v.conferencia in ('Aguardando conferência', 'Devolvida')
       and not exists (select 1 from public.lancamentos l where l.venda_id = v.id)
  loop
    select min(a.data) into v_assinou from public.auditoria a
     where a.tabela = 'vendas_ebooks' and a.registro_id = r.id::text
       and a.dados_depois->>'conferencia' = 'Aguardando conferência'
       and coalesce(a.dados_antes->>'conferencia', '') <> 'Aguardando conferência';
    v_assinou := coalesce(r.assinatura_em, v_assinou, r.updated_at, now());
    update public.vendas_ebooks set assinatura_em = v_assinou where id = r.id and assinatura_em is null;
    perform public.contar_venda_rebolo(r, (v_assinou at time zone 'America/Sao_Paulo')::date);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Conferência: deve mostrar true | 0 | true
select
  exists (select 1 from information_schema.columns where table_name = 'lancamentos' and column_name = 'venda_id') as meta_ligada_a_venda,
  (select count(*) from public.vendas_ebooks v where v.canal = 'Rebolo' and v.conferencia in ('Aguardando conferência', 'Devolvida')
     and not exists (select 1 from public.lancamentos l where l.venda_id = v.id)) as assinadas_sem_contar,
  exists (select 1 from pg_proc where proname = 'contar_venda_rebolo' and pronargs = 2) as conta_na_assinatura;
