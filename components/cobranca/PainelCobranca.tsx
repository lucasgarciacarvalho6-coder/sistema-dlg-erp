'use client'

// Painel da Cobrança (SQL 049), igual ao sistema antigo: selo do nível da comissão com quanto falta, quadro
// "Comissão por quantidade de parcelas vencidas", meta SPC (clientes elegíveis trabalhados, ciclo 12 → 11),
// indicadores do mês e os quadros por situação.

import { usePainelCobranca } from '@/lib/erp/cobrancas'
import { ROTULO_FAIXA_COMISSAO } from '@/lib/erp/painel-cobranca'
import { brl, dataBR, pct } from '@/lib/erp/format'
import { Badge, Panel, ProgressBar, StatCard } from '@/components/erp/ui'
import type { Tom } from '@/lib/erp/types'

const SITUACOES_QUADRO = [
  'Aguardando cobrança', 'Contato realizado sem acordo', 'Aguardando retorno', 'Pagamento de boleto agendado', 'Promessa não cumprida',
  'Renegociação simulada', 'Renegociação feita (aguardando entrada)', 'Não localizado', 'Ficha não encontrada SPC', 'Acordo quebrado',
]

export default function PainelCobranca({ mes, cobradorId = '' }: { mes: string; cobradorId?: string }) {
  const p = usePainelCobranca(mes, cobradorId)
  if (!p) return <p className="text-xs text-zinc-500">Carregando o painel da Cobrança...</p>
  const tomNivel: Tom = p.nivel === 3 ? 'emerald' : p.nivel === 2 ? 'yellow' : 'red'
  const ms = p.metaSpc
  const andamento = ms.esperadoHoje > 0 ? (ms.trabalhados / ms.esperadoHoje) * 100 : 0
  const tomSpc: Tom = andamento >= 100 ? 'emerald' : andamento >= 70 ? 'yellow' : 'red'
  const ind = p.indicadores
  const efetividade = ind.clientesContatados > 0 ? (ind.acordosFechados / ind.clientesContatados) * 100 : 0
  const tot = p.faixas.reduce((t, f) => ({ a: t.a + f.aConfirmar, e: t.e + f.estimada, c: t.c + f.confirmada, g: t.g + f.gerada }), { a: 0, e: 0, c: 0, g: 0 })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Clientes contatados no mês" valor={ind.clientesContatados} detalhe={`${ind.contatos} contato(s)`} />
        <StatCard label="Acordos fechados no mês" valor={ind.acordosFechados} detalhe={`efetividade ${pct(efetividade)} (simulação não conta)`} />
        <StatCard label="Aguardando entrada" valor={brl(ind.aguardandoEntradaValor)} detalhe={`${ind.entradasVencidas} com entrada vencida`} tom={ind.entradasVencidas ? 'red' : 'zinc'} />
        <StatCard label="Entradas confirmadas no mês" valor={ind.entradasConfirmadas} detalhe={`${ind.efetivadas} renegociação(ões) efetivada(s)`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel titulo="Comissão por quantidade de parcelas vencidas" acoes={<Badge texto={`Comissão — Nível ${p.nivel}`} tom={tomNivel} />}>
          <p className="text-xs text-zinc-400 mb-3">
            Entradas SPC confirmadas no mês: <strong className="text-white">{brl(p.totalConfirmado)}</strong>
            {p.nivel < 3 && <> • faltam <strong className="text-white">{brl(p.faltaProximo)}</strong> para o Nível {p.nivel + 1}</>} • o nível vale para o mês todo.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="text-[10px] uppercase tracking-widest text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="py-2">Faixa</th>
                  <th className="py-2 text-right">%</th>
                  <th className="py-2 text-right">Entradas a confirmar</th>
                  <th className="py-2 text-right">Comissão estimada</th>
                  <th className="py-2 text-right">Entrada confirmada</th>
                  <th className="py-2 text-right">Comissão gerada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {p.faixas.map((f) => (
                  <tr key={f.faixa}>
                    <td className="py-2 text-white font-bold">{ROTULO_FAIXA_COMISSAO[f.faixa]}</td>
                    <td className="py-2 text-right">{f.pct.toFixed(2).replace('.', ',')}%</td>
                    <td className="py-2 text-right">{brl(f.aConfirmar)}{f.qtdAConfirmar ? ` (${f.qtdAConfirmar})` : ''}</td>
                    <td className="py-2 text-right">{brl(f.estimada)}</td>
                    <td className="py-2 text-right">{brl(f.confirmada)}{f.qtdConfirmada ? ` (${f.qtdConfirmada})` : ''}</td>
                    <td className="py-2 text-right font-bold text-emerald-400">{brl(f.gerada)}</td>
                  </tr>
                ))}
                <tr className="font-black text-white">
                  <td className="py-2">Total</td>
                  <td />
                  <td className="py-2 text-right">{brl(tot.a)}</td>
                  <td className="py-2 text-right">{brl(tot.e)}</td>
                  <td className="py-2 text-right">{brl(tot.c)}</td>
                  <td className="py-2 text-right text-emerald-400">{brl(tot.g)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-zinc-500 mt-2">
            Só contam os acordos de clientes que estavam em Registro SPC no dia do acordo. Faixa = parcelas vencidas no dia do acordo. Nível 1 até {brl(p.nivel1Ate)} • Nível 2 até {brl(p.nivel2Ate)} • Nível 3 acima.
          </p>
        </Panel>

        <Panel titulo="Meta SPC — clientes elegíveis trabalhados" acoes={<Badge texto={`${Math.round(andamento)}% do esperado`} tom={tomSpc} />}>
          <p className="text-xs text-zinc-400">
            Ciclo {dataBR(ms.inicio)} a {dataBR(ms.fim)} • {ms.diasUteis} dias úteis (segunda a sexta, sem feriados nacionais) • {ms.metaDia} por dia útil • cliente único = 1x
          </p>
          <div className="mt-3 flex items-end justify-between">
            <p className="text-3xl font-black text-white">
              {ms.trabalhados} <span className="text-sm text-zinc-500">/ {ms.alvo}</span>
            </p>
            <p className="text-xs text-zinc-400">esperado até hoje: <strong className="text-white">{ms.esperadoHoje}</strong> ({ms.diasAteHoje} dias úteis)</p>
          </div>
          <div className="mt-2">
            <ProgressBar valor={ms.alvo ? (ms.trabalhados / ms.alvo) * 100 : 0} tom={tomSpc} altura="h-2" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(ms.desfechos).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <Badge key={k} texto={`${k}: ${v}`} tom="zinc" />
            ))}
            {!Object.keys(ms.desfechos).length && <span className="text-[11px] text-zinc-500">Nenhum cliente trabalhado no ciclo ainda.</span>}
          </div>
        </Panel>
      </div>

      <Panel titulo="Carteira DLG por situação (hoje)">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {SITUACOES_QUADRO.map((x) => (
            <div key={x} className="rounded-xl border border-white/[0.06] p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{x}</p>
              <p className={`text-2xl font-black ${x === 'Promessa não cumprida' && ind.porSituacao[x] ? 'text-red-400' : 'text-white'}`}>{ind.porSituacao[x] ?? 0}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
