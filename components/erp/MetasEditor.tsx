'use client'

import { useState } from 'react'
import type { Colaborador, Meta, Setor } from '@/lib/erp/types'
import { SETORES, SETORES_PRODUTIVOS } from '@/lib/erp/config'
import { definirMetas, useErp, usePode } from '@/lib/erp/store'
import { equipe, metaColaborador, metaDefinida, metaSetor, resumo, type OrigemMeta } from '@/lib/erp/metrics'
import { formatar, iniciais, mesAtual, nomeMes, pct } from '@/lib/erp/format'
import { metaDiariaDoMes, totalDiasUteis } from '@/lib/erp/calendario'
import { Avatar, PageHeader, Panel, ProgressBar, Tabs, btnPrimario } from './ui'

const dec = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// 'YYYY-MM' deslocado n meses
function somarMes(mes: string, n: number) {
  const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const nomeCurto = (mes: string) => nomeMes(mes).split(' /')[0].toLowerCase()

function textoOrigem(o: OrigemMeta) {
  if (o.tipo === 'mes') return { texto: 'Definida para este mês', cor: 'text-emerald-400' }
  if (o.tipo === 'herdada') return { texto: `Herdada de ${nomeMes(o.mes).toLowerCase()} — salve para fixar neste mês`, cor: 'text-yellow-400' }
  if (o.tipo === 'colaborador') return { texto: 'Meta padrão do colaborador', cor: 'text-zinc-500' }
  return { texto: 'Padrão do setor (ainda não definida)', cor: 'text-zinc-500' }
}

const inputMeta =
  'w-full mt-1 bg-black/50 border border-white/[0.05] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 disabled:opacity-60'

function LinhaMetas({ c, mes, editavel }: { c: Colaborador; mes: string; editavel: boolean }) {
  const s = useErp()
  const indicadores = SETORES[c.setor].indicadores
  const [valores, setValores] = useState<Record<string, Meta>>(() =>
    Object.fromEntries(indicadores.map((i) => [i.id, metaColaborador(c, i.id, mes)])),
  )
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)
  const uteis = totalDiasUteis(mes)

  const alterar = (ind: string, campo: 'mensal' | 'piso', v: string) => setValores({ ...valores, [ind]: { ...valores[ind], [campo]: Number(v) || 0 } })

  const salvar = async () => {
    const invalido = indicadores.find((i) => (valores[i.id]?.piso ?? 0) > (valores[i.id]?.mensal ?? 0))
    if (invalido) return setErro(`${invalido.label}: o piso não pode ser maior que a meta.`)
    setErro('')
    const metas = Object.fromEntries(
      Object.entries(valores).map(([k, m]) => [k, { mensal: m.mensal, piso: m.piso ?? 0, diaria: Math.round(metaDiariaDoMes(m.mensal, mes) * 100) / 100 }]),
    )
    if (await definirMetas(c.id, metas, mes)) return
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  return (
    <tr className="hover:bg-white/[0.02] transition-colors align-top">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <Avatar texto={iniciais(c.nome)} foto={c.foto} />
          <div>
            <p className="text-white font-bold">{c.nome}</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{c.funcao}</p>
          </div>
        </div>
      </td>
      {indicadores.map((ind) => {
        const r = resumo(s, c.setor, ind.id, mes, c.id)
        const v = valores[ind.id] ?? { mensal: 0, diaria: 0, piso: 0 }
        const origem = textoOrigem(metaDefinida(c, ind.id, mes).origem)
        return (
          <td key={ind.id} className="px-6 py-4 min-w-[300px]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-2">{ind.label}</p>
            {/* Digita-se a meta e o piso do MÊS; os valores por dia são mensal ÷ dias úteis (seg–sex, sem feriados) */}
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Meta do mês</span>
                <input type="number" min="0" disabled={!editavel} value={v.mensal} onChange={(e) => alterar(ind.id, 'mensal', e.target.value)} className={inputMeta} />
              </label>
              <label className="block" title="Mínimo que precisa ser feito no mês para não dar prejuízo">
                <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Piso (mínimo)</span>
                <input type="number" min="0" disabled={!editavel} value={v.piso ?? 0} onChange={(e) => alterar(ind.id, 'piso', e.target.value)} className={inputMeta} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <p className="px-3 py-1.5 text-[11px] text-zinc-400 bg-white/[0.02] border border-white/[0.05] rounded-lg">
                Meta/dia <strong className="text-white">{dec(metaDiariaDoMes(v.mensal, mes))}</strong>
              </p>
              <p className="px-3 py-1.5 text-[11px] text-zinc-400 bg-white/[0.02] border border-white/[0.05] rounded-lg">
                Piso/dia <strong className="text-white">{dec(metaDiariaDoMes(v.piso ?? 0, mes))}</strong>
              </p>
            </div>
            <p className="text-[9px] text-zinc-500 mt-1">÷ {uteis} dias úteis de {nomeCurto(mes)}</p>
            <p className={`text-[9px] font-bold mt-1 ${origem.cor}`}>{origem.texto}</p>
            <div className="mt-3 flex items-center gap-2">
              <ProgressBar valor={r.pctMes} />
              <span className="text-[10px] font-bold text-zinc-400 whitespace-nowrap">{pct(r.pctMes)}</span>
            </div>
            <p className="text-[9px] text-zinc-600 mt-1 uppercase tracking-widest">No mês: {formatar(r.mes, ind.unidade)}</p>
          </td>
        )
      })}
      <td className="px-6 py-4 text-right">
        {editavel && (
          <button onClick={salvar} className={btnPrimario}>
            {salvo ? 'Salvo ✓' : 'Salvar'}
          </button>
        )}
        {erro && <p className="text-[10px] font-bold text-red-400 mt-2 max-w-[180px] ml-auto">{erro}</p>}
      </td>
    </tr>
  )
}

export default function MetasEditor({ modulo }: { modulo: string }) {
  const s = useErp()
  const podeFazer = usePode()
  const [setor, setSetor] = useState<Setor>('vendas')
  const [mes, setMes] = useState(mesAtual())
  const editavel = podeFazer('metas', 'editar')
  const time = equipe(s, setor)
  const cfg = SETORES[setor]
  const meses = Array.from({ length: 7 }, (_, i) => somarMes(mesAtual(), i - 3)) // 3 meses atrás … 3 meses à frente

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo={modulo}
        titulo="Metas Diárias e Mensais"
        descricao="Defina a META e o PISO (mínimo para não dar prejuízo) de cada colaborador, mês a mês. Os valores por dia são calculados: mensal ÷ dias úteis (segunda a sexta, sem feriados). Um mês sem meta própria usa a do último mês definido."
        acoes={
          <div className="flex items-center gap-2">
            <button onClick={() => setMes(somarMes(mes, -1))} className="w-9 h-9 rounded-xl border border-white/[0.08] text-zinc-400 hover:text-white" aria-label="Mês anterior">‹</button>
            <select value={mes} onChange={(e) => setMes(e.target.value)} className="bg-black/50 border border-white/[0.08] rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest text-white outline-none">
              {(meses.includes(mes) ? meses : [...meses, mes].sort()).map((m) => (
                <option key={m} value={m}>{nomeMes(m)}</option>
              ))}
            </select>
            <button onClick={() => setMes(somarMes(mes, 1))} className="w-9 h-9 rounded-xl border border-white/[0.08] text-zinc-400 hover:text-white" aria-label="Próximo mês">›</button>
          </div>
        }
      />
      <Tabs abas={SETORES_PRODUTIVOS.map((x) => ({ id: x, label: SETORES[x].nome }))} ativa={setor} onChange={setSetor} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cfg.indicadores.map((ind) => {
          const m = metaSetor(s, setor, ind.id, mes)
          return (
            <div key={ind.id} className="bg-painel-2/80 backdrop-blur-xl border border-blue-500/20 p-6 rounded-3xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400 mb-2">Meta do setor • {ind.label} • {nomeMes(mes)}</p>
              <p className="text-3xl font-black text-white">
                {formatar(m.mensal, ind.unidade)} <span className="text-sm text-zinc-500">/ mês</span> • {dec(m.diaria)} <span className="text-sm text-zinc-500">/ dia</span>
              </p>
              <p className="text-xs font-bold text-zinc-400 mt-2">
                Piso: <span className="text-white">{formatar(m.piso ?? 0, ind.unidade)}</span> / mês • {dec(metaDiariaDoMes(m.piso ?? 0, mes))} / dia
              </p>
            </div>
          )
        })}
      </div>

      <Panel titulo={`Equipe ${cfg.nome} • ${nomeMes(mes)}`} subtitulo={editavel ? 'Altere e clique em salvar em cada linha (vale para este mês e os seguintes, até mudar de novo)' : 'Somente leitura para o seu perfil'} semPadding>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
              <tr>
                <th className="px-6 py-4 font-bold">Colaborador</th>
                {cfg.indicadores.map((i) => (
                  <th key={i.id} className="px-6 py-4 font-bold">{i.label}</th>
                ))}
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.02]">
              {time.map((c) => (
                <LinhaMetas key={`${c.id}-${mes}`} c={c} mes={mes} editavel={editavel} />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
