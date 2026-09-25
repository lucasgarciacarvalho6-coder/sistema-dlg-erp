'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MODO, redefinirSenha, useSessao, useStatus } from '@/lib/erp/store'

// Destino do link "Esqueci a senha" (Supabase Auth → e-mail de recuperação)
export default function RedefinirSenhaPage() {
  const router = useRouter()
  const sessao = useSessao()
  const status = useStatus()
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (senha !== confirmacao) return setErro('As senhas não conferem.')
    setSalvando(true)
    const falha = await redefinirSenha(senha)
    setSalvando(false)
    if (falha) return setErro(falha)
    setErro('')
    setOk(true)
  }

  const campo =
    'w-full bg-painel border border-zinc-800/80 rounded-xl px-5 py-4 text-white text-sm outline-none transition-all duration-300 focus:border-blue-500 focus:bg-campo focus:ring-[3px] focus:ring-blue-500/20 placeholder:text-zinc-600'

  const linkInvalido = MODO === 'supabase' && status === 'pronto' && !sessao

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-painel-2 text-white p-6 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="w-full max-w-sm relative z-10">
        <div className="flex flex-col items-center mb-10">
          <img src="/logo.png" alt="DLG Photos" className="w-24 h-24 object-contain drop-shadow-[0_0_30px_rgba(37,99,235,0.4)]" />
          <h1 className="text-3xl font-bold tracking-tight mt-6">Nova senha</h1>
          <p className="text-zinc-400 text-sm mt-2">Defina a nova senha de acesso ao ERP.</p>
        </div>

        {MODO === 'demo' ? (
          <p className="text-xs text-zinc-400 text-center">Disponível quando o Supabase estiver configurado.</p>
        ) : linkInvalido ? (
          <div className="bg-erro-fundo border border-red-900/50 rounded-xl p-4 text-xs text-red-400 leading-relaxed">
            Link inválido ou expirado. Abra o link no mesmo navegador em que pediu a recuperação ou solicite um novo na tela de login.
          </div>
        ) : ok ? (
          <div className="space-y-6">
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl text-xs text-emerald-400">Senha alterada com sucesso.</div>
            <button onClick={() => router.replace('/login')} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase tracking-widest text-sm rounded-xl transition-all">
              Entrar no sistema
            </button>
          </div>
        ) : (
          <form onSubmit={salvar} className="space-y-5">
            <input type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Nova senha" className={campo} />
            <input type="password" required minLength={6} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} placeholder="Confirmar nova senha" className={campo} />
            {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
            <button type="submit" disabled={salvando || status !== 'pronto'} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase tracking-widest text-sm rounded-xl transition-all disabled:opacity-50">
              {salvando ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
