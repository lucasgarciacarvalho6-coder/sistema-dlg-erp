'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Colaborador, Setor } from '@/lib/erp/types'
import { SETORES } from '@/lib/erp/config'
import { alterarSenha, avisar, avisarAtrasosProducao, definirFoto, logout, marcarLidas, useErp, usePode } from '@/lib/erp/store'
import { dataHoraBR, iniciais } from '@/lib/erp/format'
import Icon from './Icon'
import SeletorTema from './SeletorTema'
import { Modal, TONS, btnPrimario, btnSecundario, inputCls, labelCls } from './ui'

// cor só para alerta: aviso e aprovação = amarelo (atenção), sucesso = verde, informação = neutra
const TOM_NOTIF = { info: 'zinc', alerta: 'yellow', sucesso: 'emerald', aprovacao: 'yellow' } as const

function Relogio() {
  const [agora, setAgora] = useState<Date | null>(null)
  useEffect(() => {
    const atualizar = () => setAgora(new Date())
    atualizar()
    const t = setInterval(atualizar, 1000 * 30)
    return () => clearInterval(t)
  }, [])
  if (!agora) return null
  return (
    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hidden lg:inline">
      {agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} • {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
    </span>
  )
}

export default function Header({ setor, usuario, onMenu }: { setor: Setor; usuario: Colaborador; onMenu: () => void }) {
  const router = useRouter()
  const s = useErp()
  const [notifAberto, setNotifAberto] = useState(false)
  const [perfilAberto, setPerfilAberto] = useState(false)
  const [senhaAberta, setSenhaAberta] = useState(false)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const inputFoto = useRef<HTMLInputElement>(null)
  // Produção: confere as entregas do editor atrasadas (aviso no sininho, 1 vez por prazo)
  const veProducao = usePode()('edicao', 'visualizar')
  useEffect(() => {
    if (veProducao) void avisarAtrasosProducao()
  }, [veProducao])

  const trocarFoto = async (arquivo: File | undefined) => {
    if (!arquivo) return
    setEnviandoFoto(true)
    const erro = await definirFoto(usuario.id, arquivo)
    setEnviandoFoto(false)
    avisar(erro ?? 'Foto atualizada.', erro ? 'erro' : 'ok')
    if (inputFoto.current) inputFoto.current.value = ''
  }
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [msgSenha, setMsgSenha] = useState<{ ok: boolean; texto: string } | null>(null)

  const visaoTotal = usuario.perfil !== 'COLABORADOR'
  const notificacoes = useMemo(
    () => s.notificacoes.filter((n) => visaoTotal || n.setores.includes(usuario.setor)).slice(0, 30),
    [s.notificacoes, visaoTotal, usuario.setor],
  )
  const naoLidas = notificacoes.filter((n) => !n.lidaPor.includes(usuario.id))

  const sair = async () => {
    await logout()
    router.replace('/login')
  }

  const salvarSenha = async (e: React.FormEvent) => {
    e.preventDefault()
    const erro = await alterarSenha(atual, nova)
    setMsgSenha(erro ? { ok: false, texto: erro } : { ok: true, texto: 'Senha alterada com sucesso.' })
    if (!erro) {
      setAtual('')
      setNova('')
    }
  }

  return (
    <header className="h-20 md:h-24 bg-black/90 border-b border-white/[0.05] flex items-center justify-between px-4 md:px-10 sticky top-0 z-40 print:hidden">
      <div className="flex items-center gap-4 min-w-0">
        <button onClick={onMenu} className="md:hidden p-2 text-zinc-400 hover:text-white">
          <Icon nome="menu" className="w-6 h-6" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-300"></span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Ao vivo</span>
          </div>
          <p className="text-sm font-black text-white tracking-wide truncate mt-1">
            Área {SETORES[setor].nome} <span className="text-zinc-600 font-bold">• {SETORES[setor].descricao}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 md:gap-8">
        <Relogio />

        {/* Notificações */}
        <div className="relative">
          <button onClick={() => { setNotifAberto(!notifAberto); setPerfilAberto(false) }} className="relative p-2 text-zinc-500 hover:text-white transition-colors">
            <Icon nome="bell" className="w-6 h-6" />
            {naoLidas.length > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 bg-blue-500 border-2 border-black rounded-full text-[9px] font-black text-white flex items-center justify-center">
                {naoLidas.length > 9 ? '9+' : naoLidas.length}
              </span>
            )}
          </button>
          {notifAberto && (
            <div className="absolute right-0 mt-3 w-[340px] max-w-[90vw] bg-modal border border-white/[0.1] rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.9)] overflow-hidden z-50">
              <div className="px-5 py-4 border-b border-white/[0.05] flex justify-between items-center">
                <span className="text-xs font-bold text-white uppercase tracking-widest">Notificações</span>
                {naoLidas.length > 0 && (
                  <button onClick={() => marcarLidas(naoLidas.map((n) => n.id))} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">
                    Marcar todas
                  </button>
                )}
              </div>
              <div className="max-h-[420px] overflow-y-auto custom-scrollbar divide-y divide-white/[0.03]">
                {notificacoes.length === 0 && <p className="p-6 text-center text-xs text-zinc-500">Sem notificações.</p>}
                {notificacoes.map((n) => {
                  const lida = n.lidaPor.includes(usuario.id)
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        marcarLidas([n.id])
                        setNotifAberto(false)
                        if (n.link) router.push(n.link)
                      }}
                      className={`w-full text-left px-5 py-4 hover:bg-white/[0.03] transition-colors ${lida ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${TONS[TOM_NOTIF[n.tipo]].solido}`}></span>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${TONS[TOM_NOTIF[n.tipo]].texto}`}>{n.titulo}</span>
                        <span className="ml-auto text-[9px] text-zinc-600 font-mono">{dataHoraBR(n.data)}</span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">{n.descricao}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Perfil */}
        <div className="relative flex items-center gap-5 md:pl-8 md:border-l border-white/[0.05]">
          {/* Seletor de tema, ao lado do nome */}
          <div className="hidden lg:block">
            <SeletorTema />
          </div>
          <div className="lg:hidden">
            <SeletorTema compacto />
          </div>
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-sm font-bold text-white tracking-wide">{usuario.nome}</span>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              {usuario.perfil === 'ADM' ? 'Admin' : usuario.perfil === 'GERENTE' ? 'Gerência' : usuario.funcao}
            </span>
          </div>
          <button
            onClick={() => { setPerfilAberto(!perfilAberto); setNotifAberto(false) }}
            className="w-11 h-11 md:w-12 md:h-12 rounded-2xl overflow-hidden bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-white text-sm font-black hover:scale-105 transition-transform"
          >
            {usuario.foto ? <img src={usuario.foto} alt={usuario.nome} className="w-full h-full object-cover" /> : iniciais(usuario.nome)}
          </button>
          <input ref={inputFoto} type="file" accept="image/*" className="hidden" onChange={(e) => trocarFoto(e.target.files?.[0])} />
          {perfilAberto && (
            <div className="absolute right-0 top-full mt-3 w-60 bg-modal border border-white/[0.1] rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.9)] overflow-hidden z-50 p-2">
              <div className="px-3 py-3 border-b border-white/[0.05] mb-1">
                <p className="text-xs font-bold text-white">{usuario.nome}</p>
                <p className="text-[10px] text-zinc-500 truncate">{usuario.email}</p>
              </div>
              <button onClick={() => { inputFoto.current?.click(); setPerfilAberto(false) }} disabled={enviandoFoto} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-white/[0.03] disabled:opacity-50">
                <Icon nome="camera" className="w-4 h-4" /> {enviandoFoto ? 'Enviando foto...' : usuario.foto ? 'Trocar foto' : 'Adicionar foto'}
              </button>
              <button onClick={() => { setSenhaAberta(true); setPerfilAberto(false); setMsgSenha(null) }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-white/[0.03]">
                <Icon nome="key" className="w-4 h-4" /> Alterar senha
              </button>
              <button onClick={sair} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-red-400 hover:bg-red-500/10">
                <Icon nome="logout" className="w-4 h-4" /> Encerrar sessão
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal
        aberto={senhaAberta}
        titulo="Alterar senha"
        subtitulo="Segurança da conta"
        onFechar={() => setSenhaAberta(false)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setSenhaAberta(false)} className={btnSecundario}>Fechar</button>
            <button form="form-senha" type="submit" className={btnPrimario}>Salvar</button>
          </>
        }
      >
        <form id="form-senha" onSubmit={salvarSenha} className="space-y-4">
          <div className="space-y-2">
            <label className={labelCls}>Senha atual</label>
            <input type="password" required value={atual} onChange={(e) => setAtual(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-2">
            <label className={labelCls}>Nova senha</label>
            <input type="password" required minLength={6} value={nova} onChange={(e) => setNova(e.target.value)} className={inputCls} />
          </div>
          {msgSenha && <p className={`text-xs font-bold ${msgSenha.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msgSenha.texto}</p>}
        </form>
      </Modal>
    </header>
  )
}
