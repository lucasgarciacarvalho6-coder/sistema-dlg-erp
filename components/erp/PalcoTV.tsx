'use client'

// PALCO FIXO DA TV (15/10/2026 — "no navegador da TV a Visão TV fica toda desajustada"; TV Philips 70"):
// o navegador da TV desenha numa área pequena (1280×720 ou 960×540) e só depois amplia para a tela. Nessa área os
// cards da Visão TV (feitos para 1920×1080) não cabem e os textos encavalam. Aqui tudo é desenhado SEMPRE em
// 1920×1080 e reduzido/ampliado de uma vez para caber na tela, como uma imagem — fica igual em qualquer TV,
// notebook ou monitor (tela de outra proporção ganha faixas pretas nas bordas).
// REGRA: dentro do palco, nada de tamanhos pela tela (sm:/md:/lg:/xl:/2xl:, vh, vw): use o tamanho do palco.

import { useEffect, useState, type ReactNode } from 'react'

export const PALCO_LARGURA = 1920
export const PALCO_ALTURA = 1080

export default function PalcoTV({ children }: { children: ReactNode }) {
  const [escala, setEscala] = useState(1)
  useEffect(() => {
    const medir = () => {
      const w = window.innerWidth || document.documentElement.clientWidth
      const h = window.innerHeight || document.documentElement.clientHeight
      if (w > 0 && h > 0) setEscala(Math.min(w / PALCO_LARGURA, h / PALCO_ALTURA))
    }
    medir()
    window.addEventListener('resize', medir)
    document.addEventListener('fullscreenchange', medir)
    // letra base fixa enquanto a TV está aberta (navegador de TV costuma aumentar a letra padrão)
    document.documentElement.classList.add('palco-tv-aberto')
    return () => {
      window.removeEventListener('resize', medir)
      document.removeEventListener('fullscreenchange', medir)
      document.documentElement.classList.remove('palco-tv-aberto')
    }
  }, [])
  return (
    <div className="palco-tv" style={{ width: PALCO_LARGURA, height: PALCO_ALTURA, marginLeft: -PALCO_LARGURA / 2, marginTop: -PALCO_ALTURA / 2, transform: `scale(${escala})` }}>
      {children}
    </div>
  )
}
