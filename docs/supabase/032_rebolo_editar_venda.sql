-- =====================================================================
-- 032 — REBOLO: EDITAR A VENDA FECHADA  (rodar DEPOIS do 031; pode rodar mais de uma vez)
--
--  Antes, depois de fechar a venda só havia o botão Cancelar — e cancelar perdia todo o processo.
--  Agora (pedido de 06/10/2026) a dona da venda (ou a supervisão) corrige a venda enquanto ela está
--  "A efetivar" (Aguardando contrato) ou "Devolvida" pelo Financeiro: produto, valor, forma de pagamento,
--  parcelas, 1º vencimento e os dados do comprador (nome, CPF, RG, WhatsApp, observação).
--  A venda continua no mesmo lugar e o histórico da ficha registra o que mudou ("Venda editada").
--  Venda no Financeiro, aprovada ou cancelada não muda.
-- =====================================================================

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

  -- histórico da ficha: o que mudou no negócio (ou só os dados do comprador)
  v_antes := concat_ws(' • ', v.pacote, v.forma_pagamento, v.forma_parcelamento, 'R$ ' || replace(to_char(v.valor, 'FM9999999990.00'), '.', ','));
  v_depois := concat_ws(' • ', v_pacote, v_forma, v_parcelamento, 'R$ ' || replace(to_char(v_valor, 'FM9999999990.00'), '.', ','));
  insert into public.rebolo_contatos (ficha_id, vendedora_id, resultado, observacao)
  values (v.ficha_rebolo_id, auth.uid(), 'Venda editada',
          case when v_antes = v_depois then 'Dados do comprador corrigidos' else v_antes || ' → ' || v_depois end);
end $$;
revoke all on function public.editar_venda_rebolo(uuid, jsonb) from public, anon;
grant execute on function public.editar_venda_rebolo(uuid, jsonb) to authenticated;

-- Conferência: deve mostrar 1
select (select count(*) from pg_proc where proname = 'editar_venda_rebolo') as editar_venda;
