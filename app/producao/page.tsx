'use client'

import Link from 'next/link'
import SectorDashboard from '@/components/erp/SectorDashboard'
import { Badge, Panel, StatCard } from '@/components/erp/ui'
import { ETAPAS_PRODUCAO } from '@/lib/erp/config'
import { useErp } from '@/lib/erp/store'
import { colecao, nomeColaborador } from '@/lib/erp/metrics'
import { dataBR, hoje, num } from '@/lib/erp/format'

export default function ProducaoDashboardPage() {
  const s = useErp()
  const ordens = colecao(s, 'ordens_producao')
  const fila = ordens.filter((o) => o.etapa !== 'Concluído')
  const emEdicao = fila.filter((o) => o.etapa === 'Tratamento' || o.etapa === 'Diagramação')
  const fotosEmEdicao = emEdicao.reduce((a, o) => a + Number(o.fotos || 0), 0)
  const ebooksProntos = ordens.filter((o) => ['E-book gerado', 'Revisão de qualidade', 'Concluído'].includes(String(o.etapa))).length
  const atrasadas = fila.filter((o) => String(o.prazo) < hoje()).length
  const estoqueBaixo = colecao(s, 'estoque').filter((e) => Number(e.quantidade) < Number(e.minimo)).length

  return (
    <SectorDashboard
      setor="producao"
      titulo="Dashboard da Produção"
      descricao="Fotos em edição, e-books gerados, fila de trabalho e metas de cada editor."
      tituloEquipe="Editores • metas diárias e mensais"
      antesDaEquipe={
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
            <StatCard tom="violet" label="Fotos em edição" valor={num(fotosEmEdicao)} detalhe={`${emEdicao.length} ordem(ns) em tratamento/diagramação`} />
            <StatCard tom="blue" label="E-books gerados" valor={ebooksProntos} detalhe="Total de ordens com e-book" />
            <StatCard tom="orange" label="Fila de trabalho" valor={fila.length} detalhe={`${atrasadas} com prazo vencido`} />
            <StatCard tom={estoqueBaixo ? 'red' : 'emerald'} label="Matéria-prima" valor={estoqueBaixo} detalhe="Itens abaixo do mínimo" />
          </div>
          <Panel titulo="Fila de trabalho por etapa" semPadding acoes={<Link href="/producao/ordens" className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">Abrir ordens →</Link>}>
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3 p-6">
              {ETAPAS_PRODUCAO.map((etapa) => {
                const itens = ordens.filter((o) => o.etapa === etapa)
                return (
                  <div key={etapa} className="bg-black/40 border border-white/[0.05] rounded-2xl p-4 min-h-[140px]">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">{etapa}</span>
                      <span className="text-xs font-black text-white">{itens.length}</span>
                    </div>
                    <div className="space-y-2">
                      {itens.slice(0, 4).map((o) => (
                        <div key={o.id} className="bg-blue-950/20 border border-blue-500/20 rounded-xl p-2.5">
                          <p className="text-[11px] font-bold text-white truncate">{String(o.escola)}</p>
                          <p className="text-[9px] text-zinc-500 mt-0.5">{nomeColaborador(s, o.responsavelId)} • {dataBR(String(o.prazo))}</p>
                        </div>
                      ))}
                      {itens.length === 0 && <p className="text-[10px] text-zinc-700 uppercase">Vazio</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
          {atrasadas > 0 && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 p-4 rounded-2xl">
              <Badge texto="Produção atrasada" tom="red" />
              <p className="text-xs text-red-300">{atrasadas} ordem(ns) passaram do prazo. Priorize na fila.</p>
            </div>
          )}
        </div>
      }
    />
  )
}
