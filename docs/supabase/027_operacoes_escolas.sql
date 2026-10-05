-- =====================================================================
-- 027 — OPERAÇÕES: ESCOLAS  (rodar DEPOIS do 026; pode rodar mais de uma vez)
--
--  • Aba "Escolas" nas Operações: todas as escolas que já estão no sistema, com o histórico de cada uma.
--    Quase todo ano a empresa volta na mesma escola: o contrato novo já sai preenchido.
--  • As Operações passam a cadastrar e editar escolas (o cadastro é o mesmo dos Cadastros Centrais).
--  • O cadastro ganha endereço e observação.
--  • As escolas que já estão nos contratos e na agenda entram no cadastro agora, e todo contrato novo
--    (pelo sistema ou pelo app do vendedor) cadastra a escola sozinho.
--  • A escola é reconhecida pelo INEP ou por nome + cidade + UF (sem acento e sem diferença de maiúsculas).
--  • O PIX continua só no contrato (o cadastro de escolas é visto por todos os setores).
-- =====================================================================

alter table public.escolas add column if not exists endereco text;
alter table public.escolas add column if not exists observacao text;

-- chave da escola: nome + cidade + UF, minúsculas e sem acento
create or replace function public.chave_escola(p_nome text, p_cidade text, p_uf text) returns text
language sql immutable as $$
  select translate(lower(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
    || '|' || translate(lower(regexp_replace(trim(coalesce(p_cidade, '')), '\s+', ' ', 'g')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
    || '|' || upper(trim(coalesce(p_uf, '')))
$$;

-- registra a escola se ainda não existir (pelo INEP ou pela chave) e completa o que estiver vazio; devolve o id
create or replace function public.registrar_escola(p_nome text, p_cidade text, p_uf text, p_inep text default null,
                                                    p_endereco text default null, p_telefone text default null, p_responsavel text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_inep text := nullif(regexp_replace(coalesce(p_inep, ''), '\D', '', 'g'), '');
begin
  if coalesce(trim(p_nome), '') = '' then return null; end if;
  if v_inep is not null then
    select e.id into v_id from public.escolas e where regexp_replace(coalesce(e.inep, ''), '\D', '', 'g') = v_inep limit 1;
  end if;
  if v_id is null then
    select e.id into v_id from public.escolas e where public.chave_escola(e.nome, e.cidade, e.uf) = public.chave_escola(p_nome, p_cidade, p_uf) limit 1;
  end if;
  if v_id is null then
    insert into public.escolas (nome, cidade, uf, inep, endereco, telefone, responsavel, status)
    values (trim(p_nome), coalesce(trim(p_cidade), ''), coalesce(nullif(upper(trim(p_uf)), ''), 'PR'), v_inep,
            nullif(trim(p_endereco), ''), nullif(trim(p_telefone), ''), nullif(trim(p_responsavel), ''), 'Ativa')
    returning id into v_id;
  else
    update public.escolas e set
      endereco = coalesce(nullif(e.endereco, ''), nullif(trim(p_endereco), '')),
      telefone = coalesce(nullif(e.telefone, ''), nullif(trim(p_telefone), '')),
      responsavel = coalesce(nullif(e.responsavel, ''), nullif(trim(p_responsavel), '')),
      inep = coalesce(nullif(e.inep, ''), v_inep)
    where e.id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.registrar_escola(text, text, text, text, text, text, text) from public, anon, authenticated;

-- contrato novo (sistema ou app do vendedor) → a escola entra no cadastro
create or replace function public.fluxo_contrato_registra_escola() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.registrar_escola(new.escola, new.cidade, new.uf, new.inep, new.endereco, new.telefone, new.responsavel);
  return new;
end $$;
drop trigger if exists trg_contrato_registra_escola on public.contratos_escola;
create trigger trg_contrato_registra_escola after insert on public.contratos_escola for each row execute function public.fluxo_contrato_registra_escola();

-- as Operações cadastram e editam escolas (o ADM e a Gerência continuam pelos Cadastros Centrais)
drop policy if exists escolas_operacional_insert on public.escolas;
create policy escolas_operacional_insert on public.escolas for insert to authenticated with check (public.pode('operacional', 'criar'));
drop policy if exists escolas_operacional_update on public.escolas;
create policy escolas_operacional_update on public.escolas for update to authenticated
  using (public.pode('operacional', 'editar')) with check (public.pode('operacional', 'editar'));

-- carga: as escolas que já estão nos contratos (o mais novo de cada escola) e nas visitas sem contrato
select count(public.registrar_escola(c.escola, c.cidade, c.uf, c.inep, c.endereco, c.telefone, c.responsavel))
from (select distinct on (public.chave_escola(escola, cidade, uf)) * from public.contratos_escola
      order by public.chave_escola(escola, cidade, uf), created_at desc) c;
select count(public.registrar_escola(v.escola, v.cidade, v.uf, null, v.endereco, v.telefone, v.responsavel))
from (select distinct on (public.chave_escola(escola, cidade, uf)) * from public.agenda_visitas where contrato_id is null and status <> 'Cancelada'
      order by public.chave_escola(escola, cidade, uf), data desc) v;

-- Conferência: escolas no cadastro | contratos cuja escola está no cadastro / total de contratos
select (select count(*) from public.escolas) as escolas_no_cadastro,
       (select count(*) from public.contratos_escola c where exists (
          select 1 from public.escolas e
          where public.chave_escola(e.nome, e.cidade, e.uf) = public.chave_escola(c.escola, c.cidade, c.uf)
             or (nullif(e.inep, '') is not null and regexp_replace(e.inep, '\D', '', 'g') = regexp_replace(coalesce(c.inep, ''), '\D', '', 'g')))) || ' / ' ||
       (select count(*) from public.contratos_escola) as contratos_com_escola;
