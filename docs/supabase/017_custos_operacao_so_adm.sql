-- =====================================================================
-- 017 — CUSTOS DA OPERAÇÃO: SOMENTE O ADM ALTERA  (pode rodar mais de uma vez)
--
-- Regra do dono: custo total = operações × fixo (R$ 2.500 por carro/dia) + fichas × variável
-- (R$ 60 por ficha: repasse da escola + comissão do vendedor). Esses valores ficam travados:
--   • veiculos.gasto_fixo_mes ............ fixo de cada carro, por mês
--   • empresas.parametros ops_variavel_* .. variável por ficha, por mês
-- Quem não é ADM continua cadastrando e editando os carros e os outros parâmetros normalmente;
-- só não consegue mudar esses dois valores.
-- =====================================================================

-- fixo dos carros
create or replace function public.travar_gasto_fixo_carro() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or public.meu_perfil() = 'ADM' then
    return new;
  end if;
  if tg_op = 'INSERT' and coalesce(new.gasto_fixo_mes, '{}'::jsonb) <> '{}'::jsonb then
    raise exception 'Somente o ADM define o custo fixo dos carros' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.gasto_fixo_mes is distinct from old.gasto_fixo_mes then
    raise exception 'Somente o ADM altera o custo fixo dos carros' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_travar_gasto_fixo_carro on public.veiculos;
create trigger trg_travar_gasto_fixo_carro before insert or update on public.veiculos
  for each row execute function public.travar_gasto_fixo_carro();

-- variável por ficha (só as chaves ops_variavel_*; os outros parâmetros seguem como antes)
create or replace function public.travar_custo_variavel() returns trigger
language plpgsql as $$
declare
  antes jsonb;
  depois jsonb;
begin
  if auth.uid() is null or public.meu_perfil() = 'ADM' then
    return new;
  end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into antes
    from jsonb_each(coalesce(old.parametros, '{}'::jsonb)) where starts_with(key, 'ops_variavel_');
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into depois
    from jsonb_each(coalesce(new.parametros, '{}'::jsonb)) where starts_with(key, 'ops_variavel_');
  if antes is distinct from depois then
    raise exception 'Somente o ADM altera o custo variável por ficha' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_travar_custo_variavel on public.empresas;
create trigger trg_travar_custo_variavel before update of parametros on public.empresas
  for each row execute function public.travar_custo_variavel();

-- Conferência: deve mostrar 1 | 1
select (select count(*) from pg_trigger where tgname = 'trg_travar_gasto_fixo_carro') as trava_fixo,
       (select count(*) from pg_trigger where tgname = 'trg_travar_custo_variavel') as trava_variavel;
