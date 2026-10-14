-- 045 — Cobrança, etapa 1 (14/10, SPEC_COBRANCA v0.6, seções 2, 8.1 e 9)
-- 1. Setor Cobrança sem hierarquia: a única função é "Cobrador".
-- 2. O cobrador da dívida tem que ser do setor Cobrança. Com 1 cobrador ativo só, TODA dívida é dele
--    (as 9.284 migradas, que estavam sem cobrador, e as novas). A vendedora do Rebolo / interna deixa de virar
--    "cobradora" da própria venda. Se um dia houver 2 ou mais cobradores, vale a escolha manual (só entre eles).
-- 3. Meta "valor recebido" do cobrador: só conta recebimento de dívida em Registro SPC (regra de ouro, 8.1).
-- Não apaga nem muda nenhum lançamento antigo; a conferência no fim só mostra os números.
-- Rodar inteiro no SQL Editor. Conferência esperada (última linha): cobradores_ativos = 1, sem_cobrador = 0, fora_do_setor = 0.

begin;

-- 1. Função única
update public.colaboradores set funcao = 'Cobrador' where setor = 'cobranca' and funcao <> 'Cobrador';

-- 2. Quem é o cobrador da dívida
create or replace function public.cobrador_da_cobranca(p_sugerido uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_qtd int;
  v_id uuid;
begin
  select count(*), min(id::text)::uuid into v_qtd, v_id
    from public.colaboradores where setor = 'cobranca' and status = 'ATIVO';
  if v_qtd = 1 then return v_id; end if;
  if p_sugerido is not null and exists (
    select 1 from public.colaboradores where id = p_sugerido and setor = 'cobranca' and status = 'ATIVO'
  ) then return p_sugerido; end if;
  return null;
end $$;
revoke all on function public.cobrador_da_cobranca(uuid) from public, anon, authenticated;

create or replace function public.cobranca_cobrador() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.cobrador_id := public.cobrador_da_cobranca(new.cobrador_id);
  return new;
end $$;
revoke all on function public.cobranca_cobrador() from public, anon, authenticated;

drop trigger if exists trg_cobranca_cobrador on public.cobrancas;
create trigger trg_cobranca_cobrador before insert or update of cobrador_id on public.cobrancas
  for each row execute function public.cobranca_cobrador();

-- dívidas que já existem (o gatilho acerta o cobrador)
update public.cobrancas c set cobrador_id = c.cobrador_id
 where c.cobrador_id is distinct from public.cobrador_da_cobranca(c.cobrador_id);

-- 3. Recebimento: meta do cobrador só com a dívida em Registro SPC (resto igual ao 041)
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
  if c.cobrador_id is not null
     and exists (select 1 from public.cobranca_categorias k where k.id = c.categoria_id and k.grupo = 'Registro SPC') then
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

commit;
notify pgrst, 'reload schema';

-- Conferência
select
  (select count(*) from public.colaboradores where setor = 'cobranca' and status = 'ATIVO') as cobradores_ativos,
  (select count(*) from public.cobrancas where cobrador_id is null) as sem_cobrador,
  (select count(*) from public.cobrancas c left join public.colaboradores co on co.id = c.cobrador_id
    where c.cobrador_id is not null and co.setor is distinct from 'cobranca') as fora_do_setor,
  (select count(*) from public.lancamentos l join public.colaboradores co on co.id = l.colaborador_id
    where l.setor = 'cobranca' and l.indicador_id = 'valor_recebido' and co.setor <> 'cobranca') as lancamentos_antigos_de_quem_nao_e_cobrador;
