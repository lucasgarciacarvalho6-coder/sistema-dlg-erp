-- =====================================================================
-- 024 — ESTOQUE: UMA COR PARA CADA CIDADE NO COMPROVANTE  (rodar DEPOIS do 023; pode rodar mais de uma vez)
--
--  • Na 1ª caixa de uma cidade, o sistema dá uma cor para ela (lista de 16 cores bem diferentes,
--    sem repetir enquanto houver cor livre). Todas as caixas daquela cidade saem sempre nessa cor,
--    para achar no estoque físico.
--  • A Produção (ou o ADM) pode trocar a cor de uma cidade no Estoque.
--  • As cidades que já têm caixas ganham cor agora (na ordem da 1ª caixa).
-- =====================================================================

create table if not exists public.producao_cores_cidade (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique, -- cidade (minúsculas) | UF (maiúsculas)
  cidade text,
  uf text,
  cor text not null check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text := 'producao_cores_cidade';
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', t || '_select', t);
  execute format('drop policy if exists %I on public.%I', t || '_update', t);
  execute format('drop trigger if exists trg_auditoria on public.%I', t);
  execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.fn_auditoria()', t);
  execute format('drop trigger if exists trg_updated_at on public.%I', t);
  execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.tocar_updated_at()', t);
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
    execute format('alter publication supabase_realtime add table public.%I', t);
  end if;
end $$;
-- a Produção e a Revelação veem; só a Produção (e o ADM/Gerência) troca a cor; quem cria é a função abaixo
create policy producao_cores_cidade_select on public.producao_cores_cidade for select to authenticated
  using (public.pode('edicao', 'visualizar') or public.pode('producao', 'visualizar'));
create policy producao_cores_cidade_update on public.producao_cores_cidade for update to authenticated
  using (public.pode('edicao', 'editar')) with check (public.pode('edicao', 'editar'));

-- As 16 cores (mesma ordem da tela: vinho, azul, verde, laranja, roxo, vermelho, azul-petróleo, marrom,
-- rosa, azul-marinho, verde-oliva, turquesa, púrpura, cinza-escuro, terracota, preto)
create or replace function public.producao_paleta() returns text[]
language sql immutable as $$
  select array['#7E2F5B', '#1D4ED8', '#15803D', '#C2410C', '#6D28D9', '#B91C1C', '#0F766E', '#78350F',
               '#BE185D', '#1E3A8A', '#4D7C0F', '#0E7490', '#86198F', '#374151', '#9A3412', '#111111']
$$;

-- Cor da cidade: a que já tem; senão a próxima livre (com todas usadas, a menos usada)
create or replace function public.producao_cor_da_cidade(p_cidade text, p_uf text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_chave text := lower(trim(coalesce(p_cidade, ''))) || '|' || upper(trim(coalesce(p_uf, '')));
  v_cor text;
begin
  select cor into v_cor from public.producao_cores_cidade where chave = v_chave;
  if v_cor is not null then return v_cor; end if;
  select p.cor into v_cor
  from unnest(public.producao_paleta()) with ordinality as p(cor, ordem)
  left join public.producao_cores_cidade c on upper(c.cor) = upper(p.cor)
  group by p.cor, p.ordem
  order by count(c.id), p.ordem
  limit 1;
  insert into public.producao_cores_cidade (chave, cidade, uf, cor)
  values (v_chave, trim(coalesce(p_cidade, '')), upper(trim(coalesce(p_uf, ''))), v_cor)
  on conflict (chave) do nothing;
  select cor into v_cor from public.producao_cores_cidade where chave = v_chave;
  return v_cor;
end $$;
revoke all on function public.producao_cor_da_cidade(text, text) from public, anon, authenticated;

-- A Revelação solta uma caixa: igual ao 023 e agora já garante a cor da cidade
create or replace function public.producao_registrar_caixa(p_lote uuid, p_albuns int, p_posteres int default 0,
                                                           p_observacao text default null, p_data date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.producao_lotes;
  v_eu public.colaboradores;
  v_data date := coalesce(p_data, current_date);
  v_num int;
  v_lanc uuid;
  v_caixa uuid;
  v_total int;
  v_autor text;
begin
  if not public.pode('producao', 'criar') then
    raise exception 'Sem permissão para registrar caixas' using errcode = '42501';
  end if;
  select * into v_eu from public.colaboradores where id = auth.uid();
  v_autor := v_eu.nome;
  select * into l from public.producao_lotes where id = p_lote for update;
  if not found then raise exception 'Escola não encontrada'; end if;
  if l.etapa not in ('Aguardando revelação', 'Revelando', 'Na caixa') then
    raise exception 'Esta escola ainda não foi liberada para a Revelação (está em "%")', l.etapa;
  end if;
  if coalesce(p_albuns, 0) <= 0 then raise exception 'Informe quantos álbuns tem na caixa'; end if;
  if coalesce(p_posteres, 0) < 0 then raise exception 'Pôster/brindes não pode ser negativo'; end if;
  if v_data > current_date then raise exception 'A data não pode ser depois de hoje'; end if;

  perform public.producao_cor_da_cidade(l.cidade, l.uf); -- cor do comprovante (1ª caixa da cidade ganha a cor)
  select coalesce(max(numero), 0) + 1 into v_num from public.producao_caixas where lote_id = l.id;
  -- álbuns revelados: meta de quem soltou a caixa (se for da Revelação)
  insert into public.lancamentos (setor, indicador_id, colaborador_id, quantidade, descricao, data, origem)
  values ('producao', 'books', case when v_eu.setor = 'producao' then v_eu.id end, p_albuns, format('Caixa %s — %s', v_num, l.escola), v_data, 'automatico')
  returning id into v_lanc;
  insert into public.producao_caixas (lote_id, numero, data, albuns, posteres, observacao, registrado_por, lancamento_id)
  values (l.id, v_num, v_data, p_albuns, coalesce(p_posteres, 0), nullif(trim(coalesce(p_observacao, '')), ''), v_eu.id, v_lanc)
  returning id into v_caixa;

  insert into public.producao_historico (lote_id, etapa, acao, quantidade, descricao, autor)
  values (l.id, l.etapa, 'Caixa da Revelação', p_albuns,
          format('Caixa %s: %s álbuns%s. Aguardando a conferência da Produção.', v_num, p_albuns, case when coalesce(p_posteres, 0) > 0 then format(' + %s pôster/brindes', p_posteres) else '' end), v_autor);

  -- 1ª caixa: a escola está sendo revelada
  if l.etapa = 'Aguardando revelação' then
    update public.producao_lotes set etapa = 'Revelando', revelando_em = coalesce(revelando_em, v_data) where id = l.id;
    insert into public.producao_historico (lote_id, etapa, acao, descricao, autor)
    values (l.id, 'Revelando', 'Revelando', 'A Revelação começou a soltar as caixas.', v_autor);
    l.etapa := 'Revelando';
  end if;
  -- as caixas somam todos os álbuns: revelado
  select coalesce(sum(albuns), 0) into v_total from public.producao_caixas where lote_id = l.id;
  if l.etapa = 'Revelando' and v_total >= l.albuns then
    update public.producao_lotes set etapa = 'Na caixa', na_caixa_em = current_date where id = l.id;
    insert into public.producao_historico (lote_id, etapa, acao, descricao, autor)
    values (l.id, 'Na caixa', 'Na caixa', format('Todos os álbuns revelados: %s em %s caixa(s).', v_total, v_num), v_autor);
  end if;

  perform public.notificar(array['edicao']::public.setor[], 'info', 'Caixa para conferir',
    format('%s: caixa %s com %s álbuns. Confira no Estoque.', l.escola, v_num, p_albuns), '/edicao/estoque');
  return v_caixa;
end $$;
revoke all on function public.producao_registrar_caixa(uuid, int, int, text, date) from public, anon;
grant execute on function public.producao_registrar_caixa(uuid, int, int, text, date) to authenticated;

-- As cidades que já têm caixas ganham cor agora (na ordem da 1ª caixa de cada uma)
do $$
declare r record;
begin
  for r in
    select l.cidade, l.uf, min(c.created_at) as primeira
    from public.producao_caixas c join public.producao_lotes l on l.id = c.lote_id
    group by l.cidade, l.uf
    order by primeira
  loop
    perform public.producao_cor_da_cidade(r.cidade, r.uf);
  end loop;
end $$;

-- Conferência: tabela criada | cidades com cor (as que já têm caixas)
select (select count(*) from pg_tables where schemaname = 'public' and tablename = 'producao_cores_cidade') as tabela,
       (select count(*) from public.producao_cores_cidade) as cidades_com_cor;
