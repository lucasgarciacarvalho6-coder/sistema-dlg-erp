'use client'

import { useEffect } from 'react'

// Liga o service worker do app (exigido pelo Android para instalar / gerar o APK)
export default function RegistrarSW({ arquivo, escopo }: { arquivo: string; escopo: string }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(arquivo, { scope: escopo }).catch(() => undefined)
  }, [arquivo, escopo])
  return null
}
