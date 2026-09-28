'use client'

import type { Setor } from '@/lib/erp/types'
import { SETORES } from '@/lib/erp/config'
import { useErp } from '@/lib/erp/store'
import { diaReferencia, equipeComMeta, resumo, serieMes } from '@/lib/erp/metrics'
import { formatar, iniciais, mesAtual, pct } from '@/lib/erp/format'
import { Avatar, BarChart, Badge, EmptyState, ProgressBar, TONS } from './ui'

// Um cartão por colaborador: meta diária (hoje), meta mensal e gráfico diário do mês.
export default function TeamGoalCards({ setor, mes }: { setor: Setor; mes: string }) {
  const s = useErp()
  const time = equipeComMeta(s, setor, mes) // quem está "Sem meta" não tem cartão
  const indicadores = SETORES[setor].indicadores
  const limite = mes === mesAtual() ? diaReferencia(mes) : undefined

  if (time.length === 0) return <EmptyState titulo="Sem colaboradores com meta" descricao="Cadastre a equipe em Colaboradores e defina as metas em Metas." />

  const ranking = time
    .map((c) => ({ c, pct: resumo(s, setor, indicadores[0].id, mes, c.id).pctMes }))
    .sort((a, b) => b.pct - a.pct)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {ranking.map(({ c }, pos) => (
        <div key={c.id} className="bg-painel-2/80 border border-white/[0.05] rounded-3xl p-6 relative overflow-hidden hover:border-white/[0.1] transition-all">
          <div className="absolute -top-16 -right-16 w-40 h-40 bg-blue-600/10 brilho scale-150 rounded-full pointer-events-none"></div>
          <div className="flex items-center justify-between gap-4 mb-5 relative z-10">
            <div className="flex items-center gap-4 min-w-0">
              <Avatar texto={iniciais(c.nome)} foto={c.foto} tamanho="w-11 h-11" />
              <div className="min-w-0">
                <p className="text-base font-black text-white truncate">{c.nome}</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">{c.funcao}</p>
              </div>
            </div>
            <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${pos === 0 ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' : 'text-zinc-400 border-white/[0.1] bg-white/[0.03]'}`}>
              #{pos + 1}
            </span>
          </div>

          <div className="space-y-5 relative z-10">
            {indicadores.map((ind, idx) => {
              const r = resumo(s, setor, ind.id, mes, c.id)
              const serie = serieMes(s.lancamentos, { setor, indicador: ind.id, colaboradorId: c.id }, mes)
              const tom = idx === 0 ? 'blue' : 'violet'
              return (
                <div key={ind.id} className="bg-black/40 border border-white/[0.05] rounded-2xl p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${TONS[tom].texto}`}>{ind.label}</span>
                    {r.pctDia >= 100 && mes === mesAtual() && <Badge texto="Meta do dia batida" tom="emerald" />}
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Hoje / Meta diária</p>
                      <p className="text-xl font-black text-white mt-1">
                        {formatar(r.hoje, ind.unidade)} <span className="text-xs text-zinc-500 font-bold">/ {formatar(r.meta.diaria, ind.unidade)}</span>
                      </p>
                      <div className="mt-2"><ProgressBar valor={r.pctDia} tom={tom} /></div>
                    </div>
                    <div>
                      <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Mês / Meta mensal</p>
                      <p className="text-xl font-black text-white mt-1">
                        {formatar(r.mes, ind.unidade)} <span className="text-xs text-zinc-500 font-bold">/ {formatar(r.meta.mensal, ind.unidade)}</span>
                      </p>
                      <div className="mt-2"><ProgressBar valor={r.pctMes} tom={tom} /></div>
                    </div>
                  </div>
                  <BarChart valores={serie} meta={r.meta.diaria} tom={tom} altura="h-20" compacto limite={limite} formatar={(v) => formatar(v, ind.unidade)} />
                  <div className="flex justify-between mt-2 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                    <span>{pct(r.pctMes)} da meta mensal</span>
                    <span>Projeção: {formatar(r.projecao, ind.unidade)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
