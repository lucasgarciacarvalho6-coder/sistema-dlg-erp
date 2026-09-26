// Utilitários de formatação e datas (sempre no fuso local).

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtNum = new Intl.NumberFormat('pt-BR')

export const brl = (v: number) => fmtBRL.format(v || 0)
export const num = (v: number) => fmtNum.format(Math.round(v || 0))
export const pct = (v: number) => `${(v || 0).toFixed(1).replace('.', ',')}%`

export function formatar(valor: number, unidade: 'qtd' | 'brl') {
  return unidade === 'brl' ? brl(valor) : num(valor)
}

const pad = (n: number) => String(n).padStart(2, '0')

export function isoData(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const hoje = () => isoData(new Date())
export const mesDe = (iso: string) => iso.slice(0, 7)
export const mesAtual = () => mesDe(hoje())

export function addDias(iso: string, dias: number) {
  const [a, m, d] = iso.split('-').map(Number)
  return isoData(new Date(a, m - 1, d + dias))
}

export function diasNoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  return new Date(a, m, 0).getDate()
}

export function dataBR(iso: string | null | undefined) {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function dataHoraBR(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function nomeMes(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES[m - 1]} / ${a}`
}

export function mesAnterior(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  return isoData(new Date(a, m - 2, 1)).slice(0, 7)
}

// Semana de segunda a domingo
export function inicioSemana(iso: string) {
  const [a, m, d] = iso.split('-').map(Number)
  const dia = new Date(a, m - 1, d).getDay() // 0 = domingo
  return addDias(iso, dia === 0 ? -6 : 1 - dia)
}

export const fimSemana = (iso: string) => addDias(inicioSemana(iso), 6)

export function rotuloSemana(inicio: string) {
  return `${dataBR(inicio).slice(0, 5)} a ${dataBR(addDias(inicio, 6)).slice(0, 5)}`
}

export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

export function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// 'YYYY-MM-DD' + n meses (dia ajustado ao fim do mês quando não existe, ex.: 31/01 + 1 → 28/02)
export function addMeses(iso: string, n: number) {
  const [a, m, d] = iso.split('-').map(Number)
  const alvo = new Date(a, m - 1 + n, 1)
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  alvo.setDate(Math.min(d, ultimo))
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')}`
}
