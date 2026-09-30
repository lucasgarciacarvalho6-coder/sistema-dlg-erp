// Credenciais públicas do Supabase (src/.env.local).
// Enquanto não forem preenchidas, o ERP roda em MODO DEMONSTRAÇÃO (dados no navegador).

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabaseConfigurado =
  /^https?:\/\//.test(SUPABASE_URL) &&
  !SUPABASE_URL.includes('seu-projeto') &&
  SUPABASE_ANON_KEY.length > 30 &&
  !SUPABASE_ANON_KEY.startsWith('sua-')

// Rotas protegidas → módulo usado na verificação de permissão (função pode() do banco)
export const ROTAS_SETOR: Record<string, string> = {
  adm: 'adm',
  gerencia: 'gerencia',
  operacional: 'operacional',
  vendas: 'vendas',
  edicao: 'edicao', // Produção (na tela)
  producao: 'producao', // Revelação (na tela)
  financeiro: 'financeiro',
  cobranca: 'cobranca',
  rebolo: 'rebolo',
}
