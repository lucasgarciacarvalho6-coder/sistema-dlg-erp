-- =====================================================================
-- 012 — VENDAS REBOLO + "SEM META" NO COLABORADOR  (rodar DEPOIS do 011; pode rodar mais de uma vez)
--
--  • Colaborador "Sem meta" (ex.: Financeiro, Gerência): fora dos cards/ranking e da soma da meta do setor.
--  • Setor Vendas Rebolo: pacotes (caixas de 10 álbuns), fichas cadastradas à mão, contatos
--    (sem resposta → tentar de novo; descarte com motivo), desconto aprovado pela Gerência,
--    venda "Aguardando contrato" → contrato assinado anexado → conferência do Financeiro
--    → aprovada (gera parcelas e conta na meta) → envio pelo Correio com rastreio.
--  • A venda interna de books sai da Cobrança: o histórico de "books vendidos" passa para o Rebolo.
-- =====================================================================

-- 1. Sem meta
alter table public.colaboradores add column if not exists sem_meta boolean not null default false;

-- 2. Indicadores do Rebolo e histórico das vendas internas
insert into public.indicadores (id, setor, label, unidade, meta_diaria_padrao, meta_mensal_padrao) values
  ('valor_vendido', 'rebolo', 'Valor vendido', 'brl', 0, 0),
  ('books_vendidos', 'rebolo', 'Books vendidos', 'qtd', 0, 0)
on conflict (id) do update set label = excluded.label, unidade = excluded.unidade;

update public.lancamentos set setor = 'rebolo', indicador_id = 'books_vendidos'
where setor = 'cobranca' and indicador_id = 'ebooks_vendidos';

-- Gerente acompanha e opera o setor (como os demais)
insert into public.permissoes (perfil, modulo, acao)
select 'GERENTE'::public.perfil, 'rebolo', a::public.acao
from unnest(array['visualizar', 'criar', 'editar', 'excluir', 'exportar']) a
where not exists (select 1 from public.permissoes p where p.perfil = 'GERENTE' and p.modulo = 'rebolo' and p.acao = a::public.acao);

-- ADM, Gerência ou supervisora do rebolo (reabre descartes, vê todas as fichas)
create or replace function public.eh_supervisao_rebolo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.colaboradores
    where id = auth.uid() and status = 'ATIVO'
      and (perfil in ('ADM', 'GERENTE') or (setor = 'rebolo' and funcao ilike 'supervisor%'))
  )
$$;

-- 3. Pacotes (caixas) — numeração continua a do sistema antigo (último: 245)
create sequence if not exists public.rebolo_pacote_seq start 246;
create table if not exists public.rebolo_pacotes (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique default nextval('public.rebolo_pacote_seq'),
  tipo text not null default 'Padrão' check (tipo in ('Padrão', 'Avulso')),
  vendedora_id uuid not null references public.colaboradores(id),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Fichas (uma por álbum) — mesmos campos da ficha de cadastro de papel
create table if not exists public.rebolo_fichas (
  id uuid primary key default gen_random_uuid(),
  pacote_id uuid not null references public.rebolo_pacotes(id) on delete cascade,
  vendedora_id uuid not null references public.colaboradores(id),
  escola text not null,
  data_visita date not null, -- define a faixa de preço
  numero_ficha text not null,
  aluno text not null,
  serie text,
  data_nascimento date,
  qtd_fotos int not null default 0,
  cep text, rua text, numero text, apto text, fazenda text, proprietario_fazenda text,
  bairro text, cidade text, uf text, ponto_referencia text,
  whatsapp1 text not null, whatsapp2 text, whatsapp3 text, telefone text,
  nome_pai text, nome_mae text,
  horario text, -- Manhã / Tarde / Noite
  observacao text,
  -- fila de contatos (só muda pelas funções abaixo)
  situacao text not null default 'Aguardando contato' check (situacao in ('Aguardando contato', 'Tentar de novo', 'Em negociação', 'Agendado', 'Venda a efetivar', 'Vendida', 'Descarte', 'Cancelada')),
  motivo_descarte text,
  tentativas int not null default 0,
  agendado_para timestamptz,
  ultimo_contato timestamptz,
  venda_id uuid,
  desconto_valor numeric(12, 2),
  desconto_status text check (desconto_status in ('Pendente', 'Aprovado', 'Rejeitado')),
  desconto_motivo text,
  rastreio text,
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rebolo_fichas_pacote_idx on public.rebolo_fichas (pacote_id);
create index if not exists rebolo_fichas_vendedora_idx on public.rebolo_fichas (vendedora_id, situacao);

-- 5. Histórico de contatos de cada ficha
create table if not exists public.rebolo_contatos (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.rebolo_fichas(id) on delete cascade,
  vendedora_id uuid references public.colaboradores(id) on delete set null,
  data timestamptz not null default now(),
  resultado text not null,
  observacao text,
  agendado_para timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rebolo_contatos_ficha_idx on public.rebolo_contatos (ficha_id, data);

-- 6. RLS: o setor vê tudo do rebolo (gestão diária); cada vendedora mexe nas próprias fichas
do $$
declare t text;
begin
  foreach t in array array['rebolo_pacotes', 'rebolo_fichas', 'rebolo_contatos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.pode(''rebolo'', ''visualizar'') or public.pode(''financeiro'', ''visualizar''))', t || '_select', t);
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.fn_auditoria()', t);
    if t <> 'rebolo_contatos' then
      execute format('drop trigger if exists trg_updated_at on public.%I', t);
      execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.tocar_updated_at()', t);
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
-- pacote: a vendedora abre o próprio (a supervisão pode abrir para outra)
drop policy if exists rebolo_pacotes_insert on public.rebolo_pacotes;
create policy rebolo_pacotes_insert on public.rebolo_pacotes for insert to authenticated
  with check (public.pode('rebolo', 'criar') and (vendedora_id = auth.uid() or public.eh_supervisao_rebolo()));
drop policy if exists rebolo_pacotes_delete on public.rebolo_pacotes;
create policy rebolo_pacotes_delete on public.rebolo_pacotes for delete to authenticated using (public.eh_supervisao_rebolo());
-- ficha: cadastro e correção pela dona do pacote ou pela supervisão
drop policy if exists rebolo_fichas_insert on public.rebolo_fichas;
create policy rebolo_fichas_insert on public.rebolo_fichas for insert to authenticated
  with check (public.pode('rebolo', 'criar'));
drop policy if exists rebolo_fichas_update on public.rebolo_fichas;
create policy rebolo_fichas_update on public.rebolo_fichas for update to authenticated
  using (public.pode('rebolo', 'editar') and (vendedora_id = auth.uid() or public.eh_supervisao_rebolo()));
drop policy if exists rebolo_fichas_delete on public.rebolo_fichas;
create policy rebolo_fichas_delete on public.rebolo_fichas for delete to authenticated
  using (public.eh_supervisao_rebolo() and situacao = 'Aguardando contato');
-- rebolo_contatos: só pelas funções (security definer)

-- O rebolo lê a agenda (escola + data da visita) para calcular a faixa de preço da ficha
drop policy if exists agenda_visitas_rebolo_select on public.agenda_visitas;
create policy agenda_visitas_rebolo_select on public.agenda_visitas for select to authenticated using (public.pode('rebolo', 'visualizar'));

-- Uma caixa aberta por vendedora: só abre outra quando TODAS as fichas estiverem vendidas/descartadas/canceladas
create or replace function public.rebolo_pacote_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_aberto int;
begin
  select p.numero into v_aberto from public.rebolo_pacotes p
  where p.vendedora_id = new.vendedora_id
    and (not exists (select 1 from public.rebolo_fichas f where f.pacote_id = p.id)
         or exists (select 1 from public.rebolo_fichas f where f.pacote_id = p.id and f.situacao not in ('Vendida', 'Descarte', 'Cancelada')))
  limit 1;
  if v_aberto is not null then
    raise exception 'Finalize o pacote P% (todas as fichas vendidas ou em descarte) antes de abrir outro.', v_aberto;
  end if;
  return new;
end $$;
drop trigger if exists trg_rebolo_pacote_antes on public.rebolo_pacotes;
create trigger trg_rebolo_pacote_antes before insert on public.rebolo_pacotes for each row execute function public.rebolo_pacote_antes();

-- Ficha nova: dona = dona do pacote; Padrão até 10 fichas, Avulso 1; entra "Aguardando contato"
create or replace function public.rebolo_ficha_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.rebolo_pacotes;
begin
  if tg_op = 'INSERT' then
    select * into p from public.rebolo_pacotes where id = new.pacote_id;
    if not found then raise exception 'Pacote não encontrado'; end if;
    if p.vendedora_id <> auth.uid() and not public.eh_supervisao_rebolo() then
      raise exception 'Este pacote é de outra vendedora' using errcode = '42501';
    end if;
    if (select count(*) from public.rebolo_fichas where pacote_id = p.id) >= (case when p.tipo = 'Avulso' then 1 else 10 end) then
      raise exception 'O pacote P% já está completo.', p.numero;
    end if;
    new.vendedora_id := p.vendedora_id;
    new.situacao := 'Aguardando contato';
    new.tentativas := 0;
    new.venda_id := null;
    new.desconto_valor := null; new.desconto_status := null; new.desconto_motivo := null;
    new.rastreio := null; new.enviado_em := null;
    return new;
  end if;
  -- UPDATE direto (edição do cadastro): a fila, o desconto e o envio só mudam pelas funções do rebolo
  if coalesce(current_setting('dlg.rebolo_fluxo', true), '') <> '1' then
    new.pacote_id := old.pacote_id; new.vendedora_id := old.vendedora_id;
    new.situacao := old.situacao; new.motivo_descarte := old.motivo_descarte; new.tentativas := old.tentativas;
    new.agendado_para := old.agendado_para; new.ultimo_contato := old.ultimo_contato; new.venda_id := old.venda_id;
    new.desconto_valor := old.desconto_valor; new.desconto_status := old.desconto_status; new.desconto_motivo := old.desconto_motivo;
    new.rastreio := old.rastreio; new.enviado_em := old.enviado_em;
  end if;
  return new;
end $$;
drop trigger if exists trg_rebolo_ficha_antes on public.rebolo_fichas;
create trigger trg_rebolo_ficha_antes before insert or update on public.rebolo_fichas for each row execute function public.rebolo_ficha_antes();

-- Quem pode mexer na ficha: a dona ou a supervisão
create or replace function public.rebolo_ficha_minha(p_ficha uuid) returns public.rebolo_fichas
language plpgsql security definer set search_path = public as $$
declare f public.rebolo_fichas;
begin
  if not public.pode('rebolo', 'editar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  select * into f from public.rebolo_fichas where id = p_ficha for update;
  if not found then raise exception 'Ficha não encontrada'; end if;
  if f.vendedora_id <> auth.uid() and not public.eh_supervisao_rebolo() then
    raise exception 'Esta ficha é de outra vendedora' using errcode = '42501';
  end if;
  perform set_config('dlg.rebolo_fluxo', '1', true);
  return f;
end $$;
revoke all on function public.rebolo_ficha_minha(uuid) from public, anon, authenticated;

-- 7. Registrar contato: Sem resposta (tentar de novo) • Em negociação • Agendado • Descarte (com motivo)
create or replace function public.registrar_contato_rebolo(p_ficha uuid, p_resultado text, p_observacao text default null, p_motivo text default null, p_agendado timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare f public.rebolo_fichas;
begin
  f := public.rebolo_ficha_minha(p_ficha);
  if f.situacao not in ('Aguardando contato', 'Tentar de novo', 'Em negociação', 'Agendado') then raise exception 'Esta ficha não está na fila de contatos.'; end if;
  if p_resultado not in ('Sem resposta', 'Em negociação', 'Agendado', 'Descarte') then raise exception 'Resultado inválido'; end if;
  if p_resultado = 'Descarte' and coalesce(p_motivo, '') not in ('Sem interesse', 'Sem retorno', 'Não localizado', 'Sem condição financeira', 'Restrição nos nomes') then
    raise exception 'Escolha o motivo do descarte.';
  end if;
  if p_resultado = 'Agendado' and p_agendado is null then raise exception 'Informe a data e a hora do agendamento.'; end if;

  insert into public.rebolo_contatos (ficha_id, vendedora_id, resultado, observacao, agendado_para)
  values (p_ficha, auth.uid(), case when p_resultado = 'Descarte' then 'Descarte: ' || p_motivo else p_resultado end, nullif(trim(coalesce(p_observacao, '')), ''),
          case when p_resultado = 'Agendado' then p_agendado end);
  update public.rebolo_fichas set
    situacao = case p_resultado when 'Sem resposta' then 'Tentar de novo' else p_resultado end,
    ultimo_contato = now(),
    tentativas = tentativas + case when p_resultado = 'Sem resposta' then 1 else 0 end,
    agendado_para = case when p_resultado = 'Agendado' then p_agendado end,
    motivo_descarte = case when p_resultado = 'Descarte' then p_motivo end,
    observacao = coalesce(nullif(trim(coalesce(p_observacao, '')), ''), observacao)
  where id = p_ficha;
end $$;

-- Supervisão devolve um descarte para a fila
create or replace function public.reabrir_ficha_rebolo(p_ficha uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f public.rebolo_fichas;
begin
  if not public.eh_supervisao_rebolo() then raise exception 'Só a supervisão reabre descartes' using errcode = '42501'; end if;
  f := public.rebolo_ficha_minha(p_ficha);
  if f.situacao <> 'Descarte' then raise exception 'Só fichas em descarte podem ser reabertas.'; end if;
  update public.rebolo_fichas set situacao = 'Aguardando contato', motivo_descarte = null where id = p_ficha;
  insert into public.rebolo_contatos (ficha_id, vendedora_id, resultado, observacao)
  values (p_ficha, auth.uid(), 'Reaberta', 'Descarte reaberto por ' || (select nome from public.colaboradores where id = auth.uid()));
end $$;

-- 8. Desconto fora da tabela → Gerência › Aprovações
do $$ begin
  alter table public.aprovacoes drop constraint if exists aprovacoes_ref_tabela_check;
  alter table public.aprovacoes add constraint aprovacoes_ref_tabela_check check (ref_tabela in ('acordos', 'contas_pagar', 'rebolo_fichas'));
end $$;

create or replace function public.pedir_desconto_rebolo(p_ficha uuid, p_valor numeric, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare f public.rebolo_fichas;
begin
  f := public.rebolo_ficha_minha(p_ficha);
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe o valor com desconto.'; end if;
  if f.desconto_status = 'Pendente' then raise exception 'Já existe um pedido de desconto aguardando a Gerência.'; end if;
  update public.rebolo_fichas set desconto_valor = p_valor, desconto_status = 'Pendente', desconto_motivo = nullif(trim(coalesce(p_motivo, '')), '') where id = p_ficha;
  perform public.pedir_aprovacao('Desconto rebolo', 'rebolo',
    format('Ficha %s (%s) por R$ %s%s', f.numero_ficha, f.aluno, replace(to_char(p_valor, 'FM9999999990.00'), '.', ','),
           case when coalesce(trim(p_motivo), '') <> '' then ' — ' || trim(p_motivo) else '' end),
    p_valor, 'rebolo_fichas', p_ficha);
end $$;

create or replace function public.fluxo_decisao() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_aprovado boolean;
begin
  if old.status = 'Pendente' and new.status in ('Aprovado', 'Rejeitado') then
    v_aprovado := new.status = 'Aprovado';
    new.decidido_por := auth.uid();
    new.decidido_em := now();
    if new.ref_tabela = 'acordos' then
      update public.acordos set status = case when v_aprovado then 'Ativo' else 'Rejeitado' end where id = new.ref_id;
    elsif new.ref_tabela = 'contas_pagar' then
      update public.contas_pagar set status = case when v_aprovado then 'A pagar' else 'Rejeitada' end where id = new.ref_id;
    elsif new.ref_tabela = 'rebolo_fichas' then
      perform set_config('dlg.rebolo_fluxo', '1', true);
      update public.rebolo_fichas set desconto_status = case when v_aprovado then 'Aprovado' else 'Rejeitado' end where id = new.ref_id;
    end if;
    perform public.lancar('gerencia', 'aprovacoes', case when public.meu_setor() = 'gerencia' then auth.uid() end, 1,
      new.tipo || case when v_aprovado then ' aprovado' else ' rejeitado' end, current_date);
    perform public.notificar(array[new.setor_origem, 'adm']::public.setor[], case when v_aprovado then 'sucesso' else 'alerta' end,
      new.tipo || case when v_aprovado then ' aprovado' else ' rejeitado' end, new.descricao,
      case new.ref_tabela when 'acordos' then '/cobranca/acordos' when 'rebolo_fichas' then '/rebolo/contatos' else '/financeiro/contas-pagar' end);
  elsif old.status <> 'Pendente' and new.status is distinct from old.status then
    raise exception 'Aprovação já decidida';
  end if;
  return new;
end $$;

-- 9. Venda do rebolo em vendas_ebooks (canal 'Rebolo')
alter table public.vendas_ebooks add column if not exists uf text;
alter table public.vendas_ebooks add column if not exists ficha_rebolo_id uuid references public.rebolo_fichas(id) on delete set null;
do $$ begin
  alter table public.vendas_ebooks drop constraint if exists vendas_ebooks_canal_check;
  alter table public.vendas_ebooks add constraint vendas_ebooks_canal_check check (canal in ('Interno', 'Externo', 'Rebolo'));
  alter table public.vendas_ebooks drop constraint if exists vendas_ebooks_conferencia_check;
  alter table public.vendas_ebooks add constraint vendas_ebooks_conferencia_check
    check (conferencia in ('Aguardando contrato', 'Aguardando conferência', 'Conferida', 'Devolvida', 'Cancelada'));
end $$;

drop policy if exists vendas_ebooks_rebolo_select on public.vendas_ebooks;
create policy vendas_ebooks_rebolo_select on public.vendas_ebooks for select to authenticated
  using (canal in ('Rebolo', 'Interno') and public.pode('rebolo', 'visualizar'));
drop policy if exists vendas_ebooks_rebolo_insert on public.vendas_ebooks;
create policy vendas_ebooks_rebolo_insert on public.vendas_ebooks for insert to authenticated
  with check (canal = 'Rebolo' and cobrador_id = auth.uid() and conferencia = 'Aguardando contrato' and public.pode('rebolo', 'criar'));

-- Títulos: igual ao 009; o que é recebido na hora (cartão/PIX) entra no faturamento para Interno e Rebolo
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
    if v.canal in ('Interno', 'Rebolo') then
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
    if v.canal in ('Interno', 'Rebolo') then
      perform public.lancar('cobranca', 'valor_recebido', v.cobrador_id, restante, 'Recebido na venda — ' || v.responsavel, v.data);
    end if;
  end if;
end $$;
revoke all on function public.gerar_titulos_venda(uuid) from public, anon, authenticated;

-- Venda aprovada conta na meta da vendedora do rebolo
create or replace function public.contar_venda_rebolo(v public.vendas_ebooks) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.lancar('rebolo', 'books_vendidos', v.cobrador_id, coalesce(v.quantidade, 1), coalesce(v.pacote, 'Book') || ' — ' || v.responsavel, v.data);
  if coalesce(v.valor, 0) > 0 then
    perform public.lancar('rebolo', 'valor_vendido', v.cobrador_id, v.valor, coalesce(v.pacote, 'Book') || ' — ' || v.responsavel, v.data);
  end if;
end $$;
revoke all on function public.contar_venda_rebolo(public.vendas_ebooks) from public, anon, authenticated;

-- Nova venda: interna (antiga) conta no Rebolo e gera títulos; externa espera a conferência;
-- rebolo liga a ficha ("Venda a efetivar") e espera o contrato assinado
create or replace function public.fluxo_venda_ebook() returns trigger
language plpgsql security definer set search_path = public as $$
declare f public.rebolo_fichas;
begin
  if new.canal = 'Rebolo' then
    select * into f from public.rebolo_fichas where id = new.ficha_rebolo_id for update;
    if not found or f.vendedora_id <> new.cobrador_id then raise exception 'Ficha do rebolo inválida para esta venda'; end if;
    if f.situacao not in ('Aguardando contato', 'Tentar de novo', 'Em negociação', 'Agendado') then
      raise exception 'Esta ficha não está disponível para venda (situação: %)', f.situacao;
    end if;
    perform set_config('dlg.rebolo_fluxo', '1', true);
    update public.rebolo_fichas set situacao = 'Venda a efetivar', venda_id = new.id, ultimo_contato = now() where id = f.id;
    insert into public.rebolo_contatos (ficha_id, vendedora_id, resultado, observacao)
    values (f.id, auth.uid(), 'Fechou venda', format('%s • %s • R$ %s', new.pacote, new.forma_pagamento, replace(to_char(new.valor, 'FM9999999990.00'), '.', ',')));
  elsif new.canal = 'Interno' then
    perform public.contar_venda_rebolo(new);
    perform public.gerar_titulos_venda(new.id);
    perform public.notificar(array['rebolo', 'financeiro', 'adm']::public.setor[], 'info', 'Venda interna de book',
      format('%s (%s) • %s • R$ %s', new.responsavel, new.escola, new.forma_pagamento, replace(to_char(new.valor, 'FM9999999990.00'), '.', ',')), '/financeiro/vendas-books');
  else
    perform public.notificar(array['financeiro', 'adm']::public.setor[], 'aprovacao', 'Venda externa para conferir',
      format('%s (%s) • R$ %s — confira contrato, assinatura, documento e promissória.', new.responsavel, new.escola, replace(to_char(new.valor, 'FM9999999990.00'), '.', ',')), '/financeiro/conferencia');
  end if;
  return new;
end $$;

-- A vendedora anexa o contrato assinado e envia ao Financeiro, ou cancela a venda
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
  elsif p_acao = 'enviar' then
    if coalesce(p_contrato, '') = '' or p_contrato not like 'rebolo/%' then raise exception 'Anexe o contrato assinado.'; end if;
    update public.vendas_ebooks set anexos = jsonb_build_object('contratoAssinado', p_contrato), conferencia = 'Aguardando conferência', conferencia_motivo = null where id = p_venda;
    perform public.notificar(array['financeiro', 'adm']::public.setor[], 'aprovacao', 'Venda do rebolo para conferir',
      format('%s • %s • R$ %s', v.responsavel, v.pacote, replace(to_char(v.valor, 'FM9999999990.00'), '.', ',')), '/financeiro/conferencia');
  else
    raise exception 'Ação inválida';
  end if;
end $$;

-- Conferência pelo Financeiro (009) + rebolo: aprovada conta na meta e libera o envio
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
      perform public.contar_venda_rebolo(v);
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

-- 10. Envio pelo Correio
create or replace function public.registrar_envio_rebolo(p_ficha uuid, p_rastreio text) returns void
language plpgsql security definer set search_path = public as $$
declare f public.rebolo_fichas;
begin
  f := public.rebolo_ficha_minha(p_ficha);
  if f.situacao <> 'Vendida' then raise exception 'Só vendas aprovadas podem ser enviadas.'; end if;
  if coalesce(trim(p_rastreio), '') = '' then raise exception 'Informe o código de rastreio.'; end if;
  update public.rebolo_fichas set rastreio = upper(trim(p_rastreio)), enviado_em = now() where id = p_ficha;
end $$;

-- Funções chamadas pelo app (as internas ficam fechadas)
do $$
declare fn text;
begin
  foreach fn in array array['registrar_contato_rebolo(uuid, text, text, text, timestamptz)', 'reabrir_ficha_rebolo(uuid)',
    'pedir_desconto_rebolo(uuid, numeric, text)', 'atualizar_venda_rebolo(uuid, text, text, text)', 'registrar_envio_rebolo(uuid, text)']
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- 11. Contrato assinado: contratos/rebolo/<usuário>/...
drop policy if exists contratos_rebolo_insert on storage.objects;
create policy contratos_rebolo_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'contratos'
  and (storage.foldername(name))[1] = 'rebolo'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.pode('rebolo', 'criar')
);
drop policy if exists contratos_rebolo_select on storage.objects;
create policy contratos_rebolo_select on storage.objects for select to authenticated using (
  bucket_id = 'contratos' and (storage.foldername(name))[1] = 'rebolo' and public.pode('rebolo', 'visualizar')
);

-- 12. "Meta diária batida" ignora quem está sem meta
create or replace function public.fluxo_meta_batida() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_meta numeric;
  v_total numeric;
  v_nome text;
  v_label text;
begin
  if new.colaborador_id is null or new.data <> current_date then return new; end if;
  if exists (select 1 from public.colaboradores where id = new.colaborador_id and sem_meta) then return new; end if;
  select coalesce(v.mensal, i.meta_mensal_padrao) / nullif(public.dias_uteis_mes(new.data), 0), i.label into v_meta, v_label
  from public.indicadores i left join lateral public.meta_vigente(new.colaborador_id, i.id, new.data) v on true
  where i.id = new.indicador_id;
  if coalesce(v_meta, 0) <= 0 then return new; end if;
  select sum(quantidade) into v_total from public.lancamentos
  where colaborador_id = new.colaborador_id and indicador_id = new.indicador_id and data = new.data;
  if v_total >= v_meta and v_total - new.quantidade < v_meta then
    select nome into v_nome from public.colaboradores where id = new.colaborador_id;
    perform public.notificar(array['adm', 'gerencia', new.setor]::public.setor[], 'sucesso', 'Meta diária batida 🎯',
      format('%s atingiu a meta diária de %s.', v_nome, lower(v_label)), case when new.setor = 'operacional' then '/operacional/metas' else '/' || new.setor::text end);
  end if;
  return new;
end $$;

-- Conferência: deve mostrar 1 | 3 | 2 | 5
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'colaboradores' and column_name = 'sem_meta') as coluna_sem_meta,
       (select count(*) from pg_tables where schemaname = 'public' and tablename in ('rebolo_pacotes', 'rebolo_fichas', 'rebolo_contatos')) as tabelas_rebolo,
       (select count(*) from public.indicadores where setor = 'rebolo') as indicadores_rebolo,
       (select count(*) from pg_proc where proname in ('registrar_contato_rebolo', 'reabrir_ficha_rebolo', 'pedir_desconto_rebolo', 'atualizar_venda_rebolo', 'registrar_envio_rebolo')) as funcoes_rebolo;
