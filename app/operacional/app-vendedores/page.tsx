'use client'

// Operacional › App dos Vendedores: tudo o que chega do app dos vendedores externos.
// Contratos de escola enviados pelo app vão direto para Contratos de Escola (Em conferência, selo 📱 APP).

import { useState } from 'react'
import Link from 'next/link'
import type { Registro } from '@/lib/erp/types'
import { atualizarRegistro, urlArquivoContrato, useErp, usePode } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { lerJSON } from '@/lib/erp/operacional'
import { brl, dataBR, mesAtual, num } from '@/lib/erp/format'
import { Badge, EmptyState, PageHeader, Panel, StatCard, Tabs, btnSecundario } from '@/components/erp/ui'

type Aba = 'documentos' | 'vendas' | 'devolucoes'

const nomeVendedor = (s: ReturnType<typeof useErp>, id: unknown) => String(colecao(s, 'pj_vendedores').find((v) => v.id === id)?.nome ?? '—')

async function abrirPagina(caminho: string) {
  const url = await urlArquivoContrato(caminho)
  if (url) window.open(url, '_blank')
}

function Paginas({ r }: { r: Registro }) {
  const paginas = lerJSON<string[]>(r.paginas, [])
  if (!paginas.length) return <span className="text-zinc-600 text-xs">—</span>
  return (
    <div className="flex gap-1.5">
      {paginas.map((p, i) => (
        <button key={p} onClick={() => abrirPagina(p)} className="px-2 py-1 rounded-lg border border-white/[0.08] text-[10px] font-bold text-blue-400 hover:bg-white/[0.05]">
          Pág. {i + 1}
        </button>
      ))}
    </div>
  )
}

export default function AppVendedoresPage() {
  const s = useErp()
  const podeFazer = usePode()
  const pEditar = podeFazer('operacional', 'editar')
  const [aba, setAba] = useState<Aba>('documentos')
  const mes = mesAtual()

  const documentos = colecao(s, 'documentos_externos').sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))
  const vendas = colecao(s, 'vendas_ebooks')
    .filter((v) => v.canal === 'Externo')
    .sort((a, b) => `${b.data}${b.criadoEm}`.localeCompare(`${a.data}${a.criadoEm}`))
  const devolucoes = colecao(s, 'devolucoes_books').sort((a, b) => String(b.data).localeCompare(String(a.data)))
  const contratosApp = colecao(s, 'contratos_escola').filter((c) => c.origem === 'App')
  const vendasMes = vendas.filter((v) => String(v.data).startsWith(mes))

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Módulo / Operações"
        titulo="App dos Vendedores"
        descricao="O que os vendedores externos enviam pelo app: documentos, vendas de books e books devolvidos. Os contratos de escola enviados pelo app caem direto em Contratos de Escola."
        acoes={
          <Link href="/operacional/contratos" className={btnSecundario}>
            Contratos enviados pelo app ({contratosApp.filter((c) => c.status === 'Em conferência').length} em conferência)
          </Link>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard tom="blue" label="Documentos a conferir" valor={documentos.filter((d) => d.status === 'Recebido').length} />
        <StatCard tom="emerald" label="Vendas externas no mês" valor={vendasMes.length} detalhe={brl(vendasMes.reduce((a, v) => a + Number(v.valor || 0), 0))} />
        <StatCard tom="violet" label="Books vendidos no mês" valor={num(vendasMes.reduce((a, v) => a + Number(v.quantidade || 1), 0))} detalhe="pelos vendedores de books" />
        <StatCard tom="orange" label="Books devolvidos no mês" valor={num(devolucoes.filter((d) => String(d.data).startsWith(mes)).reduce((a, d) => a + Number(d.quantidade || 0), 0))} detalhe="seguem para as vendas internas" />
      </div>

      <Tabs
        abas={[
          { id: 'documentos', label: `Documentos (${documentos.length})` },
          { id: 'vendas', label: `Vendas externas (${vendas.length})` },
          { id: 'devolucoes', label: `Books devolvidos (${devolucoes.length})` },
        ]}
        ativa={aba}
        onChange={setAba}
      />

      {aba === 'documentos' && (
        <Panel titulo="Documentos recebidos" semPadding>
          {documentos.length === 0 ? (
            <EmptyState titulo="Nenhum documento enviado" descricao="Os vendedores enviam contratos de venda, comprovantes e outros documentos pelo app." />
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-zinc-300">
                <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                  <tr>
                    <th className="px-4 py-4 font-bold">Data</th>
                    <th className="px-4 py-4 font-bold">Vendedor</th>
                    <th className="px-4 py-4 font-bold">Tipo</th>
                    <th className="px-4 py-4 font-bold">Escola • descrição</th>
                    <th className="px-4 py-4 font-bold">Fotos</th>
                    <th className="px-4 py-4 font-bold text-right">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {documentos.map((d) => (
                    <tr key={d.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-400">{dataBR(String(d.criadoEm).slice(0, 10))}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-white font-bold">{nomeVendedor(s, d.vendedorId)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge texto={String(d.tipo)} tom={d.tipo === 'Contrato de venda' ? 'blue' : d.tipo === 'Comprovante' ? 'emerald' : 'zinc'} />
                      </td>
                      <td className="px-4 py-3 min-w-[220px]">
                        <p className="text-white text-xs font-bold">{String(d.escola || '—')}</p>
                        <p className="text-[11px] text-zinc-500">{String(d.descricao || '')}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Paginas r={d} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {d.status === 'Conferido' ? (
                          <Badge texto="Conferido" tom="emerald" />
                        ) : pEditar ? (
                          <button onClick={() => atualizarRegistro('documentos_externos', d.id, { status: 'Conferido' }, 'operacional')} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border text-emerald-400 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20">
                            Marcar conferido
                          </button>
                        ) : (
                          <Badge texto="Recebido" tom="orange" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {aba === 'vendas' && (
        <Panel titulo="Vendas externas de books" subtitulo="Registradas pelos vendedores de books no app. Todas aparecem no Financeiro; as de boleto geram parcelas na Cobrança." semPadding>
          {vendas.length === 0 ? (
            <EmptyState titulo="Nenhuma venda externa" descricao="As vendas registradas no app aparecem aqui." />
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-zinc-300">
                <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                  <tr>
                    <th className="px-4 py-4 font-bold">Data</th>
                    <th className="px-4 py-4 font-bold">Vendedor</th>
                    <th className="px-4 py-4 font-bold">Escola</th>
                    <th className="px-4 py-4 font-bold">Criança • responsável</th>
                    <th className="px-4 py-4 font-bold">Pagamento</th>
                    <th className="px-4 py-4 font-bold text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {vendas.map((v) => (
                    <tr key={v.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-400">{dataBR(String(v.data))}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-white font-bold">{nomeVendedor(s, v.vendedorExternoId)}</td>
                      <td className="px-4 py-3 text-xs">{String(v.escola)}</td>
                      <td className="px-4 py-3 min-w-[200px]">
                        <p className="text-white text-xs font-bold">{String(v.aluno)}</p>
                        <p className="text-[11px] text-zinc-500">
                          {String(v.responsavel)} • {String(v.telefone || '')}
                        </p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {String(v.formaPagamento)}
                        {Number(v.parcelas) > 1 ? ` • ${String(v.parcelas)}x` : ''}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-black text-white">{brl(Number(v.valor || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {aba === 'devolucoes' && (
        <Panel titulo="Books devolvidos" subtitulo="Não vendidos pelo vendedor externo: voltam para a empresa e seguem para as vendas internas (rebolo)." semPadding>
          {devolucoes.length === 0 ? (
            <EmptyState titulo="Nenhuma devolução" descricao="O vendedor de books informa no app quantos books voltaram de cada escola." />
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-zinc-300">
                <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                  <tr>
                    <th className="px-4 py-4 font-bold">Data</th>
                    <th className="px-4 py-4 font-bold">Vendedor</th>
                    <th className="px-4 py-4 font-bold">Escola</th>
                    <th className="px-4 py-4 font-bold text-right">Books</th>
                    <th className="px-4 py-4 font-bold">Observação</th>
                    <th className="px-4 py-4 font-bold text-right">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {devolucoes.map((d) => (
                    <tr key={d.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-400">{dataBR(String(d.data))}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-white font-bold">{nomeVendedor(s, d.vendedorId)}</td>
                      <td className="px-4 py-3 text-xs">{String(d.escola)}</td>
                      <td className="px-4 py-3 text-right font-black text-white">{num(Number(d.quantidade))}</td>
                      <td className="px-4 py-3 text-xs text-zinc-400">{String(d.observacao || '—')}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {d.status === 'Recebido na empresa' ? (
                          <Badge texto="Recebido na empresa" tom="emerald" />
                        ) : pEditar ? (
                          <button onClick={() => atualizarRegistro('devolucoes_books', d.id, { status: 'Recebido na empresa' }, 'operacional')} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border text-emerald-400 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20">
                            Confirmar recebimento
                          </button>
                        ) : (
                          <Badge texto="Devolvido" tom="orange" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
