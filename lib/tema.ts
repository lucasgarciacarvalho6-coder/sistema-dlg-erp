// Tema visual (escuro / claro). Preferência de cada pessoa, salva no navegador.
// O atributo <html data-theme> é aplicado antes da pintura pelo script em app/layout.tsx.

import { useSyncExternalStore } from 'react'

import { CHAVE_TEMA } from './tema-script'

export type Tema = 'dark' | 'light'

const ouvintes = new Set<() => void>()

function lerTema(): Tema {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function definirTema(tema: Tema) {
  document.documentElement.dataset.theme = tema
  try {
    localStorage.setItem(CHAVE_TEMA, tema)
  } catch {
    // navegação privada / armazenamento bloqueado: vale só nesta visita
  }
  ouvintes.forEach((o) => o())
}

function assinar(cb: () => void) {
  ouvintes.add(cb)
  // outra aba trocou o tema → acompanha
  const aoMudar = (e: StorageEvent) => {
    if (e.key === CHAVE_TEMA) {
      document.documentElement.dataset.theme = e.newValue === 'light' ? 'light' : 'dark'
      cb()
    }
  }
  window.addEventListener('storage', aoMudar)
  return () => {
    ouvintes.delete(cb)
    window.removeEventListener('storage', aoMudar)
  }
}

export function useTema(): Tema {
  return useSyncExternalStore(assinar, lerTema, () => 'dark')
}
