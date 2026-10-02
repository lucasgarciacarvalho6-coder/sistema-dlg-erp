// PRODUÇÃO (setor 'edicao' por dentro): controle das fotos de cada escola até a Revelação.
// Cada visita encerrada nas Operações vira um LOTE (uma linha, como na planilha antiga), que passa pelas etapas:
//   Aguardando fotos → Em edição (editor) → Análise de qualidade → Conferência final (ADM) →
//   Aguardando revelação → Revelando (a Revelação pegou o HD) → Na caixa (já revelado).
// 1 aluno = 1 álbum (o número dá para ajustar); pôster fica anotado à parte e não conta na meta.

import type { ErpState, Registro, Tom } from './types'
import { colecao } from './metrics'

export const ETAPAS_LOTE = ['Aguardando fotos', 'Em edição', 'Análise de qualidade', 'Conferência final', 'Aguardando revelação', 'Revelando', 'Na caixa'] as const
export type EtapaLote = (typeof ETAPAS_LOTE)[number]

export const TOM_ETAPA: Record<EtapaLote, Tom> = {
  'Aguardando fotos': 'zinc',
  'Em edição': 'blue',
  'Análise de qualidade': 'yellow',
  'Conferência final': 'violet',
  'Aguardando revelação': 'orange',
  Revelando: 'cyan',
  'Na caixa': 'emerald',
}

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
export const etapaDoLote = (l: Registro) => (ETAPAS_LOTE.includes(String(l.etapa) as EtapaLote) ? (String(l.etapa) as EtapaLote) : 'Aguardando fotos')
export const indiceEtapa = (l: Registro) => ETAPAS_LOTE.indexOf(etapaDoLote(l))

// Botões de cada etapa (as mesmas regras do banco: SQL 021, producao_avancar)
export type AcaoLote =
  | 'fotos'
  | 'enviar_editor'
  | 'editor_devolveu'
  | 'aprovar_qualidade'
  | 'reprovar_qualidade'
  | 'confirmar' // conferência final: só o ADM
  | 'reprovar_conferencia' // conferência final: só o ADM
  | 'revelando'
  | 'na_caixa'
export interface DadosAcaoLote {
  editorId?: string
  quantidade?: number // álbuns que voltam para o editor
  motivo?: string
  analistaId?: string // quem fez a análise de qualidade (quando o ADM/Gerência aprova por ela)
  prevista?: string // data prevista da entrega do editor (ao enviar e ao devolver álbuns reprovados)
  data?: string // data do recebimento do editor
  drive?: string // drive do envio / do recebimento (texto livre: OneDrive, Google Drive...)
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
  revelando: 'Aguardando revelação',
  na_caixa: 'Revelando',
}

// ---- Estoque: caixas que a Revelação solta (cada escola pode ter várias) ----
export const ETAPAS_REVELACAO: EtapaLote[] = ['Aguardando revelação', 'Revelando', 'Na caixa']
export const caixasDoLote = (s: ErpState, loteId: string) =>
  colecao(s, 'producao_caixas')
    .filter((c) => c.loteId === loteId)
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
// 6 linhas com os nomes que a empresa usa (a análise de qualidade e a conferência final ficam juntas em
// "Aguardando aprovação (pagamento)"), nas cores da planilha.
// Cada linha: álbuns, escolas e a VARIAÇÃO de hoje (agora × como estava no fim de ontem, pelo histórico das escolas).
// "Na caixa" conta só as escolas que chegaram na caixa no mês (senão soma todas desde o começo).
export const ETAPAS_PAINEL: { nome: string; descricao: string; cor: string; etapas: EtapaLote[] }[] = [
  { nome: 'Aguardando envio editor', descricao: 'fotos que os fotógrafos mandam depois das sessões', cor: '#EAB308', etapas: ['Aguardando fotos'] },
  { nome: 'Em edição', descricao: 'fotos que estão com os editores', cor: '#94A3B8', etapas: ['Em edição'] },
  { nome: 'Aguardando aprovação (pagamento)', descricao: 'análise de qualidade e conferência final', cor: '#3B82F6', etapas: ['Análise de qualidade', 'Conferência final'] },
  { nome: 'Aguardando revelação', descricao: 'fotos que estão no HD', cor: '#F97316', etapas: ['Aguardando revelação'] },
  { nome: 'Revelando', descricao: 'fotos que estão em revelação', cor: '#D946EF', etapas: ['Revelando'] },
  { nome: 'Na caixa', descricao: 'prontas na caixa, no estoque', cor: '#22C55E', etapas: ['Na caixa'] },
]

export interface LinhaPainel {
  nome: string
  descricao: string
  cor: string
  albuns: number
  escolas: number
  variacao: number | null // null = mês que não é o atual (a variação é sempre de hoje)
  atrasadas: number // Em edição: escolas com o editor fora do prazo
}

// dia (no fuso local) de uma data/hora do histórico
const diaLocal = (iso: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso // só a data: já é o dia
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function painelEtapas(s: ErpState, mes: string, hojeISO: string): { linhas: LinhaPainel[]; total: { albuns: number; escolas: number; variacao: number | null } } {
  const lotes = lotesProducao(s)
  const historico = new Map<string, Registro[]>()
  for (const h of colecao(s, 'producao_historico')) historico.set(String(h.loteId), [...(historico.get(String(h.loteId)) ?? []), h])
  for (const lista of historico.values()) lista.sort((a, b) => String(a.data).localeCompare(String(b.data)))
  const valida = (e: unknown) => (ETAPAS_LOTE.includes(String(e) as EtapaLote) ? (String(e) as EtapaLote) : null)
  // etapa no fim de ontem: a última do histórico antes de hoje • escola que entrou hoje: não existia • sem histórico: como está
  const etapaOntem = (l: Registro): EtapaLote | null => {
    const h = historico.get(l.id) ?? []
    if (!h.length) return etapaDoLote(l)
    const antes = h.filter((x) => diaLocal(String(x.data)) < hojeISO)
    return antes.length ? (valida(antes[antes.length - 1].etapa) ?? etapaDoLote(l)) : null
  }
  // dia em que a escola chegou na caixa (a data da escola ou, se faltar, o histórico)
  const diaNaCaixa = (l: Registro) => {
    if (l.naCaixaEm) return String(l.naCaixaEm).slice(0, 10)
    const h = (historico.get(l.id) ?? []).filter((x) => x.etapa === 'Na caixa')
    return h.length ? diaLocal(String(h[h.length - 1].data)) : ''
  }
  const atual = mes === hojeISO.slice(0, 7)
  const linhas = ETAPAS_PAINEL.map((p): LinhaPainel => {
    const caixa = p.etapas.includes('Na caixa')
    const agora = lotes.filter((l) => p.etapas.includes(etapaDoLote(l)) && (!caixa || diaNaCaixa(l).slice(0, 7) === mes))
    const albuns = agora.reduce((a, l) => a + (Number(l.albuns) || 0), 0)
    let variacao: number | null = null
    if (atual) {
      // na caixa: o que chegou hoje • as outras: agora − fim de ontem
      if (caixa) variacao = agora.filter((l) => diaNaCaixa(l) === hojeISO).reduce((a, l) => a + (Number(l.albuns) || 0), 0)
      else {
        const ontem = lotes.filter((l) => {
          const e = etapaOntem(l)
          return e !== null && p.etapas.includes(e)
        })
        variacao = albuns - ontem.reduce((a, l) => a + (Number(l.albuns) || 0), 0)
      }
    }
    return { ...p, albuns, escolas: agora.length, variacao, atrasadas: agora.filter((l) => diasAtraso(l, hojeISO) > 0).length }
  })
  const semCaixa = linhas.slice(0, -1)
  return {
    linhas,
    total: {
      albuns: semCaixa.reduce((a, x) => a + x.albuns, 0),
      escolas: semCaixa.reduce((a, x) => a + x.escolas, 0),
      variacao: atual ? semCaixa.reduce((a, x) => a + (x.variacao ?? 0), 0) : null,
    },
  }
}

// ---- Fotos de cada fotógrafo na escola (a Produção lança) ----
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
