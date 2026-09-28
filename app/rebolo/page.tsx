'use client'

import Link from 'next/link'
import SectorDashboard from '@/components/erp/SectorDashboard'
import { Panel, StatCard } from '@/components/erp/ui'
import { brl } from '@/lib/erp/format'
import { EM_ABERTO, MOTIVOS_DESCARTE } from '@/lib/erp/rebolo'
import { useRebolo } from '@/components/rebolo/comum'

// Dashboard do setor: metas (R$ vendido e books), a fila do time e para onde vão os descartes
export default function ReboloDashboardPage() {
  const { fichas, vendas } = useRebolo()
  const abertas = fichas.filter((f) => EM_ABERTO.includes(String(f.situacao)))
  const efetivar = vendas.filter((v) => v.conferencia === 'Aguardando contrato')
  const financeiro = vendas.filter((v) => v.conferencia === 'Aguardando conferência')
  const aEnviar = fichas.filter((f) => f.situacao === 'Vendida' && !f.enviadoEm)
  const descartes = fichas.filter((f) => f.situacao === 'Descarte')
  const soma = (l: typeof vendas) => l.reduce((a, v) => a + (Number(v.valor) || 0), 0)
  const link = 'text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300'

  return (
    <SectorDashboard
      setor="rebolo"
      titulo="Dashboard Rebolo"
      descricao="Revenda dos books que o vendedor externo não vendeu. A venda conta na meta quando o Financeiro aprova."
      tituloEquipe="Vendedoras • metas do mês"
      registroManual={false}
      antesDaEquipe={
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
            <Link href="/rebolo/contatos"><StatCard tom="blue" label="Fichas na fila" valor={abertas.length} detalhe={`${abertas.filter((f) => f.situacao === 'Agendado').length} agendada(s) • ${abertas.filter((f) => f.situacao === 'Tentar de novo').length} tentar de novo`} /></Link>
            <Link href="/rebolo/vendas"><StatCard tom="cyan" label="Vendas a efetivar" valor={efetivar.length} detalhe={`${brl(soma(efetivar))} • aguardando contrato`} /></Link>
            <Link href="/rebolo/vendas"><StatCard tom="yellow" label="No Financeiro" valor={financeiro.length} detalhe={brl(soma(financeiro))} /></Link>
            <Link href="/rebolo/envios"><StatCard tom="orange" label="A enviar" valor={aEnviar.length} detalhe="aprovadas, falta o rastreio" /></Link>
          </div>
          <Panel titulo="Descartes por motivo" subtitulo={`${descartes.length} álbum(ns) congelado(s) na empresa`} acoes={<Link href="/rebolo/contatos" className={link}>Ver fichas →</Link>}>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {MOTIVOS_DESCARTE.map((m) => (
                <div key={m} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{m}</p>
                  <p className="text-2xl font-black text-white mt-1">{descartes.filter((f) => f.motivoDescarte === m).length}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      }
    />
  )
}
