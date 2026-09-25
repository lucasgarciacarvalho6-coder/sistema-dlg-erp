'use client'

import { useState } from 'react'
import { useErp } from '@/lib/erp/store'
import { diaReferencia, fluxoCaixa, mesesDisponiveis } from '@/lib/erp/metrics'
import { brl, mesAtual, nomeMes } from '@/lib/erp/format'
import { BarChart, Legenda, PageHeader, Panel, StatCard } from '@/components/erp/ui'

export default function FluxoCaixaPage() {
  const s = useErp()
  const [mes, setMes] = useState(mesAtual())
  const f = fluxoCaixa(s, mes)
  const limite = mes === mesAtual() ? diaReferencia(mes) : undefined
  const saldos = f.entradas.reduce<number[]>((acc, e, i) => [...acc, (acc[i - 1] ?? 0) + e - f.saidas[i]], [])
  const linhas = f.entradas
    .map((e, i) => ({ dia: i + 1, entrada: e, saida: f.saidas[i], saldo: saldos[i] }))
    .filter((l) => l.entrada || l.saida)

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Financeiro / Fluxo de Caixa"
        titulo="Fluxo de Caixa"
        descricao="Entradas (recebimentos da Cobrança) e saídas (contas e comissões pagas), dia a dia."
        acoes={
          <select value={mes} onChange={(e) => setMes(e.target.value)} className="bg-black/50 border border-white/[0.05] text-white text-xs font-bold uppercase tracking-widest rounded-xl px-4 py-3.5 outline-none focus:border-blue-500/50 appearance-none">
            {mesesDisponiveis(s).map((m) => (
              <option key={m} value={m}>{nomeMes(m)}</option>
            ))}
          </select>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard destaque tom="emerald" label="Entradas" valor={brl(f.totalEntradas)} />
        <StatCard tom="red" label="Saídas" valor={brl(f.totalSaidas)} />
        <StatCard tom={f.saldo >= 0 ? 'blue' : 'red'} label="Saldo do período" valor={brl(f.saldo)} />
      </div>

      <Panel titulo="Entradas x Saídas" subtitulo={nomeMes(mes)} acoes={<Legenda itens={[{ label: 'Entradas', tom: 'emerald' }, { label: 'Saídas', tom: 'red' }]} />}>
        <BarChart valores={f.entradas} tom="emerald" altura="h-56" limite={limite} formatar={brl} />
        <div className="mt-4">
          <BarChart valores={f.saidas} tom="red" altura="h-32" limite={limite} formatar={brl} compacto />
        </div>
      </Panel>

      <Panel titulo="Movimentação diária" semPadding>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
              <tr>
                <th className="px-6 py-4 font-bold">Dia</th>
                <th className="px-6 py-4 font-bold text-right">Entradas</th>
                <th className="px-6 py-4 font-bold text-right">Saídas</th>
                <th className="px-6 py-4 font-bold text-right">Saldo acumulado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.02]">
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-xs text-zinc-500">Sem movimentação no período.</td>
                </tr>
              )}
              {linhas.map((l) => (
                <tr key={l.dia} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-3.5 text-white font-bold">{String(l.dia).padStart(2, '0')}/{mes.slice(5, 7)}</td>
                  <td className="px-6 py-3.5 text-right text-emerald-400 font-bold">{brl(l.entrada)}</td>
                  <td className="px-6 py-3.5 text-right text-red-400 font-bold">{brl(l.saida)}</td>
                  <td className={`px-6 py-3.5 text-right font-black ${l.saldo >= 0 ? 'text-white' : 'text-red-400'}`}>{brl(l.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
