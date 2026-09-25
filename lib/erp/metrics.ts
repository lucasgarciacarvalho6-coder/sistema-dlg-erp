import type { Colaborador, ErpState, Lancamento, Meta, Registro, Setor } from './types'
import { SETORES } from './config'
import { diasNoMes, hoje, mesAtual } from './format'
import { diasUteisAte, diasUteisDoMes, ehDiaUtil, metaDiariaDoMes, totalDiasUteis } from './calendario'

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

// De onde vem a meta do mês: definida para o próprio mês, herdada do último mês definido,
// meta padrão do colaborador ou padrão do setor. Nada é fixo: cada mês pode ter meta e piso diferentes.
export type OrigemMeta = { tipo: 'mes' } | { tipo: 'herdada'; mes: string } | { tipo: 'colaborador' } | { tipo: 'setor' }

export function metaDefinida(c: Colaborador, indicadorId: string, mes: string): { meta: Meta; origem: OrigemMeta } {
  const meses = Object.keys(c.metasMes ?? {})
    .filter((m) => m <= mes && c.metasMes![m][indicadorId])
    .sort()
  const ultimo = meses[meses.length - 1]
  if (ultimo) return { meta: c.metasMes![ultimo][indicadorId], origem: ultimo === mes ? { tipo: 'mes' } : { tipo: 'herdada', mes: ultimo } }
  if (c.metas[indicadorId]) return { meta: c.metas[indicadorId], origem: { tipo: 'colaborador' } }
  const padrao = SETORES[c.setor].indicadores.find((i) => i.id === indicadorId)?.metaPadrao ?? { mensal: 0, diaria: 0 }
  return { meta: padrao, origem: { tipo: 'setor' } }
}

// Meta do colaborador no mês. A DIÁRIA é sempre derivada da mensal:
// mensal ÷ dias úteis do mês (seg–sex, sem feriados) — ex.: 1.200 ÷ 21 = 57,14. O piso segue a mesma conta.
export function metaColaborador(c: Colaborador, indicadorId: string, mes: string = mesAtual()): Meta {
  const { meta } = metaDefinida(c, indicadorId, mes)
  const mensal = meta.mensal ?? 0
  return { mensal, diaria: metaDiariaDoMes(mensal, mes), piso: Math.min(meta.piso ?? 0, mensal || Infinity) }
}

export const pisoDiario = (m: Meta, mes: string) => metaDiariaDoMes(m.piso ?? 0, mes)

export function equipe(s: ErpState, setor: Setor) {
  return s.colaboradores.filter((c) => c.setor === setor && c.status === 'ATIVO')
}

// Quem tem meta no indicador principal do setor (aparece nos cards de metas individuais).
// Ex.: no Operacional só a coordenação (RMC) tem meta de fichas; fotógrafos ficam com meta 0.
export function equipeComMeta(s: ErpState, setor: Setor, mes: string = mesAtual()) {
  const principal = SETORES[setor].indicadores[0].id
  return equipe(s, setor).filter((c) => metaColaborador(c, principal, mes).mensal > 0)
}

// Meta do setor = soma das metas individuais dos colaboradores ativos
export function metaSetor(s: ErpState, setor: Setor, indicadorId: string, mes: string = mesAtual()): Meta {
  return equipe(s, setor).reduce(
    (acc, c) => {
      const m = metaColaborador(c, indicadorId, mes)
      return { diaria: acc.diaria + m.diaria, mensal: acc.mensal + m.mensal, piso: (acc.piso ?? 0) + (m.piso ?? 0) }
    },
    { diaria: 0, mensal: 0, piso: 0 } as Meta,
  )
}

export const progresso = (valor: number, meta: number) => (meta > 0 ? (valor / meta) * 100 : 0)

// Dia do calendário de referência: hoje (mês corrente) ou último dia (meses passados).
// Usado para saber até onde desenhar os gráficos.
export function diaReferencia(mes: string) {
  return mes === mesAtual() ? Number(hoje().slice(8, 10)) : diasNoMes(mes)
}

// Dias úteis: total do mês e decorridos até hoje (inclusive). Ex.: setembro/2026 → 18 de 21 no dia 25.
export function diasUteisMes(mes: string) {
  const total = totalDiasUteis(mes)
  const decorridos = mes === mesAtual() ? diasUteisAte(mes, hoje()) : mes < mesAtual() ? total : 0
  return { total, decorridos, restantes: Math.max(0, total - decorridos) }
}

// Projeção = média por dia útil decorrido × dias úteis do mês (mesma conta do sistema antigo)
export function projecao(valorMes: number, mes: string) {
  const { total, decorridos } = diasUteisMes(mes)
  return decorridos > 0 ? (valorMes / decorridos) * total : 0
}

export interface ResumoIndicador {
  hoje: number
  mes: number
  meta: Meta
  pctDia: number
  pctMes: number
  projecao: number
  necessarioDia: number
  mediaDiaria: number
  diasDecorridos: number
  diasUteis: number
  falta: number
  piso: number // piso do mês (0 = sem piso)
  pisoDiario: number
  faltaPiso: number
}

export function resumo(s: ErpState, setor: Setor, indicadorId: string, mes: string, colaboradorId?: string): ResumoIndicador {
  const f = { setor, indicador: indicadorId, colaboradorId }
  const valorHoje = somar(s.lancamentos, { ...f, data: hoje() })
  const valorMes = somar(s.lancamentos, { ...f, mes })
  const colab = colaboradorId ? s.colaboradores.find((c) => c.id === colaboradorId) : undefined
  const meta = colab ? metaColaborador(colab, indicadorId, mes) : metaSetor(s, setor, indicadorId, mes)
  const dias = diasUteisMes(mes)
  const falta = Math.max(0, meta.mensal - valorMes)
  // dias que ainda dá para produzir: os que faltam + hoje, se hoje for útil
  const aindaDa = dias.restantes + (mes === mesAtual() && ehDiaUtil(hoje()) ? 1 : 0)
  return {
    hoje: valorHoje,
    mes: valorMes,
    meta,
    pctDia: progresso(valorHoje, meta.diaria),
    pctMes: progresso(valorMes, meta.mensal),
    projecao: projecao(valorMes, mes),
    necessarioDia: mes === mesAtual() && aindaDa > 0 ? falta / aindaDa : 0,
    mediaDiaria: dias.decorridos > 0 ? valorMes / dias.decorridos : 0,
    diasDecorridos: dias.decorridos,
    diasUteis: dias.total,
    falta,
    piso: meta.piso ?? 0,
    pisoDiario: pisoDiario(meta, mes),
    faltaPiso: Math.max(0, (meta.piso ?? 0) - valorMes),
  }
}

// Quanto da meta mensal já deveria estar feito até hoje (% dos dias úteis decorridos).
// Mês passado = 100%. É a régua do "está no ritmo?" dos painéis.
export function esperadoAteHoje(mes: string) {
  const { total, decorridos } = diasUteisMes(mes)
  return total ? (decorridos / total) * 100 : 0
}

export type Situacao = 'bom' | 'atencao' | 'critico'

// Compara o realizado com o esperado para a data: ≥100% do esperado = no ritmo
export function situacaoMeta(pctMes: number, esperado: number): Situacao {
  if (esperado <= 0 || pctMes >= esperado) return 'bom'
  return pctMes >= esperado * 0.85 ? 'atencao' : 'critico'
}

// Situação considerando o PISO (quando definido):
//   no ritmo da meta = bom • acima do ritmo do piso = atenção • abaixo do piso = crítico (prejuízo)
// Sem piso, usa a régua antiga (85% do esperado).
export function situacaoResumo(r: ResumoIndicador, mes: string): Situacao {
  const esperado = esperadoAteHoje(mes)
  if (esperado <= 0 || r.meta.mensal <= 0) return 'bom'
  if (r.piso > 0) {
    if (r.pctMes >= esperado) return 'bom'
    return r.mes >= (r.piso * esperado) / 100 ? 'atencao' : 'critico'
  }
  return situacaoMeta(r.pctMes, esperado)
}

// Dias úteis do mês: quantos já passaram, em quantos a meta diária foi batida e quantos faltam
export function diasDeMeta(s: ErpState, setor: Setor, indicadorId: string, colaboradorId: string, mes: string) {
  const colab = s.colaboradores.find((c) => c.id === colaboradorId)
  const m = colab ? metaColaborador(colab, indicadorId, mes) : undefined
  const meta = m?.diaria ?? 0
  const serie = serieMes(s.lancamentos, { setor, indicador: indicadorId, colaboradorId }, mes)
  const dias = diasUteisMes(mes)
  const uteis = diasUteisDoMes(mes)
  let batidas = 0
  for (const d of uteis.slice(0, dias.decorridos)) if (meta > 0 && serie[Number(d.slice(8)) - 1] >= meta) batidas++
  return { decorridos: dias.decorridos, batidas, restantes: dias.restantes, serie, metaDiaria: meta, pisoDiario: m ? pisoDiario(m, mes) : 0, uteis }
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
