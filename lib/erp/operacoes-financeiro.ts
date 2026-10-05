// O dinheiro de Operações, na regra do dono:
//  • custo FIXO por operação = cada carro que sai num dia (padrão R$ 2.500: combustível, fotógrafos, motorista,
//    veículo...). Guardado por carro e por mês (mudar não altera os meses passados). SÓ o ADM altera.
//    Dia em que o carro não sai não tem custo. As diárias dos fechamentos NÃO são somadas (já estão no fixo).
//  • custo VARIÁVEL por ficha fotografada (padrão R$ 60: repasse da escola + comissão do vendedor).
//    Guardado por mês. SÓ o ADM altera (SQL 017 barra no banco).
//  • custo total = operações × fixo + fichas × variável • custo por ficha = custo total ÷ fichas.
//    Ex.: 1 dia, 100 fichas → 2.500 + 6.000 = R$ 8.500 → R$ 85 por ficha.
//  • projeção pelas FICHAS FECHADAS nos contratos (visitas ainda por fazer + contratos em conferência do mês).
//  • "quanto vai ganhar": receita real das vendas de books por aluno fotografado (últimos meses) × alunos projetados.

import type { ErpState, Registro } from './types'
import { colecao } from './metrics'
import { addDias, hoje, mesAtual } from './format'
import { equipeDaVisita, lerJSON } from './operacional'
import { ehDiaUtil } from './calendario'

const n = (v: unknown) => Number(v) || 0
const t = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export const REALIZADA = ['Fotografada', 'Fechamento enviado']

export function somarMes(mes: string, k: number) {
  const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + k, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const CUSTO_FIXO_PADRAO = 2500 // por operação (carro por dia de viagem), enquanto o carro não tem valor próprio
export const CUSTO_VARIAVEL_PADRAO = 60 // por ficha: repasse da escola + comissão do vendedor

// Gasto fixo por dia do carro no mês: vale o último valor definido até aquele mês (sem valor: o padrão)
export function gastoFixoCarro(v: Registro | undefined, mes: string): number {
  if (!v) return 0
  const mapa = lerJSON<Record<string, number>>(v.gastoFixoMes, {})
  const chave = Object.keys(mapa)
    .filter((m) => m <= mes)
    .sort()
    .at(-1)
  return chave ? n(mapa[chave]) : CUSTO_FIXO_PADRAO
}

// Custo variável por ficha no mês: fica nos parâmetros da empresa, uma chave por mês (ops_variavel_AAAA-MM);
// vale o último valor definido até aquele mês (sem valor: o padrão)
const PREFIXO_VARIAVEL = 'ops_variavel_'
export const chaveCustoVariavel = (mes: string) => `${PREFIXO_VARIAVEL}${mes}`
export function custoVariavelFicha(s: ErpState, mes: string): number {
  const salvos = s.empresa.parametros ?? {}
  const chave = Object.keys(salvos)
    .filter((k) => k.startsWith(PREFIXO_VARIAVEL) && k.slice(PREFIXO_VARIAVEL.length) <= mes)
    .sort()
    .at(-1)
  return chave ? n(salvos[chave]) : CUSTO_VARIAVEL_PADRAO
}

export interface Custos {
  alunos: number
  fixo: number
  variavel: number
  total: number
}
const zero = (): Custos => ({ alunos: 0, fixo: 0, variavel: 0, total: 0 })
const somar = (a: Custos, b: Partial<Custos>) => {
  a.alunos += b.alunos ?? 0
  a.fixo += b.fixo ?? 0
  a.variavel += b.variavel ?? 0
  a.total = a.fixo + a.variavel
}
export const custoPorAluno = (c: Custos) => (c.alunos > 0 ? c.total / c.alunos : 0)

function contexto(s: ErpState, mes: string) {
  const veiculos = colecao(s, 'veiculos')
  const contratos = colecao(s, 'contratos_escola')
  const porFicha = custoVariavelFicha(s, mes)
  return { veiculos, contratos, porFicha, variavel: (fichas: number) => fichas * porFicha }
}

export interface DiaOperacao extends Custos {
  data: string
  carros: string[]
}

export interface FinanceiroOperacoes {
  mes: string
  dias: DiaOperacao[] // dias com viagem realizada, em ordem
  realizado: Custos & { visitas: number; escolas: number; diasViagem: number; operacoes: number; semCarro: number }
  porCarro: { veiculo: Registro; dias: number; alunos: number; fixo: number; valorDia: number }[]
  previsto: Custos & { visitas: number; contratosConferencia: number }
  projecao: Custos & { custoAluno: number; receitaAluno: number; receita: number; resultado: number; temVendas: boolean }
  agenda: { feitas: number; agendadas: number; canceladas: number }
}

export function financeiroOperacoes(s: ErpState, mes: string = mesAtual()): FinanceiroOperacoes {
  const ctx = contexto(s, mes)
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
  const realizado = { ...zero(), visitas: realizadas.length, escolas: new Set(realizadas.map((v) => t(v.escola))).size, diasViagem: 0, operacoes: 0, semCarro: 0 }
  for (const v of realizadas) {
    const fichas = n(v.fichasFotografadas)
    const d = porDia.get(t(v.data)) ?? { ...zero(), data: t(v.data), carros: [] }
    somar(d, { alunos: fichas, variavel: ctx.variavel(fichas) })
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
    realizado.operacoes++
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
  const previsto = { ...zero(), visitas: futuras.length, contratosConferencia: 0 }
  for (const v of futuras) {
    const fichas = n(v.fichasPrevistas)
    somar(previsto, { alunos: fichas, variavel: ctx.variavel(fichas) })
  }
  for (const [k, info] of diaCarro) if (!info.realizada) somar(previsto, { fixo: fixoDe(k.split('|')[1]) })
  // contratos fechados com data no mês que ainda estão em conferência (sem carro definido: só o variável)
  for (const c of ctx.contratos.filter((x) => x.status === 'Em conferência' && t(x.dataPrevista).startsWith(mes) && t(x.dataPrevista) >= hojeISO)) {
    const fichas = n(c.fichasPrevistas)
    previsto.contratosConferencia++
    somar(previsto, { alunos: fichas, variavel: ctx.variavel(fichas) })
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

// ---- Agenda futura: próximos N dias úteis a partir de hoje (a PROJEÇÃO fica só aqui) ----
//  OK = dia com visita, fichas confirmadas pela escola e equipe completa (carro, motorista, fotógrafos)
//  Pendente = tem visita, mas falta confirmar fichas ou montar a equipe • Vazio = dia útil sem visita
//  Alunos = só as fichas CONFIRMADAS pela escola
//  Agendadas = a projeção: visitas e retornos agendados, pelas confirmadas ou, enquanto a escola não confirma,
//  pelas previstas no contrato. Encerrou a visita, ela sai daqui e entra nos fotografados.
//  Capacidade = fichas agendadas ÷ o que a meta pede nesses dias (meta diária × dias)
//  Custo previsto (regra do dono, igual ao realizado): cada carro que sai no dia × gasto fixo do carro
//  + fichas agendadas × custo variável por ficha
export type SituacaoDia = 'OK' | 'Pendente' | 'Vazio'
export interface DiaAgenda {
  data: string
  alunos: number
  agendadas: number
  visitas: number
  situacao: SituacaoDia
  custo: number // custo previsto do dia (R$)
}

// fichas de uma visita agendada na projeção: as confirmadas pela escola ou, sem confirmação, as previstas no contrato
export const fichasAgendadas = (v: Registro) => (n(v.fichasConfirmadas) > 0 ? n(v.fichasConfirmadas) : n(v.fichasPrevistas))

export function agendaFutura(s: ErpState, metaDiaria: number, quantos = 20) {
  const agendadas = colecao(s, 'agenda_visitas').filter((v) => t(v.status) === 'Agendada')
  const veiculos = colecao(s, 'veiculos')
  const dias: DiaAgenda[] = []
  for (let d = hoje(); dias.length < quantos; d = addDias(d, 1)) {
    if (!ehDiaUtil(d)) continue
    const doDia = agendadas.filter((v) => t(v.data) === d)
    const alunos = doDia.reduce((a, v) => a + n(v.fichasConfirmadas), 0)
    const agendadasDia = doDia.reduce((a, v) => a + fichasAgendadas(v), 0)
    const tudoOk = doDia.every((v) => n(v.fichasConfirmadas) > 0 && equipeDaVisita(s, v).completa)
    const carros = [...new Set(doDia.map((v) => t(v.veiculoId)).filter(Boolean))]
    const custo = carros.reduce((a, id) => a + gastoFixoCarro(veiculos.find((x) => x.id === id), d.slice(0, 7)), 0) + agendadasDia * custoVariavelFicha(s, d.slice(0, 7))
    dias.push({ data: d, alunos, agendadas: agendadasDia, visitas: doDia.length, situacao: !doDia.length ? 'Vazio' : tudoOk ? 'OK' : 'Pendente', custo })
  }
  const total = dias.reduce((a, d) => a + d.alunos, 0)
  const totalAgendadas = dias.reduce((a, d) => a + d.agendadas, 0)
  const custo = dias.reduce((a, d) => a + d.custo, 0)
  const esperado = metaDiaria * quantos
  return {
    dias,
    total,
    agendadas: totalAgendadas,
    custo, // custo previsto dos 20 dias (R$)
    custoPorFicha: totalAgendadas > 0 ? custo / totalAgendadas : 0,
    comAgenda: dias.filter((d) => d.visitas > 0).length,
    ok: dias.filter((d) => d.situacao === 'OK').length,
    pendentes: dias.filter((d) => d.situacao === 'Pendente').length,
    vazios: dias.filter((d) => d.situacao === 'Vazio').length,
    capacidade: esperado > 0 ? (totalAgendadas / esperado) * 100 : null,
  }
}

// ---- Régua das cores da agenda (pedido do ADM): o agendamento de cada dia comparado com os meses anteriores ----
// média = fichas fotografadas ÷ dias com visita realizada, nos 3 meses antes do mês atual (mês parado não pesa).
// alto (verde) = na média ou acima • médio (amarelo) = de 60% até a média • baixo (vermelho) = abaixo de 60% da média
export const PISO_REGUA = 0.6
export type NivelFichas = 'alto' | 'medio' | 'baixo'

export function mediaFichasPorDia(s: ErpState, mes: string = mesAtual(), quantos = 3): number {
  const meses = Array.from({ length: quantos }, (_, i) => somarMes(mes, i - quantos))
  const porDia = new Map<string, number>()
  for (const v of colecao(s, 'agenda_visitas')) {
    if (!REALIZADA.includes(t(v.status)) || !meses.includes(t(v.data).slice(0, 7))) continue
    porDia.set(t(v.data), (porDia.get(t(v.data)) ?? 0) + n(v.fichasFotografadas))
  }
  const dias = [...porDia.values()].filter((x) => x > 0)
  return dias.length ? dias.reduce((a, b) => a + b, 0) / dias.length : 0
}

export const nivelFichas = (v: number, media: number): NivelFichas | null => (media <= 0 ? null : v >= media ? 'alto' : v >= media * PISO_REGUA ? 'medio' : 'baixo')
