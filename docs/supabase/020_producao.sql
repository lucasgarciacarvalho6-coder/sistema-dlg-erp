-- =====================================================================
-- 020 — PRODUÇÃO: CONTROLE DAS ESCOLAS ATÉ A REVELAÇÃO  (rodar DEPOIS do 019; pode rodar mais de uma vez)
--
--  • Cada visita encerrada nas Operações vira um LOTE na Produção (uma linha, como na planilha):
--      Aguardando fotos → Em edição (editor) → Análise de qualidade → Conferência final (ADM)
--      → Aguardando revelação → Revelando (a Revelação pegou o HD) → Na caixa (já revelado).
--  • 1 aluno = 1 álbum (dá para ajustar); pôster fica anotado à parte e não conta na meta.
--  • Editores (PJ) não usam o sistema: é só um cadastro para escolher a quem mandar as fotos.
--  • Meta de cada colaboradora da Produção: 1.000 álbuns no mês.
--  • Os lotes só mudam pelas funções do banco (a tela não edita direto).
-- =====================================================================

-- 1. Meta da Produção + nome novo da Revelação (a tela lê os nomes do sistema; aqui é para os avisos)
insert into public.indicadores (id, setor, label, unidade, meta_diaria_padrao, meta_mensal_padrao)
values ('albuns_entregues', 'edicao', 'Álbuns entregues', 'qtd', 0, 1000)
on conflict (id) do update set label = excluded.label, unidade = excluded.unidade;

update public.indicadores set label = 'Álbuns revelados' where id = 'books';

-- Gerente acompanha e opera o setor (como os demais)
insert into public.permissoes (perfil, modulo, acao)
select 'GERENTE'::public.perfil, 'edicao', a::public.acao
from unnest(array['visualizar', 'criar', 'editar', 'excluir', 'exportar']) a
where not exists (select 1 from public.permissoes p where p.perfil = 'GERENTE' and p.modulo = 'edicao' and p.acao = a::public.acao);

-- 2. Editores (cadastro simples; não entram no sistema)
create table if not exists public.editores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  observacao text,
  status text not null default 'Ativo' check (status in ('Ativo', 'Inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Lotes: uma escola fotografada (a base que vem das Operações) e em que etapa está
create table if not exists public.producao_lotes (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid unique references public.agenda_visitas(id) on delete set null, -- a mesma visita nunca entra duas vezes
  escola text not null,
  cidade text,
  uf text,
  data_foto date,
  vendedor_id uuid references public.pj_vendedores(id) on delete set null,
  vendedor text,
  retorno boolean not null default false, -- visita de retorno (fica em laranja, como na planilha)
  alunos int not null default 0 check (alunos >= 0),
  albuns int not null default 0 check (albuns >= 0), -- conta na meta (1 aluno = 1 álbum, ajustável)
  posteres int not null default 0 check (posteres >= 0), -- não conta na meta
  etapa text not null default 'Aguardando fotos'
    check (etapa in ('Aguardando fotos', 'Em edição', 'Análise de qualidade', 'Conferência final', 'Aguardando revelação', 'Revelando', 'Na caixa')),
  fotos_recebidas_em date,
  editor_id uuid references public.editores(id) on delete set null,
  enviado_editor_em date,
  devolvido_editor_em date,
  voltas int not null default 0, -- quantas vezes voltou ao editor
  reprovados int not null default 0, -- álbuns reprovados (total)
  aprovado_qualidade_em date,
  aprovado_qualidade_por uuid references public.colaboradores(id) on delete set null, -- os álbuns contam na meta dela
  confirmado_em date, -- conferência final: dia em que os álbuns entram na meta
  confirmado_por uuid references public.colaboradores(id) on delete set null,
  revelando_em date,
  na_caixa_em date,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists producao_lotes_etapa on public.producao_lotes (etapa);

create table if not exists public.producao_historico (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.producao_lotes(id) on delete cascade,
  data timestamptz not null default now(),
  etapa text not null,
  acao text not null,
  quantidade int,
  descricao text,
  autor text,
  created_at timestamptz not null default now()
);
create index if not exists producao_historico_lote on public.producao_historico (lote_id, data);

-- 4. Acesso (módulo "edicao"), auditoria, updated_at e realtime
do $$
declare t text;
begin
  foreach t in array array['editores', 'producao_lotes', 'producao_historico']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.pode(''edicao'', ''visualizar''))', t || '_select', t);

    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.fn_auditoria()', t);
    if t <> 'producao_historico' then
      execute format('drop trigger if exists trg_updated_at on public.%I', t);
      execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.tocar_updated_at()', t);
    end if;

    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
-- editores: a Produção cadastra e corrige; excluir só ADM/Gerência (o normal é deixar "Inativo")
create policy editores_insert on public.editores for insert to authenticated with check (public.pode('edicao', 'criar'));
create policy editores_update on public.editores for update to authenticated using (public.pode('edicao', 'editar')) with check (public.pode('edicao', 'editar'));
create policy editores_delete on public.editores for delete to authenticated using (public.pode('edicao', 'excluir'));
-- producao_lotes e producao_historico: só leitura; mudam pelas funções abaixo

-- 5. Lote novo a partir de uma visita encerrada (uso interno das funções)
create or replace function public.producao_criar_lote(v public.agenda_visitas, p_origem text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  novo uuid;
  v_alunos int := coalesce(v.fichas_fotografadas, 0);
begin
  insert into public.producao_lotes (visita_id, escola, cidade, uf, data_foto, vendedor_id, vendedor, retorno, alunos, albuns)
  values (v.id, v.escola, v.cidade, v.uf, v.data, v.vendedor_id, (select nome from public.pj_vendedores where id = v.vendedor_id),
          v.retorno_de is not null, v_alunos, v_alunos)
  on conflict (visita_id) do nothing
  returning id into novo;
  if novo is null then return null; end if; -- já estava na Produção

  insert into public.producao_historico (lote_id, etapa, acao, quantidade, descricao, autor)
  values (novo, 'Aguardando fotos', p_origem, v_alunos,
          format('%s alunos fotografados em %s%s.', v_alunos, to_char(v.data, 'DD/MM/YYYY'), case when v.retorno_de is not null then ' (retorno)' else '' end),
          (select nome from public.colaboradores where id = auth.uid()));
  return novo;
end $$;
revoke all on function public.producao_criar_lote(public.agenda_visitas, text) from public, anon, authenticated;

-- 6. Visita encerrada nas Operações → a escola chega na Produção (aguardando as fotos)
create or replace function public.fluxo_visita_producao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Fotografada' and old.status = 'Agendada' then
    if public.producao_criar_lote(new, 'Chegou das Operações') is not null then
      perform public.notificar(array['edicao']::public.setor[], 'info', 'Escola chegou na Produção',
        format('%s: %s alunos fotografados. Aguardando as fotos.', new.escola, new.fichas_fotografadas), '/edicao');
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_fluxo_visita_producao on public.agenda_visitas;
create trigger trg_fluxo_visita_producao after update of status on public.agenda_visitas
  for each row execute function public.fluxo_visita_producao();

-- 7. Escolas encerradas antes do controle existir: traz só as escolhidas (as que ainda estão em andamento)
create or replace function public.producao_trazer_visitas(p_visitas uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v public.agenda_visitas;
  n int := 0;
begin
  if not public.pode('edicao', 'editar') then
    raise exception 'Sem permissão para trazer escolas para a Produção' using errcode = '42501';
  end if;
  for v in select * from public.agenda_visitas where id = any(p_visitas) and status in ('Fotografada', 'Fechamento enviado') order by data
  loop
    if public.producao_criar_lote(v, 'Trazida para a Produção') is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.producao_trazer_visitas(uuid[]) from public, anon;
grant execute on function public.producao_trazer_visitas(uuid[]) to authenticated;

-- Conferência: deve mostrar 3 | 1 | 2
select (select count(*) from pg_tables where schemaname = 'public' and tablename in ('editores', 'producao_lotes', 'producao_historico')) as tabelas_producao,
       (select count(*) from public.indicadores where id = 'albuns_entregues' and setor = 'edicao') as meta_albuns,
       (select count(*) from pg_proc where proname in ('fluxo_visita_producao', 'producao_trazer_visitas')) as funcoes_producao;
