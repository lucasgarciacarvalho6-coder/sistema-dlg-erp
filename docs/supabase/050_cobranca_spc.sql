-- 050 — Cobrança, etapa 6 (14/10, SPEC_COBRANCA v0.6, seção 7): SPC, igual ao sistema antigo
-- Estado do SPC de cada cobrança (spc_estado):
--   (vazio) → "Inclusão marcada" (a Cobrança marca: cliente sem interesse; o banco confere se ainda é elegível)
--   → "Enviado" (o Financeiro registrou o envio; aguarda a confirmação de fora)
--   → "Registrado" (confirmado pelo Financeiro ou pela planilha oficial; a categoria vira Registro SPC, com histórico)
--   → "Retirada solicitada" (regularizou e o Financeiro pediu a retirada) → "Removido" (a planilha nova confirmou que saiu)
--   "Divergência": a planilha e o sistema não batem (exige revisão).
-- Ficha não encontrada: fila de exceção da Cobrança; se a ficha aparecer, "Ficha localizada — liberar para SPC" (com registro).
-- Conferir com a planilha oficial do SPC (aba BASE_CONSOLIDADA): cruza por CPF/CNPJ e depois pelo contrato (nº da venda).
-- Elegível (manual, item 8): carteira DLG, ≥ 2 boletos vencidos, ≥ 61 dias, categoria que permite SPC, CPF/CNPJ válido,
-- fora do Registro SPC (é o "pode_ir_spc" que já existe) e sem SPC em andamento.
-- Só ACRESCENTA (colunas, funções, views). Rodar inteiro no SQL Editor.
-- Conferência esperada (última linha): colunas = 5, funcoes = 3, views = 2.

begin;

alter table public.cobrancas add column if not exists spc_estado text
  check (spc_estado in ('Inclusão marcada', 'Enviado', 'Registrado', 'Divergência', 'Retirada solicitada', 'Removido'));
alter table public.cobrancas add column if not exists spc_marcado_em date;
alter table public.cobrancas add column if not exists spc_enviado_em date;
alter table public.cobrancas add column if not exists spc_registrado_em date;
alter table public.cobrancas add column if not exists spc_historico jsonb not null default '[]';
create index if not exists cobrancas_spc_estado_idx on public.cobrancas (spc_estado) where spc_estado is not null;

create or replace function public.spc_evento(p_acao text, p_obs text default null) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_array(jsonb_build_object('em', now(), 'por', (select nome from public.colaboradores where id = auth.uid()), 'acao', p_acao, 'obs', p_obs))
$$;

-- 1. Cobrança: marcar para o SPC / ficha localizada / desmarcar
create or replace function public.cobranca_spc(p_cobranca uuid, p_acao text, p_observacao text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
begin
  if not (public.pode('cobranca', 'editar') or public.pode('cobranca', 'criar')) then raise exception 'Só a Cobrança marca o cliente para o SPC.'; end if;
  select c.id, c.cliente_id, c.pode_ir_spc, c.carteira, c.vencido, x.spc_estado, x.situacao
    into v from public.vw_cobrancas c join public.cobrancas x on x.id = c.id where c.id = p_cobranca for update of x;
  if v.id is null then raise exception 'Cobrança não encontrada.'; end if;

  if p_acao = 'incluir' then
    if v.spc_estado is not null and v.spc_estado <> 'Removido' then raise exception 'Esta cobrança já está no fluxo do SPC (%).', v.spc_estado; end if;
    if not v.pode_ir_spc then
      raise exception 'Inclusão no SPC bloqueada: esta cobrança não está elegível (carteira DLG, 2 boletos vencidos, 61 dias, CPF/CNPJ válido, fora do Registro SPC).';
    end if;
    if v.situacao in ('Renegociação feita (aguardando entrada)', 'Entrada confirmada') then raise exception 'Esta cobrança tem acordo em andamento.'; end if;
    insert into public.cobranca_contatos (cobranca_id, cliente_id, tipo, data, situacao, situacao_antes, observacao, registrado_por, registrado_por_nome)
    values (v.id, v.cliente_id, 'Outro', current_date, 'Contato realizado sem acordo', v.situacao,
            coalesce(v_obs, 'Cliente sem interesse - enviar ao SPC'), auth.uid(), (select nome from public.colaboradores where id = auth.uid()));
    update public.cobrancas
       set spc_estado = 'Inclusão marcada', spc_marcado_em = current_date, situacao = 'Contato realizado sem acordo',
           retorno_em = null, promessa_em = null, promessa_valor = null, ultimo_contato_em = greatest(coalesce(ultimo_contato_em, current_date), current_date),
           spc_historico = spc_historico || public.spc_evento('Marcado para inclusão no SPC (cliente sem interesse)', v_obs), updated_at = now()
     where id = v.id;
    return 'Cliente marcado para o SPC: o Financeiro faz o envio.';
  elsif p_acao = 'ficha_localizada' then
    if v.situacao <> 'Ficha não encontrada SPC' then raise exception 'Só libera cobrança que está como "Ficha não encontrada".'; end if;
    insert into public.cobranca_contatos (cobranca_id, cliente_id, tipo, data, situacao, situacao_antes, observacao, registrado_por, registrado_por_nome)
    values (v.id, v.cliente_id, 'Outro', current_date, 'Contato realizado sem acordo', v.situacao,
            coalesce(v_obs, 'Ficha localizada — liberar para SPC'), auth.uid(), (select nome from public.colaboradores where id = auth.uid()));
    update public.cobrancas
       set situacao = 'Contato realizado sem acordo', spc_historico = spc_historico || public.spc_evento('Ficha localizada — liberar para SPC', v_obs), updated_at = now()
     where id = v.id;
    return 'Ficha localizada: a cobrança voltou para a fila do SPC.';
  elsif p_acao = 'desmarcar' then
    if v.spc_estado is distinct from 'Inclusão marcada' then raise exception 'Só desmarca antes de o Financeiro enviar.'; end if;
    update public.cobrancas
       set spc_estado = null, spc_marcado_em = null, spc_historico = spc_historico || public.spc_evento('Inclusão no SPC desmarcada', v_obs), updated_at = now()
     where id = v.id;
    return 'Inclusão no SPC desmarcada.';
  end if;
  raise exception 'Ação inválida.';
end $$;
revoke all on function public.cobranca_spc(uuid, text, text) from public, anon;
grant execute on function public.cobranca_spc(uuid, text, text) to authenticated;

-- 2. Financeiro: enviar / confirmar registro / divergência / solicitar retirada / confirmar retirada
create or replace function public.financeiro_spc(p_cobranca uuid, p_acao text, p_observacao text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  x public.cobrancas;
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_cat uuid;
begin
  if not public.pode('financeiro', 'editar') then raise exception 'Só o Financeiro envia e retira do SPC.'; end if;
  select * into x from public.cobrancas where id = p_cobranca for update;
  if x.id is null then raise exception 'Cobrança não encontrada.'; end if;
  if p_acao = 'enviar' then
    if x.spc_estado is distinct from 'Inclusão marcada' then raise exception 'Só envia cobrança marcada pela Cobrança.'; end if;
    update public.cobrancas set spc_estado = 'Enviado', spc_enviado_em = current_date,
           spc_historico = spc_historico || public.spc_evento('Enviado ao SPC pelo Financeiro', v_obs), updated_at = now() where id = x.id;
    return 'Envio ao SPC registrado: aguardando a confirmação.';
  elsif p_acao = 'confirmar' then
    if x.spc_estado not in ('Enviado', 'Divergência') then raise exception 'Só confirma registro de cobrança enviada (ou em divergência).'; end if;
    select id into v_cat from public.cobranca_categorias where grupo = 'Registro SPC' and ativa order by nome limit 1;
    if v_cat is null then raise exception 'Cadastre uma categoria do grupo Registro SPC em Configurações.'; end if;
    update public.cobrancas set spc_estado = 'Registrado', spc_registrado_em = current_date, categoria_id = v_cat,
           spc_historico = spc_historico || public.spc_evento('Registro no SPC confirmado', v_obs), updated_at = now() where id = x.id;
    return 'Registro no SPC confirmado (categoria Registro SPC).';
  elsif p_acao = 'divergencia' then
    if v_obs is null then raise exception 'Informe o que não bateu.'; end if;
    update public.cobrancas set spc_estado = 'Divergência', spc_historico = spc_historico || public.spc_evento('Divergência na conferência do SPC', v_obs), updated_at = now() where id = x.id;
    return 'Divergência registrada.';
  elsif p_acao = 'solicitar_retirada' then
    if x.spc_estado not in ('Registrado', 'Divergência') then raise exception 'Só pede retirada de quem está registrado no SPC.'; end if;
    update public.cobrancas set spc_estado = 'Retirada solicitada', spc_historico = spc_historico || public.spc_evento('Solicitação de retirada do SPC', v_obs), updated_at = now() where id = x.id;
    return 'Solicitação de retirada registrada (só vira "Removido" quando a planilha nova confirmar).';
  elsif p_acao = 'confirmar_retirada' then
    if x.spc_estado is distinct from 'Retirada solicitada' then raise exception 'Só confirma retirada já solicitada.'; end if;
    update public.cobrancas set spc_estado = 'Removido', spc_historico = spc_historico || public.spc_evento('Retirada do SPC confirmada', v_obs), updated_at = now() where id = x.id;
    return 'Retirada do SPC confirmada.';
  end if;
  raise exception 'Ação inválida.';
end $$;
revoke all on function public.financeiro_spc(uuid, text, text) from public, anon;
grant execute on function public.financeiro_spc(uuid, text, text) to authenticated;

-- 3. Telas: fila de elegíveis/SPC (Cobrança) e Registro SPC (Financeiro) — uma linha por cobrança
create or replace view public.vw_cobranca_spc with (security_invoker = true) as
select c.id as cobranca_id, c.cliente_id, c.cliente, c.documento, c.documento_ok, c.telefone, c.codigo_venda, c.conta, c.categoria, c.grupo,
       c.carteira, c.parcelas_vencidas, c.vencido, c.atualizado, c.total_divida, c.vencida_desde, c.dias_atraso, c.pode_ir_spc, c.cobrador_id,
       x.situacao, x.spc_estado, x.spc_marcado_em, x.spc_enviado_em, x.spc_registrado_em, x.spc_historico,
       (c.parcelas_abertas = 0 or coalesce(c.vencido, 0) = 0) as regularizada,
       min(p.vencimento) filter (where p.situacao in ('Aberta', 'Parcial') and p.vencimento < current_date) as parcela_mais_antiga
  from public.vw_cobrancas c
  join public.cobrancas x on x.id = c.id
  left join public.cobranca_parcelas p on p.cobranca_id = c.id
 where (c.pode_ir_spc and x.spc_estado is null) or x.spc_estado is not null or x.situacao = 'Ficha não encontrada SPC'
 group by c.id, c.cliente_id, c.cliente, c.documento, c.documento_ok, c.telefone, c.codigo_venda, c.conta, c.categoria, c.grupo, c.carteira,
          c.parcelas_vencidas, c.vencido, c.atualizado, c.total_divida, c.vencida_desde, c.dias_atraso, c.pode_ir_spc, c.cobrador_id, c.parcelas_abertas,
          x.situacao, x.spc_estado, x.spc_marcado_em, x.spc_enviado_em, x.spc_registrado_em, x.spc_historico;

-- conferência com a planilha: recebe [{"documento": "...", "contrato": "..."}] e devolve cada linha com o que achou
create or replace function public.conferir_planilha_spc(p_linhas jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode('financeiro', 'visualizar') then raise exception 'Só o Financeiro confere a planilha do SPC.'; end if;
  return (
    with pl as (
      select distinct regexp_replace(coalesce(e ->> 'documento', ''), '\D', '', 'g') as doc, btrim(coalesce(e ->> 'contrato', '')) as contrato
        from jsonb_array_elements(p_linhas) e
    ), achados as (
      select pl.doc, pl.contrato, c.id as cobranca_id, c.cliente, c.codigo_venda, c.conta, c.grupo, c.carteira, c.vencido, x.spc_estado,
             (pl.contrato <> '' and c.codigo_venda = pl.contrato) as contrato_ok
        from pl
        left join public.vw_cobrancas c on c.documento = pl.doc
        left join public.cobrancas x on x.id = c.id
    ), escolhido as (
      select distinct on (doc, contrato) * from achados order by doc, contrato, contrato_ok desc, vencido desc nulls last
    ), na_planilha as (
      select jsonb_build_object(
        'documento', doc, 'contrato', contrato, 'cobranca_id', cobranca_id, 'cliente', cliente, 'codigo_venda', codigo_venda, 'conta', conta,
        'grupo', grupo, 'spc_estado', spc_estado, 'vencido', vencido, 'contrato_ok', coalesce(contrato_ok, false),
        'resultado', case
          when cobranca_id is null then 'Não encontrado no sistema'
          when coalesce(vencido, 0) <= 0 then 'No SPC, mas sem dívida em atraso (pendência de retirada)'
          when grupo = 'Registro SPC' or spc_estado = 'Registrado' then 'SPC OK'
          when grupo in ('Terceirizada', 'Advogado', 'Fundo perdido') then 'SPC OK (herdado)'
          when spc_estado in ('Enviado', 'Divergência') then 'Confirmar registro'
          when spc_estado = 'Retirada solicitada' then 'Retirada solicitada, ainda no SPC'
          else 'Divergência: no SPC com categoria normal' end) as j
        from escolhido
    ), fora as (
      select jsonb_build_object('documento', c.documento, 'contrato', '', 'cobranca_id', c.id, 'cliente', c.cliente, 'codigo_venda', c.codigo_venda,
                                'conta', c.conta, 'grupo', c.grupo, 'spc_estado', x.spc_estado, 'vencido', c.vencido, 'contrato_ok', false,
                                'resultado', case when x.spc_estado = 'Retirada solicitada' then 'Saiu do SPC: confirmar retirada'
                                                  when coalesce(c.vencido, 0) <= 0 then 'Fora da planilha: pagou/renegociou (conferir retirada)'
                                                  else 'Divergência: registrado no sistema, mas fora da planilha' end) as j
        from public.vw_cobrancas c join public.cobrancas x on x.id = c.id
       where (c.grupo = 'Registro SPC' or x.spc_estado in ('Registrado', 'Retirada solicitada'))
         and c.documento is not null and c.documento not in (select doc from pl)
    )
    select jsonb_build_object('na_planilha', coalesce((select jsonb_agg(j) from na_planilha), '[]'), 'fora_da_planilha', coalesce((select jsonb_agg(j) from fora), '[]'))
  );
end $$;
revoke all on function public.conferir_planilha_spc(jsonb) from public, anon;
grant execute on function public.conferir_planilha_spc(jsonb) to authenticated;

-- "Para hoje": SPC inclusão marcada hoje / pendente de envio entra como pendência do dia (mesmas colunas do 047)
create or replace view public.vw_cobranca_spc_pendente with (security_invoker = true) as
select cobranca_id, cliente, conta, vencido, spc_estado, spc_marcado_em from public.vw_cobranca_spc where spc_estado = 'Inclusão marcada';

revoke all on public.vw_cobranca_spc, public.vw_cobranca_spc_pendente from public, anon;
grant select on public.vw_cobranca_spc, public.vw_cobranca_spc_pendente to authenticated, service_role;

commit;
notify pgrst, 'reload schema';

-- Conferência
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'cobrancas'
     and column_name in ('spc_estado', 'spc_marcado_em', 'spc_enviado_em', 'spc_registrado_em', 'spc_historico')) as colunas,
  (select count(*) from pg_proc where proname in ('cobranca_spc', 'financeiro_spc', 'conferir_planilha_spc')) as funcoes,
  (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('vw_cobranca_spc', 'vw_cobranca_spc_pendente')) as views;
