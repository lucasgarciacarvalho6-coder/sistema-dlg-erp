'use client'

// Assinatura do cliente com o dedo, em TELA CHEIA, com o celular deitado.
// No Android o app tenta virar a tela sozinho (tela cheia + orientação paisagem).
// Se o celular continuar em pé (iPhone, app travado em retrato), o quadro já aparece
// "deitado": os textos giram e a imagem é salva girada, sempre na horizontal.
// Fundo branco; sai em PNG junto com os outros anexos da venda.

import { useCallback, useEffect, useRef, useState } from 'react'

// Chamar no toque do botão (o navegador só permite tela cheia a partir de um toque)
export function entrarTelaCheia() {
  const el = document.documentElement
  void el
    .requestFullscreen?.()
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {})
}

function sairTelaCheia() {
  try {
    screen.orientation?.unlock?.()
  } catch {}
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
}

export default function AssinaturaPad({ nome, onConcluir, onCancelar }: { nome?: string; onConcluir: (arquivo: File) => void; onCancelar: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)
  const ultimo = useRef<{ x: number; y: number } | null>(null)
  const [vazio, setVazio] = useState(true)
  // em pé = o celular não girou: quadro "deitado" virtual
  const [emPe, setEmPe] = useState(false)

  // prepara o quadro no tamanho da tela (nítido em alta densidade); ao girar, recomeça
  const preparar = useCallback(() => {
    const c = canvas.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const { width, height } = c.getBoundingClientRect()
    c.width = Math.round(width * dpr)
    c.height = Math.round(height * dpr)
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0b1f5c'
    setVazio(true)
    setEmPe(window.innerHeight > window.innerWidth)
  }, [])

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    let tamanho = ''
    const obs = new ResizeObserver(([e]) => {
      const t = `${Math.round(e.contentRect.width)}x${Math.round(e.contentRect.height)}`
      if (t !== tamanho) {
        tamanho = t
        preparar()
      }
    })
    obs.observe(c)
    const trava = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      obs.disconnect()
      document.body.style.overflow = trava
      sairTelaCheia()
    }
  }, [preparar])

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const finalizar = () => {
    desenhando.current = false
    ultimo.current = null
  }

  // salva em tamanho normal (sem a densidade da tela) e, se o celular estava em pé, gira para a horizontal
  const concluir = () => {
    const c = canvas.current
    if (!c || vazio) return
    const { width: w, height: h } = c.getBoundingClientRect()
    const out = document.createElement('canvas')
    const ctx = out.getContext('2d')!
    if (emPe) {
      out.width = Math.round(h)
      out.height = Math.round(w)
      ctx.translate(0, w)
      ctx.rotate(-Math.PI / 2)
    } else {
      out.width = Math.round(w)
      out.height = Math.round(h)
    }
    ctx.drawImage(c, 0, 0, w, h)
    out.toBlob((b) => {
      if (!b) return
      sairTelaCheia()
      onConcluir(new File([b], 'assinatura.png', { type: 'image/png' }))
    }, 'image/png')
  }

  const botao = 'px-5 py-3 rounded-2xl text-sm font-black uppercase tracking-widest'
  const acoes = (
    <>
      <button type="button" onClick={() => (sairTelaCheia(), onCancelar())} className={`${botao} bg-zinc-200 text-zinc-700`}>
        Cancelar
      </button>
      <button type="button" onClick={preparar} className={`${botao} bg-zinc-200 text-zinc-700`}>
        Limpar
      </button>
      <button type="button" onClick={concluir} disabled={vazio} className={`${botao} bg-blue-600 text-white disabled:opacity-40`}>
        Concluir assinatura
      </button>
    </>
  )
  const aviso = vazio ? `${nome ? `${nome}: ` : ''}assine aqui com o dedo` : ''

  return (
    <div className="fixed inset-0 z-[200] bg-white select-none">
      <canvas
        ref={canvas}
        className="absolute inset-0 w-full h-full touch-none block"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          desenhando.current = true
          ultimo.current = ponto(e)
        }}
        onPointerMove={(e) => {
          if (!desenhando.current || !ultimo.current) return
          const ctx = e.currentTarget.getContext('2d')!
          const p = ponto(e)
          ctx.beginPath()
          ctx.moveTo(ultimo.current.x, ultimo.current.y)
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
          ultimo.current = p
          if (vazio) setVazio(false)
        }}
        onPointerUp={finalizar}
        onPointerCancel={finalizar}
      />

      {emPe ? (
        // celular em pé: tudo "deitado" (topo do celular para a esquerda)
        <>
          <span className="absolute top-8 bottom-8 left-[25%] border-l-2 border-zinc-300 pointer-events-none"></span>
          <div className="absolute right-3 top-1/2 origin-center rotate-90 -translate-y-1/2 translate-x-[calc(50%-1.5rem)] w-[85vh] text-center pointer-events-none">
            <p className="text-sm font-bold text-zinc-500">↻ Vire o celular deitado para assinar</p>
            {aviso && <p className="text-lg text-zinc-400 mt-2">{aviso}</p>}
          </div>
          <div className="absolute left-3 top-1/2 origin-center rotate-90 -translate-y-1/2 -translate-x-[calc(50%-2rem)] w-[85vh] flex justify-center gap-3">{acoes}</div>
        </>
      ) : (
        <>
          <span className="absolute left-8 right-8 bottom-[25%] border-b-2 border-zinc-300 pointer-events-none"></span>
          {aviso && <p className="absolute inset-x-0 top-[35%] text-center text-lg text-zinc-400 pointer-events-none">{aviso}</p>}
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-3 pb-[env(safe-area-inset-bottom)]">{acoes}</div>
        </>
      )}
    </div>
  )
}
