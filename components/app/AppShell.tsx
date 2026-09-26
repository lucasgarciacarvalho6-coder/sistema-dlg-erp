'use client'

// Moldura dos apps de celular (PWA): Vendedor externo e Produção.
// Tela estreita (celular), cabeçalho com o nome, navegação inferior e a mesma guarda de acesso do ERP.
// A proteção real dos dados continua no RLS do Supabase.

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { Setor } from '@/lib/erp/types'
import { rotaInicial } from '@/lib/erp/permissions'
import { logout, useAviso, useStatus, useUsuario } from '@/lib/erp/store'
import { iniciais } from '@/lib/erp/format'
import { Avatar, Carregando } from '@/components/erp/ui'

export interface ItemNav {
  id: string
  label: string
  icone: string // emoji: leve e legível no celular
}

export default function AppShell({
  setor,
  titulo,
  subtitulo,
  nav,
  ativa,
  onNav,
  children,
}: {
  setor: Setor
  titulo: string
  subtitulo?: string
  nav?: ItemNav[]
  ativa?: string
  onNav?: (id: string) => void
  children: ReactNode
}) {
  const router = useRouter()
  const status = useStatus()
  const usuario = useUsuario()
  const aviso = useAviso()
  const pronto = status === 'pronto'
  // ADM pode abrir os apps para conferir; os demais só o app do próprio setor
  const permitido = !!usuario && (usuario.setor === setor || usuario.perfil === 'ADM')

  useEffect(() => {
    if (!pronto) return
    if (!usuario) router.replace('/login')
    else if (!permitido) router.replace(rotaInicial(usuario))
  }, [pronto, usuario, permitido, router])

  if (!pronto || !usuario || !permitido) return <Carregando />

  const sair = async () => {
    await logout()
    router.replace('/login')
  }

  return (
    <div className="min-h-screen bg-fundo text-white flex justify-center">
      <div className="w-full max-w-[480px] min-h-screen flex flex-col relative border-x border-white/[0.04]">
        <header className="sticky top-0 z-30 bg-black/90 border-b border-white/[0.06] px-4 py-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="DLG" className="w-9 h-9 object-contain" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black leading-tight truncate">{titulo}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 truncate">{subtitulo ?? usuario.funcao}</p>
          </div>
          <Avatar texto={iniciais(usuario.nome)} foto={usuario.foto} tamanho="w-9 h-9" arredondado="rounded-xl" textoCls="text-[10px]" />
          <button onClick={sair} className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white px-2 py-2" aria-label="Sair">
            Sair
          </button>
        </header>

        <main className={`flex-1 px-4 py-5 space-y-5 ${nav ? 'pb-28' : 'pb-8'}`}>{children}</main>

        {nav && (
          <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-30 bg-black/95 border-t border-white/[0.08] grid pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
            {nav.map((n) => (
              <button
                key={n.id}
                onClick={() => onNav?.(n.id)}
                className={`py-3 flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${ativa === n.id ? 'text-blue-400' : 'text-zinc-500 hover:text-white'}`}
              >
                <span className="text-lg leading-none" aria-hidden="true">{n.icone}</span>
                {n.label}
              </button>
            ))}
          </nav>
        )}

        {aviso && (
          <div key={aviso.id} className="fixed top-20 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[448px] z-[80] animate-fade-in-up">
            <div className={`flex items-start gap-3 border p-4 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.8)] ${aviso.tipo === 'erro' ? 'bg-erro-fundo/95 border-red-900/50' : 'bg-ok-fundo/95 border-emerald-900/50'}`}>
              <span className={`mt-1 w-2 h-2 shrink-0 rounded-full ${aviso.tipo === 'erro' ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
              <p className={`text-sm font-medium leading-relaxed ${aviso.tipo === 'erro' ? 'text-red-300' : 'text-emerald-300'}`}>{aviso.texto}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Peças visuais dos apps (maiores, para uso com o dedo)
export const cardApp = 'bg-painel-2/90 border border-white/[0.06] rounded-3xl p-5'
export const inputApp =
  'w-full bg-black/50 border border-white/[0.08] rounded-2xl px-4 py-3.5 text-base text-white outline-none focus:border-blue-500/60 placeholder:text-zinc-600'
export const labelApp = 'text-[11px] font-bold uppercase tracking-widest text-zinc-400'
export const botaoApp =
  'w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white text-sm font-black uppercase tracking-widest transition-all disabled:opacity-50'
export const botaoSecApp =
  'w-full py-3.5 rounded-2xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] text-white text-xs font-bold uppercase tracking-widest transition-all'
