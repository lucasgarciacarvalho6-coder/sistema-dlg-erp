// Renegociação da Cobrança (SQL 047), IGUAL ao "Simular Renegociação" do sistema antigo:
// a conta, os avisos (nada trava), a sugestão da tabela por faixa e os 2 documentos
// ("Simulação de Renegociação" e "Ficha de Renegociação de Cobrança") + o texto do WhatsApp.
// O banco refaz a mesma conta ao salvar; aqui é a prévia na tela e o modo demonstração.

import { addMeses, brl, dataBR, hoje } from './format'
import { formatarDocumento } from './documento'

export const FORMAS_ENTRADA = ['PIX', 'Cartão', 'Dinheiro'] as const
export const FORMAS_RENEGOCIACAO = ['Pix', 'Boleto', 'Cartão', 'Transferência', 'Dinheiro'] as const
export const SITUACOES_ACORDO_ABERTO = ['Simulada', 'Aguardando entrada', 'Entrada confirmada']

export interface DadosAcordo {
  descontoTipo: '%' | 'R$'
  desconto: number
  entrada: number
  entradaPrazo: string
  entradaForma: string
  pagadorTipo: 'Titular' | 'Outra pessoa'
  pagadorNome: string
  pagadorDocumento: string
  simularPor: 'Parcelas' | 'Valor'
  parcelasQtd: number
  valorDesejado: number
  formaPagamento: string
  primeiroVencimento: string
  retornoEm: string
  observacao: string
}

export interface ContaAcordo {
  desconto: number
  valorAposDesconto: number
  valorPrazo: number
  quitacaoAVista: boolean
  parcelasQtd: number
  parcelaValor: number
  totalAPagar: number
}

const cent = (v: number) => Math.round((Number(v) || 0) * 100)

// mesma conta do banco (em centavos para arredondar igual)
export function calcularAcordo(totalDivida: number, x: Pick<DadosAcordo, 'descontoTipo' | 'desconto' | 'entrada' | 'simularPor' | 'parcelasQtd' | 'valorDesejado'>): ContaAcordo {
  const total = cent(totalDivida)
  const desc = x.descontoTipo === '%' ? Math.round((total * Math.min(100, Math.max(0, Number(x.desconto) || 0))) / 100) : Math.min(total, Math.max(0, cent(x.desconto)))
  const apos = Math.max(0, total - desc)
  const entrada = Math.max(0, cent(x.entrada))
  let prazo = Math.max(0, apos - entrada)
  const avista = entrada > 0 && prazo <= 1
  let qtd = 0
  let parcela = 0
  if (avista) prazo = 0
  else {
    qtd = x.simularPor === 'Valor' ? (cent(x.valorDesejado) > 0 ? Math.max(1, Math.ceil(prazo / cent(x.valorDesejado))) : 0) : Math.max(0, Math.trunc(Number(x.parcelasQtd) || 0))
    parcela = qtd > 0 ? Math.round(prazo / qtd) : 0
  }
  return { desconto: desc / 100, valorAposDesconto: apos / 100, valorPrazo: prazo / 100, quitacaoAVista: avista, parcelasQtd: qtd, parcelaValor: parcela / 100, totalAPagar: (prazo + entrada) / 100 }
}

// regra do 1º boleto: acordo até o dia 20 → dia 10 do mês seguinte; depois do dia 20 → dia 10 do mês depois
export function primeiroVencimentoPadrao(base = hoje(), dia = 10, corte = 20) {
  const d = Number(base.slice(8, 10))
  const mes = addMeses(`${base.slice(0, 8)}01`, d <= corte ? 1 : 2)
  return `${mes.slice(0, 8)}${String(dia).padStart(2, '0')}`
}

export interface CondicaoFaixa {
  faixa: number
  condicao: number
  entradaPct: number
  descJurosPct: number
  descPrincipalPct: number
}
export const CONDICOES_PADRAO: CondicaoFaixa[] = [
  [2, 1, 100, 0, 0], [2, 2, 70, 0, 0], [2, 3, 50, 0, 0],
  [3, 1, 70, 0, 0], [3, 2, 50, 0, 0], [3, 3, 30, 0, 0],
  [4, 1, 50, 100, 0], [4, 2, 30, 100, 10], [4, 3, 20, 100, 20],
].map(([faixa, condicao, entradaPct, descJurosPct, descPrincipalPct]) => ({ faixa, condicao, entradaPct, descJurosPct, descPrincipalPct }))
export const ROTULO_FAIXA_CONDICAO: Record<number, string> = { 2: '61 a 180 dias', 3: '181 a 360 dias', 4: 'acima de 360 dias' }
export const faixaDaCondicao = (dias: number) => (dias > 360 ? 4 : dias > 180 ? 3 : dias >= 61 ? 2 : 0)

// sugestão de uma condição (como o "Simular do Banco" do antigo): desconto em R$ e entrada
export function sugestaoCondicao(c: CondicaoFaixa, d: { vencido: number; multa: number; juros: number; atualizado: number }) {
  const desconto = (cent(d.multa + d.juros) * c.descJurosPct) / 100 + (cent(d.vencido) * c.descPrincipalPct) / 100
  const entrada = ((cent(d.atualizado) - desconto) * c.entradaPct) / 100
  return { desconto: Math.round(desconto) / 100, entrada: Math.max(0, Math.round(entrada)) / 100 }
}

// avisos (14/10: nenhuma regra do setor trava; o cobrador decide)
export function avisosAcordo(
  conta: ContaAcordo,
  x: DadosAcordo,
  c: { podeRenegociar: boolean; parcelasVencidas: number; diasAtraso: number; totalDivida: number },
  regras: Record<string, number>,
): string[] {
  const av: string[] = []
  const min = regras.parcela_minima ?? 100
  if (!conta.quitacaoAVista && conta.parcelaValor > 0 && conta.parcelaValor < min)
    av.push(`Valor da parcela abaixo do mínimo de ${brl(min)}. Aumente o número de parcelas ou reduza o desconto/entrada.`)
  if (!(x.entrada > 0)) av.push('Sem entrada: a regra do setor é ter entrada.')
  if (!c.podeRenegociar) av.push(`Pela regra, renegocia com ${regras.reneg_min_boletos ?? 2} boletos vencidos e ${regras.reneg_min_dias ?? 61} dias de atraso (esta tem ${c.parcelasVencidas} e ${c.diasAtraso} dias).`)
  const pct = c.totalDivida > 0 ? (conta.desconto / c.totalDivida) * 100 : 0
  if (pct > (regras.desconto_maximo ?? 100) + 0.001) av.push(`Desconto de ${pct.toFixed(1)}% (a referência do setor é até ${regras.desconto_maximo}%).`)
  if (!conta.quitacaoAVista && x.primeiroVencimento && x.entradaPrazo) {
    const regra = primeiroVencimentoPadrao(x.entradaPrazo, regras.primeiro_boleto_dia ?? 10, regras.primeiro_boleto_corte ?? 20)
    if (regra !== x.primeiroVencimento) av.push(`Data fora de regra: pelo prazo da entrada, o 1º boleto seria ${dataBR(regra)}.`)
  }
  return av
}

// ---------------- Documentos ----------------
export interface AcordoDoc {
  cliente: string
  documento: string
  codigoVenda: string
  telefones: string[]
  categoria: string
  colaborador: string
  valorOriginalAtraso: number
  multa: number
  juros: number
  atualizado: number
  aVencer: number
  totalDivida: number
  desconto: number
  valorAposDesconto: number
  entrada: number
  entradaPrazo: string
  entradaForma: string
  pagador: string
  valorPrazo: number
  formaPagamento: string
  primeiroVencimento: string
  quitacaoAVista: boolean
  parcelasQtd: number
  parcelaValor: number
  totalAPagar: number
  observacao: string
  versao?: number
  impressao?: number
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!)

function abrirParaImprimir(html: string) {
  const w = window.open('', '_blank')
  if (!w) return 'O navegador bloqueou a janela de impressão. Libere pop-ups e tente novamente.'
  w.document.write(html)
  w.document.close()
  return null
}

const logo = () => `${typeof window !== 'undefined' ? window.location.origin : ''}/logo.png`

// 1) Simulação de Renegociação — vai ao cliente ANTES de fechar
export function htmlSimulacao(a: AcordoDoc) {
  const linha = (l: string, v: string) => `<div class="row"><span class="label">${esc(l)}</span><span class="value">${esc(v)}</span></div>`
  const emissao = dataBR(hoje())
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Simulação de Renegociação — ${esc(a.cliente)}</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,sans-serif;background:#f0f0f0;padding:20px;color:#1a1a1a}
.doc{max-width:580px;margin:0 auto;background:#fff;border-radius:8px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
h1{text-align:center;font-size:18px;text-transform:uppercase;color:#4f46e5;padding-bottom:10px;border-bottom:2px solid #4f46e5;margin-bottom:16px}
.head{display:flex;align-items:center;gap:12px;margin-bottom:12px}.head img{height:60px;width:auto;mix-blend-mode:multiply}
.collab{font-size:11px;color:#4b5563;text-align:right;flex:1}.date{text-align:center;font-size:12px;color:#666;margin-bottom:20px}
.section{margin-bottom:16px}.st{font-size:13px;font-weight:700;text-transform:uppercase;color:#3730a3;margin-bottom:8px}
.row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dotted #d1d5db;font-size:14px}.label{color:#4b5563}.value{font-weight:700}
.hl{background:#eef2ff;border-radius:6px;padding:12px;margin-top:8px}.hl .row{border-bottom:none}.hl .value{font-size:16px}
.total{background:#4f46e5;color:#fff;border-radius:6px;padding:12px;margin-top:12px;display:flex;justify-content:space-between;font-size:16px;font-weight:700}
.note{margin-top:20px;font-size:11px;color:#6b7280;text-align:center}
@media print{body{padding:0;background:#fff}.doc{box-shadow:none;max-width:100%}@page{margin:1cm}}
</style></head><body><div class="doc">
<div class="head"><img src="${logo()}" alt="DLG Photo Studio"/><div class="collab"><strong>Colaborador:</strong> ${esc(a.colaborador)}<br><strong>Emissão:</strong> ${emissao}</div></div>
<h1>Simulação de Renegociação</h1><div class="date">Data: ${emissao}</div>
<div class="section"><div class="st">Dados do Cliente</div>${linha('Nome', a.cliente)}${a.documento ? linha('CPF/CNPJ', formatarDocumento(a.documento)) : ''}${a.codigoVenda ? linha('Nº da venda', a.codigoVenda) : ''}${a.entrada > 0 && a.pagador ? linha('Pagador', a.pagador) : ''}</div>
<div class="section"><div class="st">Resumo da Dívida</div>${linha('Valor original em atraso', brl(a.valorOriginalAtraso))}${linha('Multa', brl(a.multa))}${linha('Juros', brl(a.juros))}${linha('Valor atualizado (vencidos)', brl(a.atualizado))}${linha('Parcelas a vencer', brl(a.aVencer))}${linha('Total da dívida', brl(a.totalDivida))}</div>
<div class="section"><div class="st">Condições da Proposta</div>
${a.desconto > 0 ? linha('Desconto concedido', brl(a.desconto)) : ''}${linha('Valor após desconto', brl(a.valorAposDesconto))}
${a.entrada > 0 ? linha('Entrada', brl(a.entrada)) + linha('Prazo para pagamento da entrada', dataBR(a.entradaPrazo)) + (a.pagador ? linha('Quem vai pagar a entrada', a.pagador) : '') + linha('Forma de pagamento da entrada', a.entradaForma) : ''}
${linha('Valor a prazo (s/ entrada)', brl(a.valorPrazo))}
${a.quitacaoAVista ? '' : linha('Forma de pagamento da renegociação', a.formaPagamento) + (a.primeiroVencimento ? linha('Vencimento do primeiro boleto', dataBR(a.primeiroVencimento)) : '')}
${a.quitacaoAVista ? '<div class="hl" style="text-align:center"><div class="row" style="justify-content:center"><span class="value" style="color:#10b981">QUITAÇÃO À VISTA</span></div></div>' : `<div class="hl">${linha('Nº de parcelas', `${a.parcelasQtd}x`)}${linha('Valor da parcela', brl(a.parcelaValor))}</div>`}
<div class="total"><span>${a.quitacaoAVista ? 'Total quitado' : 'Total a pagar'}</span><span>${brl(a.totalAPagar)}</span></div></div>
<div class="note">${a.entrada > 0 ? `Prazo para pagamento da entrada: ${dataBR(a.entradaPrazo)}.<br>` : ''}Esta simulação não constitui um acordo formal. O acordo é efetivado com o pagamento da entrada.</div>
</div><script>window.onload=function(){window.print()}<\/script></body></html>`
}

// texto do WhatsApp ("Encaminhar")
export function textoSimulacao(a: AcordoDoc) {
  const l: string[] = ['*SIMULAÇÃO DE RENEGOCIAÇÃO*', dataBR(hoje()), '', `*Cliente:* ${a.cliente}`]
  if (a.codigoVenda) l.push(`*Venda:* ${a.codigoVenda}`)
  l.push('')
  if (a.desconto > 0) l.push(`*Desconto:* ${brl(a.desconto)}`)
  if (a.entrada > 0) {
    l.push(`*Entrada:* ${brl(a.entrada)}`, `*Prazo para pagamento da entrada:* ${dataBR(a.entradaPrazo)}`)
    if (a.pagador) l.push(`*Quem vai pagar a entrada:* ${a.pagador}`)
    l.push(`*Forma de pagamento da entrada:* ${a.entradaForma}`)
  }
  if (a.quitacaoAVista) l.push('*QUITAÇÃO À VISTA*', `*Valor quitado:* ${brl(a.entrada)}`)
  else {
    l.push(`*Forma de pagamento da renegociação:* ${a.formaPagamento}`, `*Parcelamento:* ${a.parcelasQtd}x de ${brl(a.parcelaValor)}`)
    if (a.primeiroVencimento) l.push(`*Vencimento do primeiro boleto:* ${dataBR(a.primeiroVencimento)}`)
    l.push(`*Valor a prazo:* ${brl(a.valorPrazo)}`)
  }
  if (a.entrada > 0) l.push(`*Total:* ${brl(a.totalAPagar)}`)
  l.push('', '_O acordo é efetivado com o pagamento da entrada._')
  return l.join('\n')
}

// 2) Ficha de Renegociação de Cobrança — formalização (o cobrador imprime ao fechar e entrega ao Financeiro)
export function htmlFicha(a: AcordoDoc) {
  const campo = (l: string, v: string) => `<div class="field"><div class="fl">${esc(l)}</div><div class="fv">${esc(v)}</div></div>`
  const cx = (f: string) => `<div class="opt"><span class="cb ${a.entradaForma === f ? 'on' : ''}"></span> ${f}</div>`
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Ficha de Renegociação — ${esc(a.cliente)}</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,sans-serif;background:#fff;padding:20px;color:#1a1a1a}
.ficha{max-width:600px;margin:0 auto;background:#fef9c3;border:2px solid #ca8a04;border-radius:8px;padding:24px}
.head{display:flex;align-items:center;gap:12px;margin-bottom:12px}.head img{height:60px;width:auto;mix-blend-mode:multiply}.collab{font-size:11px;color:#713f12;text-align:right;flex:1}
h1{text-align:center;font-size:18px;text-transform:uppercase;letter-spacing:.5px;padding-bottom:8px;border-bottom:2px solid #ca8a04;margin-bottom:16px}
.st{font-size:13px;font-weight:700;text-transform:uppercase;color:#713f12;margin:14px 0 8px;padding-bottom:4px;border-bottom:1px solid #ca8a04}
.r{display:flex;gap:16px;margin-bottom:8px;font-size:13px}.field{flex:1}.fl{font-size:11px;color:#713f12;font-weight:600;text-transform:uppercase}
.fv{font-size:14px;font-weight:600;border-bottom:1px dotted #a16207;padding-bottom:2px;min-height:20px}
.opts{display:flex;gap:20px;margin:6px 0;font-size:13px}.opt{display:flex;align-items:center;gap:4px}
.cb{width:14px;height:14px;border:1.5px solid #713f12;border-radius:2px;display:inline-block}.cb.on::after{content:'✓';font-size:12px;line-height:14px;display:block;text-align:center;font-weight:bold}
.obs{border:1px dashed #a16207;min-height:60px;padding:8px;font-size:13px;margin-top:4px;border-radius:4px;white-space:pre-wrap}
.audit{margin-top:12px;font-size:10px;color:#713f12;text-align:right}
@media print{body{padding:0}.ficha{border:1px solid #ca8a04;max-width:100%}@page{margin:1cm}}
</style></head><body><div class="ficha">
<div class="head"><img src="${logo()}" alt="DLG Photo Studio"/><div class="collab"><strong>Colaborador:</strong> ${esc(a.colaborador)}<br><strong>Emissão:</strong> ${dataBR(hoje())}</div></div>
<h1>Ficha de Renegociação de Cobrança</h1>
<div class="st">Dados do Cliente</div>
<div class="r">${campo('Número da venda', a.codigoVenda)}${campo('Nome do cliente', a.cliente)}</div>
<div class="r">${campo('Telefone do cliente', a.telefones.join('  /  '))}${campo('CPF/CNPJ', a.documento ? formatarDocumento(a.documento) : '')}</div>
<div class="r">${campo('Categoria', a.categoria)}</div>
<div class="st">Detalhes Financeiros</div>
<div class="r">${campo('Boletos vencidos (original)', brl(a.valorOriginalAtraso))}${campo('Multa', brl(a.multa))}</div>
<div class="r">${campo('Juros', brl(a.juros))}${campo('Boletos a vencer', brl(a.aVencer))}</div>
<div class="r">${campo('Total da dívida renegociada', brl(a.totalDivida))}${campo('Desconto', brl(a.desconto))}</div>
<div class="r">${campo('Valor após desconto', brl(a.valorAposDesconto))}${campo('Valor entrada', brl(a.entrada))}</div>
<div class="st">Forma de Pagamento da Entrada</div>
<div class="opts">${cx('PIX')}${cx('Cartão')}${cx('Dinheiro')}</div>
<div class="r">${campo('Quem vai pagar a entrada', a.pagador)}${campo('Prazo da entrada', a.entradaPrazo ? dataBR(a.entradaPrazo) : '')}</div>
<div class="st">Parcelamento</div>
${a.quitacaoAVista ? '<div class="r"><div class="field"><div class="fv">QUITAÇÃO À VISTA — sem parcelas</div></div></div>' : `
<div class="r">${campo('Valor para parcelamento', brl(a.valorPrazo))}${campo('Forma de pagamento', a.formaPagamento)}</div>
<div class="r">${campo('O restante será pago em', `${a.parcelasQtd} vezes`)}${campo('Prestações de R$', brl(a.parcelaValor))}</div>
<div class="r">${campo(`Confirmação (${a.parcelasQtd}x ${brl(a.parcelaValor)})`, brl(a.valorPrazo))}${campo('Vencimento do primeiro boleto', a.primeiroVencimento ? dataBR(a.primeiroVencimento) : '')}</div>`}
<div class="st">Observações</div><div class="obs">${esc(a.observacao) || '&nbsp;'}</div>
<div class="audit">Acordo versão ${a.versao ?? 1} · ${a.impressao && a.impressao > 1 ? `REIMPRESSÃO Nº ${a.impressao}` : 'Primeira impressão'}</div>
</div><script>window.onload=function(){window.print()}<\/script></body></html>`
}

export const imprimirSimulacao = (a: AcordoDoc) => abrirParaImprimir(htmlSimulacao(a))
export const imprimirFicha = (a: AcordoDoc) => abrirParaImprimir(htmlFicha(a))

// ---------------- Acordo gravado (cobranca_acordos) ----------------
export interface AcordoV {
  id: string
  cobrancaId: string
  clienteId: string
  versao: number
  situacao: string
  conta: string
  dataCalculo: string
  valorOriginalAtraso: number
  multa: number
  juros: number
  atualizado: number
  aVencer: number
  totalDivida: number
  descontoTipo: '%' | 'R$'
  descontoInformado: number
  desconto: number
  valorAposDesconto: number
  entrada: number
  entradaPrazo: string
  entradaForma: string
  pagadorTipo: 'Titular' | 'Outra pessoa'
  pagadorNome: string
  pagadorDocumento: string
  valorPrazo: number
  simularPor: 'Parcelas' | 'Valor'
  parcelasQtd: number
  parcelaValor: number
  formaPagamento: string
  primeiroVencimento: string
  quitacaoAVista: boolean
  totalAPagar: number
  observacao: string
  retornoEm: string
  parcelasVencidasCongeladas: number
  estavaSpc: boolean
  criadoPorNome: string
  fichaImpressoes: number
  criadoEm: string
}

const tx = (v: unknown) => (v == null ? '' : String(v))
const nb = (v: unknown) => Number(v) || 0
// aceita a linha do banco (snake_case) ou o registro da demonstração (camelCase)
export function acordoV(l: Record<string, unknown>): AcordoV {
  const g = (camel: string, snake: string) => (l[camel] !== undefined ? l[camel] : l[snake])
  return {
    id: tx(l.id), cobrancaId: tx(g('cobrancaId', 'cobranca_id')), clienteId: tx(g('clienteId', 'cliente_id')), versao: nb(l.versao) || 1,
    situacao: tx(l.situacao), conta: tx(l.conta), dataCalculo: tx(g('dataCalculo', 'data_calculo')),
    valorOriginalAtraso: nb(g('valorOriginalAtraso', 'valor_original_atraso')), multa: nb(l.multa), juros: nb(l.juros), atualizado: nb(l.atualizado),
    aVencer: nb(g('aVencer', 'a_vencer')), totalDivida: nb(g('totalDivida', 'total_divida')),
    descontoTipo: tx(g('descontoTipo', 'desconto_tipo')) === 'R$' ? 'R$' : '%', descontoInformado: nb(g('descontoInformado', 'desconto_informado')),
    desconto: nb(l.desconto), valorAposDesconto: nb(g('valorAposDesconto', 'valor_apos_desconto')), entrada: nb(l.entrada),
    entradaPrazo: tx(g('entradaPrazo', 'entrada_prazo')), entradaForma: tx(g('entradaForma', 'entrada_forma')),
    pagadorTipo: tx(g('pagadorTipo', 'pagador_tipo')) === 'Outra pessoa' ? 'Outra pessoa' : 'Titular',
    pagadorNome: tx(g('pagadorNome', 'pagador_nome')), pagadorDocumento: tx(g('pagadorDocumento', 'pagador_documento')),
    valorPrazo: nb(g('valorPrazo', 'valor_prazo')), simularPor: tx(g('simularPor', 'simular_por')) === 'Valor' ? 'Valor' : 'Parcelas',
    parcelasQtd: nb(g('parcelasQtd', 'parcelas_qtd')), parcelaValor: nb(g('parcelaValor', 'parcela_valor')),
    formaPagamento: tx(g('formaPagamento', 'forma_pagamento')), primeiroVencimento: tx(g('primeiroVencimento', 'primeiro_vencimento')),
    quitacaoAVista: !!g('quitacaoAVista', 'quitacao_a_vista'), totalAPagar: nb(g('totalAPagar', 'total_a_pagar')), observacao: tx(l.observacao),
    retornoEm: tx(g('retornoEm', 'retorno_em')), parcelasVencidasCongeladas: nb(g('parcelasVencidasCongeladas', 'parcelas_vencidas_congeladas')),
    estavaSpc: !!g('estavaSpc', 'estava_spc'), criadoPorNome: tx(g('criadoPorNome', 'criado_por_nome')),
    fichaImpressoes: nb(g('fichaImpressoes', 'ficha_impressoes')), criadoEm: tx(g('criadoEm', 'created_at')),
  }
}

// ---------------- Financeiro › Acordos da Cobrança (vw_acordos_financeiro, SQL 048) ----------------
export interface AcordoFin {
  id: string
  cobrancaId: string
  clienteId: string
  cliente: string
  documento: string
  telefone: string
  codigoVenda: string
  conta: string
  versao: number
  situacao: string
  totalDivida: number
  desconto: number
  entrada: number
  entradaPrazo: string
  entradaForma: string
  pagador: string
  parcelasQtd: number
  parcelaValor: number
  formaPagamento: string
  primeiroVencimento: string
  quitacaoAVista: boolean
  totalAPagar: number
  observacao: string
  criadoPorNome: string
  fichaImpressoes: number
  entradaRecebidaEm: string
  confirmadoPorNome: string
  efetivadoEm: string
  boletosEnviadosEm: string
  motivo: string
  estavaSpc: boolean
  entradaVencida: boolean
}

export function acordoFin(l: Record<string, unknown>): AcordoFin {
  const g = (camel: string, snake: string) => (l[camel] !== undefined ? l[camel] : l[snake])
  return {
    id: tx(l.id), cobrancaId: tx(g('cobrancaId', 'cobranca_id')), clienteId: tx(g('clienteId', 'cliente_id')), cliente: tx(l.cliente), documento: tx(l.documento),
    telefone: tx(l.telefone), codigoVenda: tx(g('codigoVenda', 'codigo_venda')), conta: tx(l.conta), versao: nb(l.versao) || 1, situacao: tx(l.situacao),
    totalDivida: nb(g('totalDivida', 'total_divida')), desconto: nb(l.desconto), entrada: nb(l.entrada), entradaPrazo: tx(g('entradaPrazo', 'entrada_prazo')),
    entradaForma: tx(g('entradaForma', 'entrada_forma')), pagador: tx(l.pagador), parcelasQtd: nb(g('parcelasQtd', 'parcelas_qtd')), parcelaValor: nb(g('parcelaValor', 'parcela_valor')),
    formaPagamento: tx(g('formaPagamento', 'forma_pagamento')), primeiroVencimento: tx(g('primeiroVencimento', 'primeiro_vencimento')),
    quitacaoAVista: !!g('quitacaoAVista', 'quitacao_a_vista'), totalAPagar: nb(g('totalAPagar', 'total_a_pagar')), observacao: tx(l.observacao),
    criadoPorNome: tx(g('criadoPorNome', 'criado_por_nome')), fichaImpressoes: nb(g('fichaImpressoes', 'ficha_impressoes')),
    entradaRecebidaEm: tx(g('entradaRecebidaEm', 'entrada_recebida_em')), confirmadoPorNome: tx(g('confirmadoPorNome', 'confirmado_por_nome')),
    efetivadoEm: tx(g('efetivadoEm', 'efetivado_em')), boletosEnviadosEm: tx(g('boletosEnviadosEm', 'boletos_enviados_em')), motivo: tx(l.motivo),
    estavaSpc: !!g('estavaSpc', 'estava_spc'), entradaVencida: !!g('entradaVencida', 'entrada_vencida'),
  }
}
