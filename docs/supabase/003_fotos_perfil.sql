-- =====================================================================
-- 003 — FOTOS DE PERFIL DOS COLABORADORES
-- Rode no SQL Editor (pode rodar mais de uma vez sem problema).
--  • coluna colaboradores.foto_url
--  • bucket "avatares" (leitura pública da imagem, até 2 MB, só imagens)
--  • cada colaborador envia a PRÓPRIA foto; o ADM pode trocar a de qualquer um
--  • função definir_foto(): grava a URL no cadastro com checagem de permissão
-- =====================================================================

alter table public.colaboradores add column if not exists foto_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Arquivo de cada um: avatares/<id do colaborador>.jpg
drop policy if exists avatares_leitura on storage.objects;
drop policy if exists avatares_envio on storage.objects;
drop policy if exists avatares_troca on storage.objects;
drop policy if exists avatares_remocao on storage.objects;

create policy avatares_leitura on storage.objects for select to authenticated
  using (bucket_id = 'avatares');
create policy avatares_envio on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (name = auth.uid()::text || '.jpg' or public.pode('usuarios', 'editar')));
create policy avatares_troca on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and (name = auth.uid()::text || '.jpg' or public.pode('usuarios', 'editar')));
create policy avatares_remocao on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (name = auth.uid()::text || '.jpg' or public.pode('usuarios', 'editar')));

-- O colaborador comum não pode editar o próprio cadastro (setor, status...),
-- então a foto é gravada por esta função, que só mexe na coluna foto_url.
create or replace function public.definir_foto(p_colaborador uuid, p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_colaborador is distinct from auth.uid() and not public.pode('usuarios', 'editar') then
    raise exception 'Sem permissão para alterar a foto deste colaborador' using errcode = '42501';
  end if;
  if p_url is not null and p_url not like '%/storage/v1/object/public/avatares/%' then
    raise exception 'URL de foto inválida';
  end if;
  update public.colaboradores set foto_url = p_url where id = p_colaborador;
end $$;

revoke all on function public.definir_foto(uuid, text) from public, anon;
grant execute on function public.definir_foto(uuid, text) to authenticated;

-- Conferência: deve retornar 1 linha (avatares | true)
select id, public from storage.buckets where id = 'avatares';
