-- =====================================================================
-- 035 — SEGURANÇA CONTRA ACESSO DE FORA  (rodar DEPOIS do 034; pode rodar mais de uma vez)
--
--  Pedido de 06/10/2026: proteger o sistema de pessoas de fora (sem login ou com conta criada por estranho).
--  A chave pública do Supabase fica no navegador (é normal); o que ela alcança é decidido aqui:
--   1. A chave pública (papel "anon") perde TODO acesso a tabelas, sequências e funções do sistema.
--      O sistema só usa o banco depois do login, então nada muda nas telas. Única exceção: o registro
--      de "tentativa de login inválida" (feito antes do login).
--   2. Esse registro passa a ter o texto montado pelo banco (só o e-mail digitado) e limite de quantidade,
--      para ninguém encher a Auditoria: 5 por e-mail a cada 10 minutos, 30 por minuto e 300 por dia no total.
--   3. Conta que não é colaborador (ex.: criada por estranho) não lê a matriz de permissões nem os
--      indicadores, e não envia nem lista arquivos na pasta de fotos.
--   4. Funções e tabelas criadas nos próximos SQLs já nascem fechadas para a chave pública.
--  O acesso da equipe (papel "authenticated") e das funções internas (papel "service_role") fica IGUAL:
--  o próprio SQL confere e desfaz tudo se algum acesso da equipe mudar.
-- =====================================================================

-- 2. Registro de login inválido: texto montado aqui + limite (contra quem tenta encher a Auditoria)
create index if not exists auditoria_tipo_data_idx on public.auditoria (tipo, data desc);

create or replace function public.registrar_evento(p_tipo text, p_descricao text, p_setor public.setor default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_texto text;
begin
  if p_tipo not in ('LOGIN', 'LOGIN_FALHOU', 'LOGOUT', 'ACESSO', 'SENHA') then
    raise exception 'Tipo de evento inválido';
  end if;
  if auth.uid() is null then
    -- sem login: só a tentativa de login inválida; o texto de quem chamou é ignorado (só o e-mail é aproveitado)
    if p_tipo <> 'LOGIN_FALHOU' then raise exception 'Não autenticado'; end if;
    v_email := lower(left(substring(coalesce(p_descricao, '') from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'), 120));
    v_texto := 'Tentativa de login inválida' || coalesce(' para ' || v_email, '');
    if (select count(*) from public.auditoria where tipo = 'LOGIN_FALHOU' and usuario_id is null and data > now() - interval '1 minute') >= 30
       or (select count(*) from public.auditoria where tipo = 'LOGIN_FALHOU' and usuario_id is null and data > now() - interval '1 day') >= 300
       or (select count(*) from public.auditoria where tipo = 'LOGIN_FALHOU' and usuario_id is null and data > now() - interval '10 minutes' and descricao = v_texto) >= 5 then
      return; -- acima do limite: não grava
    end if;
    insert into public.auditoria (tipo, usuario_id, usuario_nome, setor, descricao, ip)
    values ('LOGIN_FALHOU', null, 'anônimo', null, v_texto, public.ip_requisicao());
    return;
  end if;
  insert into public.auditoria (tipo, usuario_id, usuario_nome, setor, descricao, ip)
  select p_tipo, auth.uid(), coalesce(c.nome, 'anônimo'), coalesce(p_setor, c.setor), left(p_descricao, 500), public.ip_requisicao()
  from (select 1) x left join public.colaboradores c on c.id = auth.uid();
end $$;

-- 1. A chave pública sem acesso às tabelas e sequências do sistema (as regras de linha continuam valendo para a equipe)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 1. ...nem às funções. O acesso da equipe e das funções internas é conferido antes e depois:
--    se mudar, o bloco inteiro é desfeito.
do $$
declare
  f record;
  v_auth boolean;
  v_svc boolean;
  v_mudou text := '';
begin
  for f in
    select p.oid, p.oid::regprocedure::text as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e') -- funções de extensões ficam como estão
  loop
    v_auth := has_function_privilege('authenticated', f.oid, 'execute');
    v_svc := has_function_privilege('service_role', f.oid, 'execute');
    execute format('revoke execute on routine %s from public, anon', f.assinatura);
    if v_auth and not has_function_privilege('authenticated', f.oid, 'execute') then
      execute format('grant execute on routine %s to authenticated', f.assinatura);
    end if;
    if v_svc and not has_function_privilege('service_role', f.oid, 'execute') then
      execute format('grant execute on routine %s to service_role', f.assinatura);
    end if;
    if has_function_privilege('authenticated', f.oid, 'execute') is distinct from v_auth
       or has_function_privilege('service_role', f.oid, 'execute') is distinct from v_svc then
      v_mudou := v_mudou || ' ' || f.assinatura;
    end if;
  end loop;
  if v_mudou <> '' then
    raise exception 'Nada foi alterado: o acesso da equipe mudaria em:%', v_mudou;
  end if;
end $$;

-- a única função que a chave pública usa: o registro de login inválido (antes do login)
revoke all on function public.registrar_evento(text, text, public.setor) from public;
grant execute on function public.registrar_evento(text, text, public.setor) to anon, authenticated;

-- 4. Próximos SQLs: tabelas, sequências e funções novas já nascem fechadas para a chave pública
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
do $$
begin
  -- o acesso "de todos" (public) às funções novas só é tirado se a equipe tiver o próprio acesso padrão (padrão do Supabase)
  if exists (
    select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
    where d.defaclrole = (select oid from pg_roles where rolname = current_user)
      and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'f'
      and a.grantee = (select oid from pg_roles where rolname = 'authenticated') and a.privilege_type = 'EXECUTE'
  ) then
    alter default privileges revoke execute on functions from public;
  else
    raise notice 'Funções novas: sem acesso padrão da equipe; cada SQL novo fecha as próprias funções (revoke from public, anon).';
  end if;
end $$;

-- 3. Conta que não é colaborador não lê a matriz de permissões nem os indicadores
drop policy if exists permissoes_select on public.permissoes;
create policy permissoes_select on public.permissoes for select to authenticated using ((select public.meu_perfil()) is not null);
drop policy if exists indicadores_select on public.indicadores;
create policy indicadores_select on public.indicadores for select to authenticated using ((select public.meu_perfil()) is not null);

-- 3. Pasta de fotos (avatares): enviar, trocar, apagar e listar só para colaborador ativo.
--    As fotos continuam aparecendo pelo endereço público, como hoje.
drop policy if exists avatares_leitura on storage.objects;
create policy avatares_leitura on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and (select public.meu_perfil()) is not null);
drop policy if exists avatares_envio on storage.objects;
create policy avatares_envio on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (select public.meu_perfil()) is not null
              and (name = (select auth.uid())::text || '.jpg' or (select public.pode('usuarios', 'editar'))));
drop policy if exists avatares_troca on storage.objects;
create policy avatares_troca on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and (select public.meu_perfil()) is not null
         and (name = (select auth.uid())::text || '.jpg' or (select public.pode('usuarios', 'editar'))));
drop policy if exists avatares_remocao on storage.objects;
create policy avatares_remocao on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (select public.meu_perfil()) is not null
         and (name = (select auth.uid())::text || '.jpg' or (select public.pode('usuarios', 'editar'))));

-- Conferência: deve mostrar 0 | registrar_evento | (contas que entram no sistema mas não são colaboradores)
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
       and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
            or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))) as tabelas_abertas_ao_publico,
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '(nenhuma)') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
       and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')) as funcoes_abertas_ao_publico,
  (select count(*) from auth.users u where not exists (select 1 from public.colaboradores c where c.id = u.id)) as contas_sem_cadastro,
  (select coalesce(string_agg(u.email, ', ' order by u.email), '(nenhuma)') from auth.users u
     where not exists (select 1 from public.colaboradores c where c.id = u.id)) as quais;
