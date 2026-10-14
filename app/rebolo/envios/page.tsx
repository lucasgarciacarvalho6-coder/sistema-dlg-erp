'use client'

// Envio pelo Correio (SQL 037): a venda aprovada pelo Financeiro entra em "A enviar" com o endereço. A vendedora
// (ou a supervisão) registra o envio — código de rastreio, custo da postagem e previsão de entrega — e acompanha a
// entrega (Pendente / Cliente recebeu / Não recebeu), o boleto enviado e a taxa do cartão. O lápis corrige depois.
// O custo da postagem e a taxa do cartão entram no Lucro/Prejuízo da vendedora (vazio = a estimativa da Tabela de Preços).

import { useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { salvarEnvioRebolo, usePode } from '@/lib/erp/store'
import { brl, dataBR, hoje } from '@/lib/erp/format'
import { formaDaVenda, LINK_RASTREIO_CORREIOS, linkWhatsApp, SITUACOES_ENTREGA, TOM_ENTREGA } from '@/lib/erp/rebolo'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, Tabs, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import Icon from '@/components/erp/Icon'
import { FaixaBadge, PacoteBadge, useRebolo } from '@/components/rebolo/comum'

type Aba = 'enviar' | 'enviados'

const dia = (v: unknown) => (v ? dataBR(String(v).slice(0, 10)) : '')
const valorOuVazio = (v: unknown) => (v === '' || v === null || v === undefined ? '' : String(v))
const numero = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.')))
const comprador = (f: Registro, v: Registro | undefined) => String(v?.responsavel || f.nomeMae || f.nomePai || '—')

// botão da situação da entrega (abre o acompanhamento): pendente = acompanhar rastreio • recebeu = entregue • não recebeu
const BOTAO_ENTREGA: Record<string, { texto: string; cls: string }> = {
  Pendente: { texto: 'Acompanhar rastreio', cls: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/25' },
  'Cliente recebeu': { texto: 'Produto entregue', cls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25' },
  'Não recebeu': { texto: 'Não recebeu', cls: 'bg-red-500/15 border-red-500/40 text-red-400 hover:bg-red-500/25' },
}

export default function EnviosReboloPage() {
  const { eu, supervisao, fichas, vendas, vendedoras, nome, pacoteDe, tabela } = useRebolo()
  const podeFazer = usePode()
  const [aba, setAba] = useState<Aba>('enviar')
  const [busca, setBusca] = useState('')
  const [vendedora, setVendedora] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)

  const vendaDe = (f: Registro) => vendas.find((v) => v.fichaReboloId === f.id && v.conferencia === 'Conferida')
  const minhas = fichas.filter((f) => f.situacao === 'Vendida' && (supervisao ? !vendedora || f.vendedoraId === vendedora : f.vendedoraId === eu?.id))
  const aEnviar = minhas.filter((f) => !f.enviadoEm)
  const enviados = minhas.filter((f) => !!f.enviadoEm).sort((a, b) => String(b.enviadoEm).localeCompare(String(a.enviadoEm)))
  const entrega = (f: Registro) => String(f.situacaoEntrega || 'Pendente')
  const contar = (sit: string) => enviados.filter((f) => entrega(f) === sit).length
  const t = busca.trim().toLowerCase()
  const lista = (aba === 'enviar' ? aEnviar : enviados).filter((f) => !t || `${f.aluno} ${comprador(f, vendaDe(f))} ${f.rastreio} ${f.cidade} ${f.numeroFicha}`.toLowerCase().includes(t))
  const podeEnviar = (f: Registro) => (f.vendedoraId === eu?.id || supervisao) && podeFazer('rebolo', 'editar')
  const ficha = fichas.find((f) => f.id === aberta) ?? null
  const { freteEstimado, taxaCartaoEstimada } = tabela.custos

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Vendas Rebolo / Envios"
        titulo="Envios pelo Correio"
        descricao="Vendas aprovadas pelo Financeiro, prontas para despachar. Registre o envio com o código de rastreio e o custo da postagem, e acompanhe até o cliente receber."
      />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard tom={aEnviar.length ? 'yellow' : 'zinc'} label="A enviar" valor={aEnviar.length} detalhe="aprovadas pelo Financeiro" />
        <StatCard label="Em trânsito" valor={contar('Pendente')} detalhe="enviados, aguardando a entrega" />
        <StatCard label="Entregues" valor={contar('Cliente recebeu')} />
        <StatCard tom={contar('Não recebeu') ? 'red' : 'zinc'} label="Não recebeu" valor={contar('Não recebeu')} />
      </div>
      <Tabs abas={[{ id: 'enviar' as Aba, label: `A enviar (${aEnviar.length})` }, { id: 'enviados' as Aba, label: `Enviados (${enviados.length})` }]} ativa={aba} onChange={setAba} />
      <Panel
        semPadding
        titulo={aba === 'enviar' ? 'A enviar' : 'Enviados'}
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            {supervisao && (
              <select value={vendedora} onChange={(e) => setVendedora(e.target.value)} className="bg-black/50 border border-white/[0.05] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl px-3 py-2 outline-none">
                <option value="">Todas as vendedoras</option>
                {vendedoras.map((v) => (
                  <option key={v.id} value={v.id}>{v.nome}</option>
                ))}
              </select>
            )}
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aluno, comprador, rastreio..." className="campo-busca bg-black/50 border border-white/[0.05] rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-blue-500/50 w-64" />
          </div>
        }
      >
        {lista.length === 0 ? (
          <EmptyState titulo={aba === 'enviar' ? 'Nada para enviar' : 'Nenhum envio ainda'} />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-5 py-4 font-bold">Ação</th>
                  <th className="px-5 py-4 font-bold">Valor da postagem</th>
                  <th className="px-5 py-4 font-bold">{aba === 'enviar' ? 'Aprovada em' : 'Envio / previsão'}</th>
                  <th className="px-5 py-4 font-bold">Comprador / aluno</th>
                  {aba === 'enviar' && <th className="px-5 py-4 font-bold">Endereço</th>}
                  <th className="px-5 py-4 font-bold">Faixa</th>
                  <th className="px-5 py-4 font-bold">Pacote / vendedora</th>
                  <th className="px-5 py-4 font-bold">Pagamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {lista.map((f) => {
                  const v = vendaDe(f)
                  const forma = v ? formaDaVenda(String(v.formaPagamento || '')) : null
                  const sit = entrega(f)
                  const atrasada = aba === 'enviados' && sit === 'Pendente' && !!f.previsaoEntrega && String(f.previsaoEntrega).slice(0, 10) < hoje()
                  const custo = valorOuVazio(f.custoPostagem)
                  const taxa = valorOuVazio(f.taxaCartao)
                  return (
                    <tr key={f.id} className="hover:bg-white/[0.02] align-top">
                      <td className="px-5 py-3.5">
                        {aba === 'enviar' ? (
                          podeEnviar(f) ? (
                            <button onClick={() => setAberta(f.id)} className="px-3 py-2 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-300 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap hover:bg-blue-600/25">
                              Registrar envio
                            </button>
                          ) : (
                            <p className="text-xs text-zinc-500">Aguardando a vendedora despachar.</p>
                          )
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button onClick={() => setAberta(f.id)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${BOTAO_ENTREGA[sit]?.cls ?? BOTAO_ENTREGA.Pendente.cls}`}>
                              <Icon nome={sit === 'Pendente' ? 'box' : sit === 'Cliente recebeu' ? 'check' : 'alert'} className="w-3.5 h-3.5" />
                              {BOTAO_ENTREGA[sit]?.texto ?? sit}
                            </button>
                            {forma === 'boleto' && <Badge texto={f.boletoEnviadoEm ? 'Boleto enviado' : 'Boleto a enviar'} tom={f.boletoEnviadoEm ? 'emerald' : 'yellow'} />}
                            {podeEnviar(f) && (
                              <button onClick={() => setAberta(f.id)} title="Corrigir o envio" className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.05]">
                                <Icon nome="edit" className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {custo ? (
                          <span className="font-bold text-white">{brl(Number(custo))}</span>
                        ) : (
                          <span className="text-zinc-500" title="Sem o custo real: o Lucro/Prejuízo usa a estimativa da Tabela de Preços">
                            {brl(freteEstimado)} <span className="text-[10px] uppercase tracking-widest">estimado</span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-xs">
                        {aba === 'enviar' ? (
                          <p>{dia(v?.data) || '—'}</p>
                        ) : (
                          <>
                            <p className="text-zinc-200">Enviado {dia(f.enviadoEm)}</p>
                            {f.previsaoEntrega ? <p className={atrasada ? 'text-red-400 font-bold' : 'text-zinc-400'}>{atrasada ? '⚠ ' : ''}Previsão {dia(f.previsaoEntrega)}</p> : null}
                            {f.entregaEm && sit !== 'Pendente' ? <p className="text-zinc-500">{sit === 'Cliente recebeu' ? 'Recebeu' : 'Marcado'} em {dia(f.entregaEm)}</p> : null}
                          </>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-black text-white leading-tight">{comprador(f, v)}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">aluno(a): {String(f.aluno)}</p>
                        {f.rastreio ? <p className="text-[11px] text-zinc-500 mt-0.5 font-mono">{String(f.rastreio)}</p> : null}
                      </td>
                      {aba === 'enviar' && (
                        <td className="px-5 py-3.5 text-xs text-zinc-300 max-w-[260px]">
                          <p>{[f.rua, f.numero, f.apto && `apto ${f.apto}`].filter(Boolean).join(', ') || 'Endereço não informado'}</p>
                          <p className="text-zinc-500">{[f.bairro, [f.cidade, f.uf].filter(Boolean).join('/'), f.cep && `CEP ${f.cep}`].filter(Boolean).join(' • ')}</p>
                        </td>
                      )}
                      <td className="px-5 py-3.5"><FaixaBadge ficha={f} tabela={tabela} /></td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <PacoteBadge pacote={pacoteDe(f)} />
                        <p className="text-[11px] text-zinc-500 mt-1">{nome(f.vendedoraId)}</p>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-xs">
                        <p className="text-zinc-200">{String(v?.formaPagamento || '—')}</p>
                        {forma === 'cartao' && (
                          <p className={taxa ? 'text-zinc-400' : 'text-zinc-500'}>{taxa ? `taxa ${brl(Number(taxa))}` : `taxa estimada ${taxaCartaoEstimada}%`}</p>
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

      <Modal aberto={!!ficha} titulo="Acompanhamento do envio" subtitulo={ficha ? `${String(ficha.aluno)} • ficha ${String(ficha.numeroFicha)}` : ''} onFechar={() => setAberta(null)} largura="max-w-2xl">
        {ficha && (
          <AcompanhamentoEnvio
            key={ficha.id}
            ficha={ficha}
            venda={vendaDe(ficha)}
            podeEditar={podeEnviar(ficha)}
            freteEstimado={freteEstimado}
            taxaEstimada={taxaCartaoEstimada}
            onFechar={() => setAberta(null)}
          />
        )}
      </Modal>
    </div>
  )
}

function AcompanhamentoEnvio({
  ficha,
  venda,
  podeEditar,
  freteEstimado,
  taxaEstimada,
  onFechar,
}: {
  ficha: Registro
  venda: Registro | undefined
  podeEditar: boolean
  freteEstimado: number
  taxaEstimada: number
  onFechar: () => void
}) {
  const forma = venda ? formaDaVenda(String(venda.formaPagamento || '')) : null
  const jaEnviado = !!ficha.enviadoEm
  const [rastreio, setRastreio] = useState(String(ficha.rastreio || ''))
  const [custo, setCusto] = useState(valorOuVazio(ficha.custoPostagem))
  const [previsao, setPrevisao] = useState(String(ficha.previsaoEntrega || '').slice(0, 10))
  const [situacao, setSituacao] = useState(String(ficha.situacaoEntrega || 'Pendente'))
  const [boleto, setBoleto] = useState(!!ficha.boletoEnviadoEm)
  const [taxa, setTaxa] = useState(valorOuVazio(ficha.taxaCartao))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)
  const valor = Number(venda?.valor) || 0

  const rastrear = async () => {
    try {
      await navigator.clipboard.writeText(rastreio.trim().toUpperCase())
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
    window.open(LINK_RASTREIO_CORREIOS, '_blank', 'noopener')
  }

  const salvar = async () => {
    setErro('')
    const c = numero(custo)
    const tx = numero(taxa)
    if (!rastreio.trim()) return setErro('Informe o código de rastreio.')
    if ((c !== null && !(c >= 0)) || (tx !== null && !(tx >= 0))) return setErro('Confira os valores: precisam ser números maiores ou iguais a zero.')
    setSalvando(true)
    const falha = await salvarEnvioRebolo(String(ficha.id), {
      rastreio,
      custoPostagem: c,
      previsaoEntrega: previsao,
      situacaoEntrega: jaEnviado ? situacao : 'Pendente',
      boletoEnviado: boleto,
      taxaCartao: tx,
    })
    setSalvando(false)
    if (falha) return setErro(falha)
    onFechar()
  }

  const tel = String(venda?.whatsapp || ficha.whatsapp1 || '')
  const zap = linkWhatsApp(tel)
  const mensagem = zap && ficha.rastreio
    ? `${zap}?text=${encodeURIComponent(`Olá! Aqui é da DLG Photos. O álbum de ${ficha.aluno} foi enviado pelos Correios. Código de rastreio: ${ficha.rastreio}. Acompanhe em https://rastreamento.correios.com.br`)}`
    : ''

  return (
    <div className="space-y-6">
      {/* para onde vai */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm">
        <p className="font-black text-white">{String(ficha.aluno)}</p>
        <p className="text-zinc-300">Comprador: <span className="font-bold text-white">{comprador(ficha, venda)}</span>{venda?.cpf ? ` • CPF ${String(venda.cpf)}` : ''}</p>
        <p className="text-zinc-400">{[ficha.rua, ficha.numero, ficha.apto && `apto ${ficha.apto}`, ficha.bairro].filter(Boolean).join(', ') || 'Endereço não informado'}</p>
        <p className="text-zinc-400">{[[ficha.cidade, ficha.uf].filter(Boolean).join('/'), ficha.cep && `CEP ${ficha.cep}`].filter(Boolean).join(' • ')}</p>
        {tel ? <p className="text-zinc-400">Tel.: {tel}</p> : null}
        <p className="text-zinc-500 text-xs mt-2">
          {String(venda?.pacote || 'Book')} • {String(venda?.formaPagamento || '—')}{valor ? ` • ${brl(valor)}` : ''}
          {jaEnviado ? <span className="text-blue-300 font-bold"> • Enviado em {dia(ficha.enviadoEm)}</span> : null}
        </p>
      </div>

      <div className="space-y-1">
        <label className={labelCls}>Código de rastreio *</label>
        <div className="flex gap-2">
          <input value={rastreio} disabled={!podeEditar} onChange={(e) => setRastreio(e.target.value.toUpperCase())} placeholder="Ex.: AA123456789BR" className={`${inputCls} font-mono`} autoFocus={podeEditar} />
          <button type="button" onClick={() => void rastrear()} disabled={!rastreio.trim()} className="shrink-0 px-4 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black disabled:opacity-40">
            Rastrear nos Correios
          </button>
        </div>
        {copiado && <p className="text-[11px] font-bold text-emerald-400">Código copiado: cole na página dos Correios que abriu.</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={labelCls}>Custo da postagem (R$)</label>
          <input type="number" min="0" step="0.01" inputMode="decimal" disabled={!podeEditar} value={custo} onChange={(e) => setCusto(e.target.value)} placeholder={`vazio = estimado ${brl(freteEstimado)}`} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Data prevista de entrega</label>
          <input type="date" disabled={!podeEditar} value={previsao} onChange={(e) => setPrevisao(e.target.value)} className={inputCls} />
        </div>
      </div>

      {jaEnviado && (
        <div className="space-y-1">
          <label className={labelCls}>Situação da entrega</label>
          <select value={situacao} disabled={!podeEditar} onChange={(e) => setSituacao(e.target.value)} className={`${inputCls} appearance-none`}>
            {SITUACOES_ENTREGA.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
          <div className="pt-1"><Badge texto={situacao} tom={TOM_ENTREGA[situacao] ?? 'yellow'} /></div>
        </div>
      )}

      {forma === 'boleto' && (
        <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3 cursor-pointer">
          <input type="checkbox" disabled={!podeEditar} checked={boleto} onChange={(e) => setBoleto(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
          <span className="text-sm text-white font-bold">Boleto enviado ao cliente</span>
          {ficha.boletoEnviadoEm ? <span className="text-xs text-zinc-500">em {dia(ficha.boletoEnviadoEm)}</span> : null}
        </label>
      )}

      {forma === 'cartao' && (
        <div className="space-y-1">
          <label className={labelCls}>Taxa do cartão (R$)</label>
          <input type="number" min="0" step="0.01" inputMode="decimal" disabled={!podeEditar} value={taxa} onChange={(e) => setTaxa(e.target.value)} placeholder={`vazio = estimado ${taxaEstimada}% (${brl((valor * taxaEstimada) / 100)})`} className={inputCls} />
          <p className="text-[11px] text-zinc-500">O valor que a maquininha/link de pagamento cobrou nesta venda.</p>
        </div>
      )}

      {erro && <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400">{erro}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {mensagem && (
            <a href={mensagem} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-400 hover:text-blue-300">
              💬 Avisar o cliente no WhatsApp
            </a>
          )}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onFechar} className={btnSecundario}>{podeEditar ? 'Cancelar' : 'Fechar'}</button>
          {podeEditar && (
            <button type="button" onClick={() => void salvar()} disabled={salvando} className={btnPrimario}>
              {salvando ? 'Salvando...' : jaEnviado ? 'Salvar' : 'Registrar envio'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
