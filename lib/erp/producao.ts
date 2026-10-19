// PRODUÇÃO (setor 'edicao' por dentro): controle das fotos de cada escola até a Revelação.
// Cada visita encerrada nas Operações vira um LOTE (uma linha, como na planilha antiga), que passa por 6 etapas
// (SQLs 058 e 060, 19/10/2026 — na tela vale NOME_ETAPA; no banco as etapas guardam os nomes antigos):
//   1 Conferência Operações (as Operações lançam fotos e link) → 2 Em edição (editor) → 3 Conferência Produção →
//   4 Conferência Beatriz (ADM; libera para a Revelação) → 5 Revelando → 6 Na caixa (estoque).
// Saíram: "Pronto para conferência Beatriz" (juntou com a Conferência Beatriz) e "No HD" ("Aguardando revelação").
// 1 aluno = 1 álbum (o número dá para ajustar); pôster fica anotado à parte e não conta na meta.

import type { ErpState, Registro, Tom } from './types'
import { colecao } from './metrics'
import { diaLocal } from './format'
import { diasUteisDepois } from './calendario'
import { estoqueAgora, variacaoEstoqueHoje } from './estoque'

export const ETAPAS_LOTE = ['Aguardando fotos', 'Em edição', 'Análise de qualidade', 'Conferência final', 'Revelando', 'Na caixa'] as const
export type EtapaLote = (typeof ETAPAS_LOTE)[number]

// O nome que aparece nas telas (pedido de 19/10/2026: o fluxo da Produção com os nomes da empresa)
export const NOME_ETAPA: Record<EtapaLote, string> = {
  'Aguardando fotos': 'Conferência Operações',
  'Em edição': 'Em edição',
  'Análise de qualidade': 'Conferência Produção',
  'Conferência final': 'Conferência Beatriz',
  Revelando: 'Revelando',
  'Na caixa': 'Na caixa',
}
export const nomeEtapa = (etapa: unknown) => NOME_ETAPA[normalizarEtapa(etapa)] ?? String(etapa ?? '')
// etapa gravada antes dos SQLs 058/060 (no histórico): "Pronto para conferência Beatriz" agora é a Conferência Beatriz
// e "Aguardando revelação" (No HD) agora é Revelando
export const normalizarEtapa = (etapa: unknown): EtapaLote => {
  const e = String(etapa ?? '')
  if (e === 'Pronto para conferência Beatriz') return 'Conferência final'
  if (e === 'Aguardando revelação') return 'Revelando'
  return ETAPAS_LOTE.includes(e as EtapaLote) ? (e as EtapaLote) : 'Aguardando fotos'
}

// Etapas sem cor (regra do ADM: cor só para alerta). O atraso e a escola parada é que ganham amarelo/vermelho.
export const TOM_ETAPA: Record<EtapaLote, Tom> = {
  'Aguardando fotos': 'zinc',
  'Em edição': 'zinc',
  'Análise de qualidade': 'zinc',
  'Conferência final': 'zinc',
  Revelando: 'zinc',
  'Na caixa': 'zinc',
}

// Selo da etapa nas telas da Produção (regra das situações): andando no prazo ou pronta = verde •
// aguardando alguém = amarelo • editor atrasado ou parada além do prazo da etapa = vermelho
const COR_ETAPA: Record<EtapaLote, Tom> = {
  'Aguardando fotos': 'yellow',
  'Em edição': 'emerald',
  'Análise de qualidade': 'yellow',
  'Conferência final': 'yellow',
  Revelando: 'emerald',
  'Na caixa': 'emerald',
}
export const corDaEtapa = (etapa: EtapaLote, foraDoPrazo: boolean): Tom => (foraDoPrazo ? 'red' : COR_ETAPA[etapa])

// Etapas em que a Produção ainda está trabalhando (o resto já foi entregue à Revelação)
export const ETAPAS_EM_PRODUCAO: EtapaLote[] = ['Aguardando fotos', 'Em edição', 'Análise de qualidade', 'Conferência final']

// Bônus de cada colaboradora (regra do dono): 1.000 álbuns no mês → R$ 300; + R$ 30 a cada 100 COMPLETOS acima.
// Ex.: 999 → 0 • 1.000 a 1.099 → 300 • 1.100 → 330 • 1.500 → 450
export const META_BONUS = 1000
export function bonusAlbuns(albuns: number): number {
  if (albuns < META_BONUS) return 0
  return 300 + Math.floor((albuns - META_BONUS) / 100) * 30
}
// Quanto falta para o próximo degrau do bônus (chegar nos 1.000 ou nos próximos +100)
export function proximoBonus(albuns: number): { faltam: number; valor: number } {
  if (albuns < META_BONUS) return { faltam: META_BONUS - albuns, valor: 300 }
  const proximo = META_BONUS + (Math.floor((albuns - META_BONUS) / 100) + 1) * 100
  return { faltam: proximo - albuns, valor: 30 }
}

export const lotesProducao = (s: ErpState) => colecao(s, 'producao_lotes')
export const etapaDoLote = (l: Registro) => normalizarEtapa(l.etapa)
export const indiceEtapa = (l: Registro) => ETAPAS_LOTE.indexOf(etapaDoLote(l))

// Botões de cada etapa (as mesmas regras do banco: SQL 058, producao_avancar)
export type AcaoLote =
  | 'fotos'
  | 'enviar_editor'
  | 'editor_devolveu'
  | 'aprovar_qualidade' // Conferência Produção aprovada: já vai para a Conferência Beatriz
  | 'reprovar_qualidade' // Conferência Produção: reenvia ao editor
  | 'confirmar' // Conferência Beatriz: só o ADM — libera para a Revelação (já fica Revelando)
  | 'reprovar_conferencia' // Conferência Beatriz recusa: volta para a Conferência Produção
  | 'na_caixa'
export interface DadosAcaoLote {
  editorId?: string
  quantidade?: number // álbuns que voltam para o editor
  motivo?: string
  analistaId?: string // quem fez a análise de qualidade (quando o ADM/Gerência aprova por ela)
  prevista?: string // data prevista da entrega do editor (ao enviar e ao devolver álbuns reprovados)
  data?: string // data do recebimento do editor
  drive?: string // drive do envio / do recebimento / do envio à conferência (texto livre: OneDrive, Google Drive...)
}

// Dias de atraso do editor: passou da data prevista e a escola continua "Em edição" (0 = no prazo / sem prazo)
export function diasAtraso(l: Registro, hojeISO: string): number {
  const prevista = String(l.entregaPrevista ?? '')
  if (etapaDoLote(l) !== 'Em edição' || !prevista || prevista >= hojeISO) return 0
  return Math.round((Date.parse(hojeISO) - Date.parse(prevista)) / 86400000)
}
// Em que etapa a escola precisa estar para cada botão
export const ETAPA_DA_ACAO: Record<AcaoLote, EtapaLote> = {
  fotos: 'Aguardando fotos',
  enviar_editor: 'Aguardando fotos',
  editor_devolveu: 'Em edição',
  aprovar_qualidade: 'Análise de qualidade',
  reprovar_qualidade: 'Análise de qualidade',
  confirmar: 'Conferência final',
  reprovar_conferencia: 'Conferência final',
  na_caixa: 'Revelando',
}

// ---- Estoque: caixas que a Revelação solta (cada escola pode ter várias) ----
export const ETAPAS_REVELACAO: EtapaLote[] = ['Revelando', 'Na caixa']
export const caixasDoLote = (s: ErpState, loteId: string) =>
  colecao(s, 'producao_caixas')
    .filter((c) => c.loteId === loteId && !c.origemCargaId) // a caixa da volta de carga (056) é do Financeiro, não da Revelação
    .sort((a, b) => Number(a.numero) - Number(b.numero))
// Comprovante: uma cor para cada CIDADE (para achar as caixas no estoque físico). Mesma lista e ordem do SQL 024.
export const PALETA_CIDADES: { cor: string; nome: string }[] = [
  { cor: '#7E2F5B', nome: 'Vinho' },
  { cor: '#1D4ED8', nome: 'Azul' },
  { cor: '#15803D', nome: 'Verde' },
  { cor: '#C2410C', nome: 'Laranja' },
  { cor: '#6D28D9', nome: 'Roxo' },
  { cor: '#B91C1C', nome: 'Vermelho' },
  { cor: '#0F766E', nome: 'Azul-petróleo' },
  { cor: '#78350F', nome: 'Marrom' },
  { cor: '#BE185D', nome: 'Rosa' },
  { cor: '#1E3A8A', nome: 'Azul-marinho' },
  { cor: '#4D7C0F', nome: 'Verde-oliva' },
  { cor: '#0E7490', nome: 'Turquesa' },
  { cor: '#86198F', nome: 'Púrpura' },
  { cor: '#374151', nome: 'Cinza-escuro' },
  { cor: '#9A3412', nome: 'Terracota' },
  { cor: '#111111', nome: 'Preto' },
]
export const chaveCidade = (cidade: unknown, uf: unknown) => `${String(cidade ?? '').trim().toLowerCase()}|${String(uf ?? '').trim().toUpperCase()}`
export const nomeDaCor = (cor: string) => PALETA_CIDADES.find((p) => p.cor.toLowerCase() === cor.toLowerCase())?.nome ?? 'Cor'
export function corDaCidade(s: ErpState, cidade: unknown, uf: unknown): { cor: string; nome: string } {
  const reg = colecao(s, 'producao_cores_cidade').find((c) => c.chave === chaveCidade(cidade, uf))
  const cor = reg ? String(reg.cor) : PALETA_CIDADES[0].cor // cidade sem caixa ainda
  return { cor, nome: nomeDaCor(cor) }
}

// ---- Visão TV: as etapas como na planilha da empresa ----
// As 7 etapas com os nomes da empresa (19/10/2026, SQL 058). Sem cor por etapa (regra do ADM): a linha só fica
// vermelha com editor atrasado e amarela com escola parada além do prazo (dias úteis na mesma etapa).
// Cada linha: álbuns, escolas e a VARIAÇÃO de hoje (agora × como estava no fim de ontem, pelo histórico das escolas).
// "Na caixa" conta só as escolas que chegaram na caixa no mês (senão soma todas desde o começo).
export const ETAPAS_PAINEL: { nome: string; descricao: string; etapas: EtapaLote[]; prazo: number | null }[] = [
  { nome: 'Conferência Operações', descricao: 'aguardando as Operações lançarem fotos e link', etapas: ['Aguardando fotos'], prazo: 2 },
  { nome: 'Em edição', descricao: 'fotos que estão com os editores', etapas: ['Em edição'], prazo: null }, // aqui vale a data prevista do editor
  { nome: 'Conferência Produção', descricao: 'a Produção confere e manda para a Beatriz', etapas: ['Análise de qualidade'], prazo: 3 },
  { nome: 'Conferência Beatriz', descricao: 'a Beatriz confere e libera o HD', etapas: ['Conferência final'], prazo: 3 },
  { nome: 'Revelando', descricao: 'fotos que estão em revelação', etapas: ['Revelando'], prazo: null },
  // o estoque de agora (os mesmos números do Financeiro › Estoque e Cargas): caixas conferidas que não saíram com vendedor
  { nome: 'Na caixa', descricao: 'prontas na caixa, no estoque', etapas: ['Na caixa'], prazo: null },
]
const grupoDaEtapa = (e: EtapaLote) => ETAPAS_PAINEL.findIndex((p) => p.etapas.includes(e))

export interface LinhaPainel {
  nome: string
  descricao: string
  albuns: number
  escolas: number
  variacao: number | null // null = mês que não é o atual (a variação é sempre de hoje)
  atrasadas: number // Em edição: escolas com o editor fora do prazo (vermelho)
  paradas: number // escolas paradas na etapa além do prazo (amarelo)
  prazo: number | null // dias úteis que a escola pode ficar na etapa
}

// histórico de cada escola, do mais antigo para o mais novo
export function historicoPorLote(s: ErpState) {
  const m = new Map<string, Registro[]>()
  for (const h of colecao(s, 'producao_historico')) m.set(String(h.loteId), [...(m.get(String(h.loteId)) ?? []), h])
  for (const lista of m.values()) lista.sort((a, b) => String(a.data).localeCompare(String(b.data)))
  return m
}

// Desde quando a escola está na etapa do painel em que está agora (pelo histórico; sem histórico, pela data da etapa)
const DATA_DA_ETAPA: Record<EtapaLote, string> = {
  'Aguardando fotos': 'dataFoto',
  'Em edição': 'enviadoEditorEm',
  'Análise de qualidade': 'devolvidoEditorEm',
  'Conferência final': 'aprovadoQualidadeEm',
  Revelando: 'revelandoEm',
  'Na caixa': 'naCaixaEm',
}
export function desdeNaEtapa(l: Registro, historico: Registro[] = []): string {
  const grupo = grupoDaEtapa(etapaDoLote(l))
  let desde = ''
  for (const h of historico) {
    const e = ETAPAS_LOTE.includes(normalizarEtapa(h.etapa)) && h.etapa ? grupoDaEtapa(normalizarEtapa(h.etapa)) : -1
    if (e === grupo) desde ||= diaLocal(String(h.data))
    else desde = ''
  }
  return desde || String(l[DATA_DA_ETAPA[etapaDoLote(l)]] || l.dataFoto || '').slice(0, 10)
}

// Escolas paradas além do prazo da etapa (amarelo no card da Produção e no gerente virtual)
export interface EscolaParada {
  lote: Registro
  etapa: string // nome da etapa no painel
  desde: string
  dias: number // dias úteis na etapa
  prazo: number
}
export function escolasParadas(s: ErpState, hojeISO: string, historico = historicoPorLote(s)): EscolaParada[] {
  const lista: EscolaParada[] = []
  for (const l of lotesProducao(s)) {
    const p = ETAPAS_PAINEL[grupoDaEtapa(etapaDoLote(l))]
    if (!p?.prazo) continue
    const desde = desdeNaEtapa(l, historico.get(l.id))
    if (!desde) continue
    const dias = diasUteisDepois(desde, hojeISO)
    if (dias > p.prazo) lista.push({ lote: l, etapa: p.nome, desde, dias, prazo: p.prazo })
  }
  return lista.sort((a, b) => b.dias - a.dias)
}

// Linha "Atrasadas" do card: escolas com o editor fora da data prevista + escolas paradas além do prazo da etapa
export interface AtrasadasPainel {
  albuns: number
  escolas: number
  editor: number // escolas com o editor atrasado (vermelho)
  paradas: number // escolas paradas além do prazo (amarelo)
}

export function painelEtapas(
  s: ErpState,
  mes: string,
  hojeISO: string,
): { linhas: LinhaPainel[]; total: { albuns: number; escolas: number; variacao: number | null }; atrasadas: AtrasadasPainel } {
  const lotes = lotesProducao(s)
  const historico = historicoPorLote(s)
  const paradas = new Set(escolasParadas(s, hojeISO, historico).map((x) => x.lote.id))
  const valida = (e: unknown) => (ETAPAS_LOTE.includes(String(e) as EtapaLote) ? (String(e) as EtapaLote) : null)
  // etapa no fim de ontem: a última do histórico antes de hoje • escola que entrou hoje: não existia • sem histórico: como está
  const etapaOntem = (l: Registro): EtapaLote | null => {
    const h = historico.get(l.id) ?? []
    if (!h.length) return etapaDoLote(l)
    const antes = h.filter((x) => diaLocal(String(x.data)) < hojeISO)
    return antes.length ? (valida(antes[antes.length - 1].etapa) ?? etapaDoLote(l)) : null
  }
  const atual = mes === hojeISO.slice(0, 7)
  const linhas = ETAPAS_PAINEL.map((p): LinhaPainel => {
    // na caixa = o estoque de agora (o mesmo do Estoque e Cargas: sai quando vai na carga do vendedor);
    // o "Hoje" é o que entrou no estoque menos o que saiu
    if (p.etapas.includes('Na caixa')) {
      const e = estoqueAgora(s)
      return { nome: p.nome, descricao: p.descricao, albuns: e.albuns, escolas: e.escolas, variacao: atual ? variacaoEstoqueHoje(s, hojeISO) : null, atrasadas: 0, paradas: 0, prazo: p.prazo }
    }
    const agora = lotes.filter((l) => p.etapas.includes(etapaDoLote(l)))
    const albuns = agora.reduce((a, l) => a + (Number(l.albuns) || 0), 0)
    let variacao: number | null = null
    if (atual) {
      // agora − fim de ontem
      const ontem = lotes.filter((l) => {
        const e = etapaOntem(l)
        return e !== null && p.etapas.includes(e)
      })
      variacao = albuns - ontem.reduce((a, l) => a + (Number(l.albuns) || 0), 0)
    }
    return {
      nome: p.nome,
      descricao: p.descricao,
      albuns,
      escolas: agora.length,
      variacao,
      atrasadas: agora.filter((l) => diasAtraso(l, hojeISO) > 0).length,
      paradas: agora.filter((l) => paradas.has(l.id)).length,
      prazo: p.prazo,
    }
  })
  const semCaixa = linhas.slice(0, -1)
  const comEditorAtrasado = lotes.filter((l) => diasAtraso(l, hojeISO) > 0)
  const foraDoPrazo = lotes.filter((l) => diasAtraso(l, hojeISO) > 0 || paradas.has(l.id))
  return {
    linhas,
    atrasadas: {
      albuns: foraDoPrazo.reduce((a, l) => a + (Number(l.albuns) || 0), 0),
      escolas: foraDoPrazo.length,
      editor: comEditorAtrasado.length,
      paradas: foraDoPrazo.length - comEditorAtrasado.length,
    },
    total: {
      albuns: semCaixa.reduce((a, x) => a + x.albuns, 0),
      escolas: semCaixa.reduce((a, x) => a + x.escolas, 0),
      variacao: atual ? semCaixa.reduce((a, x) => a + (x.variacao ?? 0), 0) : null,
    },
  }
}

// ---- Fotos de cada fotógrafo na escola (a Produção lança) ----
// (SQL 057) a escola na Produção que veio desta visita
export const loteDaVisita = (s: ErpState, visitaId: string) => colecao(s, 'producao_lotes').find((l) => l.visitaId === visitaId)
// visitas encerradas cuja escola espera as Operações lançarem as fotos e o link
export const fotosPendentes = (s: ErpState) => {
  const visitas = new Map(colecao(s, 'agenda_visitas').map((v) => [v.id, v]))
  return colecao(s, 'producao_lotes')
    .filter((l) => !l.fotosLink && etapaDoLote(l) === 'Aguardando fotos' && visitas.has(String(l.visitaId)))
    .map((l) => ({ lote: l, visita: visitas.get(String(l.visitaId))! }))
    .sort((a, b) => String(a.visita.data).localeCompare(String(b.visita.data)))
}
export const fotosDoLote = (s: ErpState, loteId: string) =>
  colecao(s, 'producao_fotos')
    .filter((f) => f.loteId === loteId)
    .sort((a, b) => String(a.fotografoNome).localeCompare(String(b.fotografoNome), 'pt-BR'))
export interface FotografoDaEscola {
  id: string
  nome: string
  naEquipe: boolean // estava na equipe da visita (Operações)
}
// Demo: a mesma lista do banco (SQL 025, producao_fotografos): os da equipe da visita primeiro; inativos só se estavam na equipe
export function fotografosDaEscola(s: ErpState, loteId: string): FotografoDaEscola[] {
  const l = lotesProducao(s).find((x) => x.id === loteId)
  const v = l ? colecao(s, 'agenda_visitas').find((x) => x.id === l.visitaId) : undefined
  const equipe = String(v?.fotografoIds ?? '').split(',').filter(Boolean)
  return colecao(s, 'freelancers')
    .filter((f) => f.tipo === 'Fotógrafo' && (f.status === 'Ativo' || equipe.includes(f.id)))
    .map((f) => ({ id: f.id, nome: String(f.nome), naEquipe: equipe.includes(f.id) }))
    .sort((a, b) => Number(b.naEquipe) - Number(a.naEquipe) || a.nome.localeCompare(b.nome, 'pt-BR'))
}

export const fichasDoLote = (s: ErpState, loteId: string) =>
  colecao(s, 'producao_fichas')
    .filter((f) => f.loteId === loteId)
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }))

// Visitas já encerradas que ainda não estão na Produção (para trazer as escolas que estavam em andamento)
export function visitasForaDaProducao(s: ErpState) {
  const jaEstao = new Set(lotesProducao(s).map((l) => String(l.visitaId)))
  return colecao(s, 'agenda_visitas')
    .filter((v) => (v.status === 'Fotografada' || v.status === 'Fechamento enviado') && !jaEstao.has(v.id))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))
}
