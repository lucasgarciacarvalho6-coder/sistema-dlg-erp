'use client'

// Cobrança › "Dados Atualizados do Contrato" + "Simular Renegociação" (SQL 047), IGUAL ao sistema antigo:
// as parcelas com o cálculo do dia, a simulação (entrada, desconto %/R$, prazo da entrada, quem paga, forma, simular por,
// parcelas, 1º boleto), os avisos (nada trava), a sugestão da tabela por faixa, e os botões Exportar Simulação,
// Encaminhar (WhatsApp), Salvar simulação e Fechar acordo. Acordo fechado: Imprimir Ficha (entregar ao Financeiro)
// e Editar ("só a data da entrada" ou "recalcular").

import { useState } from 'react'
import { registrarImpressaoFicha, salvarAcordoCobranca, useErp, useUsuario, avisar } from '@/lib/erp/store'
import { regrasCobranca } from '@/lib/erp/cobranca-config'
import { brl, dataBR, hoje } from '@/lib/erp/format'
import { linkWhatsApp } from '@/lib/erp/rebolo'
import { useCondicoesFaixa } from '@/lib/erp/cobrancas'
import {
  FORMAS_ENTRADA,
  FORMAS_RENEGOCIACAO,
  ROTULO_FAIXA_CONDICAO,
  avisosAcordo,
  calcularAcordo,
  faixaDaCondicao,
  imprimirFicha,
  imprimirSimulacao,
  primeiroVencimentoPadrao,
  sugestaoCondicao,
  textoSimulacao,
  type AcordoDoc,
  type AcordoV,
  type DadosAcordo,
} from '@/lib/erp/acordo'
import type { CobrancaV, ParcelaV } from '@/lib/erp/carteira'
import { rotuloParcela } from '@/components/erp/ContasPessoa'
import { Badge, Modal, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

type Modo = 'novo' | 'recalcular' | 'data' | 'ver'

const num = (v: string) => Number(String(v).replace(/\./g, '').replace(',', '.')) || 0
const dinheiro = (v: number) => (v ? v.toFixed(2).replace('.', ',') : '')

function dadosIniciais(a: AcordoV | undefined, regras: Record<string, number>): DadosAcordo {
  const primeiro = primeiroVencimentoPadrao(hoje(), regras.primeiro_boleto_dia ?? 10, regras.primeiro_boleto_corte ?? 20)
  if (!a)
    return {
      descontoTipo: '%', desconto: 0, entrada: regras.entrada_sugerida ?? 200, entradaPrazo: '', entradaForma: 'PIX', pagadorTipo: 'Titular', pagadorNome: '',
      pagadorDocumento: '', simularPor: 'Parcelas', parcelasQtd: 1, valorDesejado: 0, formaPagamento: 'Boleto', primeiroVencimento: primeiro, retornoEm: '', observacao: '',
    }
  return {
    descontoTipo: a.descontoTipo, desconto: a.descontoInformado, entrada: a.entrada, entradaPrazo: a.entradaPrazo, entradaForma: a.entradaForma || 'PIX',
    pagadorTipo: a.pagadorTipo, pagadorNome: a.pagadorNome, pagadorDocumento: a.pagadorDocumento, simularPor: a.simularPor, parcelasQtd: a.parcelasQtd || 1,
    valorDesejado: a.simularPor === 'Valor' ? a.parcelaValor : 0, formaPagamento: a.formaPagamento || 'Boleto', primeiroVencimento: a.primeiroVencimento || primeiro,
    retornoEm: a.retornoEm, observacao: a.observacao,
  }
}

export default function SimularRenegociacao({ c, parcelas, acordo, onFechar }: { c: CobrancaV; parcelas: ParcelaV[]; acordo?: AcordoV; onFechar: () => void }) {
  const s = useErp()
  const eu = useUsuario()
  const regras = regrasCobranca(s)
  const condicoes = useCondicoesFaixa()
  const fechado = acordo && acordo.situacao !== 'Simulada' ? acordo : undefined
  const [modo, setModo] = useState<Modo>(fechado ? 'ver' : 'novo')
  const [x, setX] = useState<DadosAcordo>(() => dadosIniciais(acordo, regras))
  const [salvando, setSalvando] = useState(false)
  const [escolherEdicao, setEscolherEdicao] = useState(false)
  const set = (y: Partial<DadosAcordo>) => setX((v) => ({ ...v, ...y }))

  const abertas = parcelas.filter((p) => p.situacao === 'Aberta' || p.situacao === 'Parcial').sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.numero - b.numero)
  const vencidas = abertas.filter((p) => p.vencida)
  const conta = calcularAcordo(c.totalDivida, x)
  const avisos = avisosAcordo(conta, x, c, regras)
  const faixa = faixaDaCondicao(c.diasAtraso)
  const sugestoes = condicoes.filter((k) => k.faixa === faixa)
  const editando = modo === 'novo' || modo === 'recalcular'

  const pagador = x.pagadorTipo === 'Titular' ? c.cliente : x.pagadorNome
  const doc = (a?: AcordoV): AcordoDoc =>
    a
      ? {
          cliente: c.cliente, documento: c.documento, codigoVenda: c.codigoVenda, telefones: [c.telefone].filter(Boolean), categoria: c.categoria,
          colaborador: eu?.nome ?? a.criadoPorNome, valorOriginalAtraso: a.valorOriginalAtraso, multa: a.multa, juros: a.juros, atualizado: a.atualizado,
          aVencer: a.aVencer, totalDivida: a.totalDivida, desconto: a.desconto, valorAposDesconto: a.valorAposDesconto, entrada: a.entrada, entradaPrazo: a.entradaPrazo,
          entradaForma: a.entradaForma, pagador: a.pagadorTipo === 'Titular' ? c.cliente : a.pagadorNome, valorPrazo: a.valorPrazo, formaPagamento: a.formaPagamento,
          primeiroVencimento: a.primeiroVencimento, quitacaoAVista: a.quitacaoAVista, parcelasQtd: a.parcelasQtd, parcelaValor: a.parcelaValor, totalAPagar: a.totalAPagar,
          observacao: a.observacao, versao: a.versao, impressao: a.fichaImpressoes + 1,
        }
      : {
          cliente: c.cliente, documento: c.documento, codigoVenda: c.codigoVenda, telefones: [c.telefone].filter(Boolean), categoria: c.categoria,
          colaborador: eu?.nome ?? '', valorOriginalAtraso: c.vencido, multa: c.multa, juros: c.juros, atualizado: c.atualizado, aVencer: c.aVencer,
          totalDivida: c.totalDivida, desconto: conta.desconto, valorAposDesconto: conta.valorAposDesconto, entrada: x.entrada, entradaPrazo: x.entradaPrazo,
          entradaForma: x.entradaForma, pagador, valorPrazo: conta.valorPrazo, formaPagamento: x.formaPagamento, primeiroVencimento: x.primeiroVencimento,
          quitacaoAVista: conta.quitacaoAVista, parcelasQtd: conta.parcelasQtd, parcelaValor: conta.parcelaValor, totalAPagar: conta.totalAPagar, observacao: x.observacao,
        }
  const podeExportar = conta.quitacaoAVista || (conta.parcelasQtd >= 1 && conta.valorPrazo > 0)
  const exportar = (a?: AcordoV) => {
    const erro = imprimirSimulacao(doc(a))
    if (erro) avisar(erro)
  }
  const encaminhar = (a?: AcordoV) => {
    const texto = textoSimulacao(doc(a))
    const link = linkWhatsApp(c.telefone)
    if (link) window.open(`${link}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
    else {
      void navigator.clipboard?.writeText(texto)
      avisar('Sem telefone: o texto da simulação foi copiado.', 'ok')
    }
  }
  const salvar = async (m: 'simular' | 'fechar' | 'data' | 'recalcular') => {
    setSalvando(true)
    const erro = await salvarAcordoCobranca(c.id, m, x)
    setSalvando(false)
    if (!erro) onFechar()
  }
  const imprimir = async () => {
    if (!fechado) return
    const erro = imprimirFicha(doc(fechado))
    if (erro) return avisar(erro)
    await registrarImpressaoFicha(fechado.id)
  }

  return (
    <Modal aberto titulo={`Dados atualizados do contrato — ${c.cliente}`} subtitulo={[c.codigoVenda && `Venda #${c.codigoVenda}`, c.conta, c.categoria].filter(Boolean).join(' • ')} onFechar={onFechar} largura="max-w-5xl" rodape={<button onClick={onFechar} className={btnSecundario}>Fechar</button>}>
      <div className="space-y-5">
        {/* Informações financeiras + parcelas */}
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
          <div className="px-4 py-3 flex flex-wrap justify-between gap-2 border-b border-white/[0.05]">
            <p className="text-xs text-zinc-400">
              Forma e condição acordadas na venda: <span className="text-white font-bold">{c.parcelas}x</span>. Parcelas em aberto no financeiro:
            </p>
            <p className="text-xs text-zinc-500">Juros diário: {brl(regras.juros_dia ?? 0)} • Data do cálculo: {dataBR(hoje())}</p>
          </div>
          <div className="overflow-x-auto custom-scrollbar max-h-64">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  {['Parcela', 'Vencimento', 'Dias atraso', 'Em aberto', 'Multa', 'Juros', 'Atualizado', 'Situação'].map((h, i) => (
                    <th key={h} className={`px-4 py-2 font-bold ${i >= 3 && i <= 6 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {abertas.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 font-bold text-white">{rotuloParcela(p.numero, p.total)}</td>
                    <td className={`px-4 py-2 ${p.vencida ? 'text-red-400 font-bold' : ''}`}>{dataBR(p.vencimento)}</td>
                    <td className="px-4 py-2">{p.vencida ? p.diasAtraso : '—'}</td>
                    <td className="px-4 py-2 text-right">{brl(p.saldo)}</td>
                    <td className="px-4 py-2 text-right">{p.vencida ? brl(p.multaDevida) : '—'}</td>
                    <td className="px-4 py-2 text-right">{p.vencida ? (p.cobraJuros ? brl(p.juros) : <span className="text-[11px] text-zinc-500">sem juros (migrada)</span>) : '—'}</td>
                    <td className="px-4 py-2 text-right font-bold text-white">{brl(p.atualizado)}</td>
                    <td className="px-4 py-2"><Badge texto={p.vencida ? 'Vencido' : 'A vencer'} tom={p.vencida ? 'red' : 'zinc'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-white/[0.05] grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <Linha r="Vencidos (original)" v={brl(c.vencido)} tom="text-red-400" />
            <Linha r="Multa + juros" v={brl(c.multa + c.juros)} />
            <Linha r={`Atualizado dos vencidos (${vencidas.length})`} v={brl(c.atualizado)} tom="text-red-400" />
            <Linha r="Parcelas a vencer" v={brl(c.aVencer)} />
            <Linha r="Total da dívida" v={brl(c.totalDivida)} tom="text-white" />
          </div>
        </div>

        {/* acordo fechado */}
        {fechado && !editando && modo !== 'data' && (
          <div className="rounded-2xl border border-emerald-500/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-white">Renegociação efetuada • versão {fechado.versao}</p>
              <Badge texto={fechado.situacao} tom={fechado.situacao === 'Aguardando entrada' ? 'yellow' : 'emerald'} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <Linha r="Data" v={dataBR(fechado.criadoEm.slice(0, 10))} />
              <Linha r="Total da dívida" v={brl(fechado.totalDivida)} />
              {fechado.desconto > 0 && <Linha r="Desconto" v={brl(fechado.desconto)} />}
              {fechado.entrada > 0 && <Linha r="Entrada" v={`${brl(fechado.entrada)} • ${fechado.entradaForma}`} />}
              {fechado.entrada > 0 && <Linha r="Prazo da entrada" v={dataBR(fechado.entradaPrazo)} tom="text-yellow-300" />}
              {fechado.entrada > 0 && <Linha r="Quem paga a entrada" v={fechado.pagadorTipo === 'Titular' ? c.cliente : fechado.pagadorNome} />}
              <Linha r="Parcelamento" v={fechado.quitacaoAVista ? 'Quitação à vista' : `${fechado.parcelasQtd}x de ${brl(fechado.parcelaValor)} • ${fechado.formaPagamento}`} tom="text-white" />
              {!fechado.quitacaoAVista && <Linha r="1º boleto" v={dataBR(fechado.primeiroVencimento)} />}
              <Linha r="Total a pagar" v={brl(fechado.totalAPagar)} tom="text-white" />
              <Linha r="Ficha impressa" v={fechado.fichaImpressoes ? `${fechado.fichaImpressoes}x` : 'ainda não'} tom={fechado.fichaImpressoes ? '' : 'text-red-400'} />
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={() => exportar(fechado)} className={btnSecundario}>Imprimir simulação</button>
              <button onClick={() => encaminhar(fechado)} className={btnSecundario}>Reenviar (WhatsApp)</button>
              {fechado.situacao === 'Aguardando entrada' && <button onClick={() => setEscolherEdicao(true)} className={btnSecundario}>Editar renegociação</button>}
              <button onClick={imprimir} className={btnPrimario}>{fechado.fichaImpressoes ? 'Reimprimir ficha' : 'Imprimir ficha'}</button>
            </div>
            <p className="text-[11px] text-zinc-500">Imprima a ficha e entregue ao Financeiro. O acordo é efetivado com o pagamento da entrada, conferido pelo Financeiro.</p>
          </div>
        )}

        {/* editar: só a data da entrada */}
        {modo === 'data' && (
          <div className="rounded-2xl border border-blue-500/20 p-4 space-y-3">
            <p className="text-xs text-blue-300">
              <strong>Apenas alterar a data da entrada:</strong> juros, multa, entrada, parcelas e valor da parcela continuam iguais.
            </p>
            <label className="block max-w-xs">
              <span className={labelCls}>Prazo para pagar a entrada</span>
              <input type="date" min={hoje()} value={x.entradaPrazo} onChange={(e) => set({ entradaPrazo: e.target.value })} className={inputCls} />
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModo('ver')} className={btnSecundario}>Voltar</button>
              <button onClick={() => salvar('data')} disabled={salvando || !x.entradaPrazo} className={btnPrimario}>Atualizar data</button>
            </div>
          </div>
        )}

        {/* simulação */}
        {editando && (
          <div className="rounded-2xl border border-indigo-500/20 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-widest text-indigo-300">{modo === 'recalcular' ? 'Recalcular renegociação (juros de hoje)' : 'Simular renegociação'}</p>
              <p className="text-xs text-zinc-400">
                Valor atualizado (total da dívida): <span className="text-lg font-black text-red-400">{brl(c.totalDivida)}</span>
              </p>
            </div>

            {sugestoes.length > 0 && (
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                  Sugestão da tabela • {ROTULO_FAIXA_CONDICAO[faixa]} (ofereça a condição 1 primeiro; a próxima depois de {regras.reneg_intervalo_ofertas ?? 3} dias úteis)
                </p>
                <div className="flex flex-wrap gap-2">
                  {sugestoes.map((k) => {
                    const sg = sugestaoCondicao(k, c)
                    return (
                      <button key={k.condicao} onClick={() => set({ descontoTipo: 'R$', desconto: sg.desconto, entrada: sg.entrada })} className="px-3 py-2 rounded-lg border border-white/10 text-left text-[11px] text-zinc-300 hover:bg-white/[0.04]">
                        <span className="font-bold text-white">Condição {k.condicao}</span>: entrada {k.entradaPct}% ({brl(sg.entrada)})
                        {k.descJurosPct > 0 && ` • desc. ${k.descJurosPct}% juros/multa`}
                        {k.descPrincipalPct > 0 && ` • desc. ${k.descPrincipalPct}% principal`}
                        {sg.desconto > 0 && ` = ${brl(sg.desconto)}`}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block">
                <span className={labelCls}>Entrada (R$)</span>
                <input inputMode="decimal" defaultValue={dinheiro(x.entrada)} key={`e${x.entrada}`} onBlur={(e) => set({ entrada: num(e.target.value) })} className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>
                  Desconto
                  <span className="ml-2 inline-flex gap-1">
                    {(['%', 'R$'] as const).map((t) => (
                      <button key={t} type="button" onClick={() => set({ descontoTipo: t, desconto: 0 })} className={`px-1.5 rounded ${x.descontoTipo === t ? 'bg-indigo-500 text-white' : 'text-zinc-400'}`}>{t}</button>
                    ))}
                  </span>
                </span>
                <input inputMode="decimal" defaultValue={x.desconto ? String(x.desconto).replace('.', ',') : ''} key={`d${x.descontoTipo}${x.desconto}`} onBlur={(e) => set({ desconto: num(e.target.value) })} className={inputCls} placeholder="0" />
                {conta.desconto > 0 && <span className="text-[10px] text-zinc-500">{x.descontoTipo === '%' ? `${brl(conta.desconto)} de desconto` : `${((conta.desconto / (c.totalDivida || 1)) * 100).toFixed(1)}% de desconto`}</span>}
              </label>
              <label className="block">
                <span className={labelCls}>Prazo para pagar a entrada</span>
                <input type="date" min={hoje()} value={x.entradaPrazo} onChange={(e) => set({ entradaPrazo: e.target.value })} className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>Quem vai pagar a entrada (titular do PIX)</span>
                <select value={x.pagadorTipo} onChange={(e) => set({ pagadorTipo: e.target.value as DadosAcordo['pagadorTipo'] })} className={inputCls}>
                  <option value="Titular">Titular ({c.cliente.split(' ')[0]})</option>
                  <option value="Outra pessoa">Outra pessoa (nome + CPF)</option>
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Forma de pagamento da entrada</span>
                <select value={x.entradaForma} onChange={(e) => set({ entradaForma: e.target.value })} className={inputCls}>
                  {FORMAS_ENTRADA.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              {x.pagadorTipo === 'Outra pessoa' ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className={labelCls}>Nome</span>
                    <input value={x.pagadorNome} onChange={(e) => set({ pagadorNome: e.target.value })} className={inputCls} />
                  </label>
                  <label className="block">
                    <span className={labelCls}>CPF/CNPJ</span>
                    <input value={x.pagadorDocumento} onChange={(e) => set({ pagadorDocumento: e.target.value })} className={inputCls} />
                  </label>
                </div>
              ) : (
                <div />
              )}
            </div>

            {!conta.quitacaoAVista && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <label className="block">
                  <span className={labelCls}>Simular por</span>
                  <select value={x.simularPor} onChange={(e) => set({ simularPor: e.target.value as DadosAcordo['simularPor'] })} className={inputCls}>
                    <option value="Parcelas">Qtd. parcelas → Valor</option>
                    <option value="Valor">Valor parcela → Qtd.</option>
                  </select>
                </label>
                {x.simularPor === 'Parcelas' ? (
                  <label className="block">
                    <span className={labelCls}>Nº de parcelas</span>
                    <input type="number" min={1} value={x.parcelasQtd || ''} onChange={(e) => set({ parcelasQtd: Number(e.target.value) || 0 })} className={inputCls} />
                  </label>
                ) : (
                  <label className="block">
                    <span className={labelCls}>Valor desejado (R$)</span>
                    <input inputMode="decimal" defaultValue={dinheiro(x.valorDesejado)} onBlur={(e) => set({ valorDesejado: num(e.target.value) })} className={inputCls} />
                  </label>
                )}
                <label className="block">
                  <span className={labelCls}>Vencimento do primeiro boleto</span>
                  <input type="date" value={x.primeiroVencimento} onChange={(e) => set({ primeiroVencimento: e.target.value })} className={inputCls} />
                </label>
                <label className="block">
                  <span className={labelCls}>Forma de pagamento da renegociação</span>
                  <select value={x.formaPagamento} onChange={(e) => set({ formaPagamento: e.target.value })} className={inputCls}>
                    {FORMAS_RENEGOCIACAO.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {!conta.quitacaoAVista && (
              <p className="text-[11px] text-zinc-500 rounded-lg bg-white/[0.02] border border-white/[0.05] p-2">
                <strong>Regra do primeiro boleto:</strong> renegociações feitas até o dia {regras.primeiro_boleto_corte ?? 20} têm o primeiro boleto com vencimento no dia {regras.primeiro_boleto_dia ?? 10} do mês seguinte. A partir do dia {(regras.primeiro_boleto_corte ?? 20) + 1}, pulam o mês seguinte (ex.: renegociação em julho → vencimento em 10 de setembro).
              </p>
            )}

            {conta.quitacaoAVista ? (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-center">
                <p className="text-sm font-black text-emerald-400 uppercase tracking-widest">Quitação à vista</p>
                <p className="text-[11px] text-zinc-400">Entrada de {brl(x.entrada)} cobre o valor total após desconto</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <Linha r="Nº de parcelas" v={`${conta.parcelasQtd}x`} tom="text-white text-lg" />
                <Linha r="Valor da parcela" v={brl(conta.parcelaValor)} tom="text-indigo-300 text-lg" />
                <Linha r="Total a pagar" v={brl(conta.totalAPagar)} tom="text-white text-lg" />
              </div>
            )}

            {avisos.length > 0 && (
              <div className="space-y-1">
                {avisos.map((a) => (
                  <p key={a} className="text-[11px] text-yellow-300 bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-1.5">⚠ {a}</p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <label className="block md:col-span-2">
                <span className={labelCls}>Observação</span>
                <input value={x.observacao} onChange={(e) => set({ observacao: e.target.value })} className={inputCls} placeholder="Vai na ficha do acordo" />
              </label>
              {modo === 'novo' && (
                <label className="block">
                  <span className={labelCls}>Retorno do cliente (para salvar a simulação)</span>
                  <input type="date" min={hoje()} value={x.retornoEm} onChange={(e) => set({ retornoEm: e.target.value })} className={inputCls} />
                </label>
              )}
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              {modo === 'recalcular' && <button onClick={() => setModo('ver')} className={btnSecundario}>Voltar</button>}
              <button onClick={() => exportar()} disabled={!podeExportar} className={btnSecundario}>Exportar simulação</button>
              <button onClick={() => encaminhar()} disabled={!podeExportar} className={btnSecundario}>Encaminhar (WhatsApp)</button>
              {modo === 'novo' && (
                <button onClick={() => salvar('simular')} disabled={salvando || !podeExportar || !x.retornoEm} className={btnSecundario} title="Salva a simulação e agenda o retorno do cliente">
                  Salvar simulação
                </button>
              )}
              <button onClick={() => salvar(modo === 'recalcular' ? 'recalcular' : 'fechar')} disabled={salvando || !podeExportar} className={btnPrimario}>
                {modo === 'recalcular' ? 'Atualizar renegociação' : 'Fechar acordo'}
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        aberto={escolherEdicao}
        titulo="Editar renegociação"
        subtitulo="Você está editando uma renegociação existente. Escolha o tipo de alteração:"
        onFechar={() => setEscolherEdicao(false)}
        largura="max-w-md"
        rodape={<button onClick={() => setEscolherEdicao(false)} className={btnSecundario}>Cancelar</button>}
      >
        <div className="space-y-3">
          <button onClick={() => { setEscolherEdicao(false); setModo('data') }} className="w-full text-left rounded-xl border border-blue-500/40 p-4 hover:bg-blue-500/10">
            <p className="font-bold text-blue-300">Apenas alterar a data da entrada</p>
            <p className="text-xs text-zinc-400 mt-1">Mantém juros, multa, valor da entrada, parcelas e valor da parcela. Só o prazo da entrada muda.</p>
          </button>
          <button onClick={() => { setEscolherEdicao(false); setX(dadosIniciais(fechado, regras)); setModo('recalcular') }} className="w-full text-left rounded-xl border border-yellow-500/40 p-4 hover:bg-yellow-500/10">
            <p className="font-bold text-yellow-300">Recalcular renegociação</p>
            <p className="text-xs text-zinc-400 mt-1">Permite alterar desconto, entrada, parcelas e valor. Os juros são recalculados com a data de hoje.</p>
          </button>
        </div>
      </Modal>
    </Modal>
  )
}

function Linha({ r, v, tom = '' }: { r: string; v: string; tom?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{r}</p>
      <p className={`font-bold ${tom || 'text-zinc-200'}`}>{v}</p>
    </div>
  )
}
