'use client'

// Operacional › GPS dos vendedores externos (só monitoramento).
// A localização é registrada enquanto o app do vendedor está aberto: ao abrir, a cada ~3 min e em cada ação.

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type { Registro } from '@/lib/erp/types'
import { buscarRotaDoDia, buscarUltimasLocalizacoes, useErp, type PontoGps } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { dataBR, hoje, iniciais } from '@/lib/erp/format'
import type { MarcadorMapa } from '@/components/erp/MapaGps'
import { Avatar, EmptyState, PageHeader, Panel, StatCard, inputCls } from '@/components/erp/ui'

const MapaGps = dynamic(() => import('@/components/erp/MapaGps'), { ssr: false, loading: () => <div className="h-[420px] rounded-2xl bg-white/[0.02] animate-pulse" /> })

type Ultimo = PontoGps & { pontosHoje: number }

const COR = { abertura: '#10b981', periodico: '#3b82f6', acao: '#f59e0b' }
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function haQuanto(iso: string, agora: number) {
  const min = Math.round((agora - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  return `em ${dataBR(iso.slice(0, 10))} às ${hora(iso)}`
}

// Cidade do ponto (OpenStreetMap/Nominatim, gratuito). Guardada no navegador para não repetir a consulta.
const CHAVE_CIDADES = 'dlg-erp:cidades-gps'
function lerCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CIDADES) ?? '{}')
  } catch {
    return {}
  }
}
const chaveCoord = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`

export default function GpsVendedoresPage() {
  const s = useErp()
  const [ultimos, setUltimos] = useState<Ultimo[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [dia, setDia] = useState(hoje())
  const [rota, setRota] = useState<PontoGps[]>([])
  const [cidades, setCidades] = useState<Record<string, string>>({})
  const [agora, setAgora] = useState(() => Date.now()) // relógio da tela (atualiza a cada minuto)

  // últimas posições: carrega e atualiza a cada minuto
  useEffect(() => {
    let vivo = true
    const carregar = () =>
      buscarUltimasLocalizacoes().then((r) => {
        if (!vivo) return
        setUltimos(r)
        setAgora(Date.now())
      })
    carregar()
    const t = setInterval(carregar, 60_000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    if (!sel) return
    let vivo = true
    buscarRotaDoDia(sel, dia).then((r) => vivo && setRota(r))
    return () => {
      vivo = false
    }
  }, [sel, dia])

  // nome da cidade de cada último ponto (1 consulta por segundo, com cache)
  useEffect(() => {
    if (!ultimos?.length) return
    let vivo = true
    const cache = lerCache()
    const faltam = ultimos.filter((u) => !cache[chaveCoord(u.lat, u.lng)])
    const t0 = setTimeout(() => vivo && setCidades({ ...cache }), 0)
    void (async () => {
      for (const u of faltam) {
        const k = chaveCoord(u.lat, u.lng)
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=pt-BR&lat=${u.lat}&lon=${u.lng}`)
          const j = (await r.json()) as { address?: Record<string, string> }
          const a = j.address ?? {}
          const nome = a.city || a.town || a.village || a.municipality || ''
          const uf = (a['ISO3166-2-lvl4'] ?? '').replace('BR-', '')
          if (nome) cache[k] = uf ? `${nome}-${uf}` : nome
          localStorage.setItem(CHAVE_CIDADES, JSON.stringify(cache))
          if (vivo) setCidades({ ...cache })
        } catch {
          // sem internet ou limite do serviço: fica só a coordenada
        }
        await new Promise((ok) => setTimeout(ok, 1100))
      }
    })()
    return () => {
      vivo = false
      clearTimeout(t0)
    }
  }, [ultimos])

  const vendedores = colecao(s, 'pj_vendedores').filter((v) => v.usuarioId || ultimos?.some((u) => u.vendedorId === v.id))
  const ultimoDe = (v: Registro) => ultimos?.find((u) => u.vendedorId === v.id)
  const ativoAgora = (u?: Ultimo) => !!u && agora - new Date(u.criadoEm).getTime() < 15 * 60_000
  const vendSel = vendedores.find((v) => v.id === sel)

  const marcadoresGerais: MarcadorMapa[] = useMemo(
    () =>
      (ultimos ?? []).map((u) => {
        const v = colecao(s, 'pj_vendedores').find((x) => x.id === u.vendedorId)
        return { lat: u.lat, lng: u.lng, cor: agora - new Date(u.criadoEm).getTime() < 15 * 60_000 ? '#10b981' : '#71717a', texto: `${v?.nome ?? 'Vendedor'}\n${haQuanto(u.criadoEm, agora)}`, destaque: true }
      }),
    [ultimos, s, agora],
  )
  const marcadoresRota: MarcadorMapa[] = useMemo(
    () => rota.map((p, i) => ({ lat: p.lat, lng: p.lng, cor: COR[p.origem], destaque: i === rota.length - 1 || p.origem === 'acao', texto: `${hora(p.criadoEm)}${p.descricao ? ` • ${p.descricao}` : ''}\nprecisão ~${Math.round(p.precisao)} m` })),
    [rota],
  )

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Módulo / Operações"
        titulo="GPS dos Vendedores"
        descricao="Por onde os vendedores externos passaram. A localização é registrada enquanto o app está aberto no celular (ao abrir, a cada ~3 min e em cada contrato, venda ou documento). Histórico de 90 dias."
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Vendedores com app" valor={vendedores.length} />
        <StatCard label="Ativos agora" valor={vendedores.filter((v) => ativoAgora(ultimoDe(v))).length} detalhe="app aberto nos últimos 15 min" />
        <StatCard label="Registraram hoje" valor={(ultimos ?? []).filter((u) => u.pontosHoje > 0).length} />
        <StatCard tom={vendedores.some((v) => !ultimoDe(v)) ? 'yellow' : 'zinc'} label="Sem registro" valor={vendedores.filter((v) => !ultimoDe(v)).length} detalhe="ainda não abriram o app" />
      </div>

      {ultimos === null ? (
        <div className="h-40 rounded-3xl bg-white/[0.02] animate-pulse" />
      ) : vendedores.length === 0 ? (
        <EmptyState titulo="Nenhum vendedor com app" descricao="Crie o acesso dos vendedores em ADM › Vendedores externos." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vendedores.map((v) => {
            const u = ultimoDe(v)
            const ativo = ativoAgora(u)
            return (
              <button
                key={v.id}
                onClick={() => setSel(sel === v.id ? null : v.id)}
                className={`text-left bg-painel-2/80 border rounded-3xl p-5 space-y-3 transition-all hover:-translate-y-0.5 ${sel === v.id ? 'border-blue-500/60' : 'border-white/[0.06] hover:border-white/[0.15]'}`}
              >
                <div className="flex items-center gap-3">
                  <Avatar texto={iniciais(String(v.nome))} tamanho="w-11 h-11" arredondado="rounded-2xl" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-white truncate">{String(v.nome)}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{v.tipo === 'Books' ? 'Vendedor de books' : 'Vendedor de contrato'}</p>
                  </div>
                  <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${ativo ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    <span className={`w-2 h-2 rounded-full ${ativo ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`}></span>
                    {ativo ? 'Ativo' : 'Offline'}
                  </span>
                </div>
                {u ? (
                  <div className="text-xs space-y-1">
                    <p className="text-white font-bold">📍 {cidades[chaveCoord(u.lat, u.lng)] ?? `${u.lat.toFixed(4)}, ${u.lng.toFixed(4)}`}</p>
                    <p className="text-zinc-400">
                      Último registro {haQuanto(u.criadoEm, agora)} • {u.pontosHoje} ponto(s) hoje
                    </p>
                    {u.descricao && <p className="text-yellow-400 truncate">⚑ {u.descricao}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-yellow-400 font-bold">Ainda não abriu o app.</p>
                )}
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">{sel === v.id ? 'Fechar rota ▲' : 'Ver rota ▼'}</p>
              </button>
            )
          })}
        </div>
      )}

      {vendSel ? (
        <Panel
          titulo={`Rota de ${vendSel.nome}`}
          subtitulo={`${dataBR(dia)} • ${rota.length} ponto(s)`}
          acoes={<input type="date" value={dia} max={hoje()} onChange={(e) => setDia(e.target.value || hoje())} className={`${inputCls} py-2`} />}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COR.abertura }}></span> Abriu o app</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COR.periodico }}></span> Registro automático</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COR.acao }}></span> Contrato / venda / documento</span>
            </div>
            {rota.length ? <MapaGps marcadores={marcadoresRota} linha altura={460} /> : <EmptyState titulo="Sem registros neste dia" descricao="O vendedor não abriu o app nessa data. Escolha outro dia." />}
            {rota.length > 0 && (
              <div className="max-h-64 overflow-y-auto custom-scrollbar divide-y divide-white/[0.03] border border-white/[0.05] rounded-2xl">
                {[...rota].reverse().map((p) => (
                  <div key={p.criadoEm} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COR[p.origem] }}></span>
                    <span className="font-mono font-bold text-white w-12">{hora(p.criadoEm)}</span>
                    <span className="text-zinc-400 flex-1 truncate">{p.descricao || (p.origem === 'abertura' ? 'Abriu o app' : 'Registro automático')}</span>
                    <a href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=16/${p.lat}/${p.lng}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 font-mono">
                      {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      ) : (
        (ultimos?.length ?? 0) > 0 && (
          <Panel titulo="Última posição de cada vendedor" subtitulo="Verde = app aberto nos últimos 15 minutos • clique num card para ver a rota do dia">
            <MapaGps marcadores={marcadoresGerais} altura={460} />
          </Panel>
        )
      )}
    </div>
  )
}
