'use client'

import Link from 'next/link'
import SectorDashboard from '@/components/erp/SectorDashboard'
import { Badge, Panel, StatCard } from '@/components/erp/ui'
import { useErp } from '@/lib/erp/store'
import { colecao, tituloAtrasado } from '@/lib/erp/metrics'
import { brl, dataBR, hoje, mesAtual, pct } from '@/lib/erp/format'

export default function CobrancaDashboardPage() {
  const s = useErp()
  const vendas = colecao(s, 'vendas_ebooks')
  const titulos = colecao(s, 'titulos')
  const acordos = colecao(s, 'acordos')
  const vendidosMes = vendas.filter((v) => String(v.data).startsWith(mesAtual()))
  const emAberto = titulos.filter((t) => t.status === 'Aberto' || t.status === 'Em acordo')
  const atrasados = titulos.filter(tituloAtrasado)
  const valor = (l: typeof titulos) => l.reduce((a, t) => a + Number(t.valor || 0), 0)
  const taxa = valor(emAberto) ? (valor(atrasados) / valor(emAberto)) * 100 : 0
  const vencendo = titulos.filter((t) => t.status === 'Aberto' && String(t.vencimento) >= hoje()).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento))).slice(0, 6)

  return (
    <SectorDashboard
      setor="cobranca"
      titulo="Dashboard de Cobrança"
      descricao="Recebimentos, inadimplência, acordos e metas de cada cobrador. A venda de books aos pais agora é feita pelo setor Vendas Rebolo."
      tituloEquipe="Cobradores • metas diárias e mensais"
      antesDaEquipe={
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
            <StatCard label="Books vendidos (mês)" valor={vendidosMes.length} detalhe={brl(vendidosMes.reduce((a, v) => a + Number(v.valor || 0), 0))} />
            <StatCard label="A receber" valor={brl(valor(emAberto))} detalhe={`${emAberto.length} parcela(s) em aberto`} />
            <StatCard tom={atrasados.length ? 'red' : 'zinc'} label="Taxa de inadimplência" valor={pct(taxa)} detalhe={`${atrasados.length} título(s) • ${brl(valor(atrasados))}`} />
            <StatCard label="Acordos gerados" valor={acordos.length} detalhe={`${acordos.filter((a) => a.status === 'Ativo').length} ativos • ${acordos.filter((a) => a.status === 'Aguardando aprovação').length} aguardando`} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Panel titulo="Clientes em atraso" semPadding acoes={<Link href="/cobranca/inadimplencia" className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">Negociar →</Link>}>
              {atrasados.length === 0 ? (
                <p className="p-6 text-xs text-zinc-500">Nenhum título em atraso. 🎉</p>
              ) : (
                <div className="divide-y divide-white/[0.03]">
                  {atrasados.slice(0, 6).map((t) => (
                    <div key={t.id} className="px-6 py-3.5 flex justify-between items-center gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{String(t.cliente)}</p>
                        <p className="text-[11px] text-zinc-500">{String(t.escola)} • parcela {String(t.parcela)} • venceu {dataBR(String(t.vencimento))}</p>
                      </div>
                      <span className="text-sm font-black text-red-400">{brl(Number(t.valor))}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            <Panel titulo="Próximos vencimentos" semPadding acoes={<Link href="/cobranca/titulos" className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">Contas a receber →</Link>}>
              <div className="divide-y divide-white/[0.03]">
                {vencendo.map((t) => (
                  <div key={t.id} className="px-6 py-3.5 flex justify-between items-center gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{String(t.cliente)}</p>
                      <p className="text-[11px] text-zinc-500">{String(t.escola)} • parcela {String(t.parcela)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-white">{brl(Number(t.valor))}</p>
                      <Badge texto={dataBR(String(t.vencimento))} tom={String(t.vencimento) === hoje() ? 'yellow' : 'zinc'} />
                    </div>
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
