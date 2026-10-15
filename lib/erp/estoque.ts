// ESTOQUE DE ÁLBUNS — só o FINANCEIRO mexe; a PRODUÇÃO só vê, para conferir se bate (mesmas regras do SQL 029).
// O estoque é por escola: as caixas que a Produção conferiu. A carga leva caixas de várias escolas com um vendedor de books
// (fica "Em venda", sem prazo). Na volta, o acerto por escola diz quantos álbuns e pôsteres/brindes foram vendidos e quantos
// voltaram; a diferença (levados − vendidos − voltaram) fica registrada. O que voltou tem um destino (SQL 056):
// "Estoque" (vira uma caixa da escola, em estoque, que pode sair em outra carga) ou "Rebolo" (encaminhado na hora).
// Acertos antigos, sem destino, ficam "aguardando Rebolo" até o Financeiro encaminhar (o Rebolo não precisa confirmar).

import type { ErpState, Registro } from './types'
import { colecao } from './metrics'
import { dataBR, diaLocal } from './format'

const n = (v: unknown) => Number(v) || 0
const t = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export interface Quantidade {
  albuns: number
  posteres: number
}
const zero = (): Quantidade => ({ albuns: 0, posteres: 0 })
const somar = (a: Quantidade, albuns: unknown, posteres: unknown) => {
  a.albuns += n(albuns)
  a.posteres += n(posteres)
}

// álbuns e pôsteres da caixa: o que a Produção conferiu (ou o que a Revelação informou, se ainda não conferiu)
const vazio = (v: unknown) => v === null || v === undefined || v === ''
export const albunsDaCaixa = (c: Registro) => n(vazio(c.conferidoAlbuns) ? c.albuns : c.conferidoAlbuns)
export const posteresDaCaixa = (c: Registro) => n(vazio(c.conferidoPosteres) ? c.posteres : c.conferidoPosteres)

export type StatusCarga = 'Em venda' | 'Encerrada' | 'Cancelada'

// A mesma escola pode ter mais de um lote na Produção (cada visita ou retorno é uma linha, como na planilha):
// a data da foto (e o "retorno") diferencia um do outro no estoque, na carga, no acerto e no romaneio.
export interface DadosLote {
  loteId: string
  escola: string
  cidade: string
  uf: string
  dataFoto: string
  retorno: boolean
}
export const dadosLote = (loteId: string, l?: Registro): DadosLote => ({
  loteId,
  escola: t(l?.escola),
  cidade: t(l?.cidade),
  uf: t(l?.uf),
  dataFoto: t(l?.dataFoto).slice(0, 10),
  retorno: l?.retorno === true || l?.retorno === 'true',
})
export const rotuloLote = (x: { dataFoto: string; retorno: boolean }) => [x.dataFoto ? `foto ${dataBR(x.dataFoto)}` : '', x.retorno ? 'retorno' : ''].filter(Boolean).join(' • ')
const ordemLote = (a: DadosLote, b: DadosLote) => a.escola.localeCompare(b.escola, 'pt-BR') || a.dataFoto.localeCompare(b.dataFoto)

export interface EscolaDaCarga extends Quantidade, DadosLote {
  caixas: Registro[] // caixas da Produção nesta carga
  acerto?: Registro // acerto desta escola (carga encerrada)
}

export interface CargaResumo extends Quantidade {
  carga: Registro
  escolas: EscolaDaCarga[]
  caixas: number
  vendidos: Quantidade
  voltaram: Quantidade
  diferenca: Quantidade
}

// Cargas com as escolas, as caixas e os totais (da mais nova para a mais antiga)
export function resumoCargas(s: ErpState): CargaResumo[] {
  const lotes = new Map(colecao(s, 'producao_lotes').map((l) => [l.id, l]))
  const caixas = new Map(colecao(s, 'producao_caixas').map((c) => [c.id, c]))
  const itens = colecao(s, 'estoque_carga_caixas')
  const acertos = colecao(s, 'estoque_carga_acertos')
  return colecao(s, 'estoque_cargas')
    .map((carga) => {
      const porLote = new Map<string, EscolaDaCarga>()
      for (const k of itens.filter((x) => x.cargaId === carga.id)) {
        const l = lotes.get(t(k.loteId))
        const e = porLote.get(t(k.loteId)) ?? { ...dadosLote(t(k.loteId), l), caixas: [], ...zero() }
        const cx = caixas.get(t(k.caixaId))
        if (cx) e.caixas.push(cx)
        somar(e, k.albuns, k.posteres)
        porLote.set(e.loteId, e)
      }
      const escolas = [...porLote.values()].sort(ordemLote)
      const total = zero()
      const vendidos = zero()
      const voltaram = zero()
      const diferenca = zero()
      for (const e of escolas) {
        e.caixas.sort((a, b) => n(a.numero) - n(b.numero))
        e.acerto = acertos.find((a) => a.cargaId === carga.id && a.loteId === e.loteId)
        somar(total, e.albuns, e.posteres)
        if (e.acerto) {
          somar(vendidos, e.acerto.albunsVendidos, e.acerto.posteresVendidos)
          somar(voltaram, e.acerto.albunsVoltaram, e.acerto.posteresVoltaram)
          somar(diferenca, e.acerto.albunsDiferenca, e.acerto.posteresDiferenca)
        }
      }
      return { carga, escolas, caixas: escolas.reduce((a, e) => a + e.caixas.length, 0), ...total, vendidos, voltaram, diferenca }
    })
    .sort((a, b) => n(b.carga.numero) - n(a.carga.numero))
}

export interface EstoqueEscola extends DadosLote {
  lote: Registro
  caixas: Registro[] // caixas conferidas (em estoque, em carga e acertadas)
  emEstoque: Quantidade & { caixas: Registro[] }
  emVenda: Quantidade & { caixas: Registro[]; cargas: Registro[] }
  vendidos: Quantidade
  voltaram: Quantidade
  voltaramEstoque: Quantidade // voltaram e foram para o estoque (056)
  rebolo: Quantidade // encaminhados ao Rebolo
  aguardandoRebolo: Quantidade // voltaram e ainda não foram para o Rebolo
  diferenca: Quantidade
  aguardandoConferencia: number // caixas que a Produção ainda não conferiu
}

// O estoque de cada escola que já tem caixa conferida (ou algum movimento)
export function estoquePorEscola(s: ErpState): EstoqueEscola[] {
  const cargas = new Map(colecao(s, 'estoque_cargas').map((c) => [c.id, c]))
  const itens = colecao(s, 'estoque_carga_caixas')
  const acertos = colecao(s, 'estoque_carga_acertos')
  const envios = colecao(s, 'estoque_envios_rebolo')
  const lista: EstoqueEscola[] = []
  for (const lote of colecao(s, 'producao_lotes')) {
    const todas = colecao(s, 'producao_caixas')
      .filter((c) => c.loteId === lote.id)
      .sort((a, b) => n(a.numero) - n(b.numero))
    const conferidas = todas.filter((c) => c.status !== 'Aguardando conferência')
    const acs = acertos.filter((a) => a.loteId === lote.id)
    const evs = envios.filter((e) => e.loteId === lote.id)
    if (!todas.length && !acs.length && !evs.length) continue // entra também a escola que só tem caixa a conferir
    const e: EstoqueEscola = {
      lote,
      ...dadosLote(lote.id, lote),
      caixas: conferidas,
      emEstoque: { ...zero(), caixas: [] },
      emVenda: { ...zero(), caixas: [], cargas: [] },
      vendidos: zero(),
      voltaram: zero(),
      voltaramEstoque: zero(),
      rebolo: zero(),
      aguardandoRebolo: zero(),
      diferenca: zero(),
      aguardandoConferencia: todas.length - conferidas.length,
    }
    for (const c of conferidas) {
      if (c.status === 'Em estoque') {
        e.emEstoque.caixas.push(c)
        somar(e.emEstoque, albunsDaCaixa(c), posteresDaCaixa(c))
      }
    }
    for (const k of itens.filter((x) => x.loteId === lote.id)) {
      const carga = cargas.get(t(k.cargaId))
      if (carga?.status !== 'Em venda') continue
      const cx = conferidas.find((c) => c.id === k.caixaId)
      if (cx) e.emVenda.caixas.push(cx)
      somar(e.emVenda, k.albuns, k.posteres)
      if (!e.emVenda.cargas.includes(carga)) e.emVenda.cargas.push(carga)
    }
    for (const a of acs) {
      somar(e.vendidos, a.albunsVendidos, a.posteresVendidos)
      somar(e.voltaram, a.albunsVoltaram, a.posteresVoltaram)
      if (a.destino === 'Estoque') somar(e.voltaramEstoque, a.albunsVoltaram, a.posteresVoltaram)
      somar(e.diferenca, a.albunsDiferenca, a.posteresDiferenca)
    }
    for (const r of evs) somar(e.rebolo, r.albuns, r.posteres)
    e.aguardandoRebolo = {
      albuns: e.voltaram.albuns - e.voltaramEstoque.albuns - e.rebolo.albuns,
      posteres: e.voltaram.posteres - e.voltaramEstoque.posteres - e.rebolo.posteres,
    }
    lista.push(e)
  }
  return lista.sort(ordemLote)
}

// O estoque de agora: as caixas conferidas que estão na empresa (não saíram com vendedor).
// A etapa 6 "Na caixa" da Visão TV usa estes mesmos números — uma coisa acompanha a outra.
export function estoqueAgora(s: ErpState): Quantidade & { escolas: number; caixas: number } {
  const lotes = new Set<string>()
  const q = { ...zero(), escolas: 0, caixas: 0 }
  for (const c of colecao(s, 'producao_caixas')) {
    if (c.status !== 'Em estoque') continue
    somar(q, albunsDaCaixa(c), posteresDaCaixa(c))
    q.caixas++
    lotes.add(t(c.loteId))
  }
  q.escolas = lotes.size
  return q
}

// Quanto o estoque mudou hoje (álbuns): caixas conferidas hoje e as que voltaram para o estoque − as que saíram na carga
export function variacaoEstoqueHoje(s: ErpState, hojeISO: string): number {
  let v = 0
  // (a caixa da volta de carga entra pelo movimento "Voltou ao estoque", não conta duas vezes)
  for (const c of colecao(s, 'producao_caixas')) if (c.status !== 'Aguardando conferência' && !c.origemCargaId && t(c.conferidoEm).slice(0, 10) === hojeISO) v += albunsDaCaixa(c)
  for (const m of colecao(s, 'estoque_movimentos')) {
    if (!t(m.criadoEm) || diaLocal(t(m.criadoEm)) !== hojeISO) continue
    if (m.tipo === 'Saiu na carga') v -= n(m.albuns)
    else if (m.tipo === 'Voltou ao estoque' || m.tipo === 'Carga cancelada') v += n(m.albuns)
  }
  return v
}

// Situação de cada caixa conferida (para a lista de caixas da escola)
export function situacaoDaCaixa(s: ErpState, caixa: Registro): string {
  if (caixa.status === 'Em estoque') return 'Em estoque'
  if (caixa.status === 'Aguardando conferência') return 'Aguardando a conferência da Produção'
  const itens = colecao(s, 'estoque_carga_caixas').filter((k) => k.caixaId === caixa.id)
  const cargas = colecao(s, 'estoque_cargas')
  const carga = itens
    .map((k) => cargas.find((c) => c.id === k.cargaId))
    .filter((c): c is Registro => !!c && c.status !== 'Cancelada')
    .sort((a, b) => n(b.numero) - n(a.numero))[0]
  if (!carga) return t(caixa.status)
  return caixa.status === 'Em carga' ? `Em venda • carga ${t(carga.numero)} • ${t(carga.vendedor)}` : `Acertada • carga ${t(carga.numero)} • ${t(carga.vendedor)}`
}

export interface LinhaExtrato {
  id: string
  data: string // ISO (data e hora)
  tipo: string
  albuns: number
  posteres: number
  descricao: string
  autor: string
}

// Extrato da escola: caixas que entraram (conferidas pela Produção) + os movimentos do Financeiro (do mais novo ao mais antigo)
export function extratoDaEscola(s: ErpState, loteId: string): LinhaExtrato[] {
  const entradas: LinhaExtrato[] = colecao(s, 'producao_caixas')
    .filter((c) => c.loteId === loteId && c.status !== 'Aguardando conferência' && t(c.conferidoEm) && !c.origemCargaId)
    .map((c) => ({
      id: `cx-${c.id}`,
      data: `${t(c.conferidoEm).slice(0, 10)}T08:00:00`,
      tipo: 'Entrou no estoque',
      albuns: albunsDaCaixa(c),
      posteres: posteresDaCaixa(c),
      descricao: `Caixa ${t(c.numero)} conferida pela Produção`,
      autor: '',
    }))
  const movs: LinhaExtrato[] = colecao(s, 'estoque_movimentos')
    .filter((m) => m.loteId === loteId)
    .map((m) => ({ id: m.id, data: t(m.criadoEm), tipo: t(m.tipo), albuns: n(m.albuns), posteres: n(m.posteres), descricao: t(m.descricao), autor: t(m.autor) }))
  return [...entradas, ...movs].sort((a, b) => b.data.localeCompare(a.data))
}

// Caixas que podem entrar numa carga: em estoque, agrupadas por escola (cidade e escola em ordem)
export function caixasDisponiveis(s: ErpState, alemDestas: string[] = []) {
  const lotes = new Map(colecao(s, 'producao_lotes').map((l) => [l.id, l]))
  const grupos = new Map<string, DadosLote & { caixas: Registro[] }>()
  for (const c of colecao(s, 'producao_caixas')) {
    if (c.status !== 'Em estoque' && !alemDestas.includes(c.id)) continue
    const l = lotes.get(t(c.loteId))
    const g = grupos.get(t(c.loteId)) ?? { ...dadosLote(t(c.loteId), l), caixas: [] }
    g.caixas.push(c)
    grupos.set(g.loteId, g)
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, caixas: g.caixas.sort((a, b) => n(a.numero) - n(b.numero)) }))
    .sort((a, b) => a.cidade.localeCompare(b.cidade, 'pt-BR') || ordemLote(a, b))
}

// Vendedores que levam carga: os vendedores de books (cadastro em ADM › Vendedores externos)
export const vendedoresDeBooks = (s: ErpState, incluir = '') =>
  colecao(s, 'pj_vendedores')
    .filter((v) => v.tipo === 'Books' && (v.status !== 'Inativo' || v.id === incluir))
    .sort((a, b) => t(a.nome).localeCompare(t(b.nome), 'pt-BR'))

// Acerto de uma escola (o que o Financeiro digita na volta)
export interface AcertoEscola {
  loteId: string
  albunsVendidos: number
  albunsVoltaram: number
  posteresVendidos: number
  posteresVoltaram: number
  observacao: string
  destino?: 'Estoque' | 'Rebolo' | ''
}
