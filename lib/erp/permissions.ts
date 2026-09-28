import type { Acao, Colaborador, MatrizPermissoes, Modulo, Setor } from './types'
import { SETORES } from './config'

export const ACOES: Acao[] = ['visualizar', 'criar', 'editar', 'excluir', 'exportar']

const TODAS: Acao[] = [...ACOES]

// Matriz padrão. Gerente acompanha e opera todos os setores; a gestão de
// colaboradores e permissões continua exclusiva do ADM (ajustável na tela de Matriz de Acesso).
export const MATRIZ_PADRAO: MatrizPermissoes = {
  GERENTE: {
    gerencia: TODAS,
    operacional: TODAS,
    vendas: TODAS,
    producao: TODAS,
    financeiro: TODAS,
    cobranca: TODAS,
    rebolo: TODAS,
    adm: ['visualizar', 'exportar'],
    usuarios: ['visualizar'],
    permissoes: ['visualizar'],
    metas: ['visualizar', 'editar'],
    cadastros: ['visualizar', 'criar', 'editar', 'exportar'],
    relatorios: ['visualizar', 'exportar'],
    auditoria: ['visualizar', 'exportar'],
    configuracoes: [],
  },
  COLABORADOR: {
    setor_proprio: ['visualizar', 'criar', 'editar', 'exportar'],
  },
}

export const MODULOS: { id: Modulo; label: string }[] = [
  { id: 'adm', label: 'Painel ADM (Visão TV)' },
  { id: 'usuarios', label: 'Colaboradores / Usuários' },
  { id: 'permissoes', label: 'Matriz de acesso' },
  { id: 'metas', label: 'Metas' },
  { id: 'cadastros', label: 'Cadastros centrais' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'auditoria', label: 'Auditoria' },
  { id: 'configuracoes', label: 'Configurações' },
  ...(['gerencia', 'operacional', 'vendas', 'producao', 'rebolo', 'financeiro', 'cobranca'] as Setor[]).map((s) => ({
    id: s as Modulo,
    label: `Setor ${SETORES[s].nome}`,
  })),
]

const SETORES_IDS = Object.keys(SETORES) as Setor[]

// IMPORTANTE: esta verificação é só de interface. No backend, a mesma regra
// precisa existir nas políticas RLS do Supabase (esconder menu não protege dado).
export function pode(usuario: Colaborador | null, matriz: MatrizPermissoes, modulo: Modulo, acao: Acao): boolean {
  if (!usuario || usuario.status !== 'ATIVO') return false
  if (usuario.perfil === 'ADM') return true
  if (usuario.perfil === 'GERENTE') return matriz.GERENTE[modulo]?.includes(acao) ?? false
  if (SETORES_IDS.includes(modulo as Setor)) {
    return modulo === usuario.setor && matriz.COLABORADOR.setor_proprio.includes(acao)
  }
  return false
}

// Produção (equipe) e vendedores externos entram direto no app de celular
export function rotaInicial(usuario: Colaborador) {
  if (usuario.setor === 'producao' && usuario.perfil === 'COLABORADOR') return '/app/producao'
  return SETORES[usuario.setor].home
}
