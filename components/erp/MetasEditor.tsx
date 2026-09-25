'use client'

import { useState } from 'react'
import type { Colaborador, Meta, Setor } from '@/lib/erp/types'
import { SETORES, SETORES_PRODUTIVOS } from '@/lib/erp/config'
import { definirMetas, useErp, usePode } from '@/lib/erp/store'
import { equipe, metaColaborador, metaSetor, resumo } from '@/lib/erp/metrics'
import { formatar, iniciais, mesAtual, pct } from '@/lib/erp/format'
import { Avatar, PageHeader, Panel, ProgressBar, Tabs, btnPrimario } from './ui'

function LinhaMetas({ c, editavel }: { c: Colaborador; editavel: boolean }) {
  const s = useErp()
  const indicadores = SETORES[c.setor].indicadores
  const [valores, setValores] = useState<Record<string, Meta>>(() => Object.fromEntries(indicadores.map((i) => [i.id, metaColaborador(c, i.id)])))
  const [salvo, setSalvo] = useState(false)

  const alterar = (ind: string, campo: keyof Meta, v: string) => setValores({ ...valores, [ind]: { ...valores[ind], [campo]: Number(v) || 0 } })

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
        const r = resumo(s, c.setor, ind.id, mesAtual(), c.id)
        return (
          <td key={ind.id} className="px-6 py-4 min-w-[260px]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-2">{ind.label}</p>
            <div className="grid grid-cols-2 gap-2">
              {(['diaria', 'mensal'] as const).map((campo) => (
                <label key={campo} className="block">
                  <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">{campo === 'diaria' ? 'Diária' : 'Mensal'}</span>
                  <input
                    type="number"
                    min="0"
                    disabled={!editavel}
                    value={valores[ind.id]?.[campo] ?? 0}
                    onChange={(e) => alterar(ind.id, campo, e.target.value)}
                    className="w-full mt-1 bg-black/50 border border-white/[0.05] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 disabled:opacity-60"
                  />
                </label>
              ))}
            </div>
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
          <button
            onClick={async () => {
              if (await definirMetas(c.id, valores)) return
              setSalvo(true)
              setTimeout(() => setSalvo(false), 2000)
            }}
            className={btnPrimario}
          >
            {salvo ? 'Salvo ✓' : 'Salvar'}
          </button>
        )}
      </td>
    </tr>
  )
}

export default function MetasEditor({ modulo }: { modulo: string }) {
  const s = useErp()
  const podeFazer = usePode()
  const [setor, setSetor] = useState<Setor>('vendas')
  const editavel = podeFazer('metas', 'editar')
  const time = equipe(s, setor)
  const cfg = SETORES[setor]

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo={modulo}
        titulo="Metas Diárias e Mensais"
        descricao="Defina a meta individual de cada colaborador. A meta do setor é a soma da equipe e alimenta todos os dashboards."
      />
      <Tabs abas={SETORES_PRODUTIVOS.map((x) => ({ id: x, label: SETORES[x].nome }))} ativa={setor} onChange={setSetor} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cfg.indicadores.map((ind) => {
          const m = metaSetor(s, setor, ind.id)
          return (
            <div key={ind.id} className="bg-[#050505]/80 backdrop-blur-xl border border-blue-500/20 p-6 rounded-3xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400 mb-2">Meta do setor • {ind.label}</p>
              <p className="text-3xl font-black text-white">
                {formatar(m.diaria, ind.unidade)} <span className="text-sm text-zinc-500">/ dia</span> • {formatar(m.mensal, ind.unidade)} <span className="text-sm text-zinc-500">/ mês</span>
              </p>
            </div>
          )
        })}
      </div>

      <Panel titulo={`Equipe ${cfg.nome}`} subtitulo={editavel ? 'Altere e clique em salvar em cada linha' : 'Somente leitura para o seu perfil'} semPadding>
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
                <LinhaMetas key={c.id} c={c} editavel={editavel} />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
