'use client'

import Link from 'next/link'
import SectorDashboard from '@/components/erp/SectorDashboard'
import { Badge, Panel } from '@/components/erp/ui'
import { useErp } from '@/lib/erp/store'
import { colecao, nomeColaborador } from '@/lib/erp/metrics'
import { dataBR } from '@/lib/erp/format'

export default function OperacionalMetasPage() {
  const s = useErp()
  const pendentes = colecao(s, 'tarefas_operacionais').filter((t) => t.status !== 'Concluída')

  return (
    <SectorDashboard
      setor="operacional"
      titulo="Dashboard Operacional"
      descricao="Fichas fotografadas por equipe, metas diárias e mensais e pendências de campo."
      tituloEquipe="Equipe de campo • metas diárias e mensais"
      antesDaEquipe={
        <Panel
          titulo={`Pendências operacionais • ${pendentes.length}`}
          subtitulo="Sessões a agendar geradas pelos contratos de Vendas"
          semPadding
          acoes={<Link href="/operacional/tarefas" className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">Gerenciar →</Link>}
        >
          {pendentes.length === 0 ? (
            <p className="p-6 text-xs text-zinc-500">Nenhuma pendência.</p>
          ) : (
            <div className="divide-y divide-white/[0.03]">
              {pendentes.slice(0, 6).map((t) => (
                <div key={t.id} className="px-6 py-3.5 flex justify-between items-center gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{String(t.titulo)} • {String(t.escola)}</p>
                    <p className="text-[11px] text-zinc-500">{String(t.cidade)} • {nomeColaborador(s, t.responsavelId)} • prazo {dataBR(String(t.prazo))}</p>
                  </div>
                  <Badge texto={String(t.status)} tom={t.status === 'Em andamento' ? 'blue' : 'orange'} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      }
    />
  )
}
