import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { ROTAS_SETOR, SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigurado } from '@/lib/supabase/config'
import { SETORES } from '@/lib/erp/config'
import type { Setor } from '@/lib/erp/types'

// Proteção das áreas no SERVIDOR (antes de renderizar a página).
// Sem sessão → /login. Setor sem permissão → área do próprio usuário.
// Os dados em si continuam protegidos pelo RLS do banco.
export async function proxy(request: NextRequest) {
  if (!supabaseConfigurado) return NextResponse.next() // modo demonstração

  let resposta = NextResponse.next({ request })
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(lista, headers) {
        lista.forEach(({ name, value }) => request.cookies.set(name, value))
        resposta = NextResponse.next({ request })
        lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options))
        Object.entries(headers).forEach(([k, v]) => resposta.headers.set(k, v))
      },
    },
  })

  const redirecionar = (caminho: string) => {
    const r = NextResponse.redirect(new URL(caminho, request.url))
    resposta.cookies.getAll().forEach((c) => r.cookies.set(c))
    return r
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const segmento = request.nextUrl.pathname.split('/')[1] ?? ''
  const modulo = ROTAS_SETOR[segmento]
  if (!modulo) return resposta
  if (!user) return redirecionar('/login')

  const { data: colab } = await supabase.from('colaboradores').select('setor, status').eq('id', user.id).maybeSingle()
  if (!colab || colab.status !== 'ATIVO') return redirecionar('/login')

  const { data: permitido } = await supabase.rpc('pode', { p_modulo: modulo, p_acao: 'visualizar' })
  if (!permitido) return redirecionar(SETORES[colab.setor as Setor]?.home ?? '/login')

  return resposta
}

export const config = {
  matcher: ['/adm/:path*', '/gerencia/:path*', '/operacional/:path*', '/vendas/:path*', '/producao/:path*', '/financeiro/:path*', '/cobranca/:path*'],
}
