'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { SETORES, SETORES_PRODUTIVOS } from '@/lib/erp/config'
import { decidirAprovacao, useErp, usePode } from '@/lib/erp/store'
import { colecao, equipe, mesesDisponiveis, resumo } from '@/lib/erp/metrics'
import { brl, formatar, iniciais, mesAtual, nomeMes, pct } from '@/lib/erp/format'
import { GradeSetores, GraficoConsolidado, RankingGeral } from '@/components/erp/PainelSetores'
import { Avatar, Badge, PageHeader, Panel, ProgressBar, StatCard, TONS } from '@/components/erp/ui'

export default function GerenciaDashboardPage() {
  const s = useErp()
  const podeFazer = usePode()
  const [mes, setMes] = useState(mesAtual())

  // Metas diárias de cada colaborador de todas as equipes
  const linhas = useMemo(
    () =>
      SETORES_PRODUTIVOS.filter((x) => x !== 'gerencia').flatMap((setor) => {
        const ind = SETORES[setor].indicadores[0]
        return equipe(s, setor).map((c) => ({ c, setor, ind, r: resumo(s, setor, ind.id, mes, c.id) }))
      }),
    [s, mes],
  )
  const bateramHoje = linhas.filter((l) => l.r.pctDia >= 100).length
  const setoresNoRitmo = SETORES_PRODUTIVOS.filter((x) => {
    const r = resumo(s, x, SETORES[x].indicadores[0].id, mes)
    return r.projecao >= r.meta.mensal
  }).length
  const pendentes = colecao(s, 'aprovacoes').filter((a) => a.status === 'Pendente')
  const aprov = resumo(s, 'gerencia', 'aprovacoes', mes)

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Gerência / Dashboard Tático"
        titulo="Painel Tático das Equipes"
        descricao="Acompanhamento em tempo real das metas diárias e mensais de todas as áreas."
        acoes={
          <select value={mes} onChange={(e) => setMes(e.target.value)} className="bg-black/50 border border-white/[0.05] text-white text-xs font-bold uppercase tracking-widest rounded-xl px-4 py-3.5 outline-none focus:border-blue-500/50 appearance-none">
            {mesesDisponiveis(s).map((m) => (
              <option key={m} value={m}>{nomeMes(m)}</option>
            ))}
          </select>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard destaque tom="blue" label="Bateram a meta hoje" valor={`${bateramHoje}/${linhas.length}`} detalhe="Colaboradores de todas as áreas" progresso={(bateramHoje / (linhas.length || 1)) * 100} />
        <StatCard tom="emerald" label="Setores no ritmo da meta" valor={`${setoresNoRitmo}/${SETORES_PRODUTIVOS.length}`} detalhe="Projeção ≥ meta mensal" />
        <StatCard tom="yellow" label="Aprovações pendentes" valor={pendentes.length} detalhe={`${pct(aprov.pctMes)} da meta de análises do mês`} />
        <StatCard tom="orange" label="Valor pendente de aprovação" valor={brl(pendentes.reduce((a, p) => a + Number(p.valor || 0), 0))} />
      </div>

      <GraficoConsolidado s={s} mes={mes} />
      <GradeSetores s={s} mes={mes} />

      <Panel titulo="Metas diárias por colaborador" subtitulo="Indicador principal de cada área • hoje e no mês" semPadding>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
              <tr>
                <th className="px-6 py-4 font-bold">Colaborador</th>
                <th className="px-6 py-4 font-bold">Área</th>
                <th className="px-6 py-4 font-bold">Hoje / Meta diária</th>
                <th className="px-6 py-4 font-bold min-w-[220px]">Mês / Meta mensal</th>
                <th className="px-6 py-4 font-bold text-right">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.02]">
              {linhas.map(({ c, setor, ind, r }) => (
                <tr key={c.id} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar texto={iniciais(c.nome)} foto={c.foto} />
                      <div>
                        <p className="text-white font-bold">{c.nome}</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{ind.label}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5"><span className={`text-[10px] font-bold uppercase tracking-widest ${TONS[SETORES[setor].tom].texto}`}>{SETORES[setor].nome}</span></td>
                  <td className="px-6 py-3.5 font-black text-white whitespace-nowrap">
                    {formatar(r.hoje, ind.unidade)} <span className="text-zinc-500 text-xs">/ {formatar(r.meta.diaria, ind.unidade)}</span>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <ProgressBar valor={r.pctMes} tom={SETORES[setor].tom} />
                      <span className="text-xs font-bold text-zinc-300 whitespace-nowrap">{formatar(r.mes, ind.unidade)} • {pct(r.pctMes)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    {r.pctDia >= 100 ? <Badge texto="Meta do dia ok" tom="emerald" /> : r.projecao >= r.meta.mensal ? <Badge texto="No ritmo" tom="blue" /> : <Badge texto="Abaixo" tom="orange" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <RankingGeral s={s} mes={mes} />
        <Panel titulo="Aprovações pendentes" subtitulo="Decida direto do painel" semPadding acoes={<Link href="/gerencia/aprovacoes" className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">Ver todas →</Link>}>
          {pendentes.length === 0 ? (
            <p className="p-6 text-xs text-zinc-500">Nenhuma aprovação pendente.</p>
          ) : (
            <div className="divide-y divide-white/[0.03]">
              {pendentes.slice(0, 6).map((a) => (
                <div key={a.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{String(a.tipo)}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{String(a.descricao)} • {String(a.solicitante)}</p>
                    <p className="text-xs font-black text-yellow-400 mt-1">{brl(Number(a.valor))}</p>
                  </div>
                  {podeFazer('gerencia', 'editar') && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => decidirAprovacao(a.id, true)} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border text-emerald-400 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20">Aprovar</button>
                      <button onClick={() => decidirAprovacao(a.id, false)} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border text-red-400 border-red-500/20 bg-red-500/10 hover:bg-red-500/20">Rejeitar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
