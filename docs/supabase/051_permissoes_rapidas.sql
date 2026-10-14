-- 051 — Lentidão (14/10): as regras de permissão passam a ser conferidas UMA vez por consulta, não linha por linha.
-- O diagnóstico mostrou tabelas pequenas lentas (ex.: fichas do Rebolo, 857 linhas, 766 ms) e a auditoria (1,4 s):
-- nas regras, pode(...), meu_perfil(), meu_setor(), meu_vendedor_externo(), eh_supervisao_rebolo() e auth.uid() eram
-- chamadas para CADA linha. Aqui cada chamada vira "(select ...)", que o banco calcula uma vez e reaproveita.
-- AS PERMISSÕES NÃO MUDAM: é a mesma regra, escrita do jeito que o Postgres otimiza (recomendação do próprio Supabase).
-- Só mexe nas regras que ainda não estão assim. Rodar inteiro no SQL Editor.
-- Conferência esperada (última linha): faltam = 0.

begin;

do $$
declare
  p record;
  v_qual text;
  v_check text;
  -- as funções das regras que não dependem da linha
  v_re text := '(?<!SELECT )((public\.)?(pode\([^()]*\)|meu_perfil\(\)|meu_setor\(\)|meu_vendedor_externo\(\)|eh_supervisao_rebolo\(\))|auth\.uid\(\))';
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    v_qual := case when p.qual is not null then regexp_replace(p.qual, v_re, '(SELECT \1)', 'g') end;
    v_check := case when p.with_check is not null then regexp_replace(p.with_check, v_re, '(SELECT \1)', 'g') end;
    if v_qual is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, v_qual);
    end if;
    if v_check is distinct from p.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, v_check);
    end if;
  end loop;
end $$;

commit;

-- Conferência: regras que ainda chamam alguma dessas funções linha por linha
-- (as 3 de lançamentos usam pode(setor da linha, ...): dependem da linha e ficam como estão — não entram na conta)
select count(*) as faltam
  from pg_policies
 where schemaname = 'public'
   and (coalesce(qual, '') ~ '(?<!SELECT )((public\.)?(pode\(''|meu_perfil\(|meu_setor\(|meu_vendedor_externo\(|eh_supervisao_rebolo\()|auth\.uid\()'
     or coalesce(with_check, '') ~ '(?<!SELECT )((public\.)?(pode\(''|meu_perfil\(|meu_setor\(|meu_vendedor_externo\(|eh_supervisao_rebolo\()|auth\.uid\()');
