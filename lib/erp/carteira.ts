// Carteira de cobranças (SQL 041/042): o formato das linhas que as telas recebem do servidor e, no modo demonstração,
// as mesmas contas das views do banco feitas em memória (juros, multa, atualizado, faixas, carteira, quem pode renegociar).

import type { ErpState, Registro, Tom } from './types'
import { colecao } from './metrics'
import { hoje } from './format'
import { regrasCobranca } from './cobranca-config'
import { documentoValido, soDigitos, termosBusca, textoBusca } from './documento'

// conta de cada dívida (os 2 CNPJs): a CA Beatriz é a ativa; a CA Diogo está congelada e só tem as cobranças antigas
export const CONTAS_COBRANCA = ['CA Beatriz', 'CA Diogo'] as const
export type ContaCobranca = (typeof CONTAS_COBRANCA)[number]
export const CONTA_PADRAO: ContaCobranca = 'CA Beatriz'

export const FORMAS_RECEBIMENTO = ['Boleto', 'PIX', 'Dinheiro', 'Cartão', 'Transferência', 'Outro'] as const
export const CARTEIRAS_COBRANCA = ['Cobrança DLG', 'Terceirizada', 'Advogado', 'Fundo perdido'] as const
export const FAIXAS_DIAS = ['Até 60 dias', '61 a 180 dias', '181 a 360 dias', 'Acima de 360 dias'] as const

export type SituacaoPessoa = 'Em atraso' | 'Em dia' | 'Em acordo' | 'Quitado' | 'Cancelado'
export const ORDEM_SITUACAO: SituacaoPessoa[] = ['Em atraso', 'Em dia', 'Em acordo', 'Quitado', 'Cancelado']
export const TOM_SITUACAO: Record<SituacaoPessoa, Tom> = { 'Em atraso': 'red', 'Em dia': 'emerald', 'Em acordo': 'yellow', Quitado: 'emerald', Cancelado: 'zinc' }

export interface ParcelaV {
  id: string
  cobrancaId: string
  numero: number
  total: number
  valor: number
  vencimento: string
  multa: number
  baixado: number
  situacao: string // Aberta / Parcial / Paga / Em acordo / Cancelada
  pagoEm: string
  acordoId: string
  cobraJuros: boolean // as parcelas migradas do sistema antigo não somam juros (SQL 043)
  saldo: number
  vencida: boolean
  diasAtraso: number
  multaDevida: number
  juros: number
  atualizado: number
}

export interface CobrancaV {
  id: string
  clienteId: string
  cliente: string
  documento: string
  documentoOk: boolean
  telefone: string
  cidade: string
  uf: string
  vendaId: string
  origem: string
  codigoVenda: string
  referencia: string
  conta: string
  categoriaId: string
  categoria: string
  grupo: string
  contaInadimplencia: boolean
  podeSpc: boolean
  cobradorId: string
  cobrador: string
  situacao: string
  observacao: string
  parcelas: number
  parcelasAbertas: number
  parcelasVencidas: number
  parcelasPagas: number
  valorTotal: number
  recebido: number
  emAberto: number
  vencido: number
  aVencer: number
  multa: number
  juros: number
  atualizado: number
  totalDivida: number
  vencidaDesde: string
  proximoVencimento: string
  quitadaEm: string
  diasAtraso: number
  faixaDias: string
  faixaParcelas: string
  carteira: string
  foraDaCategoria: boolean
  podeRenegociar: boolean
  podeIrSpc: boolean
  criadoEm: string
}

// Financeiro › Contas a Receber: um nome por linha
export interface ClienteCarteira {
  clienteId: string
  cliente: string
  documento: string
  telefone: string
  cidade: string
  uf: string
  referencias: string
  cobrancas: number
  parcelas: number
  parcelasPagas: number
  parcelasVencidas: number
  emAberto: number
  vencido: number
  atualizado: number
  recebido: number
  vencePrimeiro: string
  diasAtraso: number
  carteiras: string[]
  contas: string[]
  cobradores: string[]
  situacao: SituacaoPessoa
}

// Cobrança › Inadimplência: só quem tem parcela vencida e não paga
export interface Inadimplente {
  clienteId: string
  cliente: string
  documento: string
  telefone: string
  cidade: string
  uf: string
  referencias: string
  parcelasVencidas: number
  vencido: number
  atualizado: number
  vencidaDesde: string
  diasAtraso: number
  carteiras: string[]
  contas: string[]
  cobradores: string[]
  podeRenegociar: boolean
}

export interface PagamentoV {
  id: string
  parcelaId: string
  cobrancaId: string
  valor: number
  principal: number
  encargos: number
  desconto: number
  data: string
  forma: string
  observacao: string
  origem: string
  registradoPorNome: string
  estornadoEm: string
  estornadoPorNome: string
  estornoMotivo: string
  criadoEm: string
}

export interface Indicadores {
  emAberto: number
  emAtraso: number
  atualizadoAtraso: number
  parcelasVencidas: number
  venceHoje: number
  emAcordo: number
  parcelasAbertas: number
  atrasoMedio: number
  recebidoMes: number
  recebidoHoje: number
  clientesSituacao: Partial<Record<SituacaoPessoa, number>>
  clientesEmAtraso: number
  taxaInadimplencia: number
}
export const INDICADORES_VAZIOS: Indicadores = {
  emAberto: 0, emAtraso: 0, atualizadoAtraso: 0, parcelasVencidas: 0, venceHoje: 0, emAcordo: 0, parcelasAbertas: 0, atrasoMedio: 0,
  recebidoMes: 0, recebidoHoje: 0, clientesSituacao: {}, clientesEmAtraso: 0, taxaInadimplencia: 0,
}

export interface ResumoCarteira {
  carteira: string
  faixaDias: string
  cobrancas: number
  clientes: number
  vencido: number
  atualizado: number
}

export interface ResumoVenda {
  vendaId: string
  parcelas: number
  parcelasPagas: number
  parcelasVencidas: number
  recebido: number
  emAberto: number
  vencido: number
}

// ---------------- contas (iguais às views do banco) ----------------
const n = (v: unknown) => Number(v) || 0
const t = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const centavos = (v: number) => Math.round(v * 100) / 100
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`)) / 86_400_000)
const aberta = (situacao: string) => situacao === 'Aberta' || situacao === 'Parcial'

export function faixaDias(dias: number) {
  return dias <= 60 ? 'Até 60 dias' : dias <= 180 ? '61 a 180 dias' : dias <= 360 ? '181 a 360 dias' : 'Acima de 360 dias'
}
function faixaParcelas(qtd: number) {
  return qtd <= 2 ? '1 a 2' : qtd <= 4 ? '3 a 4' : qtd <= 6 ? '5 a 6' : qtd <= 12 ? '7 a 12' : qtd <= 24 ? '13 a 24' : '25 ou mais'
}

export function parcelaV(p: Registro, jurosDia: number, hj = hoje()): ParcelaV {
  const situacao = t(p.situacao) || 'Aberta'
  const vencimento = t(p.vencimento)
  const vencida = aberta(situacao) && vencimento < hj
  const dias = vencida ? diasEntre(hj, vencimento) : 0
  const saldo = centavos(n(p.valor) - n(p.baixado))
  const multaDevida = vencida ? n(p.multa) : 0
  const cobraJuros = p.cobraJuros !== false
  const juros = vencida && cobraJuros ? centavos(dias * jurosDia) : 0
  return {
    id: p.id, cobrancaId: t(p.cobrancaId), numero: n(p.numero), total: n(p.total) || 1, valor: n(p.valor), vencimento, multa: n(p.multa),
    baixado: n(p.baixado), situacao, pagoEm: t(p.pagoEm), acordoId: t(p.acordoId), cobraJuros, saldo, vencida, diasAtraso: dias, multaDevida, juros,
    atualizado: centavos(saldo + multaDevida + juros),
  }
}

export function pagamentoV(g: Registro): PagamentoV {
  return {
    id: g.id, parcelaId: t(g.parcelaId), cobrancaId: t(g.cobrancaId), valor: n(g.valor), principal: n(g.principal), encargos: n(g.encargos), desconto: n(g.desconto),
    data: t(g.data), forma: t(g.forma), observacao: t(g.observacao), origem: t(g.origem) || 'Sistema', registradoPorNome: t(g.registradoPorNome),
    estornadoEm: t(g.estornadoEm), estornadoPorNome: t(g.estornadoPorNome), estornoMotivo: t(g.estornoMotivo), criadoEm: t(g.criadoEm),
  }
}

// a carteira inteira em memória (modo demonstração)
export function calcularCarteira(s: ErpState, hj = hoje()): { cobrancas: CobrancaV[]; parcelas: ParcelaV[] } {
  const regras = regrasCobranca(s)
  const jurosDia = regras.juros_dia ?? 0
  const terceirizadaDias = regras.terceirizada_dias ?? 730
  const minBoletos = regras.reneg_min_boletos ?? 2
  const minDias = regras.reneg_min_dias ?? 61
  const clientes = new Map(colecao(s, 'clientes').map((c) => [c.id, c]))
  const categorias = new Map(colecao(s, 'cobranca_categorias').map((c) => [c.id, c]))
  const parcelas = colecao(s, 'cobranca_parcelas').map((p) => parcelaV(p, jurosDia, hj))
  const porCobranca = new Map<string, ParcelaV[]>()
  for (const p of parcelas) porCobranca.set(p.cobrancaId, [...(porCobranca.get(p.cobrancaId) ?? []), p])
  const recebidoPor = new Map<string, number>()
  for (const g of colecao(s, 'cobranca_pagamentos')) if (!g.estornadoEm) recebidoPor.set(t(g.cobrancaId), (recebidoPor.get(t(g.cobrancaId)) ?? 0) + n(g.valor))

  const cobrancas = colecao(s, 'cobrancas').map((c): CobrancaV => {
    const cl = clientes.get(t(c.clienteId))
    const cat = categorias.get(t(c.categoriaId))
    const grupo = t(cat?.grupo)
    const ps = porCobranca.get(c.id) ?? []
    const abertas = ps.filter((p) => aberta(p.situacao))
    const vencidas = ps.filter((p) => p.vencida)
    const pagas = ps.filter((p) => p.situacao === 'Paga').length
    const emAcordo = ps.filter((p) => p.situacao === 'Em acordo').length
    const vencidaDesde = vencidas.map((p) => p.vencimento).sort()[0] ?? ''
    const dias = vencidaDesde ? diasEntre(hj, vencidaDesde) : 0
    const soma = (l: ParcelaV[], f: (p: ParcelaV) => number) => centavos(l.reduce((a, p) => a + f(p), 0))
    const vencido = soma(vencidas, (p) => p.saldo)
    const multa = soma(vencidas, (p) => p.multa)
    const juros = centavos(vencidas.filter((p) => p.cobraJuros).reduce((a, p) => a + p.diasAtraso, 0) * jurosDia)
    const aVencer = soma(abertas.filter((p) => !p.vencida), (p) => p.saldo)
    const carteira =
      abertas.length === 0
        ? emAcordo > 0
          ? 'Em acordo'
          : pagas > 0
            ? 'Quitada'
            : 'Cancelada'
        : ['Terceirizada', 'Advogado', 'Fundo perdido', 'Fora da cobrança'].includes(grupo)
          ? grupo
          : dias > terceirizadaDias
            ? 'Terceirizada'
            : 'Cobrança DLG'
    const dlgOuSpc = grupo === 'Cobrança DLG' || grupo === 'Registro SPC'
    const regraReneg = vencido > 0 && dias <= terceirizadaDias && vencidas.length >= minBoletos && dias >= minDias
    const documento = soDigitos(cl?.documento)
    return {
      id: c.id, clienteId: t(c.clienteId), cliente: t(cl?.nome), documento, documentoOk: documentoValido(documento),
      telefone: t(cl?.whatsapp) || t(cl?.telefone1), cidade: t(cl?.cidade), uf: t(cl?.uf),
      vendaId: t(c.vendaId), origem: t(c.origem) || 'Lançamento manual', codigoVenda: t(c.codigoVenda), referencia: t(c.referencia), conta: t(c.conta) || CONTA_PADRAO,
      categoriaId: t(c.categoriaId), categoria: t(cat?.nome), grupo, contaInadimplencia: !!cat?.contaInadimplencia, podeSpc: !!cat?.podeSpc,
      cobradorId: t(c.cobradorId), cobrador: t(s.colaboradores.find((x) => x.id === c.cobradorId)?.nome), situacao: t(c.situacao) || 'Aguardando cobrança', observacao: t(c.observacao),
      parcelas: ps.filter((p) => p.situacao !== 'Cancelada').length, parcelasAbertas: abertas.length, parcelasVencidas: vencidas.length, parcelasPagas: pagas,
      valorTotal: soma(ps.filter((p) => p.situacao !== 'Cancelada'), (p) => p.valor), recebido: centavos(recebidoPor.get(c.id) ?? 0),
      emAberto: soma(abertas, (p) => p.saldo), vencido, aVencer, multa, juros,
      atualizado: centavos(vencido + multa + juros), totalDivida: centavos(vencido + multa + juros + aVencer),
      vencidaDesde, proximoVencimento: abertas.filter((p) => !p.vencida).map((p) => p.vencimento).sort()[0] ?? '',
      quitadaEm: abertas.length === 0 && emAcordo === 0 && pagas > 0 ? ps.map((p) => p.pagoEm).filter(Boolean).sort().at(-1) ?? '' : '',
      diasAtraso: dias, faixaDias: vencidaDesde ? faixaDias(dias) : '', faixaParcelas: vencidas.length ? faixaParcelas(vencidas.length) : '',
      carteira, foraDaCategoria: dlgOuSpc && abertas.length > 0 && dias > terceirizadaDias,
      podeRenegociar: dlgOuSpc && regraReneg, podeIrSpc: grupo === 'Cobrança DLG' && !!cat?.podeSpc && documentoValido(documento) && regraReneg,
      criadoEm: t(c.criadoEm),
    }
  })
  return { cobrancas, parcelas }
}

const unicos = (l: string[]) => [...new Set(l.filter(Boolean))]
const juntar = (l: string[]) => unicos(l).join(' | ')

function situacaoDoCliente(cs: CobrancaV[]): SituacaoPessoa {
  if (cs.some((c) => c.vencido > 0)) return 'Em atraso'
  if (cs.some((c) => c.emAberto > 0)) return 'Em dia'
  if (cs.some((c) => c.carteira === 'Em acordo')) return 'Em acordo'
  if (cs.some((c) => c.carteira === 'Quitada')) return 'Quitado'
  return 'Cancelado'
}

const porCliente = (cobrancas: CobrancaV[]) => {
  const m = new Map<string, CobrancaV[]>()
  for (const c of cobrancas) m.set(c.clienteId, [...(m.get(c.clienteId) ?? []), c])
  return [...m.values()]
}

export function clientesDaCarteira(cobrancas: CobrancaV[]): ClienteCarteira[] {
  return porCliente(cobrancas).map((cs) => {
    const c0 = cs[0]
    const soma = (f: (c: CobrancaV) => number) => centavos(cs.reduce((a, c) => a + f(c), 0))
    const datas = cs.flatMap((c) => [c.vencidaDesde, c.proximoVencimento]).filter(Boolean).sort()
    return {
      clienteId: c0.clienteId, cliente: c0.cliente, documento: c0.documento, telefone: c0.telefone, cidade: c0.cidade, uf: c0.uf,
      referencias: juntar(cs.map((c) => c.referencia)), cobrancas: cs.length, parcelas: soma((c) => c.parcelas), parcelasPagas: soma((c) => c.parcelasPagas),
      parcelasVencidas: soma((c) => c.parcelasVencidas), emAberto: soma((c) => c.emAberto), vencido: soma((c) => c.vencido), atualizado: soma((c) => c.atualizado),
      recebido: soma((c) => c.recebido), vencePrimeiro: datas[0] ?? '', diasAtraso: Math.max(...cs.map((c) => c.diasAtraso)),
      carteiras: unicos(cs.map((c) => c.carteira)), contas: unicos(cs.map((c) => c.conta)), cobradores: unicos(cs.map((c) => c.cobrador)), situacao: situacaoDoCliente(cs),
    }
  })
}

export const ehInadimplente = (c: CobrancaV) => c.vencido > 0 && c.carteira !== 'Fora da cobrança'

export function inadimplentesDaCarteira(cobrancas: CobrancaV[]): Inadimplente[] {
  return porCliente(cobrancas.filter(ehInadimplente)).map((cs) => {
    const c0 = cs[0]
    const soma = (f: (c: CobrancaV) => number) => centavos(cs.reduce((a, c) => a + f(c), 0))
    return {
      clienteId: c0.clienteId, cliente: c0.cliente, documento: c0.documento, telefone: c0.telefone, cidade: c0.cidade, uf: c0.uf,
      referencias: juntar(cs.map((c) => c.referencia)), parcelasVencidas: soma((c) => c.parcelasVencidas), vencido: soma((c) => c.vencido),
      atualizado: soma((c) => c.atualizado), vencidaDesde: cs.map((c) => c.vencidaDesde).filter(Boolean).sort()[0] ?? '',
      diasAtraso: Math.max(...cs.map((c) => c.diasAtraso)), carteiras: unicos(cs.map((c) => c.carteira)), contas: unicos(cs.map((c) => c.conta)),
      cobradores: unicos(cs.map((c) => c.cobrador)), podeRenegociar: cs.some((c) => c.podeRenegociar),
    }
  })
}

// pesquisa da demonstração: o mesmo que a coluna "busca" do banco (nome, documento, telefones, cidade, e-mail e referências)
export function buscaDoCliente(s: ErpState, clienteId: string, referencias: string) {
  const c = colecao(s, 'clientes').find((x) => x.id === clienteId)
  return [textoBusca(c?.nome), soDigitos(c?.documento), soDigitos(c?.telefone1), soDigitos(c?.telefone2), soDigitos(c?.telefone3), soDigitos(c?.whatsapp),
    textoBusca(c?.cidade), t(c?.email).toLowerCase(), textoBusca(referencias)].join(' ')
}
export const passaNaBusca = (busca: string, termo: string) => termosBusca(termo).every((x) => busca.includes(x))

export function indicadoresDaCarteira(s: ErpState, mes: string, hj = hoje()): Indicadores {
  const { cobrancas, parcelas } = calcularCarteira(s, hj)
  const soma = (l: number[]) => centavos(l.reduce((a, v) => a + v, 0))
  const pagamentos = colecao(s, 'cobranca_pagamentos').filter((g) => !g.estornadoEm)
  const clientes = clientesDaCarteira(cobrancas)
  const situacoes: Partial<Record<SituacaoPessoa, number>> = {}
  for (const c of clientes) situacoes[c.situacao] = (situacoes[c.situacao] ?? 0) + 1
  const vencidas = parcelas.filter((p) => p.vencida)
  const contam = cobrancas.filter((c) => c.contaInadimplencia)
  const abertoContam = soma(contam.map((c) => c.emAberto))
  return {
    emAberto: soma(cobrancas.map((c) => c.emAberto)),
    emAtraso: soma(cobrancas.map((c) => c.vencido)),
    atualizadoAtraso: soma(cobrancas.filter((c) => c.vencido > 0).map((c) => c.atualizado)),
    parcelasVencidas: vencidas.length,
    venceHoje: soma(parcelas.filter((p) => aberta(p.situacao) && p.vencimento === hj).map((p) => p.saldo)),
    emAcordo: soma(parcelas.filter((p) => p.situacao === 'Em acordo').map((p) => p.saldo)),
    parcelasAbertas: parcelas.filter((p) => aberta(p.situacao)).length,
    atrasoMedio: vencidas.length ? Math.round(vencidas.reduce((a, p) => a + p.diasAtraso, 0) / vencidas.length) : 0,
    recebidoMes: soma(pagamentos.filter((g) => t(g.data).startsWith(mes)).map((g) => n(g.valor))),
    recebidoHoje: soma(pagamentos.filter((g) => t(g.data) === hj).map((g) => n(g.valor))),
    clientesSituacao: situacoes,
    clientesEmAtraso: inadimplentesDaCarteira(cobrancas).length,
    taxaInadimplencia: abertoContam > 0 ? Math.round((1000 * soma(contam.map((c) => c.vencido))) / abertoContam) / 10 : 0,
  }
}

export function resumoDaCarteira(cobrancas: CobrancaV[]): ResumoCarteira[] {
  const m = new Map<string, ResumoCarteira & { ids: Set<string> }>()
  for (const c of cobrancas) {
    const k = `${c.carteira}|${c.faixaDias}`
    const r = m.get(k) ?? { carteira: c.carteira, faixaDias: c.faixaDias, cobrancas: 0, clientes: 0, vencido: 0, atualizado: 0, ids: new Set<string>() }
    r.cobrancas++
    r.ids.add(c.clienteId)
    r.clientes = r.ids.size
    r.vencido = centavos(r.vencido + c.vencido)
    r.atualizado = centavos(r.atualizado + c.atualizado)
    m.set(k, r)
  }
  return [...m.values()].map((r) => ({ carteira: r.carteira, faixaDias: r.faixaDias, cobrancas: r.cobrancas, clientes: r.clientes, vencido: r.vencido, atualizado: r.atualizado }))
}
