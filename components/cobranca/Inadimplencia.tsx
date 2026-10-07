'use client'

// Cobrança › Inadimplência por pessoa (07/10/2026). A Cobrança só recebe a inadimplência para renegociar a dívida:
// aqui aparecem SÓ as parcelas vencidas e não pagas, um nome por linha. Clicando no nome abre a ficha com os boletos
// atrasados; "Negociar" gera o acordo. Receber e dar baixa é do Financeiro (Contas a Receber).

import { useMemo, useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { negociarTitulo, useErp, usePode } from '@/lib/erp/store'
import { colecao, tituloAtrasado } from '@/lib/erp/metrics'
import { brl, dataBR } from '@/lib/erp/format'
import { exportarCSV } from '@/lib/erp/export'
import { agruparPorPessoa, blocosPorVenda, diasAtraso, ordemParcela, pessoaNaBusca, valorDe, type Pessoa } from '@/lib/erp/contas-receber'
import Icon from '@/components/erp/Icon'
import { BuscaPessoas, CabecalhoVenda, DadosPessoa, NomePessoa, Total } from '@/components/erp/ContasPessoa'
import { EmptyState, Modal, PageHeader, Panel, StatCard, btnPrimario, btnSecundario } from '@/components/erp/ui'

const PARCELAS_ACORDO = 3

// quem está há mais tempo sem pagar vem primeiro
const ordemAtraso = (a: Pessoa, b: Pessoa) => b.diasAtraso - a.diasAtraso || b.emAtraso - a.emAtraso || a.nome.localeCompare(b.nome, 'pt-BR')

export default function Inadimplencia() {
  const s = useErp()
  const podeFazer = usePode()
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [negociar, setNegociar] = useState<Registro | null>(null)

  const pNegociar = podeFazer('cobranca', 'criar')
  const pExportar = podeFazer('cobranca', 'exportar')

  const vencidas = colecao(s, 'titulos').filter(tituloAtrasado)
  const nomeCobrador = (id: string) => s.colaboradores.find((c) => c.id === id)?.nome ?? ''
  const pessoas = useMemo(
    () => agruparPorPessoa(colecao(s, 'titulos').filter(tituloAtrasado), (id) => s.colaboradores.find((c) => c.id === id)?.nome ?? '').sort(ordemAtraso),
    [s],
  )
  const visiveis = useMemo(() => pessoas.filter((p) => pessoaNaBusca(p, busca)), [pessoas, busca])
  const pessoa = aberta ? pessoas.find((p) => p.chave === aberta) : undefined

  const valorAtraso = vencidas.reduce((a, t) => a + valorDe(t), 0)
  const atrasoMedio = vencidas.length ? Math.round(vencidas.reduce((a, t) => a + diasAtraso(String(t.vencimento)), 0) / vencidas.length) : 0

  const exportar = () =>
    exportarCSV(
      'inadimplencia',
      [
        { chave: 'cliente', label: 'Responsável' },
        { chave: 'aluno', label: 'Aluno' },
        { chave: 'escola', label: 'Escola' },
        { chave: 'telefone', label: 'Telefone' },
        { chave: 'parcela', label: 'Parcela' },
        { chave: 'valor', label: 'Valor' },
        { chave: 'vencimento', label: 'Vencimento' },
        { chave: 'dias', label: 'Dias de atraso' },
        { chave: 'cobrador', label: 'Cobrador' },
      ],
      visiveis.flatMap((p) =>
        [...p.titulos].sort(ordemParcela).map((t) => ({
          cliente: String(t.cliente ?? ''),
          aluno: String(t.aluno ?? ''),
          escola: String(t.escola ?? ''),
          telefone: String(t.telefone ?? ''),
          parcela: String(t.parcela ?? ''),
          valor: brl(valorDe(t)),
          vencimento: dataBR(String(t.vencimento ?? '')),
          dias: diasAtraso(String(t.vencimento)),
          cobrador: t.cobradorId ? nomeCobrador(String(t.cobradorId)) : '',
        })),
      ),
    )

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Cobrança / Inadimplência"
        titulo="Inadimplência"
        descricao="Quem está com boleto vencido e não pago, um nome por linha. Clique no nome para ver os boletos atrasados e negociar."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
        <StatCard label="Clientes em atraso" valor={pessoas.length} tom={pessoas.length ? 'red' : 'zinc'} />
        <StatCard label="Valor em atraso" valor={brl(valorAtraso)} tom={valorAtraso ? 'red' : 'zinc'} />
        <StatCard label="Atraso médio" valor={`${atrasoMedio} dias`} />
      </div>

      <Panel
        semPadding
        titulo={`Pessoas em atraso • ${visiveis.length}`}
        acoes={
          <>
            <BuscaPessoas valor={busca} onChange={setBusca} rotulo="Pesquisar inadimplência" />
            {pExportar && (
              <button onClick={exportar} className={btnSecundario} title="Exportar os boletos vencidos da lista em CSV">
                <Icon nome="download" className="w-4 h-4" /> CSV
              </button>
            )}
          </>
        }
      >
        {visiveis.length === 0 ? (
          <EmptyState titulo={busca ? 'Ninguém encontrado' : 'Ninguém em atraso'} descricao={busca ? 'Mude a pesquisa.' : 'Não há boletos vencidos sem pagamento.'} />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-5 py-3 font-bold">Responsável</th>
                  <th className="px-5 py-3 font-bold">Boletos vencidos</th>
                  <th className="px-5 py-3 font-bold text-right">Valor em atraso</th>
                  <th className="px-5 py-3 font-bold">Venceu em</th>
                  <th className="px-5 py-3 font-bold">Dias de atraso</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {visiveis.map((p) => (
                  <tr key={p.chave} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => setAberta(p.chave)}>
                    <td className="px-5 py-3">
                      <NomePessoa p={p} />
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">{p.vencidas}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap font-bold text-red-400">{brl(p.emAtraso)}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{dataBR(p.maisAntigo)}</td>
                    <td className="px-5 py-3 whitespace-nowrap font-black text-red-400">{p.diasAtraso} dias</td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400 whitespace-nowrap">Abrir →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        aberto={!!pessoa}
        titulo={pessoa?.nome ?? ''}
        subtitulo={pessoa ? `Inadimplência • ${pessoa.vencidas} boleto(s) vencido(s)` : ''}
        onFechar={() => setAberta(null)}
        largura="max-w-4xl"
        rodape={<button onClick={() => setAberta(null)} className={btnSecundario}>Fechar</button>}
      >
        {pessoa && (
          <div className="space-y-6">
            <DadosPessoa p={pessoa} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Total rotulo="Em atraso" valor={brl(pessoa.emAtraso)} tom="red" />
              <Total rotulo="Boletos vencidos" valor={pessoa.vencidas} />
              <Total rotulo="Maior atraso" valor={`${pessoa.diasAtraso} dias`} tom="red" />
            </div>
            {blocosPorVenda(pessoa.titulos, colecao(s, 'vendas_ebooks')).map(({ vendaId, ts, venda }) => (
              <div key={vendaId || 'avulso'} className="rounded-2xl border border-white/[0.06] overflow-hidden">
                <CabecalhoVenda vendaId={vendaId} venda={venda} ts={ts} />
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-sm text-zinc-300">
                    <thead className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 border-b border-white/[0.05]">
                      <tr>
                        <th className="px-4 py-2.5 font-bold">Parcela</th>
                        <th className="px-4 py-2.5 font-bold">Vencimento</th>
                        <th className="px-4 py-2.5 font-bold text-right">Valor</th>
                        <th className="px-4 py-2.5 font-bold">Dias de atraso</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.02]">
                      {ts.map((t) => (
                        <tr key={t.id}>
                          <td className="px-4 py-2.5 font-bold text-white whitespace-nowrap">{String(t.parcela ?? '—')}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-red-400 font-bold">{dataBR(String(t.vencimento ?? ''))}</td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap font-bold text-white">{brl(valorDe(t))}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap font-black text-red-400">{diasAtraso(String(t.vencimento))} dias</td>
                          <td className="px-4 py-2.5 text-right">
                            {pNegociar && (
                              <button
                                onClick={() => setNegociar(t)}
                                className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap transition-all text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20"
                              >
                                Negociar ({PARCELAS_ACORDO}x)
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        aberto={!!negociar}
        titulo="Negociar"
        subtitulo="O acordo segue para aprovação"
        onFechar={() => setNegociar(null)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setNegociar(null)} className={btnSecundario}>Cancelar</button>
            <button
              onClick={() => {
                if (negociar) void negociarTitulo(negociar.id, PARCELAS_ACORDO)
                setNegociar(null)
              }}
              className={btnPrimario}
            >
              Gerar acordo
            </button>
          </>
        }
      >
        {negociar && (
          <p className="text-sm text-zinc-300">
            Gerar um acordo em <strong className="text-white">{PARCELAS_ACORDO}x</strong> para a parcela <strong className="text-white">{String(negociar.parcela)}</strong> de{' '}
            <strong className="text-white">{String(negociar.cliente)}</strong> ({brl(valorDe(negociar))}, vencida há {diasAtraso(String(negociar.vencimento))} dias)?
          </p>
        )}
      </Modal>
    </div>
  )
}
