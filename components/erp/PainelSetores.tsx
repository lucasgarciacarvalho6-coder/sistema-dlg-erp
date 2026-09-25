'use client'

import Link from 'next/link'
import type { ErpState, Setor } from '@/lib/erp/types'
import { SETORES, SETORES_PRODUTIVOS } from '@/lib/erp/config'
import { diaReferencia, equipe, metaColaborador, progresso, resumo, serieMes, somar } from '@/lib/erp/metrics'
import { diasNoMes, formatar, iniciais, mesAtual, pct } from '@/lib/erp/format'
import { Avatar, BarChart, Legenda, Panel, ProgressBar, TONS } from './ui'

// Cartões por setor: indicador principal hoje e no mês + minigráfico diário
export function GradeSetores({ s, mes, tv = false }: { s: ErpState; mes: string; tv?: boolean }) {
  const limite = mes === mesAtual() ? diaReferencia(mes) : undefined
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {SETORES_PRODUTIVOS.map((setor) => {
        const cfg = SETORES[setor]
        const ind = cfg.indicadores[0]
        const r = resumo(s, setor, ind.id, mes)
        const t = TONS[cfg.tom]
        return (
          <Link
            key={setor}
            href={cfg.home}
            className={`bg-[#050505]/80 backdrop-blur-xl border ${t.borda} rounded-3xl p-6 relative overflow-hidden group hover:-translate-y-1 transition-all`}
          >
            <div className={`absolute top-0 left-0 w-full h-1 ${t.solido} opacity-70 ${t.brilho}`}></div>
            <div className={`absolute -bottom-12 -right-12 w-40 h-40 ${t.suave} blur-3xl rounded-full`}></div>
            <div className="flex justify-between items-start relative z-10">
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${t.texto}`}>{cfg.nome}</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">{ind.label}</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 group-hover:text-white transition-colors">Abrir →</span>
            </div>
            <div className="flex items-end justify-between mt-4 relative z-10">
              <p className={`${tv ? 'text-6xl' : 'text-5xl'} font-black text-white tracking-tighter`}>{formatar(r.mes, ind.unidade)}</p>
              <div className="text-right">
                <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Hoje</p>
                <p className="text-lg font-black text-white">
                  {formatar(r.hoje, ind.unidade)} <span className="text-[10px] text-zinc-500">/ {formatar(r.meta.diaria, ind.unidade)}</span>
                </p>
              </div>
            </div>
            <div className="mt-4 relative z-10 space-y-2">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                <span className="text-zinc-500">Meta mensal {formatar(r.meta.mensal, ind.unidade)}</span>
                <span className={r.pctMes >= 100 ? 'text-emerald-400' : t.texto}>{pct(r.pctMes)}</span>
              </div>
              <ProgressBar valor={r.pctMes} tom={cfg.tom} />
            </div>
            <div className="mt-5 relative z-10">
              <BarChart valores={serieMes(s.lancamentos, { setor, indicador: ind.id }, mes)} meta={r.meta.diaria} tom={cfg.tom} altura="h-16" compacto limite={limite} formatar={(v) => formatar(v, ind.unidade)} />
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// Gráfico consolidado: % da meta diária atingida por cada setor, dia a dia
export function GraficoConsolidado({ s, mes, altura = 'h-72' }: { s: ErpState; mes: string; altura?: string }) {
  const dias = diasNoMes(mes)
  const limite = mes === mesAtual() ? diaReferencia(mes) : dias
  const series = SETORES_PRODUTIVOS.map((setor) => {
    const ind = SETORES[setor].indicadores[0]
    const meta = resumo(s, setor, ind.id, mes).meta.diaria
    return { setor, valores: serieMes(s.lancamentos, { setor, indicador: ind.id }, mes).map((v) => progresso(v, meta)) }
  })
  const max = Math.max(120, ...series.flatMap((x) => x.valores)) * 1.05

  return (
    <Panel
      titulo="Produção de todas as áreas • % da meta diária"
      subtitulo="Cada barra é um setor • linha tracejada = 100% da meta"
      acoes={<Legenda itens={SETORES_PRODUTIVOS.map((x) => ({ label: SETORES[x].nome, tom: SETORES[x].tom }))} />}
    >
      <div className={`${altura} w-full flex flex-col pt-4`}>
        <div className="flex-1 relative flex items-end gap-1 sm:gap-1.5">
          <div className="absolute left-0 w-full border-t border-dashed border-white/[0.2] z-0" style={{ bottom: `${(100 / max) * 100}%` }}>
            <span className="absolute -top-3 left-0 text-[9px] text-zinc-400 font-bold tracking-widest bg-[#0a0a0a] px-2 rounded uppercase">100% da meta</span>
          </div>
          {Array.from({ length: dias }, (_, i) => (
            <div key={i} className="flex-1 h-full flex items-end gap-[1px] relative group z-10 min-w-0">
              {i < limite ? (
                <>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-black text-[10px] font-bold px-3 py-2 rounded absolute bottom-full mb-1 left-1/2 -translate-x-1/2 pointer-events-none shadow-xl z-30 whitespace-nowrap space-y-0.5">
                    <p className="font-black">Dia {i + 1}</p>
                    {series.map((x) => (
                      <p key={x.setor}>{SETORES[x.setor].nome}: {pct(x.valores[i])}</p>
                    ))}
                  </div>
                  {series.map((x) => (
                    <div key={x.setor} className={`flex-1 rounded-t-sm ${TONS[SETORES[x.setor].tom].solido} opacity-80 group-hover:opacity-100 transition-all`} style={{ height: `${Math.min(100, (x.valores[i] / max) * 100)}%` }}></div>
                  ))}
                </>
              ) : (
                <div className="w-full h-1.5 bg-white/[0.05] rounded-t-md opacity-40"></div>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-1 sm:gap-1.5 mt-2">
          {Array.from({ length: dias }, (_, i) => (
            <span key={i} className={`flex-1 text-center text-[9px] font-bold min-w-0 ${i < limite ? 'text-zinc-500' : 'text-zinc-700'}`}>{i + 1}</span>
          ))}
        </div>
      </div>
    </Panel>
  )
}

// Ranking geral de colaboradores por % da meta mensal
export function RankingGeral({ s, mes, limite = 10 }: { s: ErpState; mes: string; limite?: number }) {
  const linhas = SETORES_PRODUTIVOS.flatMap((setor) => {
    const ind = SETORES[setor].indicadores[0]
    return equipe(s, setor).map((c) => {
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
            <span className={`w-6 text-sm font-black ${i < 3 ? 'text-yellow-400' : 'text-zinc-600'}`}>{i + 1}</span>
            <Avatar texto={iniciais(l.c.nome)} foto={l.c.foto} />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center gap-2">
                <p className="text-sm font-bold text-white truncate">{l.c.nome}</p>
                <span className={`text-xs font-black ${l.pct >= 100 ? 'text-emerald-400' : 'text-white'}`}>{pct(l.pct)}</span>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <span className={`text-[9px] font-bold uppercase tracking-widest w-20 shrink-0 ${TONS[SETORES[l.setor as Setor].tom].texto}`}>{SETORES[l.setor].nome}</span>
                <ProgressBar valor={l.pct} tom={SETORES[l.setor].tom} altura="h-1" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
