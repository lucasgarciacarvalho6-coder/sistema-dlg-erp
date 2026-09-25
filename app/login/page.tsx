'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MODO, login, solicitarRecuperacao, useUsuario } from '@/lib/erp/store'
import { rotaInicial } from '@/lib/erp/permissions'
import { SETORES } from '@/lib/erp/config'
import { CONTAS_DEMO, SENHA_DEMO } from '@/lib/erp/seed'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [recuperando, setRecuperando] = useState(false)
  const [emailRecuperacao, setEmailRecuperacao] = useState('')
  const [recuperacaoEnviada, setRecuperacaoEnviada] = useState(false)
  const router = useRouter()
  const usuarioLogado = useUsuario()

  // Sessão ativa nesta aba → vai direto para a área do usuário
  useEffect(() => {
    if (usuarioLogado) router.replace(rotaInicial(usuarioLogado))
  }, [usuarioLogado, router])

  // Login: identifica o colaborador e o setor e redireciona para a área dele.
  // Com Supabase: signInWithPassword + leitura do cadastro em colaboradores.
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMessage('')
    if (MODO === 'demo') await new Promise((r) => setTimeout(r, 450))
    const resultado = await login(email, password)
    if (!resultado.ok) {
      setErrorMessage(resultado.erro)
      setLoading(false)
      return
    }
    router.push(rotaInicial(resultado.usuario))
  }

  const acessoRapido = (emailDemo: string) => {
    setEmail(emailDemo)
    setPassword(SENHA_DEMO)
    setErrorMessage('')
  }

  const enviarRecuperacao = async (e: React.FormEvent) => {
    e.preventDefault()
    await solicitarRecuperacao(emailRecuperacao)
    setRecuperacaoEnviada(true)
  }

  return (
    <main className="min-h-screen w-full flex bg-[#030303] text-white font-sans selection:bg-blue-600 selection:text-white overflow-hidden">
      
      {/* =========================================
          LADO ESQUERDO: A MARCA E LOGO OFICIAL
          ========================================= */}
      <div className="relative hidden lg:flex lg:w-[55%] flex-col justify-center items-center p-8 bg-[#020202] overflow-hidden border-r border-zinc-900/50">
        
        {/* Glow backdrop gigante para destacar a logo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[150px] pointer-events-none"></div>

        {/* Textura de Fundo Escurecida nas Bordas */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#000_100%)] pointer-events-none opacity-90"></div>

        {/* Logo Oficial Destacada */}
        <div className="relative z-10 flex flex-col items-center text-center space-y-8 w-full max-w-2xl">
          
          {/* Imagem logo.png flutuante sem os arcos exagerados */}
          <div className="relative w-80 h-80 xl:w-[450px] xl:h-[450px] flex items-center justify-center transform hover:scale-105 transition-transform duration-700 ease-out">
            <img 
              src="/logo.png" 
              alt="Logo DLG Photos" 
              className="w-full h-full object-contain drop-shadow-[0_0_50px_rgba(37,99,235,0.4)]"
            />
          </div>

          {/* Nome da Empresa e Slogan */}
          <div className="space-y-4 animate-fade-in-up">
            <h1 className="text-5xl lg:text-7xl font-black tracking-tighter leading-[1.1] text-white">
              DLG <span className="text-blue-500 drop-shadow-lg">PHOTOS</span>
            </h1>
            <p className="text-lg text-zinc-400 font-light leading-relaxed max-w-md mx-auto">
              Plataforma de gestão integrada para estúdios fotográficos e cobertura de eventos.
            </p>
          </div>

        </div>

        {/* Rodapé da Marca */}
        <div className="absolute bottom-8 left-0 w-full text-center z-10">
          <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest">
            © 2026 DLG PHOTOS • SISTEMA OPERACIONAL
          </p>
        </div>
      </div>

      {/* =========================================
          LADO DIREITO: FORMULÁRIO DE ALTA PRECISÃO
          ========================================= */}
      <div className="w-full lg:w-[45%] flex flex-col justify-center items-center p-8 lg:p-16 relative bg-[#050505]">
        
        {/* Glow subtil atrás do form */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="w-full max-w-sm relative z-10">
          
          {/* Título do Form */}
          <div className="mb-10 text-center lg:text-left">
            <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Portal de Acesso</h2>
            <p className="text-zinc-400 text-sm">Insira as suas credenciais corporativas.</p>
          </div>

          {/* Alerta de Erro Elegante */}
          {errorMessage && (
            <div className="mb-6 bg-[#1a0f0f] border border-red-900/50 rounded-xl p-4 flex items-start gap-3 shadow-[0_0_20px_rgba(220,38,38,0.1)] transition-all duration-300">
              <div className="mt-0.5 bg-red-500/20 p-1 rounded-full text-red-500 shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              </div>
              <p className="text-xs text-red-400 font-medium leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {/* Formulário Intuitivo e Moderno */}
          <form onSubmit={handleLogin} className="space-y-5">
            
            {/* Input E-mail */}
            <div className="space-y-2 group">
              <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 group-focus-within:text-blue-500 transition-colors">
                E-mail Profissional
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-zinc-800/80 rounded-xl px-5 py-4 text-white text-sm outline-none transition-all duration-300 focus:border-blue-500 focus:bg-[#0f1115] focus:ring-[3px] focus:ring-blue-500/20 placeholder:text-zinc-600 shadow-inner"
                  placeholder="nome@dlgphotos.com"
                />
              </div>
            </div>

            {/* Input Palavra-passe com Botão de Mostrar/Ocultar */}
            <div className="space-y-2 group">
              <div className="flex justify-between items-center">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 group-focus-within:text-blue-500 transition-colors">
                  Senha
                </label>
                <button type="button" onClick={() => { setRecuperando(true); setRecuperacaoEnviada(false); setEmailRecuperacao(email) }} className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-blue-400 transition-colors">
                  Esqueci a senha
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-zinc-800/80 rounded-xl pl-5 pr-12 py-4 text-white text-sm outline-none transition-all duration-300 focus:border-blue-500 focus:bg-[#0f1115] focus:ring-[3px] focus:ring-blue-500/20 placeholder:text-zinc-600 shadow-inner"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-blue-400 transition-colors focus:outline-none"
                  title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Botão de Autenticação Tradicional */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 py-4 px-6 bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase tracking-widest text-sm rounded-xl transition-all duration-300 shadow-[0_0_15px_rgba(37,99,235,0.2)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Identificando setor...</span>
                </>
              ) : (
                <span>Autenticar e Entrar</span>
              )}
            </button>
          </form>

          {/* Divisor "OU" */}
          {MODO === 'demo' && (
            <div className="my-8 flex items-center gap-4">
              <div className="flex-1 h-px bg-zinc-800"></div>
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">OU</span>
              <div className="flex-1 h-px bg-zinc-800"></div>
            </div>
          )}

          {/* Acesso rápido (somente no modo demonstração) */}
          {MODO === 'demo' && (
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold text-center">Acesso de demonstração • senha {SENHA_DEMO}</p>
            <div className="grid grid-cols-2 gap-2">
              {CONTAS_DEMO.map((c) => (
                <button
                  key={c.email}
                  type="button"
                  onClick={() => acessoRapido(c.email)}
                  className={`py-3 px-4 bg-[#0a0a0a] border hover:bg-[#111] text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all active:scale-[0.98] ${
                    email === c.email ? 'border-blue-500/60 text-blue-400' : 'border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  {SETORES[c.setor].nome}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Logo em Mobile */}
          <div className="mt-12 lg:hidden flex flex-col items-center gap-4 animate-fade-in">
            <img src="/logo.png" alt="DLG Photos Logo" className="w-32 h-32 object-contain drop-shadow-[0_0_30px_rgba(37,99,235,0.3)]" />
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
              DLG PHOTOS • FORMATURA E ESTÚDIO
            </p>
          </div>

        </div>
      </div>

      {/* Recuperação de senha (mock) */}
      {recuperando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onMouseDown={() => setRecuperando(false)}>
          <div className="bg-[#0c0f17] border border-white/[0.1] rounded-[2rem] w-full max-w-md shadow-[0_0_80px_rgba(0,0,0,0.9)] p-8 space-y-6" onMouseDown={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">Recuperar senha</h3>
              <p className="text-xs text-zinc-500 uppercase tracking-widest mt-2 font-bold">Enviaremos um link para o seu e-mail</p>
            </div>
            {recuperacaoEnviada ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl text-xs text-emerald-400 leading-relaxed">
                Se o e-mail estiver cadastrado, você receberá as instruções para criar uma nova senha.{MODO === 'demo' && ' (Modo demonstração: nenhum e-mail é enviado.)'}
              </div>
            ) : (
              <form onSubmit={enviarRecuperacao} className="space-y-4">
                <input type="email" required value={emailRecuperacao} onChange={(e) => setEmailRecuperacao(e.target.value)} placeholder="nome@dlgphotos.com" className="w-full bg-[#0a0a0a] border border-zinc-800/80 rounded-xl px-5 py-4 text-white text-sm outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/20 placeholder:text-zinc-600" />
                <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase tracking-widest text-sm rounded-xl transition-all">Enviar link</button>
              </form>
            )}
            <button onClick={() => setRecuperando(false)} className="w-full text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-white">Fechar</button>
          </div>
        </div>
      )}

    </main>
  )
}