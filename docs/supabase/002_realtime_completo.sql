-- =====================================================================
-- 002 — Realtime em todas as tabelas do ERP
-- Rode SOMENTE se você executou o schema.sql antes desta atualização
-- (quem rodar o schema.sql atual já recebe isto).
-- Faz o front-end atualizar sozinho quando QUALQUER setor alterar dados
-- (contas, comissões, acordos, estoque, cadastros, metas, permissões...).
-- =====================================================================
alter publication supabase_realtime add table
  public.leads, public.acordos, public.contas_pagar, public.comissoes, public.qualidade,
  public.escolas, public.produtos, public.fornecedores, public.estoque, public.filiais, public.empresas,
  public.colaboradores, public.metas, public.permissoes;
-- (auditoria fica fora de propósito: cada navegação gera um log e recarregaria todas as telas)
