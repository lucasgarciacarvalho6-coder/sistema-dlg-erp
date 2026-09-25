import type { Colaborador, ErpState, Lancamento, Meta, Registro, Setor } from './types'
import { SETORES } from './config'
import { diasNoMes, hoje, mesAtual } from './format'

export interface FiltroLanc {
  setor?: Setor
  indicador?: string
  colaboradorId?: string
  data?: string
  mes?: string
}

function combina(l: Lancamento, f: FiltroLanc) {
  return (
    (!f.setor || l.setor === f.setor) &&
    (!f.indicador || l.indicador === f.indicador) &&
    (f.colaboradorId === undefined || l.colaboradorId === f.colaboradorId) &&
    (!f.data || l.data === f.data) &&
    (!f.mes || l.data.startsWith(f.mes))
  )
}

export function somar(lanc: Lancamento[], f: FiltroLanc) {
  let total = 0
  for (const l of lanc) if (combina(l, f)) total += l.quantidade
  return total
}

// Série diária (índice 0 = dia 1) de um mês
export function serieMes(lanc: Lancamento[], f: Omit<FiltroLanc, 'mes' | 'data'>, mes: string) {
  const serie = new Array(diasNoMes(mes)).fill(0)
  for (const l of lanc) {
    if (l.data.startsWith(mes) && combina(l, f)) serie[Number(l.data.slice(8, 10)) - 1] += l.quantidade
  }
  return serie
}

export function metaColaborador(c: Colaborador, indicadorId: string): Meta {
  const padrao = SETORES[c.setor].indicadores.find((i) => i.id === indicadorId)?.metaPadrao
  return c.metas[indicadorId] ?? padrao ?? { diaria: 0, mensal: 0 }
}

export function equipe(s: ErpState, setor: Setor) {
  return s.colaboradores.filter((c) => c.setor === setor && c.status === 'ATIVO')
}

// Meta do setor = soma das metas individuais dos colaboradores ativos
export function metaSetor(s: ErpState, setor: Setor, indicadorId: string): Meta {
  return equipe(s, setor).reduce(
    (acc, c) => {
      const m = metaColaborador(c, indicadorId)
      return { diaria: acc.diaria + m.diaria, mensal: acc.mensal + m.mensal }
    },
    { diaria: 0, mensal: 0 },
  )
}

export const progresso = (valor: number, meta: number) => (meta > 0 ? (valor / meta) * 100 : 0)

// Dia de referência para projeções: hoje (mês corrente) ou último dia (meses passados)
export function diaReferencia(mes: string) {
  return mes === mesAtual() ? Number(hoje().slice(8, 10)) : diasNoMes(mes)
}

export function projecao(valorMes: number, mes: string) {
  const dia = diaReferencia(mes)
  return dia > 0 ? (valorMes / dia) * diasNoMes(mes) : 0
}

export interface ResumoIndicador {
  hoje: number
  mes: number
  meta: Meta
  pctDia: number
  pctMes: number
  projecao: number
  necessarioDia: number
}

export function resumo(s: ErpState, setor: Setor, indicadorId: string, mes: string, colaboradorId?: string): ResumoIndicador {
  const f = { setor, indicador: indicadorId, colaboradorId }
  const valorHoje = somar(s.lancamentos, { ...f, data: hoje() })
  const valorMes = somar(s.lancamentos, { ...f, mes })
  const colab = colaboradorId ? s.colaboradores.find((c) => c.id === colaboradorId) : undefined
  const meta = colab ? metaColaborador(colab, indicadorId) : metaSetor(s, setor, indicadorId)
  const diasRestantes = diasNoMes(mes) - diaReferencia(mes) + 1
  return {
    hoje: valorHoje,
    mes: valorMes,
    meta,
    pctDia: progresso(valorHoje, meta.diaria),
    pctMes: progresso(valorMes, meta.mensal),
    projecao: projecao(valorMes, mes),
    necessarioDia: mes === mesAtual() && diasRestantes > 0 ? Math.max(0, (meta.mensal - valorMes) / diasRestantes) : 0,
  }
}

// Quanto da meta mensal já deveria estar feito até hoje (% dos dias úteis seg–sáb decorridos).
// Mês passado = 100%. É a régua do "está no ritmo?" dos painéis.
export function esperadoAteHoje(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  const ref = diaReferencia(mes)
  let uteis = 0
  let decorridos = 0
  for (let d = 1; d <= diasNoMes(mes); d++) {
    if (new Date(a, m - 1, d).getDay() === 0) continue
    uteis++
    if (d <= ref) decorridos++
  }
  return uteis ? (decorridos / uteis) * 100 : 0
}

export type Situacao = 'bom' | 'atencao' | 'critico'

// Compara o realizado com o esperado para a data: ≥100% do esperado = no ritmo
export function situacaoMeta(pctMes: number, esperado: number): Situacao {
  if (esperado <= 0 || pctMes >= esperado) return 'bom'
  return pctMes >= esperado * 0.85 ? 'atencao' : 'critico'
}

// Dias úteis (seg–sáb) do mês: quantos já passaram, em quantos a meta diária foi batida e quantos faltam
export function diasDeMeta(s: ErpState, setor: Setor, indicadorId: string, colaboradorId: string, mes: string) {
  const colab = s.colaboradores.find((c) => c.id === colaboradorId)
  const meta = colab ? metaColaborador(colab, indicadorId).diaria : 0
  const serie = serieMes(s.lancamentos, { setor, indicador: indicadorId, colaboradorId }, mes)
  const [a, m] = mes.split('-').map(Number)
  const ref = diaReferencia(mes)
  let decorridos = 0
  let batidas = 0
  let restantes = 0
  serie.forEach((v, i) => {
    if (new Date(a, m - 1, i + 1).getDay() === 0) return // domingo
    if (i + 1 <= ref) {
      decorridos++
      if (meta > 0 && v >= meta) batidas++
    } else restantes++
  })
  return { decorridos, batidas, restantes, serie, metaDiaria: meta }
}

export function mesesDisponiveis(s: ErpState) {
  const meses = new Set<string>([mesAtual()])
  for (const l of s.lancamentos) meses.add(l.data.slice(0, 7))
  return [...meses].sort().reverse()
}

// ---- Coleções ----

export const colecao = (s: ErpState, nome: string): Registro[] => s.colecoes[nome] ?? []

export function tituloAtrasado(t: Registro) {
  return t.status === 'Aberto' && String(t.vencimento) < hoje()
}

export function statusTitulo(t: Registro) {
  return tituloAtrasado(t) ? 'Atrasado' : String(t.status)
}

// Fluxo de caixa diário: entradas = recebimentos da Cobrança (mesma fonte do painel ADM);
// saídas = contas e comissões pagas
export function fluxoCaixa(s: ErpState, mes: string) {
  const entradas = serieMes(s.lancamentos, { setor: 'cobranca', indicador: 'valor_recebido' }, mes)
  const saidas = new Array(diasNoMes(mes)).fill(0)
  const somaEm = (serie: number[], lista: Registro[]) => {
    for (const r of lista) {
      const d = String(r.dataPagamento || '')
      if (r.status === 'Pago' && d.startsWith(mes)) serie[Number(d.slice(8, 10)) - 1] += Number(r.valor) || 0
    }
  }
  somaEm(saidas, colecao(s, 'contas_pagar'))
  somaEm(saidas, colecao(s, 'comissoes'))
  const totalEntradas = entradas.reduce((a, b) => a + b, 0)
  const totalSaidas = saidas.reduce((a, b) => a + b, 0)
  return { entradas, saidas, totalEntradas, totalSaidas, saldo: totalEntradas - totalSaidas }
}

export function nomeColaborador(s: ErpState, id: Valor) {
  if (!id) return '—'
  return s.colaboradores.find((c) => c.id === id)?.nome ?? '—'
}

type Valor = Registro[string]
