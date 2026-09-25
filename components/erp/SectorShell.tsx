'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Setor } from '@/lib/erp/types'
import { MENUS, SETORES } from '@/lib/erp/config'
import { pode, rotaInicial } from '@/lib/erp/permissions'
import { logout, registrarAcesso, useAviso, useErp, useStatus, useUsuario } from '@/lib/erp/store'
import Icon from './Icon'
import Header from './Header'
import { Carregando } from './ui'

// Layout isolado de cada setor: guarda de acesso + Sidebar com o menu SÓ daquele setor + Header.
// A guarda aqui é apenas de interface; a proteção real virá das políticas RLS do Supabase.
export default function SectorShell({ setor, children }: { setor: Setor; children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const status = useStatus()
  const aviso = useAviso()
  const hidratado = status === 'pronto'
  const s = useErp()
  const usuario = useUsuario()
  const [menuAberto, setMenuAberto] = useState(false)

  const permitido = pode(usuario, s.permissoes, setor, 'visualizar')

  useEffect(() => {
    if (!hidratado) return
    if (!usuario) router.replace('/login')
    else if (!permitido) router.replace(rotaInicial(usuario))
  }, [hidratado, usuario, permitido, router])

  const usuarioId = usuario?.id
  useEffect(() => {
    if (usuarioId && permitido) registrarAcesso(setor)
  }, [usuarioId, permitido, setor])

  if (!hidratado || !usuario || !permitido) return <Carregando />

  const visaoTotal = usuario.perfil !== 'COLABORADOR'
  const grupos = MENUS[setor]
    .map((g) => ({ ...g, itens: g.itens.filter((i) => !i.modulo || pode(usuario, s.permissoes, i.modulo, 'visualizar')) }))
    .filter((g) => g.itens.length > 0)

  // ADM e Gerência têm um atalho para os dashboards de todos os setores
  const setoresAcessiveis = (setor === 'adm' || setor === 'gerencia') && visaoTotal
    ? (Object.keys(SETORES) as Setor[]).filter((x) => x !== setor && pode(usuario, s.permissoes, x, 'visualizar'))
    : []

  const ativo = (href: string) => (href === SETORES[setor].home || href === `/${setor}` ? pathname === href : pathname.startsWith(href))

  const ir = (href: string) => {
    setMenuAberto(false)
    router.push(href)
  }

  const sair = async () => {
    await logout()
    router.replace('/login')
  }

  const sidebar = (
    <aside className="w-[280px] h-screen bg-painel-2/95 md:bg-painel-2/80 backdrop-blur-2xl border-r border-white/[0.05] flex flex-col justify-between print:hidden">
      {/* O Palco da Logomarca */}
      <div className="pt-10 pb-7 flex flex-col items-center justify-center relative border-b border-white/[0.02]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-blue-600/30 blur-[40px] rounded-full pointer-events-none"></div>
        <img
          src="/logo.png"
          alt="DLG Photos"
          onClick={() => ir(rotaInicial(usuario))}
          className="w-24 h-24 object-contain relative z-10 drop-shadow-[0_0_25px_rgba(37,99,235,0.6)] hover:scale-105 transition-transform duration-500 cursor-pointer"
        />
        <div className="mt-5 text-center relative z-10">
          <h1 className="text-xl font-black text-white tracking-[0.2em] uppercase">
            DLG <span className="text-blue-500">PHOTOS</span>
          </h1>
          <div className="mt-2 inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
            <span className="text-[9px] text-blue-300 uppercase tracking-widest font-bold">Área {SETORES[setor].nome}</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-6 px-5 space-y-6 custom-scrollbar relative z-10">
        {visaoTotal && setor !== usuario.setor && (
          <button
            onClick={() => ir(rotaInicial(usuario))}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-blue-300 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all"
          >
            <Icon nome="arrowLeft" className="w-4 h-4" /> Voltar à {SETORES[usuario.setor].nome}
          </button>
        )}

        {grupos.map((g) => (
          <div key={g.titulo}>
            <p className="px-4 mb-3 text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-600">{g.titulo}</p>
            <div className="space-y-1.5">
              {g.itens.map((item) => (
                <button
                  key={item.href}
                  onClick={() => ir(item.href)}
                  className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all duration-300 border ${
                    ativo(item.href) ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 'border-transparent text-zinc-500 hover:text-white hover:bg-white/[0.03]'
                  }`}
                >
                  <Icon nome={item.icone} className="w-5 h-5 shrink-0" />
                  <span className="text-left">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {setoresAcessiveis.length > 0 && (
          <div>
            <p className="px-4 mb-3 text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-600">Setores</p>
            <div className="ml-4 pl-4 border-l border-white/[0.05] space-y-1.5">
              {setoresAcessiveis.map((x) => (
                <button
                  key={x}
                  onClick={() => ir(SETORES[x].home)}
                  className="w-full text-left px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors border border-transparent text-zinc-500 hover:text-white hover:bg-white/[0.03]"
                >
                  {SETORES[x].nome}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className="p-6 relative z-10 border-t border-white/[0.02]">
        <button
          onClick={sair}
          className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
        >
          <Icon nome="logout" className="w-4 h-4" />
          Encerrar Sessão
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden font-sans selection:bg-blue-600 selection:text-white relative print:h-auto print:overflow-visible">
      {/* Luz Ambiente Global */}
      <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-blue-600/10 blur-[150px] rounded-full pointer-events-none z-0"></div>

      <div className="hidden md:flex sticky top-0 z-50">{sidebar}</div>
      {menuAberto && (
        <div className="md:hidden fixed inset-0 z-[60] flex">
          <div>{sidebar}</div>
          <div className="flex-1 bg-black/70 backdrop-blur-sm" onClick={() => setMenuAberto(false)}></div>
        </div>
      )}

      <div className="flex-1 flex flex-col h-screen overflow-hidden relative z-10 min-w-0">
        <Header setor={setor} usuario={usuario} onMenu={() => setMenuAberto(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-[1500px] mx-auto">{children}</div>
        </main>
      </div>

      {/* Avisos do servidor (erros de permissão, confirmações) */}
      {aviso && (
        <div key={aviso.id} className="fixed bottom-6 right-6 z-[80] max-w-sm animate-fade-in-up print:hidden">
          <div className={`flex items-start gap-3 backdrop-blur-xl border p-4 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.8)] ${aviso.tipo === 'erro' ? 'bg-erro-fundo/95 border-red-900/50' : 'bg-ok-fundo/95 border-emerald-900/50'}`}>
            <span className={`mt-1 w-2 h-2 shrink-0 rounded-full ${aviso.tipo === 'erro' ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-emerald-500 shadow-[0_0_10px_#10b981]'}`}></span>
            <p className={`text-xs font-medium leading-relaxed ${aviso.tipo === 'erro' ? 'text-red-300' : 'text-emerald-300'}`}>{aviso.texto}</p>
          </div>
        </div>
      )}
    </div>
  )
}
