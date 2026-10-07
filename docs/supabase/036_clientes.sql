-- =====================================================================
-- 036 — CADASTRO DE CLIENTES (Cobrança + Financeiro)  (rodar DEPOIS do 035; pode rodar mais de uma vez)
--
--  Parte 1 da estrutura que vai receber a migração do sistema antigo (pedido de 07/10/2026).
--   • Um cadastro único de clientes: nome, CPF/CNPJ (só números, sem repetir), telefones, e-mail, endereço,
--     origem (Conta Azul, Rebolo, vendedor externo, cadastro manual) e os códigos do sistema antigo e do
--     Conta Azul (para a migração não duplicar ninguém).
--   • "documento_ok" diz se o CPF/CNPJ é válido (dígitos conferidos); sem documento ou inválido = "a corrigir".
--   • "busca" junta nome, documento, telefones, cidade e e-mail sem acento, para a pesquisa no servidor.
--   • Só Cobrança e Financeiro (e ADM/Gerência) veem e mexem; fechado para quem é de fora.
--   • Fica FORA do tempo real e da carga geral: a tela busca 50 por vez no servidor.
-- =====================================================================

-- funções puras (só fazem conta; não leem dados)
create or replace function public.documento_valido(p_doc text) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  d text := regexp_replace(coalesce(p_doc, ''), '\D', '', 'g');
  s int;
  r int;
  i int;
  pesos int[];
begin
  if length(d) = 11 then
    if d ~ '^(\d)\1{10}$' then return false; end if;
    s := 0;
    for i in 1 .. 9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> substr(d, 10, 1)::int then return false; end if;
    s := 0;
    for i in 1 .. 10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    return r = substr(d, 11, 1)::int;
  elsif length(d) = 14 then
    if d ~ '^(\d)\1{13}$' then return false; end if;
    pesos := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    s := 0;
    for i in 1 .. 12 loop s := s + substr(d, i, 1)::int * pesos[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    if r <> substr(d, 13, 1)::int then return false; end if;
    pesos := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    s := 0;
    for i in 1 .. 13 loop s := s + substr(d, i, 1)::int * pesos[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    return r = substr(d, 14, 1)::int;
  end if;
  return false;
end $$;

create or replace function public.texto_busca(p text) returns text
language sql immutable set search_path = public as $$
  select lower(translate(coalesce(p, ''), 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ-', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN '))
$$;

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  documento text check (documento is null or documento ~ '^(\d{11}|\d{14})$'), -- CPF ou CNPJ, só números
  tipo_pessoa text not null default 'Física' check (tipo_pessoa in ('Física', 'Jurídica')),
  telefone1 text,
  telefone2 text,
  telefone3 text,
  whatsapp text,
  email text,
  cep text,
  rua text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  origem text not null default 'Cadastro manual',
  codigo_conta_azul text,
  codigo_sistema_antigo text,
  observacao text,
  documento_ok boolean generated always as (public.documento_valido(documento)) stored,
  busca text generated always as (
    public.texto_busca(nome) || ' ' || coalesce(documento, '') || ' '
    || regexp_replace(coalesce(telefone1, ''), '\D', '', 'g') || ' ' || regexp_replace(coalesce(telefone2, ''), '\D', '', 'g') || ' '
    || regexp_replace(coalesce(telefone3, ''), '\D', '', 'g') || ' ' || regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') || ' '
    || public.texto_busca(cidade) || ' ' || lower(coalesce(email, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists clientes_documento_key on public.clientes (documento) where documento is not null;
create unique index if not exists clientes_conta_azul_key on public.clientes (codigo_conta_azul) where codigo_conta_azul is not null;
create unique index if not exists clientes_sistema_antigo_key on public.clientes (codigo_sistema_antigo) where codigo_sistema_antigo is not null;
create index if not exists clientes_nome_idx on public.clientes (nome, id);
create index if not exists clientes_uf_cidade_idx on public.clientes (uf, cidade);

-- arruma o que foi digitado: nome em maiúsculas, documento só com números (e o tipo de pessoa pelo tamanho),
-- e-mail em minúsculas, UF em maiúsculas, campos vazios viram nulo
create or replace function public.clientes_antes() returns trigger
language plpgsql set search_path = public as $$
begin
  new.nome := upper(regexp_replace(trim(coalesce(new.nome, '')), '\s+', ' ', 'g'));
  new.documento := nullif(regexp_replace(coalesce(new.documento, ''), '\D', '', 'g'), '');
  if new.documento is not null then
    new.tipo_pessoa := case when length(new.documento) = 14 then 'Jurídica' else 'Física' end;
  end if;
  new.email := nullif(lower(trim(coalesce(new.email, ''))), '');
  new.uf := nullif(upper(trim(coalesce(new.uf, ''))), '');
  new.cidade := nullif(trim(coalesce(new.cidade, '')), '');
  new.telefone1 := nullif(trim(coalesce(new.telefone1, '')), '');
  new.telefone2 := nullif(trim(coalesce(new.telefone2, '')), '');
  new.telefone3 := nullif(trim(coalesce(new.telefone3, '')), '');
  new.whatsapp := nullif(trim(coalesce(new.whatsapp, '')), '');
  new.cep := nullif(trim(coalesce(new.cep, '')), '');
  new.rua := nullif(trim(coalesce(new.rua, '')), '');
  new.numero := nullif(trim(coalesce(new.numero, '')), '');
  new.complemento := nullif(trim(coalesce(new.complemento, '')), '');
  new.bairro := nullif(trim(coalesce(new.bairro, '')), '');
  new.observacao := nullif(trim(coalesce(new.observacao, '')), '');
  new.origem := coalesce(nullif(trim(coalesce(new.origem, '')), ''), 'Cadastro manual');
  return new;
end $$;
drop trigger if exists trg_clientes_antes on public.clientes;
create trigger trg_clientes_antes before insert or update on public.clientes for each row execute function public.clientes_antes();
drop trigger if exists trg_updated_at on public.clientes;
create trigger trg_updated_at before update on public.clientes for each row execute function public.tocar_updated_at();
drop trigger if exists trg_auditoria on public.clientes;
create trigger trg_auditoria after insert or update or delete on public.clientes for each row execute function public.fn_auditoria();

-- quem acessa: Cobrança e Financeiro (ADM e Gerência pela matriz de permissões). Regras avaliadas 1 vez por consulta.
alter table public.clientes enable row level security;
drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes for select to authenticated
  using ((select public.pode('cobranca', 'visualizar')) or (select public.pode('financeiro', 'visualizar')));
drop policy if exists clientes_insert on public.clientes;
create policy clientes_insert on public.clientes for insert to authenticated
  with check ((select public.pode('cobranca', 'criar')) or (select public.pode('financeiro', 'criar')));
drop policy if exists clientes_update on public.clientes;
create policy clientes_update on public.clientes for update to authenticated
  using ((select public.pode('cobranca', 'editar')) or (select public.pode('financeiro', 'editar')))
  with check ((select public.pode('cobranca', 'editar')) or (select public.pode('financeiro', 'editar')));
drop policy if exists clientes_delete on public.clientes;
create policy clientes_delete on public.clientes for delete to authenticated
  using ((select public.pode('cobranca', 'excluir')) or (select public.pode('financeiro', 'excluir')));

-- fechado para quem é de fora (mesmo que o 035 ainda não tenha rodado)
revoke all on public.clientes from anon;
revoke execute on function public.documento_valido(text) from public, anon;
revoke execute on function public.texto_busca(text) from public, anon;
revoke execute on function public.clientes_antes() from public, anon;
grant select, insert, update, delete on public.clientes to authenticated;
grant all on public.clientes to service_role;
grant execute on function public.documento_valido(text) to authenticated, service_role;
grant execute on function public.texto_busca(text) to authenticated, service_role;

-- Conferência: deve mostrar 0 (ou o total, se já houver clientes) | false | true
select (select count(*) from public.clientes) as clientes,
       has_table_privilege('anon', 'public.clientes', 'select') as aberto_para_quem_e_de_fora,
       (select relrowsecurity from pg_class where oid = 'public.clientes'::regclass) as regras_de_acesso_ligadas;
