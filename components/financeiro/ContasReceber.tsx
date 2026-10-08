'use client'

// Financeiro › Contas a Receber (carteira nova, SQLs 041/042). Todo recebimento é do Financeiro; a Cobrança só vê
// a inadimplência. Um nome por linha (busca no servidor, 50 por vez); clicando no nome abre a ficha com as cobranças
// da pessoa — cada uma com a conta (CA Beatriz / CA Diogo), as parcelas e os recebimentos. A baixa é dada lá:
// pode ser parcial; o que passar do saldo é juros/multa; "quitar" fecha a parcela e o que faltar vira desconto.
// O recebimento entra na meta de valor recebido do cobrador. Estornar e excluir: só o ADM.

import { useEffect, useMemo, useState } from 'react'
import { useErp, usePode, registrarRecebimento, estornarRecebimento, editarParcela, mudarSituacaoParcela, lancarCobranca, editarCobranca, excluirCobranca } from '@/lib/erp/store'
import { colecao, equipe } from '@/lib/erp/metrics'
import { brl, dataBR, hoje, mesAtual } from '@/lib/erp/format'
import { exportarCSV } from '@/lib/erp/export'
import { formatarDocumento } from '@/lib/erp/documento'
import { buscarClientes, FILTRO_VAZIO, type Cliente } from '@/lib/erp/clientes'
import { CONTAS_COBRANCA, CONTA_PADRAO, FORMAS_RECEBIMENTO, ORDEM_SITUACAO, TOM_SITUACAO, type CobrancaV, type PagamentoV, type ParcelaV } from '@/lib/erp/carteira'
import { FILTRO_RECEBER, POR_PAGINA_CARTEIRA, buscarContasReceber, todasAsPaginas, useContasReceber, useFichaCarteira, useIndicadores, type FiltroReceber } from '@/lib/erp/cobrancas'
import Icon from '@/components/erp/Icon'
import {
  BuscaPessoas,
  CabecalhoCobranca,
  DadosCliente,
  Filtro,
  NomeCliente,
  Paginacao,
  SelecaoConta,
  SeloConta,
  Total,
  dataOuTraco,
  rotuloParcela,
  situacaoParcela,
  useAtrasado,
} from '@/components/erp/ContasPessoa'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, btnBranco, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

const btnAcao = 'px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap transition-all text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20'
const btnIcone = 'p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.05] transition-all'
const numero = (v: string) => Number(String(v).replace(',', '.')) || 0

type Receber = { parcela: ParcelaV; cobranca: CobrancaV }

export default function ContasReceber() {
  const podeFazer = usePode()
  const [filtro, setFiltro] = useState<FiltroReceber>(FILTRO_RECEBER)
  const [busca, setBusca] = useState('')
  const termo = useAtrasado(busca)
  const [pagina, setPagina] = useState(0)
  const [aberta, setAberta] = useState<{ id: string; nome: string } | null>(null)
  const [receber, setReceber] = useState<Receber | null>(null)
  const [editar, setEditar] = useState<ParcelaV | null>(null)
  const [estornar, setEstornar] = useState<PagamentoV | null>(null)
  const [cancelar, setCancelar] = useState<ParcelaV | null>(null)
  const [editarCob, setEditarCob] = useState<CobrancaV | null>(null)
  const [excluirCob, setExcluirCob] = useState<CobrancaV | null>(null)
  const [lancar, setLancar] = useState(false)

  const pCriar = podeFazer('financeiro', 'criar')
  const pEditar = podeFazer('financeiro', 'editar')
  const pExcluir = podeFazer('financeiro', 'excluir')
  const pExportar = podeFazer('financeiro', 'exportar')

  const f = useMemo(() => ({ ...filtro, termo }), [filtro, termo])
  const { linhas, total, erro, carregando } = useContasReceber(f, pagina)
  const ind = useIndicadores(mesAtual())
  const { ficha, carregando: carregandoFicha } = useFichaCarteira(aberta?.id ?? null)

  const mudar = (x: Partial<FiltroReceber>) => {
    setFiltro({ ...filtro, ...x })
    setPagina(0)
  }
  const todosClientes = ORDEM_SITUACAO.reduce((a, st) => a + (ind.clientesSituacao[st] ?? 0), 0)

  const exportar = async () => {
    const todos = await todasAsPaginas((p, n) => buscarContasReceber(f, p, n))
    exportarCSV(
      'contas-a-receber',
      [
        { chave: 'cliente', label: 'Cliente' },
        { chave: 'documento', label: 'CPF/CNPJ' },
        { chave: 'telefone', label: 'Telefone' },
        { chave: 'cidade', label: 'Cidade' },
        { chave: 'contas', label: 'Conta' },
        { chave: 'referencias', label: 'Referências' },
        { chave: 'parcelas', label: 'Parcelas pagas' },
        { chave: 'emAberto', label: 'Em aberto' },
        { chave: 'vencido', label: 'Em atraso' },
        { chave: 'atualizado', label: 'Atraso com juros e multa' },
        { chave: 'vencePrimeiro', label: 'Próximo vencimento' },
        { chave: 'situacao', label: 'Situação' },
      ],
      todos.map((c) => ({
        ...c,
        documento: c.documento ? formatarDocumento(c.documento) : '',
        cidade: [c.cidade, c.uf].filter(Boolean).join('/'),
        contas: c.contas.join(', '),
        parcelas: `${c.parcelasPagas} de ${c.parcelas}`,
        emAberto: brl(c.emAberto),
        vencido: brl(c.vencido),
        atualizado: brl(c.atualizado),
        vencePrimeiro: c.vencePrimeiro ? dataBR(c.vencePrimeiro) : '',
      })),
    )
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Financeiro / Contas a Receber"
        titulo="Contas a Receber"
        descricao="Um nome por linha. Clique no nome para ver as cobranças da pessoa (com a conta CA Beatriz ou CA Diogo), as parcelas e dar a baixa ao receber."
        acoes={
          pCriar && (
            <button onClick={() => setLancar(true)} className={btnBranco}>
              <Icon nome="plus" className="w-5 h-5" /> Lançar cobrança
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Em aberto" valor={brl(ind.emAberto)} detalhe={`${ind.parcelasAbertas} parcela(s)`} />
        <StatCard label="Em atraso" valor={brl(ind.emAtraso)} tom={ind.emAtraso ? 'red' : 'zinc'} detalhe={`${ind.parcelasVencidas} parcela(s) • com juros e multa ${brl(ind.atualizadoAtraso)}`} />
        <StatCard label="Vence hoje" valor={brl(ind.venceHoje)} tom={ind.venceHoje ? 'yellow' : 'zinc'} />
        <StatCard label="Recebido no mês" valor={brl(ind.recebidoMes)} detalhe={`Hoje: ${brl(ind.recebidoHoje)}`} />
      </div>

      <Panel
        semPadding
        titulo={`Pessoas • ${total}`}
        acoes={
          <>
            <BuscaPessoas
              valor={busca}
              onChange={(v) => {
                setBusca(v)
                setPagina(0)
              }}
              rotulo="Pesquisar contas a receber"
            />
            <SelecaoConta valor={filtro.conta} onChange={(conta) => mudar({ conta })} />
            {pExportar && (
              <button onClick={() => void exportar()} className={btnSecundario} title="Exportar a lista (com o filtro) em CSV">
                <Icon nome="download" className="w-4 h-4" /> CSV
              </button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap gap-2 px-5 py-4 border-b border-white/[0.05]">
          <Filtro ativo={filtro.situacao === ''} onClick={() => mudar({ situacao: '' })}>
            Todos ({todosClientes})
          </Filtro>
          {ORDEM_SITUACAO.filter((st) => ind.clientesSituacao[st]).map((st) => (
            <Filtro key={st} ativo={filtro.situacao === st} onClick={() => mudar({ situacao: filtro.situacao === st ? '' : st })}>
              {st} ({ind.clientesSituacao[st]})
            </Filtro>
          ))}
        </div>

        {erro ? (
          <p className="p-6 text-sm font-bold text-red-400">{erro}</p>
        ) : linhas.length === 0 && !carregando ? (
          <EmptyState titulo="Ninguém encontrado" descricao={busca || filtro.situacao || filtro.conta ? 'Mude a pesquisa ou o filtro.' : 'Não há contas a receber.'} />
        ) : (
          <div className={`overflow-x-auto custom-scrollbar transition-opacity ${carregando ? 'opacity-50' : ''}`}>
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-5 py-3 font-bold">Cliente</th>
                  <th className="px-5 py-3 font-bold">Conta</th>
                  <th className="px-5 py-3 font-bold">Parcelas</th>
                  <th className="px-5 py-3 font-bold text-right">Em aberto</th>
                  <th className="px-5 py-3 font-bold text-right">Em atraso</th>
                  <th className="px-5 py-3 font-bold">Próximo vencimento</th>
                  <th className="px-5 py-3 font-bold">Situação</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {linhas.map((c) => (
                  <tr key={c.clienteId} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => setAberta({ id: c.clienteId, nome: c.cliente })}>
                    <td className="px-5 py-3">
                      <NomeCliente nome={c.cliente} referencias={c.referencias} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.contas.map((x) => (
                          <SeloConta key={x} conta={x} />
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {c.parcelasPagas} de {c.parcelas} paga(s)
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap font-bold text-white">{c.emAberto ? brl(c.emAberto) : <span className="text-zinc-600">—</span>}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap font-bold">{c.vencido ? <span className="text-red-400">{brl(c.vencido)}</span> : <span className="text-zinc-600">—</span>}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {c.vencePrimeiro ? <span className={c.vencePrimeiro < hoje() ? 'text-red-400 font-bold' : ''}>{dataBR(c.vencePrimeiro)}</span> : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge texto={c.situacao} tom={TOM_SITUACAO[c.situacao]} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400 whitespace-nowrap">Abrir →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginacao pagina={pagina} porPagina={POR_PAGINA_CARTEIRA} total={total} carregando={carregando} onMudar={setPagina} />
      </Panel>

      <Modal
        aberto={!!aberta}
        titulo={aberta?.nome ?? ''}
        subtitulo={ficha && aberta ? `Contas a receber • ${ficha.cobrancas.length} cobrança(s)` : 'Carregando...'}
        onFechar={() => setAberta(null)}
        largura="max-w-5xl"
        rodape={<button onClick={() => setAberta(null)} className={btnSecundario}>Fechar</button>}
      >
        {!ficha || (carregandoFicha && ficha.cobrancas.length === 0) ? (
          <p className="text-sm text-zinc-500">Carregando...</p>
        ) : ficha.cobrancas.length === 0 ? (
          <p className="text-sm text-zinc-500">Esta pessoa não tem mais cobranças.</p>
        ) : (
          <FichaReceber
            cobrancas={ficha.cobrancas}
            parcelas={ficha.parcelas}
            pagamentos={ficha.pagamentos}
            pEditar={pEditar}
            pExcluir={pExcluir}
            onReceber={setReceber}
            onEditar={setEditar}
            onCancelar={setCancelar}
            onReabrir={(p) => void mudarSituacaoParcela(p.id, 'Aberta')}
            onEstornar={setEstornar}
            onEditarCobranca={setEditarCob}
            onExcluirCobranca={setExcluirCob}
          />
        )}
      </Modal>

      {receber && <ModalReceber r={receber} onFechar={() => setReceber(null)} />}
      {editar && <ModalEditarParcela p={editar} onFechar={() => setEditar(null)} />}
      {estornar && <ModalEstornar g={estornar} onFechar={() => setEstornar(null)} />}
      {editarCob && <ModalEditarCobranca c={editarCob} onFechar={() => setEditarCob(null)} />}
      {lancar && (
        <ModalLancar
          onFechar={(cliente) => {
            setLancar(false)
            if (cliente) setAberta(cliente)
          }}
        />
      )}

      <Modal
        aberto={!!cancelar}
        titulo="Cancelar parcela"
        subtitulo="Ela sai do que falta receber (dá para reabrir depois)"
        onFechar={() => setCancelar(null)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setCancelar(null)} className={btnSecundario}>Voltar</button>
            <button
              onClick={() => {
                if (cancelar) void mudarSituacaoParcela(cancelar.id, 'Cancelada')
                setCancelar(null)
              }}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all"
            >
              Cancelar parcela
            </button>
          </>
        }
      >
        {cancelar && (
          <p className="text-sm text-zinc-300">
            Cancelar a parcela <strong className="text-white">{rotuloParcela(cancelar.numero, cancelar.total)}</strong> de <strong className="text-white">{brl(cancelar.saldo)}</strong> (vencimento {dataBR(cancelar.vencimento)})?
          </p>
        )}
      </Modal>

      <Modal
        aberto={!!excluirCob}
        titulo="Excluir cobrança"
        subtitulo="Esta ação ficará registrada na auditoria"
        onFechar={() => setExcluirCob(null)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setExcluirCob(null)} className={btnSecundario}>Voltar</button>
            <button
              onClick={() => {
                if (excluirCob) void excluirCobranca(excluirCob.id)
                setExcluirCob(null)
              }}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all"
            >
              Excluir
            </button>
          </>
        }
      >
        {excluirCob && (
          <p className="text-sm text-zinc-300">
            Excluir a cobrança <strong className="text-white">{excluirCob.referencia || excluirCob.origem}</strong> ({excluirCob.parcelas} parcela(s), {brl(excluirCob.valorTotal)}) de {excluirCob.cliente}? Se tiver recebimento,
            estorne antes. Não é possível desfazer.
          </p>
        )}
      </Modal>
    </div>
  )
}

function FichaReceber({
  cobrancas,
  parcelas,
  pagamentos,
  pEditar,
  pExcluir,
  onReceber,
  onEditar,
  onCancelar,
  onReabrir,
  onEstornar,
  onEditarCobranca,
  onExcluirCobranca,
}: {
  cobrancas: CobrancaV[]
  parcelas: ParcelaV[]
  pagamentos: PagamentoV[]
  pEditar: boolean
  pExcluir: boolean
  onReceber: (r: Receber) => void
  onEditar: (p: ParcelaV) => void
  onCancelar: (p: ParcelaV) => void
  onReabrir: (p: ParcelaV) => void
  onEstornar: (g: PagamentoV) => void
  onEditarCobranca: (c: CobrancaV) => void
  onExcluirCobranca: (c: CobrancaV) => void
}) {
  const soma = (fn: (c: CobrancaV) => number) => cobrancas.reduce((a, c) => a + fn(c), 0)
  // as que ainda têm o que receber primeiro; depois as quitadas
  const lista = [...cobrancas].sort((a, b) => Number(b.parcelasAbertas > 0) - Number(a.parcelasAbertas > 0) || a.criadoEm.localeCompare(b.criadoEm))
  return (
    <div className="space-y-6">
      <DadosCliente cobrancas={cobrancas} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Total rotulo="Total" valor={brl(soma((c) => c.valorTotal))} />
        <Total rotulo="Recebido" valor={brl(soma((c) => c.recebido))} />
        <Total rotulo="Em aberto" valor={brl(soma((c) => c.emAberto))} />
        <Total rotulo="Em atraso (com juros e multa)" valor={brl(soma((c) => c.atualizado))} tom="red" />
      </div>

      {lista.map((c) => {
        const ps = parcelas.filter((p) => p.cobrancaId === c.id).sort((a, b) => a.numero - b.numero || a.vencimento.localeCompare(b.vencimento))
        const gs = pagamentos.filter((g) => g.cobrancaId === c.id).sort((a, b) => a.data.localeCompare(b.data) || a.criadoEm.localeCompare(b.criadoEm))
        return (
          <div key={c.id} className="rounded-2xl border border-white/[0.06] overflow-hidden">
            <CabecalhoCobranca
              c={c}
              acoes={
                <>
                  {pEditar && (
                    <button onClick={() => onEditarCobranca(c)} title="Trocar conta, categoria ou cobrador" className={btnIcone}>
                      <Icon nome="edit" className="w-4 h-4" />
                    </button>
                  )}
                  {pExcluir && (
                    <button onClick={() => onExcluirCobranca(c)} title="Excluir cobrança" className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                      <Icon nome="trash" className="w-4 h-4" />
                    </button>
                  )}
                </>
              }
            />
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-zinc-300">
                <thead className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 border-b border-white/[0.05]">
                  <tr>
                    <th className="px-4 py-2.5 font-bold">Parcela</th>
                    <th className="px-4 py-2.5 font-bold">Vencimento</th>
                    <th className="px-4 py-2.5 font-bold text-right">Valor</th>
                    <th className="px-4 py-2.5 font-bold text-right">A receber</th>
                    <th className="px-4 py-2.5 font-bold">Situação</th>
                    <th className="px-4 py-2.5 font-bold">Pago em</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {ps.map((p) => {
                    const aberta = p.situacao === 'Aberta' || p.situacao === 'Parcial'
                    return (
                      <tr key={p.id}>
                        <td className="px-4 py-2.5 font-bold text-white whitespace-nowrap">{rotuloParcela(p.numero, p.total)}</td>
                        <td className={`px-4 py-2.5 whitespace-nowrap ${p.vencida ? 'text-red-400 font-bold' : ''}`}>{dataBR(p.vencimento)}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">{brl(p.valor)}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {aberta ? (
                            <>
                              <span className="font-bold text-white">{brl(p.atualizado)}</span>
                              {p.vencida && (
                                <p className="text-[10px] text-zinc-500">
                                  {p.cobraJuros ? `saldo ${brl(p.saldo)} + multa ${brl(p.multaDevida)} + juros ${brl(p.juros)}` : `valor do sistema antigo (sem juros)${p.multaDevida ? ` + multa ${brl(p.multaDevida)}` : ''}`}
                                </p>
                              )}
                              {!p.vencida && p.baixado > 0 && <p className="text-[10px] text-zinc-500">já recebido {brl(p.baixado)}</p>}
                            </>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge texto={situacaoParcela(p)} />
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{dataOuTraco(p.pagoEm)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end items-center gap-1.5">
                            {pEditar && aberta && (
                              <button onClick={() => onReceber({ parcela: p, cobranca: c })} className={btnAcao}>
                                Receber
                              </button>
                            )}
                            {pEditar && p.situacao !== 'Paga' && (
                              <button onClick={() => onEditar(p)} title="Editar parcela (valor, vencimento, multa)" className={btnIcone}>
                                <Icon nome="edit" className="w-4 h-4" />
                              </button>
                            )}
                            {pEditar && aberta && p.baixado === 0 && (
                              <button onClick={() => onCancelar(p)} title="Cancelar parcela" className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                                <Icon nome="x" className="w-4 h-4" />
                              </button>
                            )}
                            {pEditar && p.situacao === 'Cancelada' && (
                              <button onClick={() => onReabrir(p)} className={btnAcao}>
                                Reabrir
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {gs.length > 0 && (
              <div className="border-t border-white/[0.05] px-4 py-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Recebimentos</p>
                {gs.map((g) => {
                  const p = ps.find((x) => x.id === g.parcelaId)
                  const partes = [g.encargos ? `juros/multa ${brl(g.encargos)}` : '', g.desconto ? `desconto ${brl(g.desconto)}` : '', g.observacao].filter(Boolean).join(' • ')
                  return (
                    <div key={g.id} className={`flex flex-wrap items-center justify-between gap-2 text-xs ${g.estornadoEm ? 'opacity-50' : ''}`}>
                      <span className="text-zinc-300">
                        <strong className={`text-white ${g.estornadoEm ? 'line-through' : ''}`}>{brl(g.valor)}</strong> em {dataBR(g.data)} • {g.forma} • parcela {p ? rotuloParcela(p.numero, p.total) : '—'}
                        {partes && <span className="text-zinc-500"> • {partes}</span>}
                        <span className="text-zinc-500"> • por {g.registradoPorNome || '—'}</span>
                        {g.estornadoEm && <span className="text-red-400 font-bold"> • estornado: {g.estornoMotivo}</span>}
                      </span>
                      {pExcluir && !g.estornadoEm && (
                        <button onClick={() => onEstornar(g)} className="px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all">
                          Estornar
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ModalReceber({ r, onFechar }: { r: Receber; onFechar: () => void }) {
  const p = r.parcela
  const [valor, setValor] = useState(String(p.atualizado.toFixed(2)))
  const [data, setData] = useState(hoje())
  const [forma, setForma] = useState('Boleto')
  const [obs, setObs] = useState('')
  const [quitar, setQuitar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const v = numero(valor)
  const resumo =
    v >= p.saldo
      ? `Fecha a parcela.${v > p.saldo ? ` ${brl(v - p.saldo)} ficam como juros e multa.` : ''}`
      : quitar
        ? `Fecha a parcela com desconto de ${brl(p.saldo - v)}.`
        : `Recebimento parcial: fica faltando ${brl(p.saldo - v)} nesta parcela.`
  const salvar = async () => {
    setSalvando(true)
    const erro = await registrarRecebimento(p.id, v, data, forma, obs, quitar)
    setSalvando(false)
    if (!erro) onFechar()
  }
  return (
    <Modal
      aberto
      titulo={`Receber parcela ${rotuloParcela(p.numero, p.total)}`}
      subtitulo={`${r.cobranca.cliente} • ${r.cobranca.conta}`}
      onFechar={onFechar}
      largura="max-w-lg"
      rodape={
        <>
          <button onClick={onFechar} className={btnSecundario}>Cancelar</button>
          <button onClick={() => void salvar()} disabled={salvando || v <= 0} className={btnPrimario}>{salvando ? 'Salvando...' : 'Confirmar recebimento'}</button>
        </>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <Total rotulo="Saldo" valor={brl(p.saldo)} />
        <Total rotulo="Multa" valor={brl(p.multaDevida)} />
        <Total rotulo="Juros" valor={brl(p.juros)} />
        <Total rotulo="Atualizado" valor={brl(p.atualizado)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className={labelCls}>Valor recebido *</label>
          <input type="number" step="0.01" min={0} value={valor} onChange={(e) => setValor(e.target.value)} aria-label="Valor recebido" className={inputCls} />
        </div>
        <div className="space-y-2">
          <label className={labelCls}>Data do recebimento *</label>
          <input type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} aria-label="Data do recebimento" className={inputCls} />
        </div>
        <div className="space-y-2">
          <label className={labelCls}>Forma</label>
          <select value={forma} onChange={(e) => setForma(e.target.value)} aria-label="Forma" className={`${inputCls} appearance-none`}>
            {FORMAS_RECEBIMENTO.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className={labelCls}>Observação</label>
          <input value={obs} onChange={(e) => setObs(e.target.value)} aria-label="Observação" className={inputCls} />
        </div>
      </div>
      {v > 0 && v < p.saldo && (
        <label className="flex items-start gap-3 text-sm text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={quitar} onChange={(e) => setQuitar(e.target.checked)} className="mt-1" aria-label="Quitar com desconto" />
          <span>Quitar a parcela com este valor (o que faltar fica como desconto)</span>
        </label>
      )}
      <p className="text-xs font-bold text-zinc-400">{v > 0 ? resumo : 'Informe o valor recebido.'} O valor entra na meta do cobrador.</p>
    </Modal>
  )
}

function ModalEditarParcela({ p, onFechar }: { p: ParcelaV; onFechar: () => void }) {
  const [valor, setValor] = useState(String(p.valor))
  const [vencimento, setVencimento] = useState(p.vencimento)
  const [multa, setMulta] = useState(String(p.multa))
  const [salvando, setSalvando] = useState(false)
  const salvar = async () => {
    setSalvando(true)
    const erro = await editarParcela(p.id, { valor: numero(valor), vencimento, multa: numero(multa) })
    setSalvando(false)
    if (!erro) onFechar()
  }
  return (
    <Modal
      aberto
      titulo={`Editar parcela ${rotuloParcela(p.numero, p.total)}`}
      subtitulo="Financeiro / Contas a Receber"
      onFechar={onFechar}
      largura="max-w-lg"
      rodape={
        <>
          <button onClick={onFechar} className={btnSecundario}>Cancelar</button>
          <button onClick={() => void salvar()} disabled={salvando} className={btnPrimario}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className={labelCls}>Valor *</label>
          <input type="number" step="0.01" min={0} value={valor} onChange={(e) => setValor(e.target.value)} aria-label="Valor" className={inputCls} />
        </div>
        <div className="space-y-2">
          <label className={labelCls}>Vencimento *</label>
          <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} aria-label="Vencimento" className={inputCls} />
        </div>
        <div className="space-y-2">
          <label className={labelCls}>Multa (R$)</label>
          <input type="number" step="0.01" min={0} value={multa} onChange={(e) => setMulta(e.target.value)} aria-label="Multa" className={inputCls} />
        </div>
      </div>
      {p.baixado > 0 && <p className="text-xs text-zinc-500">Já recebido nesta parcela: {brl(p.baixado)} (o valor não pode ficar menor que isso).</p>}
    </Modal>
  )
}

function ModalEstornar({ g, onFechar }: { g: PagamentoV; onFechar: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const salvar = async () => {
    setSalvando(true)
    const erro = await estornarRecebimento(g.id, motivo)
    setSalvando(false)
    if (!erro) onFechar()
  }
  return (
    <Modal
      aberto
      titulo="Estornar recebimento"
      subtitulo="A parcela volta a ficar em aberto e o valor sai da meta do cobrador"
      onFechar={onFechar}
      largura="max-w-md"
      rodape={
        <>
          <button onClick={onFechar} className={btnSecundario}>Voltar</button>
          <button
            onClick={() => void salvar()}
            disabled={salvando || !motivo.trim()}
            className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all disabled:opacity-40"
          >
            Estornar
          </button>
        </>
      }
    >
      <p className="text-sm text-zinc-300">
        Estornar o recebimento de <strong className="text-white">{brl(g.valor)}</strong> de {dataBR(g.data)} ({g.forma})?
      </p>
      <div className="space-y-2">
        <label className={labelCls}>Motivo *</label>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo do estorno" className={inputCls} placeholder="Ex.: baixa lançada na parcela errada" />
      </div>
    </Modal>
  )
}

function ModalEditarCobranca({ c, onFechar }: { c: CobrancaV; onFechar: () => void }) {
  const s = useErp()
  const categorias = colecao(s, 'cobranca_categorias').filter((x) => x.ativa !== false || x.id === c.categoriaId)
  const cobradores = equipe(s, 'cobranca')
  const [x, setX] = useState({ categoriaId: c.categoriaId, cobradorId: c.cobradorId, conta: c.conta || CONTA_PADRAO, referencia: c.referencia, observacao: c.observacao })
  const [salvando, setSalvando] = useState(false)
  const salvar = async () => {
    setSalvando(true)
    const erro = await editarCobranca(c.id, x)
    setSalvando(false)
    if (!erro) onFechar()
  }
  return (
    <Modal
      aberto
      titulo="Editar cobrança"
      subtitulo={`${c.cliente} • a troca de categoria fica no histórico`}
      onFechar={onFechar}
      largura="max-w-xl"
      rodape={
        <>
          <button onClick={onFechar} className={btnSecundario}>Cancelar</button>
          <button onClick={() => void salvar()} disabled={salvando} className={btnPrimario}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className={labelCls}>Conta *</label>
          <select value={x.conta} onChange={(e) => setX({ ...x, conta: e.target.value })} aria-label="Conta" className={`${inputCls} appearance-none`}>
            {CONTAS_COBRANCA.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className={labelCls}>Cobrador</label>
          <select value={x.cobradorId} onChange={(e) => setX({ ...x, cobradorId: e.target.value })} aria-label="Cobrador" className={`${inputCls} appearance-none`}>
            <option value="">—</option>
            {cobradores.map((co) => (
              <option key={co.id} value={co.id}>{co.nome}</option>
            ))}
            {x.cobradorId && !cobradores.some((co) => co.id === x.cobradorId) && <option value={x.cobradorId}>{c.cobrador || 'Outro'}</option>}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label className={labelCls}>Categoria *</label>
          <select value={x.categoriaId} onChange={(e) => setX({ ...x, categoriaId: e.target.value })} aria-label="Categoria" className={`${inputCls} appearance-none`}>
            {categorias.map((k) => (
              <option key={k.id} value={k.id}>{String(k.nome)} ({String(k.grupo)})</option>
            ))}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label className={labelCls}>Referência (aluno, escola...)</label>
          <input value={x.referencia} onChange={(e) => setX({ ...x, referencia: e.target.value })} aria-label="Referência" className={inputCls} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label className={labelCls}>Observação</label>
          <input value={x.observacao} onChange={(e) => setX({ ...x, observacao: e.target.value })} aria-label="Observação" className={inputCls} />
        </div>
      </div>
    </Modal>
  )
}

function ModalLancar({ onFechar }: { onFechar: (cliente?: { id: string; nome: string }) => void }) {
  const s = useErp()
  const categorias = colecao(s, 'cobranca_categorias').filter((x) => x.ativa !== false)
  const cobradores = equipe(s, 'cobranca')
  const padrao = categorias.find((x) => x.nome === 'Receita de Recordação Escolar') ?? categorias.find((x) => x.grupo === 'Cobrança DLG') ?? categorias[0]
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [termo, setTermo] = useState('')
  const termoAtrasado = useAtrasado(termo)
  const [opcoes, setOpcoes] = useState<{ termo: string; lista: Cliente[] }>({ termo: '', lista: [] })
  const [x, setX] = useState({ categoriaId: padrao?.id ?? '', cobradorId: '', conta: CONTA_PADRAO as string, referencia: '', valor: '', parcelas: '1', primeiroVencimento: hoje(), observacao: '' })
  const [salvando, setSalvando] = useState(false)

  // procura o cliente no cadastro (no servidor) enquanto digita
  useEffect(() => {
    if (cliente || termoAtrasado.trim().length < 2) return
    let vale = true
    void buscarClientes({ ...FILTRO_VAZIO, termo: termoAtrasado }, 0).then((r) => {
      if (vale) setOpcoes({ termo: termoAtrasado, lista: r.linhas.slice(0, 8) })
    })
    return () => {
      vale = false
    }
  }, [termoAtrasado, cliente])

  const salvar = async () => {
    if (!cliente) return
    setSalvando(true)
    const erro = await lancarCobranca({ ...x, clienteId: cliente.id, valor: numero(x.valor), parcelas: Number(x.parcelas) || 0 })
    setSalvando(false)
    if (!erro) onFechar({ id: cliente.id, nome: cliente.nome })
  }
  return (
    <Modal
      aberto
      titulo="Lançar cobrança"
      subtitulo="Financeiro / Contas a Receber • o valor é dividido em parcelas, todo mês"
      onFechar={() => onFechar()}
      largura="max-w-2xl"
      rodape={
        <>
          <button onClick={() => onFechar()} className={btnSecundario}>Cancelar</button>
          <button onClick={() => void salvar()} disabled={salvando || !cliente} className={btnPrimario}>{salvando ? 'Salvando...' : 'Lançar'}</button>
        </>
      }
    >
      <div className="space-y-2">
        <label className={labelCls}>Cliente *</label>
        {cliente ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] px-4 py-3">
            <span className="text-sm text-white font-bold">
              {cliente.nome} {cliente.documento && <span className="text-zinc-500 font-normal">• {formatarDocumento(cliente.documento)}</span>}
            </span>
            <button onClick={() => setCliente(null)} className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Trocar</button>
          </div>
        ) : (
          <>
            <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Nome, CPF/CNPJ ou telefone do cadastro de clientes" aria-label="Procurar cliente" className={inputCls} />
            {termoAtrasado.trim().length >= 2 && opcoes.termo === termoAtrasado && (
              <div className="rounded-xl border border-white/[0.08] divide-y divide-white/[0.04] max-h-56 overflow-y-auto custom-scrollbar">
                {opcoes.lista.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-zinc-500">Nenhum cliente encontrado. Cadastre em Financeiro › Clientes.</p>
                ) : (
                  opcoes.lista.map((c) => (
                    <button key={c.id} onClick={() => setCliente(c)} className="w-full text-left px-4 py-2.5 hover:bg-white/[0.04] text-sm text-zinc-200">
                      <strong className="text-white">{c.nome}</strong>
                      <span className="text-zinc-500"> {[c.documento ? formatarDocumento(c.documento) : '', [c.cidade, c.uf].filter(Boolean).join('/')].filter(Boolean).join(' • ')}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className={labelCls}>Conta *</label>
          <select value={x.conta} onChange={(e) => setX({ ...x, conta: e.target.value })} aria-label="Conta" className={`${inputCls} appearance-none`}>
            {CONTAS_COBRANCA.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className={labelCls}>Categoria *</label>
          <select value={x.categoriaId} onChange={(e) => setX({ ...x, categoriaId: e.target.value })} aria-label="Categoria" className={`${inputCls} appearance-none`}>
            {categorias.map((k) => (
              <option key={k.id} value={k.id}>{String(k.nome)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className={labelCls}>Valor total *</label>
          <input type="number" step="0.01" min={0} value={x.valor} onChange={(e) => setX({ ...x, valor: e.target.value })} aria-label="Valor total" className={inputCls} />
        </div>
        <div className="space-y-2">
          <label className={labelCls}>Parcelas *</label>
          <input type="number" min={1} max={120} value={x.parcelas} onChange={(e) => setX({ ...x, parcelas: e.target.value })} aria-label="Parcelas" className={inputCls} />
        </div>
        <div className="space-y-2">
          <label className={labelCls}>1º vencimento *</label>
          <input type="date" value={x.primeiroVencimento} onChange={(e) => setX({ ...x, primeiroVencimento: e.target.value })} aria-label="1º vencimento" className={inputCls} />
        </div>
        <div className="space-y-2">
          <label className={labelCls}>Cobrador</label>
          <select value={x.cobradorId} onChange={(e) => setX({ ...x, cobradorId: e.target.value })} aria-label="Cobrador" className={`${inputCls} appearance-none`}>
            <option value="">—</option>
            {cobradores.map((co) => (
              <option key={co.id} value={co.id}>{co.nome}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label className={labelCls}>Referência (aluno, escola...)</label>
          <input value={x.referencia} onChange={(e) => setX({ ...x, referencia: e.target.value })} aria-label="Referência" className={inputCls} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label className={labelCls}>Observação</label>
          <input value={x.observacao} onChange={(e) => setX({ ...x, observacao: e.target.value })} aria-label="Observação" className={inputCls} />
        </div>
      </div>
      {numero(x.valor) > 0 && Number(x.parcelas) >= 1 && (
        <p className="text-xs font-bold text-zinc-400">
          {x.parcelas}x de {brl(numero(x.valor) / Number(x.parcelas))}, a partir de {dataBR(x.primeiroVencimento)}.
        </p>
      )}
    </Modal>
  )
}

