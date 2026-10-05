// Cores dos selos de situação NOS SETORES (pedido de 05/10/2026): uma regra só, igual em todas as telas.
//  🟢 verde    = ok, pronto ou andando no prazo
//  🟡 amarelo  = aguardando alguém ou falta fazer
//  🔴 vermelho = atrasado, parado, cancelado ou com problema
//  cinza      = fora de uso (inativo, arquivado) e o que não é situação (nome de setor, tipo, cidade...)
// O selo usa esta regra quando a tela não diz a cor. A Visão TV não usa estes selos (fica como está).

import type { Tom } from './types'

const norm = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const VERDE = [
  // Operações
  'fotografada', 'fechado', 'fechamento enviado', 'na agenda', 'confirmada', 'agendada', 'visitada', 'realizada', 'dados completos',
  'disponivel', 'na estrada hoje', 'pronto p/ viagem', 'recebido na empresa', 'conferido', 'resolvido',
  // Produção e estoque
  'em edicao', 'revelando', 'na caixa', 'em estoque', 'encerrada', 'acertada',
  // Financeiro, Cobrança, Rebolo e Gerência
  'pago', 'paga', 'conferida', 'completos', 'quitado', 'quitada', 'vendida', 'aprovado', 'aprovada',
  // Vendas
  'convertido', 'finalizado',
  // cadastros e tarefas
  'ativo', 'ativa', 'ok', 'concluida', 'concluido', 'em andamento', 'conectado',
]
const AMARELO = [
  // Operações
  'em conferencia', 'contrato em conferencia', 'a confirmar', 'rascunho', 'enviado ao financeiro', 'a preparar', 'sem contrato',
  'em manutencao', 'pendente', 'recebido',
  // Produção e estoque
  'aguardando fotos', 'aguardando envio editor', 'analise de qualidade', 'conferencia final', 'aguardando revelacao',
  'aguardando conferencia', 'em venda',
  // Financeiro, Cobrança, Rebolo e Gerência
  'a pagar', 'aguardando aprovacao', 'aberto', 'em aberto', 'em acordo', 'faltando', 'aguardando contrato', 'aguardando contato',
  'tentar de novo', 'em negociacao', 'agendado', 'venda a efetivar', 'sem sucesso',
  // Vendas
  'novo', 'contato feito', 'visita agendada', 'proposta', 'negociacao', 'em agendamento',
  // cadastros
  'abaixo do minimo', 'nao configurado',
]
const VERMELHO = [
  'cancelada', 'cancelado', 'atrasada', 'atrasado', 'vencida', 'vencido', 'devolvida', 'devolvido pelo financeiro',
  'descarte', 'rejeitado', 'rejeitada', 'reprovado', 'reprovada', 'excluida', 'rompido', 'perdido',
]
const CINZA = ['inativo', 'inativa', 'arquivada', 'arquivado']

const MAPA = new Map<string, Tom>([
  ...VERDE.map((s) => [s, 'emerald'] as [string, Tom]),
  ...AMARELO.map((s) => [s, 'yellow'] as [string, Tom]),
  ...VERMELHO.map((s) => [s, 'red'] as [string, Tom]),
  ...CINZA.map((s) => [s, 'zinc'] as [string, Tom]),
])

export function corDaSituacao(texto: unknown): Tom {
  if (typeof texto !== 'string') return 'zinc'
  return MAPA.get(norm(texto)) ?? 'zinc'
}
