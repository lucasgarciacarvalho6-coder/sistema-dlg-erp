'use client'

import Link from 'next/link'
import SectorDashboard from '@/components/erp/SectorDashboard'
import { Panel, StatCard } from '@/components/erp/ui'
import { useErp } from '@/lib/erp/store'
import { colecao, tituloAtrasado } from '@/lib/erp/metrics'
import { brl, dataBR, pct } from '@/lib/erp/format'
import { agruparPorPessoa, diasAtraso } from '@/lib/erp/contas-receber'

// A Cobrança só recebe a inadimplência para renegociar (07/10/2026): receber e dar baixa é do Financeiro.
export default function CobrancaDashboardPage() {
  const s = useErp()
  const titulos = colecao(s, 'titulos')
  const acordos = colecao(s, 'acordos')
  const emAberto = titulos.filter((t) => t.status === 'Aberto' || t.status === 'Em acordo')
  const atrasados = titulos.filter(tituloAtrasado)
  const valor = (l: typeof titulos) => l.reduce((a, t) => a + Number(t.valor || 0), 0)
  const taxa = valor(emAberto) ? (valor(atrasados) / valor(emAberto)) * 100 : 0
  const atrasoMedio = atrasados.length ? Math.round(atrasados.reduce((a, t) => a + diasAtraso(String(t.vencimento)), 0) / atrasados.length) : 0
  const pessoas = agruparPorPessoa(atrasados, () => '').sort((a, b) => b.diasAtraso - a.diasAtraso || b.emAtraso - a.emAtraso)

  return (
    <SectorDashboard
      setor="cobranca"
      titulo="Dashboard de Cobrança"
      descricao="Inadimplência, acordos e metas de cada cobrador. Receber e dar baixa nos boletos é do Financeiro."
      tituloEquipe="Cobradores • metas diárias e mensais"
      antesDaEquipe={
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
            <StatCard tom={pessoas.length ? 'red' : 'zinc'} label="Clientes em atraso" valor={pessoas.length} detalhe={`${atrasados.length} boleto(s) vencido(s)`} />
            <StatCard tom={atrasados.length ? 'red' : 'zinc'} label="Valor em atraso" valor={brl(valor(atrasados))} detalhe={`Atraso médio de ${atrasoMedio} dias`} />
            <StatCard tom={atrasados.length ? 'red' : 'zinc'} label="Taxa de inadimplência" valor={pct(taxa)} detalhe="do valor a receber" />
            <StatCard label="Acordos gerados" valor={acordos.length} detalhe={`${acordos.filter((a) => a.status === 'Ativo').length} ativos • ${acordos.filter((a) => a.status === 'Aguardando aprovação').length} aguardando`} />
          </div>
          <Panel titulo="Clientes em atraso" semPadding acoes={<Link href="/cobranca/inadimplencia" className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">Negociar →</Link>}>
            {pessoas.length === 0 ? (
              <p className="p-6 text-xs text-zinc-500">Nenhum cliente em atraso. 🎉</p>
            ) : (
              <div className="divide-y divide-white/[0.03]">
                {pessoas.slice(0, 8).map((p) => (
                  <div key={p.chave} className="px-6 py-3.5 flex justify-between items-center gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{p.nome}</p>
                      <p className="text-[11px] text-zinc-500">
                        {[p.escolas.join(', '), `${p.vencidas} boleto(s) vencido(s)`, `venceu ${dataBR(p.maisAntigo)}`].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-red-400">{brl(p.emAtraso)}</p>
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
