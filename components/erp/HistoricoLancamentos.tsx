'use client'

import { useMemo, useState } from 'react'
import type { Setor } from '@/lib/erp/types'
import { SETORES } from '@/lib/erp/config'
import { excluirLancamento, useErp, usePode } from '@/lib/erp/store'
import { mesesDisponiveis, equipe } from '@/lib/erp/metrics'
import { dataBR, formatar, mesAtual, nomeMes } from '@/lib/erp/format'
import { exportarCSV } from '@/lib/erp/export'
import Icon from './Icon'
import { Badge, EmptyState, PageHeader, Panel, btnSecundario } from './ui'

const selectCls = 'bg-black/50 border border-white/[0.05] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl px-4 py-2.5 outline-none focus:border-blue-500/50'

// Histórico de produção do setor (tudo que alimenta as metas)
export default function HistoricoLancamentos({ setor }: { setor: Setor }) {
  const s = useErp()
  const podeFazer = usePode()
  const cfg = SETORES[setor]
  const [mes, setMes] = useState(mesAtual())
  const [indicadorId, setIndicadorId] = useState('')
  const [colabId, setColabId] = useState('')

  const linhas = useMemo(
    () =>
      s.lancamentos
        .filter((l) => l.setor === setor && l.data.startsWith(mes) && (!indicadorId || l.indicador === indicadorId) && (!colabId || l.colaboradorId === colabId))
        .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm)),
    [s.lancamentos, setor, mes, indicadorId, colabId],
  )
  const nome = (id: string) => s.colaboradores.find((c) => c.id === id)?.nome ?? 'Setor'
  const ind = (id: string) => cfg.indicadores.find((i) => i.id === id)

  const exportar = () =>
    exportarCSV(
      `historico-${setor}-${mes}`,
      [
        { chave: 'data', label: 'Data' },
        { chave: 'colaborador', label: 'Colaborador' },
        { chave: 'indicador', label: 'Indicador' },
        { chave: 'quantidade', label: 'Quantidade/Valor' },
        { chave: 'descricao', label: 'Descrição' },
        { chave: 'origem', label: 'Origem' },
      ],
      linhas.map((l) => ({ data: dataBR(l.data), colaborador: nome(l.colaboradorId), indicador: ind(l.indicador)?.label, quantidade: l.quantidade, descricao: l.descricao, origem: l.origem })),
    )

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader modulo={`Módulo / ${cfg.nome}`} titulo={`Histórico • ${cfg.nome}`} descricao="Todos os lançamentos de produção do setor. Cada registro alimenta as metas e o painel do ADM." />
      <Panel
        semPadding
        titulo={`${linhas.length} lançamento(s)`}
        acoes={
          <>
            <select value={mes} onChange={(e) => setMes(e.target.value)} className={selectCls}>
              {mesesDisponiveis(s).map((m) => (
                <option key={m} value={m}>{nomeMes(m)}</option>
              ))}
            </select>
            <select value={indicadorId} onChange={(e) => setIndicadorId(e.target.value)} className={selectCls}>
              <option value="">Todos indicadores</option>
              {cfg.indicadores.map((i) => (
                <option key={i.id} value={i.id}>{i.label}</option>
              ))}
            </select>
            <select value={colabId} onChange={(e) => setColabId(e.target.value)} className={selectCls}>
              <option value="">Toda a equipe</option>
              {equipe(s, setor).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            {podeFazer(setor, 'exportar') && (
              <button onClick={exportar} className={btnSecundario}>
                <Icon nome="download" className="w-4 h-4" /> CSV
              </button>
            )}
          </>
        }
      >
        {linhas.length === 0 ? (
          <EmptyState titulo="Sem lançamentos" descricao="Nenhum registro para os filtros selecionados." />
        ) : (
          <div className="overflow-x-auto custom-scrollbar max-h-[65vh]">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.2em] bg-[#0a0a0a] text-zinc-500 border-b border-white/[0.05] sticky top-0">
                <tr>
                  <th className="px-6 py-4 font-bold">Data</th>
                  <th className="px-6 py-4 font-bold">Colaborador</th>
                  <th className="px-6 py-4 font-bold">Indicador</th>
                  <th className="px-6 py-4 font-bold text-right">Qtd / Valor</th>
                  <th className="px-6 py-4 font-bold">Descrição</th>
                  <th className="px-6 py-4 font-bold">Origem</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {linhas.slice(0, 500).map((l) => (
                  <tr key={l.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3.5"><span className="bg-black/50 border border-white/[0.05] rounded-lg px-3 py-1.5 text-xs">{dataBR(l.data)}</span></td>
                    <td className="px-6 py-3.5 text-white font-bold">{nome(l.colaboradorId)}</td>
                    <td className="px-6 py-3.5 text-zinc-400">{ind(l.indicador)?.label}</td>
                    <td className="px-6 py-3.5 text-right font-black text-blue-400">{formatar(l.quantidade, ind(l.indicador)?.unidade ?? 'qtd')}</td>
                    <td className="px-6 py-3.5 text-zinc-500 text-xs">{l.descricao || '—'}</td>
                    <td className="px-6 py-3.5"><Badge texto={l.origem === 'manual' ? 'Manual' : 'Automático'} tom={l.origem === 'manual' ? 'zinc' : 'blue'} /></td>
                    <td className="px-6 py-3.5 text-right">
                      {podeFazer(setor, 'excluir') && (
                        <button onClick={() => excluirLancamento(l.id)} title="Excluir lançamento" className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                          <Icon nome="trash" className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
