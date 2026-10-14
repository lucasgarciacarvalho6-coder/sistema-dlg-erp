// Cobrança › Configurações (SQL 039): regras de negociação editáveis, grupos das categorias, situações e tipos de contato.
// As regras ficam na tabela cobranca_regras (uma linha por regra); ADM e Gerência mudam e cada mudança fica no histórico.
// Regras de 07/10/2026 (Manual de Cobrança do sistema antigo + decisões do usuário): desconto até 10% SEM aprovação,
// entrada sugerida R$ 200 (a cobradora pode digitar menos), parcela mínima R$ 100 sem teto de parcelas, juros R$ 0,17/dia
// por parcela vencida, 1º boleto no dia 10 (acordo depois do dia 20 pula um mês), meta SPC por cobradora.

import type { ErpState, Tom } from './types'
import { colecao } from './metrics'

export type UnidadeRegra = 'brl' | 'pct' | 'dias' | 'dia' | 'qtd'
export interface RegraCobranca {
  chave: string
  grupo: string
  label: string
  unidade: UnidadeRegra
  padrao: number
  ajuda?: string
}

const regra = (chave: string, grupo: string, label: string, unidade: UnidadeRegra, padrao: number, ajuda?: string): RegraCobranca => ({ chave, grupo, label, unidade, padrao, ajuda })

export const FAIXAS_COMISSAO = ['1-2 parcelas', '3-4 parcelas', '5-6 parcelas', '7+ parcelas'] as const
export const chaveComissao = (nivel: 1 | 2 | 3, faixa: 1 | 2 | 3 | 4) => `comissao_n${nivel}_f${faixa}`
const PERCENTUAIS: Record<1 | 2 | 3, number[]> = { 1: [1, 1.5, 2, 2.5], 2: [2, 2.5, 3, 3.5], 3: [2.25, 2.75, 3.25, 3.75] }

export const REGRAS_COBRANCA: RegraCobranca[] = [
  regra('juros_dia', 'Juros e multa', 'Juros por dia de atraso', 'brl', 0.17, 'Valor fixo por dia, em cada parcela vencida (não é percentual).'),
  regra('multa_padrao', 'Juros e multa', 'Multa padrão por parcela', 'brl', 4, 'Quando a parcela não traz a própria multa.'),
  regra('entrada_sugerida', 'Entrada e parcelas', 'Entrada sugerida', 'brl', 200, 'A cobradora pode digitar menos. Entrada em PIX ou cartão.'),
  regra('parcela_minima', 'Entrada e parcelas', 'Valor mínimo da parcela', 'brl', 100, 'Não há teto de parcelas; só este mínimo.'),
  regra('desconto_maximo', 'Entrada e parcelas', 'Desconto máximo sem aprovação', 'pct', 10, 'À vista ou parcelado; a cobradora aplica sem pedir aprovação.'),
  regra('primeiro_boleto_dia', '1º boleto do acordo', 'Dia do vencimento', 'dia', 10),
  regra('primeiro_boleto_corte', '1º boleto do acordo', 'Acordo depois deste dia pula um mês', 'dia', 20, 'Ex.: até o dia 20 → dia 10 do mês seguinte; do dia 21 em diante → dia 10 do outro mês.'),
  regra('reneg_min_boletos', 'Quem pode renegociar e ir ao SPC', 'Boletos vencidos (no mínimo)', 'qtd', 2, 'Com menos que isso: cobrar, mas não renegociar nem mandar ao SPC.'),
  regra('reneg_min_dias', 'Quem pode renegociar e ir ao SPC', 'Dias de atraso (no mínimo)', 'dias', 61),
  regra('terceirizada_dias', 'Carteira', 'Vai para a Terceirizada com mais de', 'dias', 730, 'Quando a categoria é normal: até esse atraso fica na Cobrança DLG.'),
  regra('meta_mensal', 'Metas', 'Meta mensal da Cobrança (recebido)', 'brl', 40000),
  regra('meta_spc_dia', 'Metas', 'Meta SPC por cobradora (clientes por dia útil)', 'qtd', 50, 'Clientes elegíveis trabalhados; cada cliente conta uma vez no ciclo.'),
  regra('ciclo_spc_inicio', 'Metas', 'Ciclo da meta SPC começa no dia', 'dia', 12, 'Vai até a véspera desse dia no mês seguinte (ex.: 12 → 11).'),
  regra('comissao_nivel1_ate', 'Comissão', 'Nível 1 vai até (entradas SPC confirmadas no mês)', 'brl', 30000),
  regra('comissao_nivel2_ate', 'Comissão', 'Nível 2 vai até', 'brl', 35000),
  ...([1, 2, 3] as const).flatMap((n) => ([1, 2, 3, 4] as const).map((f) => regra(chaveComissao(n, f), 'Comissão', `Nível ${n} • ${FAIXAS_COMISSAO[f - 1]}`, 'pct', PERCENTUAIS[n][f - 1]))),
]

export const GRUPOS_REGRAS = ['Juros e multa', 'Entrada e parcelas', '1º boleto do acordo', 'Quem pode renegociar e ir ao SPC', 'Carteira', 'Metas'] as const

export function regrasCobranca(s: ErpState): Record<string, number> {
  const salvas = new Map(colecao(s, 'cobranca_regras').map((r) => [String(r.chave), Number(r.valor)]))
  return Object.fromEntries(REGRAS_COBRANCA.map((r) => [r.chave, Number.isFinite(salvas.get(r.chave)) ? salvas.get(r.chave)! : r.padrao]))
}

const inteiro = (v: number) => Number.isInteger(v)
// mesma conferência do banco (SQL 039)
export function validarRegrasCobranca(v: Record<string, number>): string | null {
  for (const r of REGRAS_COBRANCA) {
    const x = v[r.chave]
    if (!Number.isFinite(x) || x < 0) return `${r.label}: informe um número maior ou igual a zero.`
    if (r.unidade === 'dia' && (!inteiro(x) || x < 1 || x > 28)) return `${r.label}: o dia precisa ser um número inteiro de 1 a 28.`
    if (r.unidade === 'pct' && x > 100) return `${r.label}: o percentual precisa ficar entre 0 e 100.`
    if ((r.unidade === 'qtd' || r.unidade === 'dias') && !inteiro(x)) return `${r.label}: precisa ser um número inteiro.`
  }
  if (v.reneg_min_boletos < 1) return 'É preciso pelo menos 1 boleto vencido para renegociar.'
  if (v.comissao_nivel2_ate <= v.comissao_nivel1_ate) return 'O nível 2 da comissão precisa terminar acima do nível 1.'
  return null
}

export const rotuloRegra = (chave: string) => REGRAS_COBRANCA.find((r) => r.chave === chave)?.label ?? chave
export const unidadeRegra = (chave: string): UnidadeRegra => REGRAS_COBRANCA.find((r) => r.chave === chave)?.unidade ?? 'qtd'

// ---- Categorias ----
export const GRUPOS_CATEGORIA = [
  { id: 'Cobrança DLG', descricao: 'A cobradora cobra (até 2 anos de atraso).' },
  { id: 'Registro SPC', descricao: 'Já negativado no SPC.' },
  { id: 'Terceirizada', descricao: 'Com empresa de cobrança terceirizada.' },
  { id: 'Advogado', descricao: 'Com advogado ou em processo.' },
  { id: 'Fundo perdido', descricao: 'Não se cobra mais (prescrita, Procon, problema).' },
  { id: 'Fora da cobrança', descricao: 'Não é venda a receber de cliente (empréstimo, desconto).' },
] as const
export type GrupoCategoria = (typeof GRUPOS_CATEGORIA)[number]['id']
export const TIPOS_ESCRITORIO = ['Terceirizada', 'Advogado'] as const
// grupo que leva escritório e o tipo de escritório dele
export const tipoEscritorioDoGrupo = (grupo: string): (typeof TIPOS_ESCRITORIO)[number] | null => (grupo === 'Terceirizada' ? 'Terceirizada' : grupo === 'Advogado' ? 'Advogado' : null)

// ---- Situações da cobrança (fixas: os 9 estados oficiais do manual + o que vem depois) e tipos de contato ----
export const SITUACOES_COBRANCA: { nome: string; descricao: string; tom: Tom }[] = [
  { nome: 'Aguardando cobrança', descricao: 'Na carteira, sem contato iniciado.', tom: 'yellow' },
  { nome: 'Contato realizado sem acordo', descricao: 'Cliente contatado, não aceitou a proposta.', tom: 'yellow' },
  { nome: 'Aguardando retorno', descricao: 'Esperando o cliente responder (cobrança normal ou antes do SPC).', tom: 'yellow' },
  { nome: 'Pagamento de boleto agendado', descricao: 'O cliente informou uma data para pagar.', tom: 'yellow' },
  { nome: 'Promessa não cumprida', descricao: 'A data prometida passou sem pagamento (o sistema marca sozinho).', tom: 'red' },
  { nome: 'Renegociação simulada', descricao: 'Simulação salva, esperando o cliente decidir.', tom: 'yellow' },
  { nome: 'Renegociação feita (aguardando entrada)', descricao: 'Acordo fechado, esperando o pagamento da entrada.', tom: 'yellow' },
  { nome: 'Não localizado', descricao: 'Não foi possível falar com o cliente (marcação manual).', tom: 'red' },
  { nome: 'Ficha não encontrada SPC', descricao: 'Falta a ficha para registrar no SPC.', tom: 'red' },
  { nome: 'Entrada confirmada', descricao: 'O Financeiro confirmou a entrada.', tom: 'emerald' },
  { nome: 'Renegociação efetivada', descricao: 'Parcelas novas criadas, acordo valendo.', tom: 'emerald' },
  { nome: 'Acordo quebrado', descricao: 'A entrada não veio; a negociação antiga continua.', tom: 'red' },
]
export const TIPOS_CONTATO = ['WhatsApp', 'Ligação', 'E-mail', 'Outro'] as const
