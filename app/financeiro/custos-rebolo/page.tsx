'use client'

// Financeiro › Custo do Rebolo (SQL 037): o salário do holerite de cada vendedora, mês a mês. O sistema soma os encargos
// (35%, na Tabela de Preços do Rebolo) e usa no Lucro/Prejuízo de cada vendedora na Visão TV. Mês sem lançamento usa o
// salário estimado. Só o Financeiro (e ADM/Gerência) vê e lança: as vendedoras não veem os salários.

import { useState } from 'react'
import type { Colaborador } from '@/lib/erp/types'
import { salvarCustoReboloMes, useErp, usePode } from '@/lib/erp/store'
import { colecao, equipe } from '@/lib/erp/metrics'
import { brl, mesAtual, nomeMes } from '@/lib/erp/format'
import { tabelaRebolo } from '@/lib/erp/rebolo'
import { Badge, EmptyState, PageHeader, Panel, StatCard, btnPrimario, btnSecundario } from '@/components/erp/ui'

const selectCls = 'bg-black/50 border border-white/[0.08] rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white outline-none'
const campo = 'w-full bg-black/50 border border-white/[0.05] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 disabled:opacity-70'

// os 12 últimos meses (e os que já têm lançamento)
function mesesDaLista(salvos: string[]) {
  const [a, m] = mesAtual().split('-').map(Number)
  const ultimos = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(a, m - 1 - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  return [...new Set([...ultimos, ...salvos])].sort().reverse()
}

function mesAnterior(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const numero = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.')))

export default function CustosReboloPage() {
  const s = useErp()
  const podeFazer = usePode()
  const [mes, setMes] = useState(mesAtual())
  const custos = colecao(s, 'rebolo_custos_mes')
  // vendedoras do rebolo (a supervisão não entra: não tem card de vendas na TV)
  const vendedoras = equipe(s, 'rebolo').filter((c) => !/^supervisor/i.test(c.funcao))

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Financeiro / Custo do Rebolo"
        titulo="Custo das vendedoras do Rebolo"
        descricao="O salário do holerite de cada vendedora no mês. O sistema soma os encargos e usa no Lucro/Prejuízo de cada vendedora na Visão TV. Mês sem lançamento usa o salário estimado."
        acoes={
          <select value={mes} onChange={(e) => setMes(e.target.value)} className={selectCls}>
            {mesesDaLista(custos.map((c) => String(c.mes))).map((m) => (
              <option key={m} value={m}>{nomeMes(m)}</option>
            ))}
          </select>
        }
      />
      {vendedoras.length === 0 ? (
        <Panel titulo="Vendedoras">
          <EmptyState titulo="Nenhuma vendedora no Rebolo" descricao="Cadastre as vendedoras em Colaboradores (setor Vendas Rebolo)." />
        </Panel>
      ) : (
        <TabelaMes key={mes} mes={mes} vendedoras={vendedoras} editavel={podeFazer('financeiro', 'editar')} />
      )}
    </div>
  )
}

function TabelaMes({ mes, vendedoras, editavel }: { mes: string; vendedoras: Colaborador[]; editavel: boolean }) {
  const s = useErp()
  const { encargos, salarioEstimado } = tabelaRebolo(s).custos
  const custos = colecao(s, 'rebolo_custos_mes')
  const salvo = (id: string, m = mes) => custos.find((c) => c.vendedoraId === id && c.mes === m)
  const inicial = (id: string, m = mes) => {
    const c = salvo(id, m)
    return { salario: c ? String(c.salario) : '', observacao: c ? String(c.observacao || '') : '' }
  }
  const [linhas, setLinhas] = useState<Record<string, { salario: string; observacao: string }>>(() => Object.fromEntries(vendedoras.map((v) => [v.id, inicial(v.id)])))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const mudar = (id: string, campoNome: 'salario' | 'observacao', valor: string) => setLinhas((l) => ({ ...l, [id]: { ...l[id], [campoNome]: valor } }))
  const alterada = (id: string) => {
    const a = inicial(id)
    const l = linhas[id] ?? a
    return numero(l.salario) !== numero(a.salario) || l.observacao.trim() !== a.observacao.trim()
  }
  const custoDe = (id: string) => {
    const sal = numero(linhas[id]?.salario ?? '')
    const base = sal ?? salarioEstimado
    return { base, estimado: sal === null, total: base * (1 + encargos / 100) }
  }
  const totais = vendedoras.reduce((a, v) => {
    const c = custoDe(v.id)
    return { salario: a.salario + c.base, total: a.total + c.total, lancadas: a.lancadas + (c.estimado ? 0 : 1) }
  }, { salario: 0, total: 0, lancadas: 0 })
  const pendentes = vendedoras.filter((v) => alterada(v.id))

  const copiarAnterior = () => {
    const ant = mesAnterior(mes)
    setLinhas((l) =>
      Object.fromEntries(
        vendedoras.map((v) => {
          const atual = l[v.id] ?? { salario: '', observacao: '' }
          const c = salvo(v.id, ant)
          return [v.id, atual.salario.trim() || !c ? atual : { salario: String(c.salario), observacao: atual.observacao }]
        }),
      ),
    )
  }

  const salvarMes = async () => {
    setErro('')
    for (const v of pendentes) {
      const sal = numero(linhas[v.id].salario)
      if (sal !== null && !(sal >= 0)) return setErro(`Confira o salário de ${v.nome}.`)
    }
    setSalvando(true)
    for (const v of pendentes) {
      const falha = await salvarCustoReboloMes(v.id, mes, numero(linhas[v.id].salario), linhas[v.id].observacao)
      if (falha) {
        setSalvando(false)
        return setErro(`${v.nome}: ${falha}`)
      }
    }
    setSalvando(false)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label="Salários do mês" valor={brl(totais.salario)} detalhe={`${totais.lancadas} de ${vendedoras.length} lançados do holerite`} />
        <StatCard label={`Encargos (${encargos}%)`} valor={brl(totais.total - totais.salario)} />
        <StatCard tom={totais.lancadas < vendedoras.length ? 'yellow' : 'zinc'} label="Custo total do mês" valor={brl(totais.total)} detalhe={totais.lancadas < vendedoras.length ? 'tem salário estimado' : 'todos do holerite'} />
      </div>
      <Panel
        semPadding
        titulo={`Salários • ${nomeMes(mes)}`}
        subtitulo={`Vazio = estimado ${brl(salarioEstimado)} (Tabela de Preços do Rebolo). Encargos: ${encargos}% sobre o salário.`}
        acoes={
          editavel ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={copiarAnterior} className={btnSecundario}>Copiar do mês anterior</button>
              <button onClick={() => void salvarMes()} disabled={salvando || pendentes.length === 0} className={btnPrimario}>
                {salvando ? 'Salvando...' : pendentes.length ? `Salvar (${pendentes.length})` : 'Salvo'}
              </button>
            </div>
          ) : undefined
        }
      >
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
              <tr>
                <th className="px-5 py-4 font-bold">Vendedora</th>
                <th className="px-5 py-4 font-bold">Salário do holerite (R$)</th>
                <th className="px-5 py-4 font-bold text-right">Encargos</th>
                <th className="px-5 py-4 font-bold text-right">Custo do mês</th>
                <th className="px-5 py-4 font-bold">Observação</th>
                <th className="px-5 py-4 font-bold">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.02]">
              {vendedoras.map((v) => {
                const c = custoDe(v.id)
                return (
                  <tr key={v.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5">
                      <p className="font-black text-white">{v.nome}</p>
                      <p className="text-[11px] text-zinc-500">{v.funcao}</p>
                    </td>
                    <td className="px-5 py-3.5 w-48">
                      <input type="number" min="0" step="0.01" inputMode="decimal" aria-label={`Salário de ${v.nome}`} disabled={!editavel} value={linhas[v.id]?.salario ?? ''} onChange={(e) => mudar(v.id, 'salario', e.target.value)} placeholder={brl(salarioEstimado)} title={`Vazio = estimado ${brl(salarioEstimado)}`} className={campo} />
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">{brl(c.total - c.base)}</td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap font-bold text-white">{brl(c.total)}</td>
                    <td className="px-5 py-3.5 min-w-[200px]">
                      <input aria-label={`Observação de ${v.nome}`} disabled={!editavel} value={linhas[v.id]?.observacao ?? ''} onChange={(e) => mudar(v.id, 'observacao', e.target.value)} placeholder="Ex.: mês incompleto, faltas..." className={campo} />
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {alterada(v.id) ? <Badge texto="Falta salvar" tom="blue" /> : c.estimado ? <Badge texto="Estimado" tom="yellow" /> : <Badge texto="Do holerite" tom="emerald" />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {erro && <p className="m-5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400">{erro}</p>}
        {!editavel && <p className="px-6 py-4 text-xs text-zinc-500">Somente leitura. O Financeiro lança os salários.</p>}
      </Panel>
    </div>
  )
}
