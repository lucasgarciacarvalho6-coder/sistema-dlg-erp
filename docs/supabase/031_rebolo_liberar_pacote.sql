-- =====================================================================
-- 031 — REBOLO: PRÓXIMO PACOTE E REABRIR DESCARTE  (rodar DEPOIS do 030; pode rodar mais de uma vez)
--
--  1. QUANDO A VENDEDORA PODE ABRIR O PRÓXIMO PACOTE
--  Antes: só abria outro com TODAS as fichas vendidas, em descarte ou canceladas.
--  Agora (pedido de 06/10/2026): libera o próximo quando o pacote atual está
--    • COMPLETO (Padrão = 10 fichas, Avulso = 1) e
--    • TODO CONTATADO (nenhuma ficha em "Aguardando contato").
--  As negociações, agendamentos e vendas a efetivar continuam andando no pacote antigo.
--  Pacote antigo com menos fichas, mas com todas já terminadas (vendida/descarte/cancelada), também libera.
--  Pacote vazio continua prendendo (é preciso cadastrar as fichas dele).
--
--  2. REABRIR DESCARTE (o cliente mudou de ideia): agora a DONA da ficha também reabre (antes, só a supervisão),
--     escolhendo para onde volta — "Em negociação" ou "Tentar de novo" (não volta para "Aguardando contato",
--     que prenderia o pacote) — com uma observação no histórico.
-- =====================================================================

create or replace function public.rebolo_pacote_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_aberto int;
  v_fichas int;
  v_aguardando int;
  v_capacidade int;
begin
  select p.numero,
         (select count(*) from public.rebolo_fichas f where f.pacote_id = p.id),
         (select count(*) from public.rebolo_fichas f where f.pacote_id = p.id and f.situacao = 'Aguardando contato'),
         case when p.tipo = 'Avulso' then 1 else 10 end
    into v_aberto, v_fichas, v_aguardando, v_capacidade
  from public.rebolo_pacotes p
  where p.vendedora_id = new.vendedora_id
    -- prende: não está completo e todo contatado...
    and not ((select count(*) from public.rebolo_fichas f where f.pacote_id = p.id) >= case when p.tipo = 'Avulso' then 1 else 10 end
             and not exists (select 1 from public.rebolo_fichas f where f.pacote_id = p.id and f.situacao = 'Aguardando contato'))
    -- ...e nem tem todas as fichas terminadas
    and not (exists (select 1 from public.rebolo_fichas f where f.pacote_id = p.id)
             and not exists (select 1 from public.rebolo_fichas f where f.pacote_id = p.id and f.situacao not in ('Vendida', 'Descarte', 'Cancelada')))
  order by p.numero
  limit 1;
  if v_aberto is not null then
    if v_fichas < v_capacidade then
      raise exception 'Para abrir outro pacote, cadastre as % fichas do P% (tem %).', v_capacidade, v_aberto, v_fichas;
    end if;
    raise exception 'Para abrir outro pacote, contate todas as fichas do P%: % ainda em "Aguardando contato".', v_aberto, v_aguardando;
  end if;
  return new;
end $$;
drop trigger if exists trg_rebolo_pacote_antes on public.rebolo_pacotes;
create trigger trg_rebolo_pacote_antes before insert on public.rebolo_pacotes for each row execute function public.rebolo_pacote_antes();

-- 2. Reabrir descarte: a dona ou a supervisão; volta para "Em negociação" ou "Tentar de novo"
drop function if exists public.reabrir_ficha_rebolo(uuid);
create or replace function public.reabrir_ficha_rebolo(p_ficha uuid, p_situacao text default 'Em negociação', p_observacao text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  f public.rebolo_fichas;
  v_obs text := nullif(trim(coalesce(p_observacao, '')), '');
begin
  f := public.rebolo_ficha_minha(p_ficha); -- só a dona da ficha ou a supervisão
  if f.situacao <> 'Descarte' then raise exception 'Só fichas em descarte podem ser reabertas.'; end if;
  if coalesce(p_situacao, '') not in ('Em negociação', 'Tentar de novo') then raise exception 'Escolha para onde a ficha volta: Em negociação ou Tentar de novo.'; end if;
  update public.rebolo_fichas set situacao = p_situacao, motivo_descarte = null, ultimo_contato = now() where id = p_ficha;
  insert into public.rebolo_contatos (ficha_id, vendedora_id, resultado, observacao)
  values (p_ficha, auth.uid(), 'Reaberta', concat_ws(' • ', format('Descarte (%s) reaberto → %s', coalesce(f.motivo_descarte, 'sem motivo'), p_situacao), v_obs));
end $$;
revoke all on function public.reabrir_ficha_rebolo(uuid, text, text) from public, anon;
grant execute on function public.reabrir_ficha_rebolo(uuid, text, text) to authenticated;

-- Conferência: deve mostrar 1 | 1
select (select count(*) from pg_proc where proname = 'rebolo_pacote_antes' and prosrc like '%Aguardando contato%') as regra_nova,
       (select count(*) from pg_proc where proname = 'reabrir_ficha_rebolo' and pronargs = 3) as reabrir_descarte;
