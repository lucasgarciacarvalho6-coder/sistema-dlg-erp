// Carteira de cobranças (SQL 041/042) para as telas: Financeiro › Contas a Receber, Cobrança › Inadimplência,
// painéis e Vendas de Books. Nada disso vem na carga geral: cada tela busca no servidor só o que mostra
// (50 por página, com a pesquisa e os totais feitos no banco). No modo demonstração, as mesmas contas rodam em memória.
// As gravações (receber, estornar, negociar, lançar...) ficam no store.

import { useEffect, useState } from 'react'
import { sb } from '@/lib/supabase/client'
import { MODO, lerEstado, useErp } from './store'
import { traduzirErro } from './supabase-sync'
import { termosBusca } from './documento'
import { colecao } from './metrics'
import { useVersaoCarteira } from './carteira-versao'
import { conferirPlanilhaDemo, filaSpcDaCarteira, linhaSpcDoBanco, resultadoDoBanco, type LinhaSpc, type ResultadoPlanilha } from './spc'
import { painelDaCarteira, painelDoBanco, type PainelCobranca } from './painel-cobranca'
import { CONDICOES_PADRAO, acordoFin, acordoV, type AcordoFin, type AcordoV, type CondicaoFaixa } from './acordo'
import {
  INDICADORES_VAZIOS,
  ORDEM_SITUACAO,
  buscaDoCliente,
  calcularCarteira,
  clientesDaCarteira,
  ehInadimplente,
  indicadoresDaCarteira,
  inadimplentesDaCarteira,
  pagamentoV,
  passaNaBusca,
  resumoDaCarteira,
  type ClienteCarteira,
  contatoV,
  paraHojeDaCarteira,
  situacoesDaCarteira,
  type CobrancaV,
  type ContatoV,
  type PendenciaHoje,
  type SituacaoCobranca,
  type Inadimplente,
  type Indicadores,
  type PagamentoV,
  type ParcelaV,
  type ResumoCarteira,
  type ResumoVenda,
  type SituacaoPessoa,
} from './carteira'

export const POR_PAGINA_CARTEIRA = 50

export interface FiltroReceber {
  termo: string
  situacao: SituacaoPessoa | ''
  conta: string
}
export const FILTRO_RECEBER: FiltroReceber = { termo: '', situacao: '', conta: '' }

export interface FiltroInadimplencia {
  termo: string
  carteira: string
  faixa: string
  conta: string
}
export const FILTRO_INADIMPLENCIA: FiltroInadimplencia = { termo: '', carteira: '', faixa: '', conta: '' }

export interface Pagina<T> {
  linhas: T[]
  total: number
  erro?: string
}

// ---------------- do banco para a tela ----------------
type Linha = Record<string, unknown>
const num = (v: unknown) => Number(v) || 0
const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== '').map(String) : [])

function cobrancaDoBanco(l: Linha): CobrancaV {
  return {
    id: txt(l.id), clienteId: txt(l.cliente_id), cliente: txt(l.cliente), documento: txt(l.documento), documentoOk: !!l.documento_ok, telefone: txt(l.telefone),
    cidade: txt(l.cidade), uf: txt(l.uf), vendaId: txt(l.venda_id), origem: txt(l.origem), codigoVenda: txt(l.codigo_venda), referencia: txt(l.referencia),
    conta: txt(l.conta), categoriaId: txt(l.categoria_id), categoria: txt(l.categoria), grupo: txt(l.grupo), contaInadimplencia: !!l.conta_inadimplencia,
    podeSpc: !!l.pode_spc, cobradorId: txt(l.cobrador_id), cobrador: txt(l.cobrador), situacao: txt(l.situacao), observacao: txt(l.observacao),
    parcelas: num(l.parcelas), parcelasAbertas: num(l.parcelas_abertas), parcelasVencidas: num(l.parcelas_vencidas), parcelasPagas: num(l.parcelas_pagas),
    valorTotal: num(l.valor_total), recebido: num(l.recebido), emAberto: num(l.em_aberto), vencido: num(l.vencido), aVencer: num(l.a_vencer),
    multa: num(l.multa), juros: num(l.juros), atualizado: num(l.atualizado), totalDivida: num(l.total_divida), vencidaDesde: txt(l.vencida_desde),
    proximoVencimento: txt(l.proximo_vencimento), quitadaEm: txt(l.quitada_em), diasAtraso: num(l.dias_atraso), faixaDias: txt(l.faixa_dias),
    faixaParcelas: txt(l.faixa_parcelas), carteira: txt(l.carteira), foraDaCategoria: !!l.fora_da_categoria, podeRenegociar: !!l.pode_renegociar,
    podeIrSpc: !!l.pode_ir_spc, criadoEm: txt(l.created_at),
  }
}

function parcelaDoBanco(l: Linha): ParcelaV {
  return {
    id: txt(l.id), cobrancaId: txt(l.cobranca_id), numero: num(l.numero), total: num(l.total) || 1, valor: num(l.valor), vencimento: txt(l.vencimento),
    multa: num(l.multa), baixado: num(l.baixado), situacao: txt(l.situacao), pagoEm: txt(l.pago_em), acordoId: txt(l.acordo_id), cobraJuros: l.cobra_juros !== false, saldo: num(l.saldo),
    vencida: !!l.vencida, diasAtraso: num(l.dias_atraso), multaDevida: num(l.multa_devida), juros: num(l.juros), atualizado: num(l.atualizado),
  }
}

function pagamentoDoBanco(l: Linha): PagamentoV {
  return {
    id: txt(l.id), parcelaId: txt(l.parcela_id), cobrancaId: txt(l.cobranca_id), valor: num(l.valor), principal: num(l.principal), encargos: num(l.encargos),
    desconto: num(l.desconto), data: txt(l.data), forma: txt(l.forma), observacao: txt(l.observacao), origem: txt(l.origem), registradoPorNome: txt(l.registrado_por_nome),
    estornadoEm: txt(l.estornado_em), estornadoPorNome: txt(l.estornado_por_nome), estornoMotivo: txt(l.estorno_motivo), criadoEm: txt(l.created_at),
  }
}

const COLUNAS_RECEBER =
  'cliente_id, cliente, documento, telefone, cidade, uf, referencias, cobrancas, parcelas, parcelas_pagas, parcelas_vencidas, em_aberto, vencido, atualizado, recebido, vence_primeiro, dias_atraso, carteiras, contas, cobradores, situacao'
function clienteCarteiraDoBanco(l: Linha): ClienteCarteira {
  return {
    clienteId: txt(l.cliente_id), cliente: txt(l.cliente), documento: txt(l.documento), telefone: txt(l.telefone), cidade: txt(l.cidade), uf: txt(l.uf),
    referencias: txt(l.referencias), cobrancas: num(l.cobrancas), parcelas: num(l.parcelas), parcelasPagas: num(l.parcelas_pagas), parcelasVencidas: num(l.parcelas_vencidas),
    emAberto: num(l.em_aberto), vencido: num(l.vencido), atualizado: num(l.atualizado), recebido: num(l.recebido), vencePrimeiro: txt(l.vence_primeiro),
    diasAtraso: num(l.dias_atraso), carteiras: lista(l.carteiras), contas: lista(l.contas), cobradores: lista(l.cobradores), situacao: (txt(l.situacao) || 'Cancelado') as SituacaoPessoa,
  }
}

const COLUNAS_INADIMPLENTES =
  'cliente_id, cliente, documento, telefone, cidade, uf, referencias, parcelas_vencidas, vencido, atualizado, vencida_desde, dias_atraso, carteiras, contas, cobradores, pode_renegociar'
function inadimplenteDoBanco(l: Linha): Inadimplente {
  return {
    clienteId: txt(l.cliente_id), cliente: txt(l.cliente), documento: txt(l.documento), telefone: txt(l.telefone), cidade: txt(l.cidade), uf: txt(l.uf),
    referencias: txt(l.referencias), parcelasVencidas: num(l.parcelas_vencidas), vencido: num(l.vencido), atualizado: num(l.atualizado),
    vencidaDesde: txt(l.vencida_desde), diasAtraso: num(l.dias_atraso), carteiras: lista(l.carteiras), contas: lista(l.contas), cobradores: lista(l.cobradores),
    podeRenegociar: !!l.pode_renegociar,
  }
}

// ---------------- leitura ----------------
const ordemReceber = (a: ClienteCarteira, b: ClienteCarteira) =>
  ORDEM_SITUACAO.indexOf(a.situacao) - ORDEM_SITUACAO.indexOf(b.situacao) ||
  (a.vencePrimeiro || '9999').localeCompare(b.vencePrimeiro || '9999') ||
  a.cliente.localeCompare(b.cliente, 'pt-BR') ||
  a.clienteId.localeCompare(b.clienteId)

function contatoDoBanco(l: Linha): ContatoV {
  return contatoV({
    id: l.id, cobrancaId: l.cobranca_id, clienteId: l.cliente_id, tipo: l.tipo, data: l.data, situacao: l.situacao, situacaoAntes: l.situacao_antes,
    observacao: l.observacao, retornoEm: l.retorno_em, promessaEm: l.promessa_em, promessaValor: l.promessa_valor, registradoPorNome: l.registrado_por_nome,
    criadoEm: l.created_at,
  } as never)
}

function situacaoDoBanco(l: Linha): SituacaoCobranca {
  const t = (v: unknown) => (v == null ? '' : String(v))
  return {
    cobrancaId: t(l.cobranca_id), situacao: t(l.situacao), situacaoGravada: t(l.situacao_gravada), retornoEm: t(l.retorno_em),
    promessaEm: t(l.promessa_em), promessaValor: Number(l.promessa_valor) || 0, ultimoContatoEm: t(l.ultimo_contato_em),
  }
}

// "Para hoje" do cobrador (SQL 046)
export async function lerParaHoje(): Promise<PendenciaHoje[]> {
  if (MODO !== 'supabase') return paraHojeDaCarteira(lerEstado()).sort((a, b) => a.dataPendencia.localeCompare(b.dataPendencia))
  const { data, error } = await sb().from('vw_cobranca_para_hoje').select('cobranca_id, cliente_id, cliente, conta, vencido, situacao, pendencia, data_pendencia').order('data_pendencia').limit(300)
  if (error) return []
  return ((data ?? []) as Linha[]).map((l) => ({
    cobrancaId: String(l.cobranca_id), clienteId: String(l.cliente_id), cliente: String(l.cliente ?? ''), conta: String(l.conta ?? ''),
    vencido: Number(l.vencido) || 0, situacao: String(l.situacao ?? ''), pendencia: String(l.pendencia ?? ''), dataPendencia: String(l.data_pendencia ?? ''),
  }))
}

export async function buscarContasReceber(f: FiltroReceber, pagina: number, porPagina = POR_PAGINA_CARTEIRA): Promise<Pagina<ClienteCarteira>> {
  const de = pagina * porPagina
  if (MODO !== 'supabase') {
    const s = lerEstado()
    const todos = clientesDaCarteira(calcularCarteira(s).cobrancas)
      .filter((c) => (!f.situacao || c.situacao === f.situacao) && (!f.conta || c.contas.includes(f.conta)) && passaNaBusca(buscaDoCliente(s, c.clienteId, c.referencias), f.termo))
      .sort(ordemReceber)
    return { linhas: todos.slice(de, de + porPagina), total: todos.length }
  }
  let q = sb().from('vw_cobranca_clientes').select(COLUNAS_RECEBER, { count: 'exact' })
  for (const t of termosBusca(f.termo)) q = q.like('busca', `%${t}%`)
  if (f.situacao) q = q.eq('situacao', f.situacao)
  if (f.conta) q = q.contains('contas', [f.conta])
  const { data, count, error } = await q
    .order('ordem')
    .order('vence_primeiro', { nullsFirst: false })
    .order('cliente')
    .order('cliente_id')
    .range(de, de + porPagina - 1)
  if (error) return { linhas: [], total: 0, erro: traduzirErro(error) }
  return { linhas: ((data ?? []) as Linha[]).map(clienteCarteiraDoBanco), total: count ?? 0 }
}

const ordemInadimplencia = (a: Inadimplente, b: Inadimplente) => b.diasAtraso - a.diasAtraso || b.vencido - a.vencido || a.clienteId.localeCompare(b.clienteId)

export async function buscarInadimplentes(f: FiltroInadimplencia, pagina: number, porPagina = POR_PAGINA_CARTEIRA): Promise<Pagina<Inadimplente>> {
  const de = pagina * porPagina
  if (MODO !== 'supabase') {
    const s = lerEstado()
    const cobrancas = calcularCarteira(s).cobrancas.filter(ehInadimplente)
    const comFaixa = new Set(f.faixa ? cobrancas.filter((c) => c.faixaDias === f.faixa).map((c) => c.clienteId) : [])
    const todos = inadimplentesDaCarteira(cobrancas)
      .filter(
        (c) =>
          (!f.carteira || c.carteiras.includes(f.carteira)) &&
          (!f.faixa || comFaixa.has(c.clienteId)) &&
          (!f.conta || c.contas.includes(f.conta)) &&
          passaNaBusca(buscaDoCliente(s, c.clienteId, c.referencias), f.termo),
      )
      .sort(ordemInadimplencia)
    return { linhas: todos.slice(de, de + porPagina), total: todos.length }
  }
  let q = sb().from('vw_inadimplentes').select(COLUNAS_INADIMPLENTES, { count: 'exact' })
  for (const t of termosBusca(f.termo)) q = q.like('busca', `%${t}%`)
  if (f.carteira) q = q.contains('carteiras', [f.carteira])
  if (f.faixa) q = q.contains('faixas', [f.faixa])
  if (f.conta) q = q.contains('contas', [f.conta])
  const { data, count, error } = await q.order('dias_atraso', { ascending: false }).order('vencido', { ascending: false }).order('cliente_id').range(de, de + porPagina - 1)
  if (error) return { linhas: [], total: 0, erro: traduzirErro(error) }
  return { linhas: ((data ?? []) as Linha[]).map(inadimplenteDoBanco), total: count ?? 0 }
}

export async function lerIndicadores(mes: string): Promise<Indicadores> {
  if (MODO !== 'supabase') return indicadoresDaCarteira(lerEstado(), mes)
  const { data, error } = await sb().rpc('indicadores_receber', { p_mes: mes })
  if (error || !data) return INDICADORES_VAZIOS
  const d = data as Linha
  return {
    emAberto: num(d.em_aberto), emAtraso: num(d.em_atraso), atualizadoAtraso: num(d.atualizado_atraso), parcelasVencidas: num(d.parcelas_vencidas),
    venceHoje: num(d.vence_hoje), emAcordo: num(d.em_acordo), parcelasAbertas: num(d.parcelas_abertas), atrasoMedio: num(d.atraso_medio),
    recebidoMes: num(d.recebido_mes), recebidoHoje: num(d.recebido_hoje), clientesSituacao: (d.clientes_situacao ?? {}) as Indicadores['clientesSituacao'],
    clientesEmAtraso: num(d.clientes_em_atraso), taxaInadimplencia: num(d.taxa_inadimplencia),
  }
}

export async function lerResumoCarteira(): Promise<ResumoCarteira[]> {
  if (MODO !== 'supabase') return resumoDaCarteira(calcularCarteira(lerEstado()).cobrancas)
  const { data, error } = await sb().rpc('resumo_cobrancas')
  if (error) return []
  return ((data ?? []) as Linha[]).map((l) => ({
    carteira: txt(l.carteira), faixaDias: txt(l.faixa_dias), cobrancas: num(l.cobrancas), clientes: num(l.clientes), vencido: num(l.vencido), atualizado: num(l.atualizado),
  }))
}

export interface FichaCarteira {
  cobrancas: CobrancaV[]
  parcelas: ParcelaV[]
  pagamentos: PagamentoV[]
  contatos?: ContatoV[]
  situacoes?: SituacaoCobranca[]
  acordos?: AcordoV[]
  erro?: string
}

// todas as cobranças de um cliente, com as parcelas e os recebimentos
export async function lerFichaCarteira(clienteId: string): Promise<FichaCarteira> {
  if (MODO !== 'supabase') {
    const s = lerEstado()
    const { cobrancas, parcelas } = calcularCarteira(s)
    const minhas = cobrancas.filter((c) => c.clienteId === clienteId)
    const ids = new Set(minhas.map((c) => c.id))
    return {
      cobrancas: minhas,
      parcelas: parcelas.filter((p) => ids.has(p.cobrancaId)),
      pagamentos: colecao(s, 'cobranca_pagamentos').filter((g) => ids.has(String(g.cobrancaId))).map(pagamentoV),
      contatos: colecao(s, 'cobranca_contatos').filter((g) => ids.has(String(g.cobrancaId))).map(contatoV),
      situacoes: situacoesDaCarteira(s, minhas),
      acordos: colecao(s, 'cobranca_acordos').filter((g) => ids.has(String(g.cobrancaId))).map((g) => acordoV(g as never)),
    }
  }
  const { data: cs, error } = await sb().from('vw_cobrancas').select('*').eq('cliente_id', clienteId).order('created_at')
  if (error) return { cobrancas: [], parcelas: [], pagamentos: [], erro: traduzirErro(error) }
  const cobrancas = ((cs ?? []) as Linha[]).map(cobrancaDoBanco)
  const ids = cobrancas.map((c) => c.id)
  if (!ids.length) return { cobrancas, parcelas: [], pagamentos: [] }
  const [ps, gs, ct, si, ac] = await Promise.all([
    sb().from('vw_cobranca_parcelas').select('*').in('cobranca_id', ids).order('numero'),
    sb().from('cobranca_pagamentos').select('*').in('cobranca_id', ids).order('data').order('created_at'),
    // contatos e situação de hoje (SQL 046); sem o SQL rodado, a ficha só não mostra o histórico
    sb().from('cobranca_contatos').select('*').in('cobranca_id', ids).order('created_at', { ascending: false }),
    sb().from('vw_cobranca_situacao').select('*').in('cobranca_id', ids),
    sb().from('cobranca_acordos').select('*').in('cobranca_id', ids).order('versao', { ascending: false }),
  ])
  return {
    cobrancas,
    parcelas: ((ps.data ?? []) as Linha[]).map(parcelaDoBanco),
    pagamentos: ((gs.data ?? []) as Linha[]).map(pagamentoDoBanco),
    contatos: ct.error ? undefined : ((ct.data ?? []) as Linha[]).map(contatoDoBanco),
    situacoes: si.error ? undefined : ((si.data ?? []) as Linha[]).map(situacaoDoBanco),
    acordos: ac.error ? undefined : ((ac.data ?? []) as Linha[]).map((l) => acordoV(l)),
    erro: ps.error ? traduzirErro(ps.error) : gs.error ? traduzirErro(gs.error) : undefined,
  }
}

// Financeiro › Vendas de Books: o que cada venda do mês já recebeu, tem em aberto e em atraso
export async function lerResumoVendas(mes: string): Promise<Map<string, ResumoVenda>> {
  if (MODO !== 'supabase') {
    const s = lerEstado()
    const doMes = new Set(colecao(s, 'vendas_ebooks').filter((v) => String(v.data).startsWith(mes)).map((v) => v.id))
    const linhas = calcularCarteira(s).cobrancas.filter((c) => doMes.has(c.vendaId))
    return new Map(
      linhas.map((c) => [c.vendaId, { vendaId: c.vendaId, parcelas: c.parcelas, parcelasPagas: c.parcelasPagas, parcelasVencidas: c.parcelasVencidas, recebido: c.recebido, emAberto: c.emAberto, vencido: c.vencido }]),
    )
  }
  const { data } = await sb().rpc('resumo_vendas_mes', { p_mes: mes })
  return new Map(
    ((data ?? []) as Linha[]).map((l) => [
      txt(l.venda_id),
      {
        vendaId: txt(l.venda_id), parcelas: num(l.parcelas), parcelasPagas: num(l.parcelas_pagas), parcelasVencidas: num(l.parcelas_vencidas),
        recebido: num(l.recebido), emAberto: num(l.em_aberto), vencido: num(l.vencido),
      },
    ]),
  )
}

// exportar: busca todas as páginas do filtro (até 20 mil linhas)
export async function todasAsPaginas<T>(buscar: (pagina: number, porPagina: number) => Promise<Pagina<T>>): Promise<T[]> {
  const saida: T[] = []
  for (let p = 0; p < 20; p++) {
    const r = await buscar(p, 1000)
    saida.push(...r.linhas)
    if (r.erro || r.linhas.length < 1000) break
  }
  return saida
}

// ---------------- ganchos das telas ----------------
// Busca de novo quando a chave muda, quando alguém grava na carteira (versão) e, na demonstração, quando os dados mudam.
function useConsulta<T>(chave: string | null, carregar: () => Promise<T>) {
  const s = useErp()
  const versao = useVersaoCarteira()
  const demo = MODO === 'supabase' ? null : s
  const k = chave === null ? null : `${chave}|${versao}`
  const [res, setRes] = useState<{ chave: string; dados: T } | null>(null)
  useEffect(() => {
    if (k === null) return
    let vale = true
    void carregar().then((dados) => {
      if (vale) setRes({ chave: k, dados })
    })
    return () => {
      vale = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, demo])
  // enquanto a busca nova não chega, o resultado anterior continua na tela
  return { dados: res?.dados ?? null, carregando: k !== null && (!res || res.chave !== k) }
}

export function useContasReceber(f: FiltroReceber, pagina: number) {
  const r = useConsulta(`receber|${JSON.stringify(f)}|${pagina}`, () => buscarContasReceber(f, pagina))
  return { linhas: r.dados?.linhas ?? [], total: r.dados?.total ?? 0, erro: r.dados?.erro, carregando: r.carregando }
}

export function useInadimplentes(f: FiltroInadimplencia, pagina: number, porPagina = POR_PAGINA_CARTEIRA) {
  const r = useConsulta(`inad|${JSON.stringify(f)}|${pagina}|${porPagina}`, () => buscarInadimplentes(f, pagina, porPagina))
  return { linhas: r.dados?.linhas ?? [], total: r.dados?.total ?? 0, erro: r.dados?.erro, carregando: r.carregando }
}

export function useIndicadores(mes: string) {
  return useConsulta(`ind|${mes}`, () => lerIndicadores(mes)).dados ?? INDICADORES_VAZIOS
}

export function useResumoCarteira() {
  return useConsulta('resumo', lerResumoCarteira).dados ?? []
}

export function useFichaCarteira(clienteId: string | null) {
  const r = useConsulta(clienteId ? `ficha|${clienteId}` : null, () => lerFichaCarteira(clienteId ?? ''))
  return { ficha: r.dados, carregando: r.carregando }
}

export function useResumoVendas(mes: string) {
  return useConsulta(`vendas|${mes}`, () => lerResumoVendas(mes)).dados ?? new Map<string, ResumoVenda>()
}

export function useParaHoje() {
  return useConsulta('para-hoje', lerParaHoje)
}

// tabela de condições por faixa (SQL 047; sugestão na simulação)
export async function lerCondicoesFaixa(): Promise<CondicaoFaixa[]> {
  if (MODO !== 'supabase') {
    const salvas = colecao(lerEstado(), 'cobranca_condicoes_faixa')
    return salvas.length ? (salvas as unknown as CondicaoFaixa[]) : CONDICOES_PADRAO
  }
  const { data, error } = await sb().from('cobranca_condicoes_faixa').select('*').order('faixa').order('condicao')
  if (error || !data?.length) return CONDICOES_PADRAO
  return (data as Linha[]).map((l) => ({ faixa: Number(l.faixa), condicao: Number(l.condicao), entradaPct: Number(l.entrada_pct), descJurosPct: Number(l.desc_juros_pct), descPrincipalPct: Number(l.desc_principal_pct) }))
}
export function useCondicoesFaixa() {
  return useConsulta('condicoes-faixa', lerCondicoesFaixa).dados ?? CONDICOES_PADRAO
}

// Financeiro › Acordos da Cobrança (SQL 048): acordos fechados, do mais urgente ao mais antigo
const SITUACOES_FIN = ['Aguardando entrada', 'Entrada confirmada', 'Efetivada', 'Quebrada']
export async function lerAcordosFinanceiro(): Promise<AcordoFin[]> {
  if (MODO !== 'supabase') {
    const s = lerEstado()
    const clientes = new Map(colecao(s, 'clientes').map((c) => [String(c.id), c]))
    const cobrancas = new Map(colecao(s, 'cobrancas').map((c) => [String(c.id), c]))
    const hj = new Date().toISOString().slice(0, 10)
    return colecao(s, 'cobranca_acordos')
      .filter((a) => SITUACOES_FIN.includes(String(a.situacao)))
      .map((a) => {
        const cl = clientes.get(String(a.clienteId))
        return acordoFin({
          ...a, cliente: cl?.nome, documento: cl?.documento, telefone: cl?.whatsapp || cl?.telefone1, codigoVenda: cobrancas.get(String(a.cobrancaId))?.codigoVenda,
          pagador: a.pagadorTipo === 'Titular' ? cl?.nome : a.pagadorNome, entradaVencida: a.situacao === 'Aguardando entrada' && String(a.entradaPrazo) < hj,
        } as never)
      })
      .sort((a, b) => a.entradaPrazo.localeCompare(b.entradaPrazo))
  }
  const { data, error } = await sb().from('vw_acordos_financeiro').select('*').order('entrada_prazo', { nullsFirst: false }).limit(1000)
  if (error) return []
  return ((data ?? []) as Linha[]).map((l) => acordoFin(l))
}
export function useAcordosFinanceiro() {
  return useConsulta('acordos-financeiro', lerAcordosFinanceiro)
}

// Painel da Cobrança (SQL 049): comissão, meta SPC e indicadores do mês
export async function lerPainelCobranca(mes: string, cobradorId = ''): Promise<PainelCobranca | null> {
  if (MODO !== 'supabase') return painelDaCarteira(lerEstado(), mes, cobradorId)
  const { data, error } = await sb().rpc('painel_cobranca', { p_mes: mes, p_cobrador: cobradorId || null })
  if (error || !data) return null
  return painelDoBanco(data as Record<string, unknown>)
}
export function usePainelCobranca(mes: string, cobradorId = '') {
  return useConsulta(`painel-cobranca|${mes}|${cobradorId}`, () => lerPainelCobranca(mes, cobradorId)).dados
}

// SPC (SQL 050): a fila (elegíveis + quem já está no fluxo + ficha não encontrada)
export async function lerFilaSpc(): Promise<LinhaSpc[]> {
  if (MODO !== 'supabase') return filaSpcDaCarteira(lerEstado())
  const linhas: LinhaSpc[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb().from('vw_cobranca_spc').select('*').order('dias_atraso', { ascending: false }).range(de, de + 999)
    if (error) return linhas
    linhas.push(...((data ?? []) as Linha[]).map(linhaSpcDoBanco))
    if (!data || data.length < 1000) return linhas
  }
}
export function useFilaSpc() {
  return useConsulta('fila-spc', lerFilaSpc)
}

// conferência com a planilha oficial (o cruzamento é feito no banco; só sobem CPF/CNPJ e contrato)
export async function conferirPlanilhaSpc(linhas: { documento: string; contrato: string }[]): Promise<{ naPlanilha: ResultadoPlanilha[]; foraDaPlanilha: ResultadoPlanilha[]; erro?: string }> {
  if (MODO !== 'supabase') return conferirPlanilhaDemo(lerEstado(), linhas)
  const { data, error } = await sb().rpc('conferir_planilha_spc', { p_linhas: linhas })
  if (error) return { naPlanilha: [], foraDaPlanilha: [], erro: traduzirErro(error) }
  const j = (data ?? {}) as { na_planilha?: Linha[]; fora_da_planilha?: Linha[] }
  return { naPlanilha: (j.na_planilha ?? []).map(resultadoDoBanco), foraDaPlanilha: (j.fora_da_planilha ?? []).map(resultadoDoBanco) }
}

// "Para hoje": marcados para o SPC que o Financeiro ainda não enviou (SQL 050)
export async function lerSpcPendentes(): Promise<{ cobrancaId: string; cliente: string; conta: string; vencido: number; marcadoEm: string }[]> {
  if (MODO !== 'supabase')
    return filaSpcDaCarteira(lerEstado())
      .filter((l) => l.spcEstado === 'Inclusão marcada')
      .map((l) => ({ cobrancaId: l.cobrancaId, cliente: l.cliente, conta: l.conta, vencido: l.vencido, marcadoEm: l.spcMarcadoEm }))
  const { data, error } = await sb().from('vw_cobranca_spc_pendente').select('*').order('spc_marcado_em').limit(300)
  if (error) return []
  return ((data ?? []) as Linha[]).map((l) => ({ cobrancaId: String(l.cobranca_id), cliente: String(l.cliente ?? ''), conta: String(l.conta ?? ''), vencido: Number(l.vencido) || 0, marcadoEm: String(l.spc_marcado_em ?? '') }))
}
export function useSpcPendentes() {
  return useConsulta('spc-pendentes', lerSpcPendentes).dados ?? []
}
