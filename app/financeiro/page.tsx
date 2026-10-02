'use client'

import Link from 'next/link'
import SectorDashboard from '@/components/erp/SectorDashboard'
import { BarChart, Badge, Panel, StatCard } from '@/components/erp/ui'
import { useErp } from '@/lib/erp/store'
import { colecao, diaReferencia, fluxoCaixa } from '@/lib/erp/metrics'
import { brl, dataBR, hoje, mesAtual } from '@/lib/erp/format'

export default function FinanceiroDashboardPage() {
  const s = useErp()
  const mes = mesAtual()
  const contas = colecao(s, 'contas_pagar')
  const aPagar = contas.filter((c) => c.status === 'A pagar' || c.status === 'Aguardando aprovação')
  // Pagamentos que vieram dos fechamentos do Operacional (bonificação escolas, vendedores, freelancers)
  const operacionaisAPagar = contas.filter((c) => c.fechamentoId && c.status === 'A pagar')
  const vencidas = aPagar.filter((c) => String(c.vencimento) < hoje())
  const fluxo = fluxoCaixa(s, mes)
  const soma = (l: typeof contas) => l.reduce((a, r) => a + Number(r.valor || 0), 0)
  const proximas = [...aPagar].sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento))).slice(0, 6)

  return (
    <SectorDashboard
      setor="financeiro"
      titulo="Dashboard Financeiro"
      descricao="Pagamentos operacionais (escolas, vendedores e freelancers), contas a pagar, fluxo de caixa e metas da equipe."
      tituloEquipe="Equipe financeira • metas diárias e mensais"
      antesDaEquipe={
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
            <StatCard label="Pagamentos operacionais" valor={brl(soma(operacionaisAPagar))} detalhe={`${operacionaisAPagar.length} PIX do Operacional`} />
            <StatCard tom={vencidas.length ? 'red' : 'zinc'} label="Contas a pagar" valor={brl(soma(aPagar))} detalhe={`${vencidas.length} vencida(s)`} />
            <StatCard label="Entradas no mês" valor={brl(fluxo.totalEntradas)} detalhe="Recebimentos da Cobrança" />
            <StatCard tom={fluxo.saldo >= 0 ? 'zinc' : 'red'} label="Saldo do mês" valor={brl(fluxo.saldo)} detalhe={`Saídas: ${brl(fluxo.totalSaidas)}`} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Panel className="xl:col-span-2" titulo="Fluxo de caixa diário" subtitulo="Entradas x saídas do mês">
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Entradas</p>
                <BarChart valores={fluxo.entradas} altura="h-40" limite={diaReferencia(mes)} formatar={brl} />
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Saídas</p>
                <BarChart valores={fluxo.saidas} altura="h-28" compacto limite={diaReferencia(mes)} formatar={brl} />
              </div>
              <Link href="/financeiro/fluxo-caixa" className="inline-block mt-4 text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">Ver fluxo detalhado →</Link>
            </Panel>
            <Panel titulo="Próximos vencimentos" semPadding>
              <div className="divide-y divide-white/[0.03]">
                {proximas.map((c) => (
                  <div key={c.id} className="px-6 py-3.5 flex justify-between items-center gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{String(c.favorecido || c.descricao)}</p>
                      <p className="text-[11px] text-zinc-500">{dataBR(String(c.vencimento))} • {brl(Number(c.valor))}</p>
                    </div>
                    <Badge texto={String(c.vencimento) < hoje() ? 'Vencida' : String(c.status)} tom={String(c.vencimento) < hoje() ? 'red' : c.status === 'Aguardando aprovação' ? 'yellow' : 'zinc'} />
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      }
    />
  )
}
