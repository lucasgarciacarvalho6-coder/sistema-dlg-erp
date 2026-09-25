'use client'

import Link from 'next/link'
import SectorDashboard from '@/components/erp/SectorDashboard'
import { Badge, Panel, ProgressBar } from '@/components/erp/ui'
import { ETAPAS_LEAD } from '@/lib/erp/config'
import { useErp } from '@/lib/erp/store'
import { colecao, nomeColaborador } from '@/lib/erp/metrics'
import { dataBR, num } from '@/lib/erp/format'

export default function VendasDashboardPage() {
  const s = useErp()
  const leads = colecao(s, 'leads')
  const contratos = colecao(s, 'contratos')
  const abertos = leads.filter((l) => l.etapa !== 'Convertido' && l.etapa !== 'Perdido')
  const convertidos = leads.filter((l) => l.etapa === 'Convertido').length
  const alunosFunil = abertos.reduce((a, l) => a + Number(l.alunos || 0), 0)

  return (
    <SectorDashboard
      setor="vendas"
      titulo="Dashboard de Vendas"
      descricao="Contratos fechados com escolas, visitas e metas diárias e mensais de cada vendedora."
      tituloEquipe="Vendedoras • metas diárias e mensais"
      antesDaEquipe={
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Panel
            titulo="Funil de leads"
            subtitulo={`${abertos.length} em aberto • ${num(alunosFunil)} alunos em negociação • ${convertidos} convertidos`}
            acoes={<Link href="/vendas/leads" className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">Gerenciar →</Link>}
          >
            <div className="space-y-4">
              {ETAPAS_LEAD.map((etapa) => {
                const qtd = leads.filter((l) => l.etapa === etapa).length
                return (
                  <div key={etapa}>
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-1.5">
                      <span className="text-zinc-400">{etapa}</span>
                      <span className="text-white">{qtd}</span>
                    </div>
                    <ProgressBar valor={(qtd / (leads.length || 1)) * 100} tom={etapa === 'Perdido' ? 'red' : etapa === 'Convertido' ? 'emerald' : 'blue'} />
                  </div>
                )
              })}
            </div>
          </Panel>
          <Panel
            titulo="Últimos contratos (pedidos)"
            semPadding
            acoes={<Link href="/vendas/contratos" className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">Ver todos →</Link>}
          >
            <div className="divide-y divide-white/[0.03]">
              {contratos.slice(0, 6).map((c) => (
                <div key={c.id} className="px-6 py-3.5 flex justify-between items-center gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{String(c.escola)}</p>
                    <p className="text-[11px] text-zinc-500">
                      {String(c.cidade)} • {nomeColaborador(s, c.vendedoraId)} • {dataBR(String(c.data))}
                    </p>
                  </div>
                  <Badge texto={`${c.alunos} alunos`} tom="emerald" />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      }
    />
  )
}
