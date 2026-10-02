'use client'

import type { ErpState, Setor } from '@/lib/erp/types'
import { SETORES, SETORES_PRODUTIVOS } from '@/lib/erp/config'
import { equipeComMeta, metaColaborador, progresso, somar } from '@/lib/erp/metrics'
import { iniciais, pct } from '@/lib/erp/format'
import { Avatar, Panel, ProgressBar } from './ui'

// (O placar das áreas e a evolução do mês ficam em VisaoTV.tsx)

// Ranking geral de colaboradores por % da meta mensal
export function RankingGeral({ s, mes, limite = 10 }: { s: ErpState; mes: string; limite?: number }) {
  const linhas = SETORES_PRODUTIVOS.flatMap((setor) => {
    const ind = SETORES[setor].indicadores[0]
    return equipeComMeta(s, setor, mes).map((c) => {
      const valor = somar(s.lancamentos, { setor, indicador: ind.id, colaboradorId: c.id, mes })
      return { c, setor, ind, valor, pct: progresso(valor, metaColaborador(c, ind.id).mensal) }
    })
  })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limite)

  return (
    <Panel titulo="Ranking de desempenho" subtitulo="% da meta mensal • todas as áreas" semPadding>
      <div className="divide-y divide-white/[0.03]">
        {linhas.map((l, i) => (
          <div key={l.c.id} className="px-6 py-3.5 flex items-center gap-4">
            <span className={`w-6 text-sm font-black ${i < 3 ? 'text-white' : 'text-zinc-600'}`}>{i + 1}</span>
            <Avatar texto={iniciais(l.c.nome)} foto={l.c.foto} />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center gap-2">
                <p className="text-sm font-bold text-white truncate">{l.c.nome}</p>
                <span className={`text-xs font-black ${l.pct >= 100 ? 'text-emerald-400' : 'text-white'}`}>{pct(l.pct)}</span>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[9px] font-bold uppercase tracking-widest w-20 shrink-0 text-zinc-500">{SETORES[l.setor as Setor].nome}</span>
                <ProgressBar valor={l.pct} altura="h-1" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
