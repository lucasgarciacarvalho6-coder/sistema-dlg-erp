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
  const [, segmento = '', subrota = ''] = request.nextUrl.pathname.split('/')
  const modulo = ROTAS_SETOR[segmento]
  const ehApp = segmento === 'app'
  if (!modulo && !ehApp) return resposta
  if (!user) return redirecionar('/login')

  const { data: colab } = await supabase.from('colaboradores').select('setor, status, perfil').eq('id', user.id).maybeSingle()
  if (!colab || colab.status !== 'ATIVO') return redirecionar('/login')
  const inicio = colab.setor === 'producao' && colab.perfil === 'COLABORADOR' ? '/app/producao' : (SETORES[colab.setor as Setor]?.home ?? '/login')

  // Apps de celular: vendedor externo → /app/vendedor; equipe da Produção → /app/producao (ADM pode abrir os dois)
  if (ehApp) {
    const dono = subrota === 'vendedor' ? 'externo' : subrota === 'producao' ? 'producao' : ''
    if (colab.perfil === 'ADM' || colab.setor === dono) return resposta
    return redirecionar(inicio)
  }

  // Equipe da Produção e vendedores externos usam só o app de celular
  if (colab.perfil === 'COLABORADOR' && (colab.setor === 'producao' || colab.setor === 'externo')) return redirecionar(inicio)

  const { data: permitido } = await supabase.rpc('pode', { p_modulo: modulo, p_acao: 'visualizar' })
  if (!permitido) return redirecionar(inicio)

  return resposta
}

export const config = {
  matcher: ['/adm/:path*', '/gerencia/:path*', '/operacional/:path*', '/vendas/:path*', '/producao/:path*', '/financeiro/:path*', '/cobranca/:path*', '/app/:path*'],
}
