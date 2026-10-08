// A carteira de cobranças fica FORA da carga geral (é buscada no servidor). Depois de cada gravação a versão sobe,
// e as telas que mostram a carteira buscam de novo.

import { useSyncExternalStore } from 'react'

let versao = 0
const ouvintes = new Set<() => void>()

export function carteiraMudou() {
  versao++
  ouvintes.forEach((o) => o())
}

export function useVersaoCarteira() {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb)
      return () => ouvintes.delete(cb)
    },
    () => versao,
    () => 0,
  )
}
