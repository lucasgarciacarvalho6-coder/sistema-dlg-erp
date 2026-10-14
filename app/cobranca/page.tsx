'use client'

import Link from 'next/link'
import SectorDashboard from '@/components/erp/SectorDashboard'
import { Panel, StatCard } from '@/components/erp/ui'
import { SeloConta } from '@/components/erp/ContasPessoa'

import { brl, dataBR, mesAtual, pct } from '@/lib/erp/format'
import { FILTRO_INADIMPLENCIA, useIndicadores, useInadimplentes } from '@/lib/erp/cobrancas'
import PainelCobranca from '@/components/cobranca/PainelCobranca'
import { ParaHoje } from '@/components/cobranca/ContatosCobranca'

// A Cobrança só recebe a inadimplência para renegociar (07/10/2026): receber e dar baixa é do Financeiro.
// Os números vêm da carteira (calculados no banco).
export default function CobrancaDashboardPage() {
  const ind = useIndicadores(mesAtual())
  const { linhas: maisAtrasados } = useInadimplentes(FILTRO_INADIMPLENCIA, 0, 8)

  return (
    <SectorDashboard
      setor="cobranca"
      titulo="Dashboard de Cobrança"
      descricao="Inadimplência, acordos e metas de cada cobrador. Receber e dar baixa nos boletos é do Financeiro."
      tituloEquipe="Cobradores • metas diárias e mensais"
      antesDaEquipe={
        <div className="space-y-6">
          <ParaHoje />
          <PainelCobranca mes={mesAtual()} />
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
            <StatCard tom={ind.clientesEmAtraso ? 'red' : 'zinc'} label="Clientes em atraso" valor={ind.clientesEmAtraso} detalhe={`${ind.parcelasVencidas} boleto(s) vencido(s)`} />
            <StatCard tom={ind.emAtraso ? 'red' : 'zinc'} label="Valor em atraso" valor={brl(ind.emAtraso)} detalhe={`Atraso médio de ${ind.atrasoMedio} dias`} />
            <StatCard tom={ind.taxaInadimplencia ? 'red' : 'zinc'} label="Taxa de inadimplência" valor={pct(ind.taxaInadimplencia)} detalhe="do valor a receber" />
            <StatCard label="Atraso médio" valor={`${ind.atrasoMedio} dias`} detalhe="da carteira em atraso" />
          </div>
          <Panel titulo="Clientes em atraso" semPadding acoes={<Link href="/cobranca/inadimplencia" className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">Negociar →</Link>}>
            {maisAtrasados.length === 0 ? (
              <p className="p-6 text-xs text-zinc-500">Nenhum cliente em atraso. 🎉</p>
            ) : (
              <div className="divide-y divide-white/[0.03]">
                {maisAtrasados.map((p) => (
                  <div key={p.clienteId} className="px-6 py-3.5 flex justify-between items-center gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate flex items-center gap-2">
                        {p.cliente}
                        {p.contas.map((c) => (
                          <SeloConta key={c} conta={c} />
                        ))}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {[p.carteiras.join(', '), `${p.parcelasVencidas} boleto(s) vencido(s)`, `venceu ${dataBR(p.vencidaDesde)}`].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-red-400">{brl(p.vencido)}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{p.diasAtraso} dias</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      }
    />
  )
}
