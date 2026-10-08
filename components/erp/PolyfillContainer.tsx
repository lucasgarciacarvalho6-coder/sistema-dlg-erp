'use client'

// TV com navegador antigo (pedido de 08/10/2026: "na TV ficou uma bagunça, no notebook fica certinho"):
// os cards da Visão TV usam container queries e as unidades cqmin/cqw (Chrome 105+, Safari 16+). Sem elas o navegador
// joga fora os tamanhos e tudo sai na letra padrão, encavalado. Nesses navegadores (só neles) carrega o complemento
// oficial do Google (container-query-polyfill, Chrome 79+), que lê o CSS do sistema e faz as contas no lugar dele.
// Nos navegadores atuais nada é carregado e nada muda.
import { useEffect } from 'react'

export default function PolyfillContainer() {
  useEffect(() => {
    const suporta = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('container-type', 'size') && CSS.supports('width', '1cqmin')
    if (!suporta) void import('container-query-polyfill')
  }, [])
  return null
}
