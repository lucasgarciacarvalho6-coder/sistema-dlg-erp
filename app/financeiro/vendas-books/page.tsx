'use client'

// Financeiro › Vendas de books: registro de TODAS as vendas (externas, pelo app, e internas),
// com forma de pagamento e situação das parcelas. O sistema só registra: a cobrança/recebimento
// é feita no sistema de pagamentos de fora.

import { useMemo, useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { useErp } from '@/lib/erp/store'
import { colecao, nomeColaborador, tituloAtrasado } from '@/lib/erp/metrics'
import { brl, dataBR, mesAtual, nomeMes, num } from '@/lib/erp/format'
import { Badge, EmptyState, PageHeader, Panel, StatCard } from '@/components/erp/ui'

const FORMAS = ['PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Boleto']
const selectCls = 'bg-black/50 border border-white/[0.08] rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white outline-none'

function mesesDe(vendas: Registro[]) {
  return [...new Set([mesAtual(), ...vendas.map((v) => String(v.data).slice(0, 7))])].sort().reverse()
}

export default function VendasBooksFinanceiroPage() {
  const s = useErp()
  const [mes, setMes] = useState(mesAtual())
  const [canal, setCanal] = useState('')
  const [forma, setForma] = useState('')

  const todas = colecao(s, 'vendas_ebooks')
  const titulos = colecao(s, 'titulos')
  const vendas = useMemo(
    () =>
      todas
        .filter((v) => String(v.data).startsWith(mes) && (!canal || String(v.canal || 'Interno') === canal) && (!forma || String(v.formaPagamento || 'Boleto') === forma))
        .sort((a, b) => `${b.data}${b.criadoEm}`.localeCompare(`${a.data}${a.criadoEm}`)),
    [todas, mes, canal, forma],
  )
  const titulosDe = (v: Registro) => titulos.filter((t) => t.vendaId === v.id)
  const valor = vendas.reduce((a, v) => a + Number(v.valor || 0), 0)
  const ts = vendas.flatMap(titulosDe)
  const recebido = ts.filter((t) => t.status === 'Pago').reduce((a, t) => a + Number(t.valor || 0), 0)
  const aReceber = ts.filter((t) => t.status === 'Aberto' || t.status === 'Em acordo').reduce((a, t) => a + Number(t.valor || 0), 0)
  const atrasado = ts.filter(tituloAtrasado).reduce((a, t) => a + Number(t.valor || 0), 0)
  const porForma = FORMAS.map((f) => ({ f, total: vendas.filter((v) => String(v.formaPagamento || 'Boleto') === f).reduce((a, v) => a + Number(v.valor || 0), 0) })).filter((x) => x.total > 0)

  const vendedor = (v: Registro) =>
    v.canal === 'Externo' ? String(colecao(s, 'pj_vendedores').find((p) => p.id === v.vendedorExternoId)?.nome ?? 'Vendedor externo') : nomeColaborador(s, v.cobradorId)

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Financeiro / Vendas de books"
        titulo="Vendas de Books"
        descricao="Todas as vendas de books aos pais — externas (app do vendedor) e internas — com forma de pagamento e parcelas. O sistema registra; o pagamento é processado no sistema de pagamentos da empresa."
        acoes={
          <div className="flex flex-wrap gap-2">
            <select value={mes} onChange={(e) => setMes(e.target.value)} className={selectCls}>
              {mesesDe(todas).map((m) => (
                <option key={m} value={m}>{nomeMes(m)}</option>
              ))}
            </select>
            <select value={canal} onChange={(e) => setCanal(e.target.value)} className={selectCls}>
              <option value="">Todos os canais</option>
              <option value="Externo">Externas (app)</option>
              <option value="Interno">Internas</option>
            </select>
            <select value={forma} onChange={(e) => setForma(e.target.value)} className={selectCls}>
              <option value="">Todas as formas</option>
              {FORMAS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-6">
        <StatCard tom="blue" label="Vendas" valor={vendas.length} detalhe={`${num(vendas.reduce((a, v) => a + Number(v.quantidade || 1), 0))} books`} />
        <StatCard tom="violet" label="Valor vendido" valor={brl(valor)} />
        <StatCard tom="emerald" label="Recebido" valor={brl(recebido)} detalhe="PIX, dinheiro, cartão e boletos pagos" />
        <StatCard tom="yellow" label="A receber" valor={brl(aReceber)} detalhe="parcelas de boleto em aberto" />
        <StatCard tom="red" label="Em atraso" valor={brl(atrasado)} detalhe="acompanhado pela Cobrança" />
      </div>

      {porForma.length > 0 && (
        <Panel titulo="Por forma de pagamento" subtitulo={nomeMes(mes)}>
          <div className="space-y-3">
            {porForma.map(({ f, total }) => (
              <div key={f} className="flex items-center gap-4">
                <span className="w-36 text-xs font-bold text-zinc-300">{f}</span>
                <div className="flex-1 h-3 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${valor ? (total / valor) * 100 : 0}%` }}></div>
                </div>
                <span className="w-28 text-right text-xs font-black text-white">{brl(total)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel titulo="Vendas registradas" subtitulo={`${vendas.length} venda(s) em ${nomeMes(mes)}`} semPadding>
        {vendas.length === 0 ? (
          <EmptyState titulo="Nenhuma venda neste filtro" descricao="As vendas do app dos vendedores e as vendas internas aparecem aqui." />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-4 py-4 font-bold">Data</th>
                  <th className="px-4 py-4 font-bold">Canal • vendedor</th>
                  <th className="px-4 py-4 font-bold">Escola</th>
                  <th className="px-4 py-4 font-bold">Criança • responsável</th>
                  <th className="px-4 py-4 font-bold">Pagamento</th>
                  <th className="px-4 py-4 font-bold text-right">Valor</th>
                  <th className="px-4 py-4 font-bold">Parcelas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {vendas.map((v) => {
                  const tv = titulosDe(v)
                  const pagas = tv.filter((t) => t.status === 'Pago').length
                  const atraso = tv.filter(tituloAtrasado).length
                  return (
                    <tr key={v.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-400">{dataBR(String(v.data))}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge texto={v.canal === 'Externo' ? 'Externa' : 'Interna'} tom={v.canal === 'Externo' ? 'orange' : 'blue'} />
                        <p className="text-[11px] text-zinc-400 mt-1">{vendedor(v)}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">{String(v.escola)}</td>
                      <td className="px-4 py-3 min-w-[200px]">
                        <p className="text-white text-xs font-bold">{String(v.aluno)}</p>
                        <p className="text-[11px] text-zinc-500">
                          {String(v.responsavel)}
                          {v.telefone ? ` • ${String(v.telefone)}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {String(v.formaPagamento || 'Boleto')}
                        {Number(v.parcelas) > 1 ? ` • ${String(v.parcelas)}x` : ''}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-black text-white">{brl(Number(v.valor || 0))}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {tv.length === 0 ? (
                          <span className="text-zinc-600">—</span>
                        ) : pagas === tv.length ? (
                          <span className="text-emerald-400 font-bold">✓ Quitado</span>
                        ) : (
                          <span>
                            {pagas}/{tv.length} pagas
                            {atraso > 0 && <span className="text-red-400 font-bold"> • {atraso} em atraso</span>}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
