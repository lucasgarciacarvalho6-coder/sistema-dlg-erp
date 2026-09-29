// O dinheiro de Operações, do jeito que o ADM pediu (informações simples):
//  • gasto fixo de cada carro por DIA DE VIAGEM (tudo incluso: motorista, fotógrafos, alimentação...),
//    editável pela coordenação e guardado por mês (mudar o valor não altera os meses passados).
//    Dia em que o carro não sai não tem custo. As diárias dos fechamentos NÃO são somadas (já estão no fixo).
//  • vendedor: fichas fotografadas × valor por ficha do vendedor (cadastro PJ);
//  • escola: o Fechamento da escola que a coordenação preenche; sem fechamento, estima pela bonificação do contrato.
//  • custo por aluno do dia = gasto do dia ÷ alunos fotografados no dia.
//  • projeção pelas FICHAS FECHADAS nos contratos (visitas ainda por fazer + contratos em conferência do mês).
//  • "quanto vai ganhar": receita real das vendas de books por aluno fotografado (últimos meses) × alunos projetados.

import type { ErpState, Registro } from './types'
import { colecao } from './metrics'
import { addDias, hoje, mesAtual } from './format'
import { equipeDaVisita, lerJSON } from './operacional'
import { ehDiaUtil } from './calendario'
import { parametros } from './parametros'

const n = (v: unknown) => Number(v) || 0
const t = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export const REALIZADA = ['Fotografada', 'Fechamento enviado']

export function somarMes(mes: string, k: number) {
  const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + k, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Gasto fixo por dia do carro no mês: vale o último valor definido até aquele mês
export function gastoFixoCarro(v: Registro | undefined, mes: string): number {
  if (!v) return 0
  const mapa = lerJSON<Record<string, number>>(v.gastoFixoMes, {})
  const chave = Object.keys(mapa)
    .filter((m) => m <= mes)
    .sort()
    .at(-1)
  return chave ? n(mapa[chave]) : 0
}

export interface Custos {
  alunos: number
  fixo: number
  vendedor: number
  escola: number
  total: number
}
const zero = (): Custos => ({ alunos: 0, fixo: 0, vendedor: 0, escola: 0, total: 0 })
const somar = (a: Custos, b: Partial<Custos>) => {
  a.alunos += b.alunos ?? 0
  a.fixo += b.fixo ?? 0
  a.vendedor += b.vendedor ?? 0
  a.escola += b.escola ?? 0
  a.total = a.fixo + a.vendedor + a.escola
}
export const custoPorAluno = (c: Custos) => (c.alunos > 0 ? c.total / c.alunos : 0)

function contexto(s: ErpState) {
  const veiculos = colecao(s, 'veiculos')
  const vendedores = colecao(s, 'pj_vendedores')
  const contratos = colecao(s, 'contratos_escola')
  const fechEscola = new Map(colecao(s, 'fechamentos').filter((f) => f.tipo === 'escola').map((f) => [t(f.refId), f]))
  const bonifPadrao = parametros(s).bonificacaoEscolaMin
  const valorFicha = (vendedorId: unknown) => n(vendedores.find((v) => v.id === vendedorId)?.valorPorFicha)
  const bonificacao = (contratoId: unknown) => {
    const c = contratos.find((x) => x.id === contratoId)
    return c && n(c.bonificacaoPorFicha) > 0 ? n(c.bonificacaoPorFicha) : bonifPadrao
  }
  return { veiculos, contratos, fechEscola, valorFicha, bonificacao }
}

// Custos variáveis de uma visita (vendedor + escola), com as fichas informadas
function variaveis(ctx: ReturnType<typeof contexto>, v: Registro, fichas: number, realizada: boolean) {
  const vendedor = fichas * ctx.valorFicha(v.vendedorId)
  const fech = realizada ? ctx.fechEscola.get(v.id) : undefined
  const escola = fech ? n(fech.total) : fichas * ctx.bonificacao(v.contratoId)
  return { vendedor, escola, escolaEstimada: !fech }
}

export interface DiaOperacao extends Custos {
  data: string
  carros: string[]
}

export interface FinanceiroOperacoes {
  mes: string
  dias: DiaOperacao[] // dias com viagem realizada, em ordem
  realizado: Custos & { visitas: number; escolas: number; diasViagem: number; escolaEstimada: number; semCarro: number }
  porCarro: { veiculo: Registro; dias: number; alunos: number; fixo: number; valorDia: number }[]
  previsto: Custos & { visitas: number; contratosConferencia: number; porDia: Record<string, number> } // porDia = fichas marcadas por data
  projecao: Custos & { custoAluno: number; receitaAluno: number; receita: number; resultado: number; temVendas: boolean }
  agenda: { feitas: number; agendadas: number; canceladas: number }
}

export function financeiroOperacoes(s: ErpState, mes: string = mesAtual()): FinanceiroOperacoes {
  const ctx = contexto(s)
  const hojeISO = hoje()
  const visitas = colecao(s, 'agenda_visitas').filter((v) => t(v.data).startsWith(mes))
  const realizadas = visitas.filter((v) => REALIZADA.includes(t(v.status)))
  const futuras = visitas.filter((v) => t(v.status) === 'Agendada' && t(v.data) >= hojeISO)

  // gasto fixo: 1 por carro por dia com viagem (realizada ou prevista)
  const diaCarro = new Map<string, { realizada: boolean }>()
  for (const v of [...realizadas, ...futuras]) {
    if (!v.veiculoId) continue
    const k = `${t(v.data)}|${t(v.veiculoId)}`
    const atual = diaCarro.get(k)
    diaCarro.set(k, { realizada: (atual?.realizada ?? false) || REALIZADA.includes(t(v.status)) })
  }
  const fixoDe = (veiculoId: string) => gastoFixoCarro(ctx.veiculos.find((x) => x.id === veiculoId), mes)

  // ---- realizado, por dia ----
  const porDia = new Map<string, DiaOperacao>()
  const realizado = { ...zero(), visitas: realizadas.length, escolas: new Set(realizadas.map((v) => t(v.escola))).size, diasViagem: 0, escolaEstimada: 0, semCarro: 0 }
  for (const v of realizadas) {
    const fichas = n(v.fichasFotografadas)
    const vv = variaveis(ctx, v, fichas, true)
    const d = porDia.get(t(v.data)) ?? { ...zero(), data: t(v.data), carros: [] }
    somar(d, { alunos: fichas, vendedor: vv.vendedor, escola: vv.escola })
    if (vv.escolaEstimada && t(v.status) === 'Fotografada') realizado.escolaEstimada++ // fechamento da escola ainda pendente
    if (!v.veiculoId) realizado.semCarro++
    porDia.set(d.data, d)
  }
  const porCarroMap = new Map<string, { dias: number; alunos: number; fixo: number }>()
  for (const [k, info] of diaCarro) {
    const [data, veiculoId] = k.split('|')
    if (!info.realizada) continue
    const valor = fixoDe(veiculoId)
    const d = porDia.get(data)
    if (d) {
      somar(d, { fixo: valor })
      d.carros.push(veiculoId)
    }
    const c = porCarroMap.get(veiculoId) ?? { dias: 0, alunos: 0, fixo: 0 }
    c.dias++
    c.fixo += valor
    porCarroMap.set(veiculoId, c)
  }
  for (const v of realizadas) {
    const c = v.veiculoId ? porCarroMap.get(t(v.veiculoId)) : undefined
    if (c) c.alunos += n(v.fichasFotografadas)
  }
  const dias = [...porDia.values()].sort((a, b) => a.data.localeCompare(b.data))
  for (const d of dias) somar(realizado, d)
  realizado.diasViagem = dias.length

  // ---- previsto: fichas fechadas ainda por fotografar ----
  const previsto = { ...zero(), visitas: futuras.length, contratosConferencia: 0, porDia: {} as Record<string, number> }
  const marcar = (data: string, fichas: number) => (previsto.porDia[data.slice(0, 10)] = (previsto.porDia[data.slice(0, 10)] ?? 0) + fichas)
  for (const v of futuras) {
    const fichas = n(v.fichasPrevistas)
    const vv = variaveis(ctx, v, fichas, false)
    somar(previsto, { alunos: fichas, vendedor: vv.vendedor, escola: vv.escola })
    marcar(t(v.data), fichas)
  }
  for (const [k, info] of diaCarro) if (!info.realizada) somar(previsto, { fixo: fixoDe(k.split('|')[1]) })
  // contratos fechados com data no mês que ainda estão em conferência (sem carro definido: só o variável)
  for (const c of ctx.contratos.filter((x) => x.status === 'Em conferência' && t(x.dataPrevista).startsWith(mes) && t(x.dataPrevista) >= hojeISO)) {
    const fichas = n(c.fichasPrevistas)
    previsto.contratosConferencia++
    marcar(t(c.dataPrevista), fichas)
    somar(previsto,{ alunos: fichas, vendedor: fichas * ctx.valorFicha(c.vendedorId), escola: fichas * (n(c.bonificacaoPorFicha) || parametros(s).bonificacaoEscolaMin) })
  }

  // ---- projeção e receita (vendas reais por aluno fotografado) ----
  const proj = zero()
  somar(proj, realizado)
  somar(proj, previsto)
  const receitaAluno = receitaPorAluno(s, mes)
  const receita = proj.alunos * receitaAluno
  const porCarro = [...porCarroMap.entries()]
    .map(([id, c]) => ({ veiculo: ctx.veiculos.find((x) => x.id === id) ?? ({ id, criadoEm: '', modelo: 'Carro removido', placa: '' } as Registro), ...c, valorDia: fixoDe(id) }))
    .sort((a, b) => b.fixo - a.fixo)

  return {
    mes,
    dias,
    realizado,
    porCarro,
    previsto,
    projecao: { ...proj, custoAluno: custoPorAluno(proj), receitaAluno, receita, resultado: receita - proj.total, temVendas: receitaAluno > 0 },
    agenda: {
      feitas: realizadas.length,
      agendadas: visitas.filter((v) => t(v.status) === 'Agendada').length,
      canceladas: visitas.filter((v) => t(v.status) === 'Cancelada').length,
    },
  }
}

// Receita das vendas de books (aprovadas) ÷ alunos fotografados, nos 3 meses anteriores + o mês atual
export function receitaPorAluno(s: ErpState, mes: string = mesAtual()) {
  const inicio = somarMes(mes, -3)
  const noPeriodo = (d: unknown) => t(d).slice(0, 7) >= inicio && t(d).slice(0, 7) <= mes
  const receita = colecao(s, 'vendas_ebooks')
    .filter((v) => noPeriodo(v.data) && (v.canal === 'Interno' || v.conferencia === 'Conferida'))
    .reduce((a, v) => a + n(v.valor), 0)
  const alunos = colecao(s, 'agenda_visitas')
    .filter((v) => REALIZADA.includes(t(v.status)) && noPeriodo(v.data))
    .reduce((a, v) => a + n(v.fichasFotografadas), 0)
  return alunos > 0 && receita > 0 ? receita / alunos : 0
}

// Histórico simples por mês: alunos fotografados e custo médio por aluno
export function historicoOperacoes(s: ErpState, mes: string, quantos = 4) {
  return Array.from({ length: quantos }, (_, i) => somarMes(mes, i - quantos)).map((m) => {
    const f = financeiroOperacoes(s, m)
    return { mes: m, alunos: f.realizado.alunos, custoAluno: custoPorAluno(f.realizado), total: f.realizado.total }
  })
}

export const nomeCarro = (v: Registro | undefined) => (v ? `${t(v.modelo)}${v.placa ? ` • ${t(v.placa)}` : ''}` : 'Sem carro')

// ---- Agenda futura: próximos N dias úteis a partir de hoje ----
//  OK = dia com visita, fichas confirmadas pela escola e equipe completa (carro, motorista, fotógrafos)
//  Pendente = tem visita, mas falta confirmar fichas ou montar a equipe • Vazio = dia útil sem visita
//  Alunos = fichas confirmadas (ou as previstas, se a escola ainda não confirmou)
//  Capacidade = alunos agendados ÷ o que a meta pede nesses dias (meta diária × dias)
export type SituacaoDia = 'OK' | 'Pendente' | 'Vazio'
export interface DiaAgenda {
  data: string
  alunos: number
  visitas: number
  situacao: SituacaoDia
}

export function agendaFutura(s: ErpState, metaDiaria: number, quantos = 20) {
  const agendadas = colecao(s, 'agenda_visitas').filter((v) => t(v.status) === 'Agendada')
  const dias: DiaAgenda[] = []
  for (let d = hoje(); dias.length < quantos; d = addDias(d, 1)) {
    if (!ehDiaUtil(d)) continue
    const doDia = agendadas.filter((v) => t(v.data) === d)
    const alunos = doDia.reduce((a, v) => a + (n(v.fichasConfirmadas) > 0 ? n(v.fichasConfirmadas) : n(v.fichasPrevistas)), 0)
    const tudoOk = doDia.every((v) => n(v.fichasConfirmadas) > 0 && equipeDaVisita(s, v).completa)
    dias.push({ data: d, alunos, visitas: doDia.length, situacao: !doDia.length ? 'Vazio' : tudoOk ? 'OK' : 'Pendente' })
  }
  const total = dias.reduce((a, d) => a + d.alunos, 0)
  const esperado = metaDiaria * quantos
  return {
    dias,
    total,
    comAgenda: dias.filter((d) => d.visitas > 0).length,
    ok: dias.filter((d) => d.situacao === 'OK').length,
    pendentes: dias.filter((d) => d.situacao === 'Pendente').length,
    vazios: dias.filter((d) => d.situacao === 'Vazio').length,
    capacidade: esperado > 0 ? (total / esperado) * 100 : null,
  }
}
