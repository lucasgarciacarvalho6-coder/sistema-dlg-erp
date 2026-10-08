'use client'

// Cobrança › Inadimplência (carteira nova, SQLs 041/042). A Cobrança só recebe a inadimplência para renegociar a dívida:
// aqui aparecem SÓ as parcelas vencidas e não pagas, um nome por linha (busca no servidor, 50 por vez). Clicando no nome
// abre a ficha com os boletos atrasados de cada cobrança (conta CA Beatriz / CA Diogo, carteira, juros e multa).
// "Negociar" gera o acordo (só quando a cobrança pode ser renegociada) e vai para a aprovação do ADM.
// Receber e dar baixa é do Financeiro (Contas a Receber).

import { useMemo, useState } from 'react'
import { negociarCobranca, useErp, usePode } from '@/lib/erp/store'
import { regrasCobranca } from '@/lib/erp/cobranca-config'
import { brl, dataBR, mesAtual } from '@/lib/erp/format'
import { exportarCSV } from '@/lib/erp/export'
import { formatarDocumento } from '@/lib/erp/documento'
import { CARTEIRAS_COBRANCA, FAIXAS_DIAS, ehInadimplente, type CobrancaV } from '@/lib/erp/carteira'
import {
  FILTRO_INADIMPLENCIA,
  POR_PAGINA_CARTEIRA,
  buscarInadimplentes,
  todasAsPaginas,
  useFichaCarteira,
  useIndicadores,
  useInadimplentes,
  useResumoCarteira,
  type FiltroInadimplencia,
} from '@/lib/erp/cobrancas'
import Icon from '@/components/erp/Icon'
import { BuscaPessoas, CabecalhoCobranca, DadosCliente, Filtro, NomeCliente, Paginacao, SelecaoConta, SeloConta, Total, rotuloParcela, useAtrasado } from '@/components/erp/ContasPessoa'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, btnPrimario, btnSecundario } from '@/components/erp/ui'

const PARCELAS_ACORDO = 3

export default function Inadimplencia() {
  const s = useErp()
  const podeFazer = usePode()
  const [filtro, setFiltro] = useState<FiltroInadimplencia>(FILTRO_INADIMPLENCIA)
  const [busca, setBusca] = useState('')
  const termo = useAtrasado(busca)
  const [pagina, setPagina] = useState(0)
  const [aberta, setAberta] = useState<{ id: string; nome: string } | null>(null)
  const [negociar, setNegociar] = useState<CobrancaV | null>(null)

  const pNegociar = podeFazer('cobranca', 'criar')
  const pExportar = podeFazer('cobranca', 'exportar')
  const regras = regrasCobranca(s)

  const f = useMemo(() => ({ ...filtro, termo }), [filtro, termo])
  const { linhas, total, erro, carregando } = useInadimplentes(f, pagina)
  const ind = useIndicadores(mesAtual())
  const resumo = useResumoCarteira()
  const { ficha } = useFichaCarteira(aberta?.id ?? null)

  const mudar = (x: Partial<FiltroInadimplencia>) => {
    setFiltro({ ...filtro, ...x })
    setPagina(0)
  }
  // cartões por carteira: só o que está vencido (o resumo do banco é por carteira e faixa de dias)
  const porCarteira = CARTEIRAS_COBRANCA.map((c) => {
    const l = resumo.filter((r) => r.carteira === c && r.faixaDias)
    return { carteira: c, clientes: l.reduce((a, r) => a + r.clientes, 0), vencido: l.reduce((a, r) => a + r.vencido, 0), atualizado: l.reduce((a, r) => a + r.atualizado, 0) }
  })

  const exportar = async () => {
    const todos = await todasAsPaginas((p, n) => buscarInadimplentes(f, p, n))
    exportarCSV(
      'inadimplencia',
      [
        { chave: 'cliente', label: 'Cliente' },
        { chave: 'documento', label: 'CPF/CNPJ' },
        { chave: 'telefone', label: 'Telefone' },
        { chave: 'cidade', label: 'Cidade' },
        { chave: 'contas', label: 'Conta' },
        { chave: 'carteiras', label: 'Carteira' },
        { chave: 'referencias', label: 'Referências' },
        { chave: 'parcelasVencidas', label: 'Boletos vencidos' },
        { chave: 'vencido', label: 'Em atraso' },
        { chave: 'atualizado', label: 'Com juros e multa' },
        { chave: 'vencidaDesde', label: 'Venceu em' },
        { chave: 'diasAtraso', label: 'Dias de atraso' },
        { chave: 'cobradores', label: 'Cobrador' },
      ],
      todos.map((c) => ({
        ...c,
        documento: c.documento ? formatarDocumento(c.documento) : '',
        cidade: [c.cidade, c.uf].filter(Boolean).join('/'),
        contas: c.contas.join(', '),
        carteiras: c.carteiras.join(', '),
        cobradores: c.cobradores.join(', '),
        vencido: brl(c.vencido),
        atualizado: brl(c.atualizado),
        vencidaDesde: dataBR(c.vencidaDesde),
      })),
    )
  }

  const cobrancasVencidas = (ficha?.cobrancas ?? []).filter(ehInadimplente).sort((a, b) => b.diasAtraso - a.diasAtraso)

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Cobrança / Inadimplência"
        titulo="Inadimplência"
        descricao="Quem está com boleto vencido e não pago, um nome por linha. Clique no nome para ver os boletos atrasados (com juros e multa) e negociar."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Clientes em atraso" valor={ind.clientesEmAtraso} tom={ind.clientesEmAtraso ? 'red' : 'zinc'} detalhe={`${ind.parcelasVencidas} boleto(s) vencido(s)`} />
        <StatCard label="Valor em atraso" valor={brl(ind.emAtraso)} tom={ind.emAtraso ? 'red' : 'zinc'} />
        <StatCard label="Com juros e multa" valor={brl(ind.atualizadoAtraso)} detalhe={`juros de ${brl(regras.juros_dia ?? 0)} por dia`} />
        <StatCard label="Atraso médio" valor={`${ind.atrasoMedio} dias`} />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {porCarteira.map((c) => (
          <button key={c.carteira} onClick={() => mudar({ carteira: filtro.carteira === c.carteira ? '' : c.carteira })} className="text-left">
            <div className={`bg-painel-2/80 border ${filtro.carteira === c.carteira ? 'border-blue-500/50' : 'border-white/[0.06]'} p-5 rounded-3xl h-full transition-all hover:-translate-y-0.5`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400 mb-2">{c.carteira}</p>
              <p className="text-2xl font-black text-white">{c.clientes} <span className="text-xs font-bold text-zinc-500">cliente(s)</span></p>
              <p className="text-[11px] text-zinc-500 mt-1">
                {brl(c.vencido)} vencido • {brl(c.atualizado)} com juros
              </p>
            </div>
          </button>
        ))}
      </div>

      <Panel
        semPadding
        titulo={`Pessoas em atraso • ${total}${filtro.carteira ? ` • ${filtro.carteira}` : ''}`}
        acoes={
          <>
            <BuscaPessoas
              valor={busca}
              onChange={(v) => {
                setBusca(v)
                setPagina(0)
              }}
              rotulo="Pesquisar inadimplência"
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
          <Filtro ativo={filtro.faixa === ''} onClick={() => mudar({ faixa: '' })}>
            Todas as faixas
          </Filtro>
          {FAIXAS_DIAS.map((fx) => (
            <Filtro key={fx} ativo={filtro.faixa === fx} onClick={() => mudar({ faixa: filtro.faixa === fx ? '' : fx })}>
              {fx}
            </Filtro>
          ))}
        </div>

        {erro ? (
          <p className="p-6 text-sm font-bold text-red-400">{erro}</p>
        ) : linhas.length === 0 && !carregando ? (
          <EmptyState
            titulo={busca || filtro.carteira || filtro.faixa || filtro.conta ? 'Ninguém encontrado' : 'Ninguém em atraso'}
            descricao={busca || filtro.carteira || filtro.faixa || filtro.conta ? 'Mude a pesquisa ou o filtro.' : 'Não há boletos vencidos sem pagamento.'}
          />
        ) : (
          <div className={`overflow-x-auto custom-scrollbar transition-opacity ${carregando ? 'opacity-50' : ''}`}>
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-5 py-3 font-bold">Cliente</th>
                  <th className="px-5 py-3 font-bold">Conta</th>
                  <th className="px-5 py-3 font-bold">Carteira</th>
                  <th className="px-5 py-3 font-bold">Boletos vencidos</th>
                  <th className="px-5 py-3 font-bold text-right">Em atraso</th>
                  <th className="px-5 py-3 font-bold text-right">Com juros e multa</th>
                  <th className="px-5 py-3 font-bold">Venceu em</th>
                  <th className="px-5 py-3 font-bold">Dias de atraso</th>
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
                    <td className="px-5 py-3 text-xs whitespace-nowrap">{c.carteiras.join(', ')}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{c.parcelasVencidas}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap font-bold text-red-400">{brl(c.vencido)}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap font-bold text-white">{brl(c.atualizado)}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{dataBR(c.vencidaDesde)}</td>
                    <td className="px-5 py-3 whitespace-nowrap font-black text-red-400">{c.diasAtraso} dias</td>
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
        subtitulo={ficha ? `Inadimplência • ${cobrancasVencidas.reduce((a, c) => a + c.parcelasVencidas, 0)} boleto(s) vencido(s)` : 'Carregando...'}
        onFechar={() => setAberta(null)}
        largura="max-w-5xl"
        rodape={<button onClick={() => setAberta(null)} className={btnSecundario}>Fechar</button>}
      >
        {!ficha ? (
          <p className="text-sm text-zinc-500">Carregando...</p>
        ) : cobrancasVencidas.length === 0 ? (
          <div className="space-y-4">
            <DadosCliente cobrancas={ficha.cobrancas} />
            <p className="text-sm text-zinc-400">Esta pessoa não tem mais boleto vencido em aberto (pode ter pago ou entrado em acordo).</p>
          </div>
        ) : (
          <div className="space-y-6">
            <DadosCliente cobrancas={cobrancasVencidas} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Total rotulo="Em atraso" valor={brl(cobrancasVencidas.reduce((a, c) => a + c.vencido, 0))} tom="red" />
              <Total rotulo="Com juros e multa" valor={brl(cobrancasVencidas.reduce((a, c) => a + c.atualizado, 0))} />
              <Total rotulo="Maior atraso" valor={`${Math.max(...cobrancasVencidas.map((c) => c.diasAtraso))} dias`} tom="red" />
            </div>
            {cobrancasVencidas.map((c) => {
              const ps = ficha.parcelas.filter((p) => p.cobrancaId === c.id && p.vencida).sort((a, b) => a.numero - b.numero || a.vencimento.localeCompare(b.vencimento))
              return (
                <div key={c.id} className="rounded-2xl border border-white/[0.06] overflow-hidden">
                  <CabecalhoCobranca
                    c={c}
                    extra={
                      <>
                        {c.foraDaCategoria && <Badge texto="Fora da categoria (mais de 730 dias)" tom="yellow" />}
                        {c.podeIrSpc && <Badge texto="Pode ir ao SPC" tom="zinc" />}
                      </>
                    }
                    acoes={
                      pNegociar &&
                      (c.podeRenegociar ? (
                        <button onClick={() => setNegociar(c)} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap transition-all text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20">
                          Negociar ({PARCELAS_ACORDO}x)
                        </button>
                      ) : (
                        <span className="text-[10px] text-zinc-500 max-w-[16rem] text-right">
                          Ainda não renegocia: precisa de {regras.reneg_min_boletos ?? 2} boletos vencidos e {regras.reneg_min_dias ?? 61} dias de atraso, na Cobrança DLG.
                        </span>
                      ))
                    }
                  />
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm text-zinc-300">
                      <thead className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 border-b border-white/[0.05]">
                        <tr>
                          <th className="px-4 py-2.5 font-bold">Parcela</th>
                          <th className="px-4 py-2.5 font-bold">Vencimento</th>
                          <th className="px-4 py-2.5 font-bold">Dias</th>
                          <th className="px-4 py-2.5 font-bold text-right">Em aberto</th>
                          <th className="px-4 py-2.5 font-bold text-right">Multa</th>
                          <th className="px-4 py-2.5 font-bold text-right">Juros</th>
                          <th className="px-4 py-2.5 font-bold text-right">Atualizado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.02]">
                        {ps.map((p) => (
                          <tr key={p.id}>
                            <td className="px-4 py-2.5 font-bold text-white whitespace-nowrap">{rotuloParcela(p.numero, p.total)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-red-400 font-bold">{dataBR(p.vencimento)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap font-black text-red-400">{p.diasAtraso}</td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">{brl(p.saldo)}</td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">{brl(p.multaDevida)}</td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">{p.cobraJuros ? brl(p.juros) : <span className="text-zinc-500 text-[11px]">sem juros (migrada)</span>}</td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap font-bold text-white">{brl(p.atualizado)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {c.aVencer > 0 && <p className="px-4 py-2.5 text-[11px] text-zinc-500 border-t border-white/[0.05]">Ainda vai vencer nesta cobrança: {brl(c.aVencer)} (total da dívida {brl(c.totalDivida)}).</p>}
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      <Modal
        aberto={!!negociar}
        titulo="Negociar"
        subtitulo="As parcelas vencidas ficam em acordo e o acordo vai para a aprovação do ADM"
        onFechar={() => setNegociar(null)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setNegociar(null)} className={btnSecundario}>Cancelar</button>
            <button
              onClick={() => {
                if (negociar) void negociarCobranca(negociar, PARCELAS_ACORDO)
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
            Gerar um acordo em <strong className="text-white">{PARCELAS_ACORDO}x</strong> para <strong className="text-white">{negociar.cliente}</strong> ({negociar.conta}): {negociar.parcelasVencidas} boleto(s) vencido(s),{' '}
            {brl(negociar.vencido)} em atraso, <strong className="text-white">{brl(negociar.atualizado)}</strong> com juros e multa, há {negociar.diasAtraso} dias?
          </p>
        )}
      </Modal>
    </div>
  )
}
