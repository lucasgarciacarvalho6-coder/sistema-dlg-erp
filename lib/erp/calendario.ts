// Dias úteis do ERP = segunda a sexta, sem feriados nacionais (mesma régua do sistema antigo:
// setembro/2026 = 21 dias úteis, porque 07/09 é feriado). Base de: meta diária, "dias 18/21",
// média diária, projeção e o gráfico diário.

import { addDias, diasNoMes, isoData } from './format'

// Pontos facultativos que a empresa também não trabalha (ajuste aqui se mudar a política)
export const FOLGA_EM_FACULTATIVOS = { carnaval: false, corpusChristi: false }

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
function pascoa(ano: number) {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return isoData(new Date(ano, mes - 1, dia))
}

const cache = new Map<number, Map<string, string>>()

// Feriados nacionais do ano → { 'YYYY-MM-DD': 'Nome' }
export function feriadosNacionais(ano: number): Map<string, string> {
  const pronto = cache.get(ano)
  if (pronto) return pronto
  const f = new Map<string, string>([
    [`${ano}-01-01`, 'Confraternização Universal'],
    [`${ano}-04-21`, 'Tiradentes'],
    [`${ano}-05-01`, 'Dia do Trabalho'],
    [`${ano}-09-07`, 'Independência do Brasil'],
    [`${ano}-10-12`, 'Nossa Senhora Aparecida'],
    [`${ano}-11-02`, 'Finados'],
    [`${ano}-11-15`, 'Proclamação da República'],
    [`${ano}-11-20`, 'Consciência Negra'],
    [`${ano}-12-25`, 'Natal'],
  ])
  const p = pascoa(ano)
  f.set(addDias(p, -2), 'Sexta-feira Santa')
  if (FOLGA_EM_FACULTATIVOS.carnaval) {
    f.set(addDias(p, -48), 'Carnaval')
    f.set(addDias(p, -47), 'Carnaval')
  }
  if (FOLGA_EM_FACULTATIVOS.corpusChristi) f.set(addDias(p, 60), 'Corpus Christi')
  cache.set(ano, f)
  return f
}

export function ehDiaUtil(iso: string) {
  const [a, m, d] = iso.split('-').map(Number)
  const semana = new Date(a, m - 1, d).getDay()
  if (semana === 0 || semana === 6) return false
  return !feriadosNacionais(a).has(iso)
}

// Datas úteis do mês ('YYYY-MM-DD')
export function diasUteisDoMes(mes: string): string[] {
  const lista: string[] = []
  for (let d = 1; d <= diasNoMes(mes); d++) {
    const iso = `${mes}-${String(d).padStart(2, '0')}`
    if (ehDiaUtil(iso)) lista.push(iso)
  }
  return lista
}

export const totalDiasUteis = (mes: string) => diasUteisDoMes(mes).length

// Dias úteis decorridos até a data (inclusive) dentro do mês
export function diasUteisAte(mes: string, iso: string) {
  return diasUteisDoMes(mes).filter((d) => d <= iso).length
}

// Último dia útil ANTES da data (segunda-feira → a sexta anterior)
export function ultimoDiaUtilAntes(iso: string) {
  let d = addDias(iso, -1)
  while (!ehDiaUtil(d)) d = addDias(d, -1)
  return d
}

// Dias úteis depois de `de` até `ate` (inclusive): entrou na segunda → na quinta são 3
export function diasUteisDepois(de: string, ate: string) {
  let n = 0
  for (let d = addDias(de, 1); d <= ate; d = addDias(d, 1)) if (ehDiaUtil(d)) n++
  return n
}

// Meta diária derivada da mensal (ex.: 1.200 ÷ 21 = 57,14)
export function metaDiariaDoMes(metaMensal: number, mes: string) {
  const uteis = totalDiasUteis(mes)
  return uteis > 0 ? metaMensal / uteis : 0
}
