'use client'

import { useMemo, useState, type ReactNode } from 'react'
import type { Setor } from '@/lib/erp/types'
import { SETORES } from '@/lib/erp/config'
import { useErp, usePode } from '@/lib/erp/store'
import { diaReferencia, mesesDisponiveis, resumo, serieMes } from '@/lib/erp/metrics'
import { dataHoraBR, formatar, mesAtual, nomeMes, pct } from '@/lib/erp/format'
import Icon from './Icon'
import LancamentoModal from './LancamentoModal'
import TeamGoalCards from './TeamGoalCards'
import { BarChart, Legenda, PageHeader, Panel, StatCard, btnBranco } from './ui'

// Dashboard padrão de cada setor: metas diárias/mensais, gráfico do mês,
// desempenho individual da equipe e feed de lançamentos em tempo real.
export default function SectorDashboard({
  setor,
  titulo,
  descricao,
  tituloEquipe = 'Metas individuais da equipe',
  antesDaEquipe,
  depoisDaEquipe,
  registroManual = true,
}: {
  setor: Setor
  titulo: string
  descricao: string
  tituloEquipe?: string
  antesDaEquipe?: ReactNode
  depoisDaEquipe?: ReactNode
  registroManual?: boolean // false: a produção é lançada sozinha pelo fluxo (ex.: vendas do Rebolo)
}) {
  const s = useErp()
  const podeFazer = usePode()
  const [mes, setMes] = useState(mesAtual())
  const [modal, setModal] = useState(false)
  const cfg = SETORES[setor]
  const meses = useMemo(() => mesesDisponiveis(s), [s])
  const limite = mes === mesAtual() ? diaReferencia(mes) : undefined

  const feed = useMemo(
    () =>
      s.lancamentos
        .filter((l) => l.setor === setor)
        .slice(-400)
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm) || b.data.localeCompare(a.data))
        .slice(0, 8),
    [s.lancamentos, setor],
  )

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo={`Módulo / ${cfg.nome}`}
        titulo={titulo}
        descricao={descricao}
        acoes={
          <>
            <select value={mes} onChange={(e) => setMes(e.target.value)} className="bg-black/50 border border-white/[0.05] text-white text-xs font-bold uppercase tracking-widest rounded-xl px-4 py-3.5 outline-none focus:border-blue-500/50 appearance-none shadow-lg">
              {meses.map((m) => (
                <option key={m} value={m}>{nomeMes(m)}</option>
              ))}
            </select>
            {registroManual && podeFazer(setor, 'criar') && (
              <button onClick={() => setModal(true)} className={btnBranco}>
                <Icon nome="plus" className="w-5 h-5" /> Registrar produção
              </button>
            )}
          </>
        }
      />

      {/* KPIs de metas do setor */}
      {cfg.indicadores.map((ind) => {
        const r = resumo(s, setor, ind.id, mes)
        return (
          <div key={ind.id} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
            <StatCard destaque label={`${ind.label} • Mês`} valor={formatar(r.mes, ind.unidade)} detalhe={`Meta mensal: ${formatar(r.meta.mensal, ind.unidade)}`} progresso={r.pctMes} />
            <StatCard label="Hoje vs meta diária" valor={formatar(r.hoje, ind.unidade)} detalhe={`Meta do dia: ${formatar(r.meta.diaria, ind.unidade)} • ${pct(r.pctDia)}`} progresso={r.pctDia} />
            <StatCard label="Projeção do mês" valor={formatar(r.projecao, ind.unidade)} detalhe={`${pct((r.projecao / (r.meta.mensal || 1)) * 100)} da meta • ritmo atual`} />
            <StatCard label="Necessário / dia" valor={formatar(r.necessarioDia, ind.unidade)} detalhe={r.mes >= r.meta.mensal ? 'Meta mensal atingida 🎯' : `Faltam ${formatar(Math.max(0, r.meta.mensal - r.mes), ind.unidade)}`} />
          </div>
        )
      })}

      {/* Gráficos diários */}
      <div className={`grid grid-cols-1 ${cfg.indicadores.length > 1 ? 'xl:grid-cols-2' : ''} gap-6`}>
        {cfg.indicadores.map((ind) => {
          const r = resumo(s, setor, ind.id, mes)
          return (
            <Panel
              key={ind.id}
              titulo={`Desempenho diário • ${ind.label}`}
              subtitulo={nomeMes(mes)}
              acoes={<Legenda itens={[{ label: 'Bateu a meta do dia', tom: 'zinc' }, { label: 'Abaixo da meta', tom: 'yellow' }]} />}
            >
              <BarChart valores={serieMes(s.lancamentos, { setor, indicador: ind.id }, mes)} meta={r.meta.diaria} limite={limite} formatar={(v) => formatar(v, ind.unidade)} />
            </Panel>
          )
        })}
      </div>

      {antesDaEquipe}

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 bg-zinc-500 rounded-full"></span>
          <h2 className="text-sm font-black text-white uppercase tracking-widest">{tituloEquipe}</h2>
        </div>
        <TeamGoalCards setor={setor} mes={mes} />
      </div>

      {depoisDaEquipe}

      <Panel titulo="Últimos lançamentos" subtitulo="Atualiza em tempo real" semPadding>
        {feed.length === 0 ? (
          <p className="p-6 text-xs text-zinc-500">Nenhum lançamento ainda.</p>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {feed.map((l) => {
              const ind = cfg.indicadores.find((i) => i.id === l.indicador)
              return (
                <div key={l.id} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.02]">
                  <div className="min-w-0">
                    <p className="text-sm text-white font-bold truncate">
                      {s.colaboradores.find((c) => c.id === l.colaboradorId)?.nome ?? 'Setor'} <span className="text-zinc-500 font-medium">• {ind?.label}</span>
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">{l.descricao || '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-white">+{formatar(l.quantidade, ind?.unidade ?? 'qtd')}</p>
                    <p className="text-[10px] text-zinc-600 font-mono">{dataHoraBR(l.criadoEm)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      <LancamentoModal setor={setor} aberto={modal} onFechar={() => setModal(false)} />
    </div>
  )
}
