'use client'

// GERENTE VIRTUAL na Visão TV: o que está atrasado ou parado hoje (regras em lib/erp/gerente.ts).
//  • PainelGerente: o quadro no topo da Visão TV (/adm), com cada aviso e o atalho para resolver.
//  • FaixaGerente: uma linha na tela cheia e no modo TV, passando os avisos um por vez.
// Cores só de alerta: vermelho = atrasado/parado, amarelo = atenção, verde = tudo em dia.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { ErpState } from '@/lib/erp/types'
import { carregarAtividadeEquipe } from '@/lib/erp/store'
import { alertasGerente, atividadeDaAuditoria, juntarAtividade, type AlertaGerente, type AtividadeEquipe } from '@/lib/erp/gerente'
import { dataHoraBR, hoje, num } from '@/lib/erp/format'
import { STATUS } from './status'

const COR = { critico: STATUS.critico.cor, atencao: STATUS.atencao.cor }
const ROTULO = { critico: 'Crítico', atencao: 'Atenção' }

// alertas de agora (a atividade do banco é buscada de novo a cada 2 minutos)
export function useAlertasGerente(s: ErpState): AlertaGerente[] {
  const [banco, setBanco] = useState<AtividadeEquipe | null>(null)
  useEffect(() => {
    let vivo = true
    const buscar = () =>
      void carregarAtividadeEquipe().then((a) => {
        if (vivo) setBanco(a)
      })
    buscar()
    const t = setInterval(buscar, 120_000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [])
  const hj = hoje()
  return useMemo(() => alertasGerente(s, juntarAtividade(banco, atividadeDaAuditoria(s)), hj), [s, banco, hj])
}

function Contagem({ alertas, grande = false }: { alertas: AlertaGerente[]; grande?: boolean }) {
  const criticos = alertas.filter((a) => a.nivel === 'critico').length
  const atencao = alertas.length - criticos
  const cls = `inline-flex items-center gap-1.5 font-black whitespace-nowrap ${grande ? 'text-sm' : 'text-[11px]'}`
  return (
    <span className="flex items-center gap-3">
      {criticos > 0 && (
        <span className={cls} style={{ color: COR.critico }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COR.critico }}></span>
          {num(criticos)}
        </span>
      )}
      {atencao > 0 && (
        <span className={cls} style={{ color: COR.atencao }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COR.atencao }}></span>
          {num(atencao)}
        </span>
      )}
    </span>
  )
}

function TudoEmDia({ grande = false }: { grande?: boolean }) {
  return (
    <p className={`font-bold ${grande ? 'text-sm' : 'text-xs'}`} style={{ color: STATUS.bom.cor }}>
      ✓ Tudo em dia — nenhum setor parado e nada atrasado.
    </p>
  )
}

// Quadro no topo da Visão TV
export function PainelGerente({ s }: { s: ErpState }) {
  const alertas = useAlertasGerente(s)
  return (
    <div className="bg-painel/80 border border-white/[0.08] rounded-3xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.05] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-white uppercase tracking-widest">Gerente virtual</h2>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">o que está atrasado ou parado hoje • {dataHoraBR(new Date().toISOString())}</p>
        </div>
        <Contagem alertas={alertas} grande />
      </div>
      {alertas.length === 0 ? (
        <div className="px-6 py-5">
          <TudoEmDia grande />
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {alertas.map((a) => (
            <div key={a.id} className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1.5">
              <span className="flex items-center gap-2 shrink-0 sm:w-40">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COR[a.nivel] }}></span>
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: COR[a.nivel] }}>
                  {ROTULO[a.nivel]}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">{a.titulo}</p>
                {a.itens.length > 0 && <p className="text-xs text-zinc-400 mt-0.5 break-words">{a.itens.join(' • ')}</p>}
              </div>
              <span className="flex items-center gap-4 shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{a.area}</span>
                <Link href={a.link} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300 whitespace-nowrap">
                  Abrir ↗
                </Link>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Faixa da tela cheia e do modo TV: um aviso por vez, com tempo para ler na TV
const SEGUNDOS_POR_AVISO = 15
export function FaixaGerente({ s }: { s: ErpState }) {
  const alertas = useAlertasGerente(s)
  const [i, setI] = useState(0)
  useEffect(() => {
    if (alertas.length < 2) return
    const t = setInterval(() => setI((x) => x + 1), SEGUNDOS_POR_AVISO * 1000)
    return () => clearInterval(t)
  }, [alertas.length])
  const a = alertas.length ? alertas[i % alertas.length] : null
  return (
    <div className="shrink-0 flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-painel/80 px-5 py-2.5 min-w-0">
      <span className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 whitespace-nowrap">Gerente virtual</span>
      {a ? (
        <>
          <Contagem alertas={alertas} />
          <div key={a.id} className="flex-1 min-w-0 flex items-center gap-3 animate-fade-in">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COR[a.nivel] }}></span>
            <p className="min-w-0 truncate text-sm">
              <span className="font-black text-white">{a.titulo}</span>
              {a.itens.length > 0 && <span className="text-zinc-400"> — {a.itens.join(' • ')}</span>}
            </p>
          </div>
          {alertas.length > 1 && (
            <span className="text-[10px] font-bold text-zinc-500 whitespace-nowrap">
              {(i % alertas.length) + 1}/{alertas.length}
            </span>
          )}
        </>
      ) : (
        <TudoEmDia />
      )}
    </div>
  )
}
