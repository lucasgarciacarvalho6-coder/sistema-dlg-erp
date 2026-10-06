'use client'

// Gestão diária do rebolo: o que a vendedora fez no dia (contatos, vendas fechadas e aprovadas)
// e como está a fila dela (fichas por situação e pacote aberto).
// SEMPRE de UMA vendedora (pedido de 06/10/2026): a vendedora vê só ela; a supervisão escolhe no seletor.

import { useState } from 'react'
import { brl, hoje, iniciais } from '@/lib/erp/format'
import { equipeComMeta, metaColaborador } from '@/lib/erp/metrics'
import { pacoteFinalizado, SITUACOES_FICHA, TOM_SITUACAO } from '@/lib/erp/rebolo'
import { Avatar, EmptyState, PageHeader, Panel, StatCard, TONS } from '@/components/erp/ui'
import { useRebolo } from '@/components/rebolo/comum'

export default function GestaoDiariaReboloPage() {
  const { s, eu, supervisao, vendedoras, fichas, contatos, vendas, pacotes } = useRebolo()
  const [dia, setDia] = useState(hoje())
  const [escolhida, setEscolhida] = useState('')
  // vendedora vê só ela; a supervisão escolhe (começa nela mesma, se vende, ou na primeira vendedora)
  const alvoId = supervisao ? escolhida || (vendedoras.some((v) => v.id === eu?.id) ? eu!.id : vendedoras[0]?.id ?? '') : eu?.id ?? ''
  const visiveis = vendedoras.filter((c) => c.id === alvoId)
  // a venda é da dona da ficha (sem ficha, de quem fechou)
  const dona = new Map(fichas.map((f) => [f.id, String(f.vendedoraId)]))
  const daVendedora = (v: (typeof vendas)[number], id: string) => (dona.get(String(v.fichaReboloId)) ?? String(v.cobradorId)) === id
  const doDia = (iso: unknown) => String(iso || '').slice(0, 10) === dia
  const comMeta = new Set(equipeComMeta(s, 'rebolo', dia.slice(0, 7)).map((c) => c.id))

  const linhas = visiveis.map((c) => {
    const minhas = fichas.filter((f) => f.vendedoraId === c.id)
    const cont = contatos.filter((x) => x.vendedoraId === c.id && doDia(x.data))
    const fechadas = vendas.filter((v) => daVendedora(v, c.id) && doDia(v.criadoEm))
    const aprovadas = vendas.filter((v) => daVendedora(v, c.id) && v.conferencia === 'Conferida' && doDia(v.conferidoEm || v.data))
    // o pacote atual: o mais novo em andamento (a vendedora pode ter vários abertos: abrir pacote não tem trava)
    const fichasDe = (p: (typeof pacotes)[number]) => fichas.filter((f) => f.pacoteId === p.id)
    const emAndamento = pacotes.filter((p) => p.vendedoraId === c.id && !pacoteFinalizado(fichasDe(p))).sort((a, b) => Number(b.numero) - Number(a.numero))
    const aberto = emAndamento[0]
    const metaDia = comMeta.has(c.id) ? metaColaborador(c, 'valor_vendido', dia.slice(0, 7)).diaria : 0
    return { c, minhas, cont, fechadas, aprovadas, aberto, emAndamento: emAndamento.length, metaDia, valorAprovado: aprovadas.reduce((a, v) => a + (Number(v.valor) || 0), 0) }
  })
  const tot = (k: 'cont' | 'fechadas' | 'aprovadas') => linhas.reduce((a, l) => a + l[k].length, 0)
  const alvo = visiveis[0]
  const aberto = linhas[0]?.aberto

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Vendas Rebolo / Gestão Diária"
        titulo={supervisao && alvo ? `Gestão Diária • ${alvo.nome}` : 'Gestão Diária'}
        descricao={supervisao ? 'O que a vendedora fez no dia e como está a fila dela.' : 'O que você fez no dia e como está a sua fila.'}
        acoes={
          <>
            {supervisao && (
              <select value={alvoId} onChange={(e) => setEscolhida(e.target.value)} aria-label="Vendedora" className="bg-black/50 border border-white/[0.05] text-white text-xs font-bold uppercase tracking-widest rounded-xl px-4 py-3.5 outline-none appearance-none">
                {vendedoras.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
              </select>
            )}
            <input type="date" value={dia} onChange={(e) => setDia(e.target.value || hoje())} className="bg-black/50 border border-white/[0.05] text-white text-xs font-bold rounded-xl px-4 py-3 outline-none" />
          </>
        }
      />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Contatos no dia" valor={tot('cont')} />
        <StatCard label="Vendas fechadas" valor={tot('fechadas')} detalhe="aguardando contrato / Financeiro" />
        <StatCard label="Aprovadas no dia" valor={tot('aprovadas')} detalhe={brl(linhas.reduce((a, l) => a + l.valorAprovado, 0))} />
        <StatCard label="Pacote aberto" valor={aberto ? `P${aberto.numero}` : '—'} detalhe={aberto ? `${fichas.filter((f) => f.pacoteId === aberto.id).length} de ${aberto.tipo === 'Avulso' ? 1 : 10} ficha(s)${(linhas[0]?.emAndamento ?? 0) > 1 ? ` • ${linhas[0].emAndamento} pacotes em andamento` : ''}` : 'nenhum pacote aberto'} />
      </div>

      <Panel semPadding titulo={alvo ? `O dia de ${alvo.nome}` : 'O dia da vendedora'}>
        {linhas.length === 0 ? (
          <EmptyState titulo={supervisao ? 'Nenhuma vendedora no setor' : 'Sem dados'} descricao={supervisao ? 'Cadastre a equipe em ADM › Colaboradores, no setor Vendas Rebolo.' : 'Seu login não está no setor Vendas Rebolo.'} />
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
