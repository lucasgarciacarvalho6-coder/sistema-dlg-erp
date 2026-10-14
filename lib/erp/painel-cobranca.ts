// Painel da Cobrança (SQL 049, função painel_cobranca), igual ao sistema antigo:
// comissão por faixa de parcelas vencidas e nível do mês, meta SPC (ciclo 12 → 11, dias úteis sem feriados nacionais)
// e indicadores do mês. No modo demonstração, as mesmas contas em memória.

import type { ErpState, Registro } from './types'
import { colecao } from './metrics'
import { hoje } from './format'
import { regrasCobranca } from './cobranca-config'
import { calcularCarteira, situacoesDaCarteira } from './carteira'

export interface FaixaComissao {
  faixa: number
  pct: number
  aConfirmar: number
  qtdAConfirmar: number
  estimada: number
  confirmada: number
  qtdConfirmada: number
  gerada: number
}
export interface PainelCobranca {
  nivel: number
  totalConfirmado: number
  nivel1Ate: number
  nivel2Ate: number
  faltaProximo: number
  faixas: FaixaComissao[]
  metaSpc: { inicio: string; fim: string; diasUteis: number; diasAteHoje: number; metaDia: number; alvo: number; esperadoHoje: number; trabalhados: number; desfechos: Record<string, number> }
  indicadores: {
    clientesContatados: number
    contatos: number
    acordosFechados: number
    entradasConfirmadas: number
    efetivadas: number
    porSituacao: Record<string, number>
    aguardandoEntradaValor: number
    entradasVencidas: number
  }
}
export const ROTULO_FAIXA_COMISSAO: Record<number, string> = { 1: '1 a 2 parcelas', 2: '3 a 4 parcelas', 3: '5 a 6 parcelas', 4: 'Acima de 6 parcelas' }

// ---- dias úteis: segunda a sexta, sem feriados nacionais ----
function pascoa(ano: number) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  return new Date(ano, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1)
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function feriadoNacional(dia: string) {
  if (['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].includes(dia.slice(5))) return true
  const p = pascoa(Number(dia.slice(0, 4)))
  p.setDate(p.getDate() - 2)
  return iso(p) === dia
}
export function diasUteis(inicio: string, fim: string) {
  let n = 0
  const d = new Date(`${inicio}T12:00:00`)
  while (iso(d) <= fim) {
    const s = d.getDay()
    if (s !== 0 && s !== 6 && !feriadoNacional(iso(d))) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}
const somaMes = (iso0: string, n: number) => {
  const [a, m, d] = iso0.split('-').map(Number)
  return iso(new Date(a, m - 1 + n, d))
}

const faixaDe = (v: number) => (v <= 0 ? 4 : v <= 2 ? 1 : v <= 4 ? 2 : v <= 6 ? 3 : 4)
const num = (v: unknown) => Number(v) || 0
const cent = (v: number) => Math.round(v * 100) / 100

export function painelDaCarteira(s: ErpState, mes: string, cobradorId = '', hj = hoje()): PainelCobranca {
  const r = regrasCobranca(s)
  const ini = `${mes}-01`
  const fim = iso(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0))
  const doCobrador = (x: Registro) => !cobradorId || String(x.cobradorId) === cobradorId
  const acordos = colecao(s, 'cobranca_acordos').filter(doCobrador)
  const confirmado = (a: Registro) => ['Entrada confirmada', 'Efetivada'].includes(String(a.situacao)) && String(a.entradaRecebidaEm) >= ini && String(a.entradaRecebidaEm) <= fim
  const spc = acordos.filter((a) => a.estavaSpc)
  const total = cent(spc.filter(confirmado).reduce((t, a) => t + num(a.entradaConfirmadaValor || a.entrada), 0))
  const n1 = r.comissao_nivel1_ate ?? 30000
  const n2 = r.comissao_nivel2_ate ?? 35000
  const nivel = total <= n1 ? 1 : total <= n2 ? 2 : 3
  const faixas = [1, 2, 3, 4].map((f) => {
    const pct = r[`comissao_n${nivel}_f${f}`] ?? 0
    const daFaixa = spc.filter((a) => faixaDe(num(a.parcelasVencidasCongeladas)) === f)
    const ag = daFaixa.filter((a) => a.situacao === 'Aguardando entrada')
    const cf = daFaixa.filter(confirmado)
    const aConfirmar = cent(ag.reduce((t, a) => t + num(a.entrada), 0))
    const conf = cent(cf.reduce((t, a) => t + num(a.entradaConfirmadaValor || a.entrada), 0))
    return { faixa: f, pct, aConfirmar, qtdAConfirmar: ag.length, estimada: cent((aConfirmar * pct) / 100), confirmada: conf, qtdConfirmada: cf.length, gerada: cent((conf * pct) / 100) }
  })

  // meta SPC
  const diaCiclo = r.ciclo_spc_inicio ?? 12
  const metaDia = r.meta_spc_dia ?? 50
  let cicloIni = `${mes}-${String(diaCiclo).padStart(2, '0')}`
  if (mes === hj.slice(0, 7) && Number(hj.slice(8)) < diaCiclo) cicloIni = somaMes(cicloIni, -1)
  const cicloFim = (() => { const d = new Date(`${somaMes(cicloIni, 1)}T12:00:00`); d.setDate(d.getDate() - 1); return iso(d) })()
  const cobrancas = colecao(s, 'cobrancas')
  const grupoDa = new Map(colecao(s, 'cobranca_categorias').map((c) => [String(c.id), String(c.grupo)]))
  const calc = calcularCarteira(s, hj).cobrancas
  const sit = new Map(situacoesDaCarteira(s, calc, hj).map((x) => [x.cobrancaId, x.situacao]))
  const contatos = colecao(s, 'cobranca_contatos')
    .filter((k) => { const c = cobrancas.find((y) => y.id === k.cobrancaId); return c && doCobrador(c) })
    .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))
  const trabalhados = new Map<string, string>()
  for (const k of contatos) {
    const c = cobrancas.find((y) => y.id === k.cobrancaId)!
    if (String(k.data) < cicloIni || String(k.data) > cicloFim || grupoDa.get(String(c.categoriaId)) !== 'Cobrança DLG' || trabalhados.has(String(k.clienteId))) continue
    trabalhados.set(String(k.clienteId), sit.get(String(k.cobrancaId)) ?? '')
  }
  const desfecho = (x: string) =>
    ['Renegociação feita (aguardando entrada)', 'Entrada confirmada', 'Renegociação efetivada'].includes(x) ? 'Renegociação'
      : x === 'Renegociação simulada' ? 'Reneg. simulada'
      : ['Pagamento de boleto agendado', 'Promessa não cumprida'].includes(x) ? 'Pagamento'
      : x === 'Contato realizado sem acordo' ? 'Contato s/ acordo'
      : x === 'Aguardando retorno' ? 'Aguardando retorno'
      : x === 'Não localizado' ? 'Não localizado'
      : x === 'Ficha não encontrada SPC' ? 'Ficha não encontrada' : 'Demais'
  const desfechos: Record<string, number> = {}
  for (const x of trabalhados.values()) desfechos[desfecho(x)] = (desfechos[desfecho(x)] ?? 0) + 1
  const du = diasUteis(cicloIni, cicloFim)
  const duHoje = diasUteis(cicloIni, hj < cicloFim ? hj : cicloFim)

  // indicadores
  const doMes = contatos.filter((k) => String(k.data) >= ini && String(k.data) <= fim)
  const porSituacao: Record<string, number> = {}
  for (const c of calc.filter((y) => y.carteira === 'Cobrança DLG' && y.vencido > 0 && (!cobradorId || y.cobradorId === cobradorId))) {
    const x = sit.get(c.id) ?? c.situacao
    porSituacao[x] = (porSituacao[x] ?? 0) + 1
  }
  const naData = (v: unknown) => String(v ?? '').slice(0, 10)
  return {
    nivel, totalConfirmado: total, nivel1Ate: n1, nivel2Ate: n2, faltaProximo: nivel === 1 ? cent(n1 - total + 0.01) : nivel === 2 ? cent(n2 - total + 0.01) : 0, faixas,
    metaSpc: { inicio: cicloIni, fim: cicloFim, diasUteis: du, diasAteHoje: duHoje, metaDia, alvo: metaDia * du, esperadoHoje: metaDia * duHoje, trabalhados: trabalhados.size, desfechos },
    indicadores: {
      clientesContatados: new Set(doMes.map((k) => String(k.clienteId))).size,
      contatos: doMes.length,
      acordosFechados: acordos.filter((a) => a.situacao !== 'Simulada' && naData(a.fechadoEm) >= ini && naData(a.fechadoEm) <= fim).length,
      entradasConfirmadas: acordos.filter(confirmado).length,
      efetivadas: acordos.filter((a) => a.situacao === 'Efetivada' && naData(a.efetivadoEm) >= ini && naData(a.efetivadoEm) <= fim).length,
      porSituacao,
      aguardandoEntradaValor: cent(acordos.filter((a) => a.situacao === 'Aguardando entrada').reduce((t, a) => t + num(a.entrada), 0)),
      entradasVencidas: acordos.filter((a) => a.situacao === 'Aguardando entrada' && String(a.entradaPrazo) < hj).length,
    },
  }
}

// a resposta do banco (snake_case) no mesmo formato
export function painelDoBanco(j: Record<string, unknown>): PainelCobranca {
  const ms = (j.meta_spc ?? {}) as Record<string, unknown>
  const ind = (j.indicadores ?? {}) as Record<string, unknown>
  return {
    nivel: num(j.nivel) || 1, totalConfirmado: num(j.total_confirmado), nivel1Ate: num(j.nivel1_ate), nivel2Ate: num(j.nivel2_ate), faltaProximo: num(j.falta_proximo),
    faixas: ((j.faixas ?? []) as Record<string, unknown>[]).map((f) => ({
      faixa: num(f.faixa), pct: num(f.pct), aConfirmar: num(f.a_confirmar), qtdAConfirmar: num(f.qtd_a_confirmar), estimada: num(f.estimada),
      confirmada: num(f.confirmada), qtdConfirmada: num(f.qtd_confirmada), gerada: num(f.gerada),
    })),
    metaSpc: {
      inicio: String(ms.inicio ?? ''), fim: String(ms.fim ?? ''), diasUteis: num(ms.dias_uteis), diasAteHoje: num(ms.dias_ate_hoje), metaDia: num(ms.meta_dia),
      alvo: num(ms.alvo), esperadoHoje: num(ms.esperado_hoje), trabalhados: num(ms.trabalhados), desfechos: (ms.desfechos ?? {}) as Record<string, number>,
    },
    indicadores: {
      clientesContatados: num(ind.clientes_contatados), contatos: num(ind.contatos), acordosFechados: num(ind.acordos_fechados), entradasConfirmadas: num(ind.entradas_confirmadas),
      efetivadas: num(ind.efetivadas), porSituacao: (ind.por_situacao ?? {}) as Record<string, number>, aguardandoEntradaValor: num(ind.aguardando_entrada_valor),
      entradasVencidas: num(ind.entradas_vencidas),
    },
  }
}
