'use client'

// Mapa do GPS dos vendedores (Leaflet + OpenStreetMap, gratuito).
// Pontos como círculos (sem imagens de marcador) e, opcionalmente, a linha da rota do dia.

import { useEffect, useRef } from 'react'
import type { LayerGroup, Map as LMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MarcadorMapa {
  lat: number
  lng: number
  cor: string
  texto: string // tooltip (texto simples)
  raio?: number
  destaque?: boolean
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

export default function MapaGps({ marcadores, linha = false, altura = 420 }: { marcadores: MarcadorMapa[]; linha?: boolean; altura?: number }) {
  const div = useRef<HTMLDivElement>(null)
  const mapa = useRef<LMap | null>(null)
  const camada = useRef<LayerGroup | null>(null)

  useEffect(() => {
    let cancelado = false
    void (async () => {
      const L = (await import('leaflet')).default
      if (cancelado || !div.current) return
      if (!mapa.current) {
        mapa.current = L.map(div.current, { zoomControl: true }).setView([-23.4, -51.9], 6)
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa.current)
        camada.current = L.layerGroup().addTo(mapa.current)
      }
      const grupo = camada.current!
      grupo.clearLayers()
      if (linha && marcadores.length > 1) {
        L.polyline(
          marcadores.map((m) => [m.lat, m.lng] as [number, number]),
          { color: '#3b82f6', weight: 4, opacity: 0.8 },
        ).addTo(grupo)
      }
      for (const m of marcadores) {
        L.circleMarker([m.lat, m.lng], { radius: m.raio ?? (m.destaque ? 9 : 6), color: '#000', weight: 2, fillColor: m.cor, fillOpacity: 1 })
          .bindTooltip(esc(m.texto).replace(/\n/g, '<br>'))
          .addTo(grupo)
      }
      if (marcadores.length === 1) mapa.current.setView([marcadores[0].lat, marcadores[0].lng], 13)
      else if (marcadores.length > 1) mapa.current.fitBounds(L.latLngBounds(marcadores.map((m) => [m.lat, m.lng] as [number, number])), { padding: [30, 30], maxZoom: 14 })
    })()
    return () => {
      cancelado = true
    }
  }, [marcadores, linha])

  useEffect(
    () => () => {
      mapa.current?.remove()
      mapa.current = null
    },
    [],
  )

  return <div ref={div} className="mapa-gps w-full rounded-2xl overflow-hidden border border-white/[0.06] z-0" style={{ height: altura }} />
}
