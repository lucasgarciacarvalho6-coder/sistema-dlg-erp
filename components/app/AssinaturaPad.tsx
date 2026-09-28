'use client'

// Assinatura do cliente com o dedo, na tela do celular do vendedor.
// Fundo branco (a imagem é salva em JPEG junto com os outros anexos da venda).

import { useEffect, useRef, useState } from 'react'

export default function AssinaturaPad({ onChange }: { onChange: (arquivo: File | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)
  const ultimo = useRef<{ x: number; y: number } | null>(null)
  const [vazio, setVazio] = useState(true)

  // prepara o quadro no tamanho real da tela (nítido em celular de alta densidade)
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const { width, height } = c.getBoundingClientRect()
    c.width = Math.round(width * dpr)
    c.height = Math.round(height * dpr)
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0b1f5c'
  }, [])

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const finalizar = () => {
    if (!desenhando.current) return
    desenhando.current = false
    ultimo.current = null
    canvas.current?.toBlob((b) => b && onChange(new File([b], 'assinatura.png', { type: 'image/png' })), 'image/png')
  }

  const limpar = () => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const { width, height } = c.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    setVazio(true)
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-2xl overflow-hidden border-2 border-dashed border-blue-500/40 bg-white">
        <canvas
          ref={canvas}
          className="w-full h-48 touch-none block"
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
          onPointerLeave={finalizar}
        />
        {vazio && <span className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm pointer-events-none">Cliente: assine aqui com o dedo</span>}
        <span className="absolute left-4 right-4 bottom-8 border-b border-zinc-300 pointer-events-none"></span>
      </div>
      <button type="button" onClick={limpar} className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white">
        ↺ Limpar assinatura
      </button>
    </div>
  )
}
