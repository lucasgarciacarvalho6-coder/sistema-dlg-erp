-- =====================================================================
-- 026 — GERENTE VIRTUAL: ÚLTIMA ATIVIDADE DE CADA PESSOA  (rodar DEPOIS do 025; pode rodar mais de uma vez)
--
--  • A Visão TV do ADM avisa quando um setor ficou PARADO (ninguém do setor registrou nada no último dia útil
--    nem hoje) e quem está há dias sem registrar.
--  • A tela carrega só as últimas 1.000 linhas da auditoria; esta função olha a auditoria dos últimos 60 dias
--    e devolve, para cada pessoa, o dia e a hora da última coisa que ela registrou (criar, editar ou excluir).
--    Entrar no sistema (login) não conta: o que conta é registrar informação.
--  • Só lê. Só quem pode ver os usuários (ADM e quem tiver essa permissão) recebe a lista; os outros recebem vazio.
-- =====================================================================

create index if not exists auditoria_usuario_data on public.auditoria (usuario_id, data desc);

create or replace function public.gerente_ultima_atividade() returns table (colaborador_id uuid, ultima timestamptz)
language sql stable security definer set search_path = public as $$
  select a.usuario_id, max(a.data)
  from public.auditoria a
  where public.pode('usuarios', 'visualizar')
    and a.usuario_id is not null
    and a.tipo in ('CRIAR', 'EDITAR', 'EXCLUIR')
    and a.data >= now() - interval '60 days'
  group by a.usuario_id
$$;
revoke all on function public.gerente_ultima_atividade() from public, anon;
grant execute on function public.gerente_ultima_atividade() to authenticated;

-- Conferência: função criada (1) | pessoas com alguma atividade nos últimos 60 dias
select (select count(*) from pg_proc where proname = 'gerente_ultima_atividade') as funcao,
       (select count(distinct usuario_id) from public.auditoria
         where usuario_id is not null and tipo in ('CRIAR', 'EDITAR', 'EXCLUIR') and data >= now() - interval '60 days') as pessoas_com_atividade;
