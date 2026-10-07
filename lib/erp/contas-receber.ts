// Parcelas (títulos) agrupadas por pessoa (pedido de 07/10/2026): um nome por linha, com os totais da pessoa.
// Usado no Financeiro › Contas a Receber (todas as parcelas) e na Cobrança › Inadimplência (só as vencidas).

import type { Registro, Tom } from './types'
import { tituloAtrasado } from './metrics'
import { hoje } from './format'
import { textoBusca } from './documento'

export type SituacaoPessoa = 'Em atraso' | 'Em dia' | 'Em acordo' | 'Quitado' | 'Cancelado'
export const ORDEM_SITUACAO: SituacaoPessoa[] = ['Em atraso', 'Em dia', 'Em acordo', 'Quitado', 'Cancelado']
export const TOM_SITUACAO: Record<SituacaoPessoa, Tom> = { 'Em atraso': 'red', 'Em dia': 'emerald', 'Em acordo': 'yellow', Quitado: 'emerald', Cancelado: 'zinc' }

export interface Pessoa {
  chave: string
  nome: string
  alunos: string[]
  escolas: string[]
  telefones: string[]
  cobradores: string[]
  titulos: Registro[]
  pagas: number
  vencidas: number
  total: number
  recebido: number
  emAberto: number
  emAtraso: number
  proximo: string // próximo vencimento em aberto
  maisAntigo: string // vencimento da parcela vencida mais antiga
  diasAtraso: number // dias de atraso da parcela vencida mais antiga
  situacao: SituacaoPessoa
}

// a mesma pessoa, escrita com ou sem acento, maiúscula ou espaço a mais, fica numa linha só
export const chaveNome = (nome: unknown) => textoBusca(nome).replace(/\s+/g, ' ').trim()
export const chavePessoa = (t: Registro) => chaveNome(t.cliente)
export const valorDe = (t: Registro) => Number(t.valor) || 0
export const unicos = (l: unknown[]) => [...new Set(l.map((v) => String(v ?? '').trim()).filter(Boolean))]
export const diasAtraso = (venc: string) => Math.max(0, Math.round((new Date(hoje()).getTime() - new Date(venc).getTime()) / 86_400_000))

// nome mostrado: o jeito de escrever que mais aparece nas parcelas da pessoa
function nomeMaisUsado(ts: Registro[]) {
  const conta = new Map<string, number>()
  for (const t of ts) {
    const n = String(t.cliente ?? '').replace(/\s+/g, ' ').trim()
    if (n) conta.set(n, (conta.get(n) ?? 0) + 1)
  }
  return [...conta.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '—'
}

function situacaoDe(ts: Registro[]): SituacaoPessoa {
  if (ts.some(tituloAtrasado)) return 'Em atraso'
  if (ts.some((t) => t.status === 'Aberto')) return 'Em dia'
  if (ts.some((t) => t.status === 'Em acordo')) return 'Em acordo'
  if (ts.some((t) => t.status === 'Pago')) return 'Quitado'
  return 'Cancelado'
}

export function agruparPorPessoa(titulos: Registro[], nomeCobrador: (id: string) => string): Pessoa[] {
  const grupos = new Map<string, Registro[]>()
  for (const t of titulos) {
    const k = chavePessoa(t)
    grupos.set(k, [...(grupos.get(k) ?? []), t])
  }
  return [...grupos.entries()].map(([chave, ts]) => {
    const abertos = ts.filter((t) => t.status === 'Aberto')
    const vencidas = ts.filter(tituloAtrasado)
    const soma = (l: Registro[]) => Math.round(l.reduce((a, t) => a + valorDe(t), 0) * 100) / 100
    const maisAntigo = vencidas.map((t) => String(t.vencimento)).sort()[0] ?? ''
    return {
      chave,
      nome: nomeMaisUsado(ts),
      alunos: unicos(ts.map((t) => t.aluno)),
      escolas: unicos(ts.map((t) => t.escola)),
      telefones: unicos(ts.map((t) => t.telefone)),
      cobradores: unicos(ts.map((t) => (t.cobradorId ? nomeCobrador(String(t.cobradorId)) : ''))),
      titulos: ts,
      pagas: ts.filter((t) => t.status === 'Pago').length,
      vencidas: vencidas.length,
      total: soma(ts.filter((t) => t.status !== 'Cancelado')),
      recebido: soma(ts.filter((t) => t.status === 'Pago')),
      emAberto: soma(abertos),
      emAtraso: soma(vencidas),
      proximo: abertos.map((t) => String(t.vencimento)).sort()[0] ?? '',
      maisAntigo,
      diasAtraso: maisAntigo ? diasAtraso(maisAntigo) : 0,
      situacao: situacaoDe(ts),
    }
  })
}

// atrasados primeiro; depois quem vence antes; o resto por nome
export function ordenarPessoas(a: Pessoa, b: Pessoa) {
  const s = ORDEM_SITUACAO.indexOf(a.situacao) - ORDEM_SITUACAO.indexOf(b.situacao)
  if (s) return s
  if (a.proximo && b.proximo && a.proximo !== b.proximo) return a.proximo.localeCompare(b.proximo)
  return a.nome.localeCompare(b.nome, 'pt-BR')
}

// pesquisa por nome, aluno ou escola (sem acento) ou pelo telefone (só os números)
export function pessoaNaBusca(p: Pessoa, busca: string) {
  const termo = chaveNome(busca)
  if (!termo) return true
  if (/^[\d\s().+-]+$/.test(busca.trim())) {
    const digitos = busca.replace(/\D/g, '')
    return p.telefones.some((t) => String(t).replace(/\D/g, '').includes(digitos))
  }
  return [p.nome, ...p.alunos, ...p.escolas].some((v) => textoBusca(v).includes(termo))
}

// parcelas de uma venda em ordem: entrada, 1/3, 2/3, 3/3...
const numeroParcela = (t: Registro) => (String(t.parcela) === 'Entrada' ? 0 : Number(String(t.parcela).split('/')[0]) || 99)
export const ordemParcela = (a: Registro, b: Registro) => numeroParcela(a) - numeroParcela(b) || String(a.vencimento).localeCompare(String(b.vencimento))

// um bloco por venda (a mesma pessoa pode ter comprado mais de uma vez); título lançado à mão fica sem venda
export function blocosPorVenda(titulos: Registro[], vendas: Registro[]) {
  const blocos = new Map<string, Registro[]>()
  for (const t of titulos) {
    const k = String(t.vendaId ?? '')
    blocos.set(k, [...(blocos.get(k) ?? []), t])
  }
  return [...blocos.entries()]
    .map(([vendaId, ts]) => ({ vendaId, ts: [...ts].sort(ordemParcela), venda: vendaId ? vendas.find((v) => v.id === vendaId) : undefined }))
    .sort((a, b) => String(a.ts[0].vencimento).localeCompare(String(b.ts[0].vencimento)))
}
