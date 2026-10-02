'use client'

// Gestão diária do rebolo: por vendedora, o que foi feito no dia (contatos, vendas fechadas e aprovadas)
// e como está a fila dela (fichas por situação e pacote aberto).

import { useState } from 'react'
import { brl, hoje, iniciais } from '@/lib/erp/format'
import { equipeComMeta, metaColaborador } from '@/lib/erp/metrics'
import { pacoteFinalizado, SITUACOES_FICHA, TOM_SITUACAO } from '@/lib/erp/rebolo'
import { Avatar, EmptyState, PageHeader, Panel, StatCard, TONS } from '@/components/erp/ui'
import { useRebolo } from '@/components/rebolo/comum'

export default function GestaoDiariaReboloPage() {
  const { s, vendedoras, fichas, contatos, vendas, pacotes } = useRebolo()
  const [dia, setDia] = useState(hoje())
  const doDia = (iso: unknown) => String(iso || '').slice(0, 10) === dia
  const comMeta = new Set(equipeComMeta(s, 'rebolo', dia.slice(0, 7)).map((c) => c.id))

  const linhas = vendedoras.map((c) => {
    const minhas = fichas.filter((f) => f.vendedoraId === c.id)
    const cont = contatos.filter((x) => x.vendedoraId === c.id && doDia(x.data))
    const fechadas = vendas.filter((v) => v.cobradorId === c.id && doDia(v.criadoEm))
    const aprovadas = vendas.filter((v) => v.cobradorId === c.id && v.conferencia === 'Conferida' && doDia(v.conferidoEm || v.data))
    const aberto = pacotes.find((p) => p.vendedoraId === c.id && !pacoteFinalizado(fichas.filter((f) => f.pacoteId === p.id)))
    const metaDia = comMeta.has(c.id) ? metaColaborador(c, 'valor_vendido', dia.slice(0, 7)).diaria : 0
    return { c, minhas, cont, fechadas, aprovadas, aberto, metaDia, valorAprovado: aprovadas.reduce((a, v) => a + (Number(v.valor) || 0), 0) }
  })
  const tot = (k: 'cont' | 'fechadas' | 'aprovadas') => linhas.reduce((a, l) => a + l[k].length, 0)

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Vendas Rebolo / Gestão Diária"
        titulo="Gestão Diária"
        descricao="O que cada vendedora fez no dia e como está a fila dela."
        acoes={<input type="date" value={dia} onChange={(e) => setDia(e.target.value || hoje())} className="bg-black/50 border border-white/[0.05] text-white text-xs font-bold rounded-xl px-4 py-3 outline-none" />}
      />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Contatos no dia" valor={tot('cont')} />
        <StatCard label="Vendas fechadas" valor={tot('fechadas')} detalhe="aguardando contrato / Financeiro" />
        <StatCard label="Aprovadas no dia" valor={tot('aprovadas')} detalhe={brl(linhas.reduce((a, l) => a + l.valorAprovado, 0))} />
        <StatCard label="Pacotes abertos" valor={linhas.filter((l) => l.aberto).length} detalhe={`${linhas.length} vendedora(s)`} />
      </div>

      <Panel semPadding titulo="Por vendedora">
        {linhas.length === 0 ? (
          <EmptyState titulo="Nenhuma vendedora no setor" descricao="Cadastre a equipe em ADM › Colaboradores, no setor Vendas Rebolo." />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-5 py-4 font-bold">Vendedora</th>
                  <th className="px-3 py-4 font-bold text-center">Contatos</th>
                  <th className="px-3 py-4 font-bold text-center">Fechadas</th>
                  <th className="px-3 py-4 font-bold text-center">Aprovadas</th>
                  <th className="px-3 py-4 font-bold">Meta do dia</th>
                  <th className="px-3 py-4 font-bold">Pacote</th>
                  {SITUACOES_FICHA.map((st) => (
                    <th key={st} className={`px-2 py-4 font-bold text-center whitespace-nowrap ${TONS[TOM_SITUACAO[st]].texto}`}>{st}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {linhas.map((l) => (
                  <tr key={l.c.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar texto={iniciais(l.c.nome)} foto={l.c.foto} />
                        <div>
                          <p className="font-bold text-white whitespace-nowrap">{l.c.nome}</p>
                          <p className="text-[10px] text-zinc-500">{l.c.funcao}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-center font-black text-white">{l.cont.length}</td>
                    <td className="px-3 py-3.5 text-center font-black text-white">{l.fechadas.length}</td>
                    <td className="px-3 py-3.5 text-center font-black text-white">{l.aprovadas.length}</td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-xs">
                      {l.metaDia > 0 ? (
                        <p className={l.valorAprovado >= l.metaDia ? 'text-emerald-400 font-bold' : 'text-zinc-300'}>{brl(l.valorAprovado)} / {brl(l.metaDia)}</p>
                      ) : (
                        <span className="text-zinc-600">sem meta</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-xs">{l.aberto ? <span className="font-black text-white">P{String(l.aberto.numero)}</span> : <span className="text-zinc-600">—</span>}</td>
                    {SITUACOES_FICHA.map((st) => {
                      const n = l.minhas.filter((f) => f.situacao === st).length
                      return (
                        <td key={st} className="px-2 py-3.5 text-center">
                          <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-black ${n ? `${TONS[TOM_SITUACAO[st]].suave} ${TONS[TOM_SITUACAO[st]].texto}` : 'text-zinc-700'}`}>{n}</span>
                        </td>
                      )
                    })}
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
