import type { ErpState, Setor } from './types'
import { equipe } from './metrics'

// Opções de selects que dependem do núcleo de dados
export const opcoesEquipe = (setor: Setor) => (s: ErpState) => equipe(s, setor).map((c) => ({ valor: c.id, label: c.nome }))

export const opcoesColecao = (nome: string, campo: string) => (s: ErpState) =>
  [...new Set((s.colecoes[nome] ?? []).map((r) => String(r[campo] ?? '')))].filter(Boolean).map((v) => ({ valor: v, label: v }))

// Colaborador logado, se for do setor (preenche automaticamente "vendedora", "cobrador"...)
export const usuarioDoSetor = (setor: Setor, sessaoId: string | undefined) => (s: ErpState) =>
  s.colaboradores.find((c) => c.id === sessaoId && c.setor === setor)?.id ?? equipe(s, setor)[0]?.id ?? ''
