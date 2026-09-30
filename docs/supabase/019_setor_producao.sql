-- =====================================================================
-- 019 — NOVO SETOR "PRODUÇÃO"  (pode rodar mais de uma vez)
--
-- A antiga Produção (app dos álbuns revelados) agora se chama REVELAÇÃO na tela;
-- por dentro continua 'producao' e nada muda nela.
-- O setor novo PRODUÇÃO (fotos das escolas → editor → análise de qualidade → Revelação)
-- usa o nome 'edicao' por dentro.
--
-- Só cria o setor. Fica num arquivo separado porque o Postgres só deixa USAR
-- um valor novo de enum depois que ele foi salvo. Rode este, depois o 020.
-- =====================================================================

alter type public.setor add value if not exists 'edicao';

-- Conferência: deve mostrar 1
select count(*) as setor_producao from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'setor' and e.enumlabel = 'edicao';
