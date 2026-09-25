import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigurado } from './config'

let cliente: SupabaseClient | null = null

// Cliente do navegador (sessão em cookies, lida também pelo proxy.ts no servidor)
export function sb(): SupabaseClient {
  if (!supabaseConfigurado) throw new Error('Supabase não configurado (src/.env.local).')
  if (!cliente) cliente = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return cliente
}
