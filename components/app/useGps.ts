'use client'

// Localização do vendedor externo, SOMENTE para monitoramento pelo Operacional.
// App web (PWA) só consegue ler o GPS enquanto está aberto: grava ao abrir, a cada ~3 min e em cada ação.
// Sem permissão de localização o app não libera o uso (pedido da empresa).

import { useCallback, useEffect, useRef, useState } from 'react'
import { registrarLocalizacao } from '@/lib/erp/store'

export type EstadoGps = 'verificando' | 'pedindo' | 'ativo' | 'negado' | 'indisponivel'

const INTERVALO_MS = 3 * 60_000

export function useGps(ligado: boolean) {
  const [estado, setEstado] = useState<EstadoGps>('verificando')
  const ultimaPosicao = useRef<GeolocationPosition | null>(null)
  const ultimaGravacao = useRef(0)
  const watchId = useRef<number | null>(null)

  const gravar = useCallback((pos: GeolocationPosition, origem: 'abertura' | 'periodico' | 'acao', descricao?: string) => {
    ultimaGravacao.current = Date.now()
    void registrarLocalizacao({ lat: pos.coords.latitude, lng: pos.coords.longitude, precisao: Math.round(pos.coords.accuracy), origem, descricao })
  }, [])

  const iniciar = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setEstado('indisponivel')
      return
    }
    setEstado('pedindo')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        ultimaPosicao.current = pos
        gravar(pos, 'abertura')
        setEstado('ativo')
        if (watchId.current === null) {
          watchId.current = navigator.geolocation.watchPosition(
            (p) => {
              ultimaPosicao.current = p
              if (Date.now() - ultimaGravacao.current >= INTERVALO_MS) gravar(p, 'periodico')
            },
            (e) => e.code === e.PERMISSION_DENIED && setEstado('negado'),
            { enableHighAccuracy: true, maximumAge: 60_000 },
          )
        }
      },
      (e) => setEstado(e.code === e.PERMISSION_DENIED ? 'negado' : 'indisponivel'),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    )
  }, [gravar])

  // liga ao abrir o app (depois do aceite); desliga ao sair
  useEffect(() => {
    if (!ligado) return
    const t = setTimeout(iniciar, 0)
    // o celular pode pausar o watch com a tela bloqueada: ao voltar, grava se passou o intervalo
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && ultimaPosicao.current && Date.now() - ultimaGravacao.current >= INTERVALO_MS) {
        navigator.geolocation.getCurrentPosition((p) => {
          ultimaPosicao.current = p
          gravar(p, 'periodico')
        })
      }
    }
    const relogio = setInterval(aoVoltar, 60_000)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      clearTimeout(t)
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', aoVoltar)
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [ligado, iniciar, gravar])

  // ponto marcado em cada ação (contrato enviado, venda registrada...)
  const registrarAcao = useCallback(
    (descricao: string) => {
      if (ultimaPosicao.current) gravar(ultimaPosicao.current, 'acao', descricao)
      navigator.geolocation?.getCurrentPosition((p) => (ultimaPosicao.current = p))
    },
    [gravar],
  )

  return { estado, tentarDeNovo: iniciar, registrarAcao }
}
