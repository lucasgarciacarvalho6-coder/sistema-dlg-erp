// Conversão entre o formato do front (camelCase, lib/erp/types.ts) e as tabelas do
// Supabase (snake_case, docs/supabase/schema.sql). Único ponto de mapeamento.

import type { Colaborador, LogAuditoria, Lancamento, Meta, MatrizPermissoes, Notificacao, Registro, Valor } from './types'

// Colunas graváveis pelo front em cada tabela (as demais são geradas pelo banco)
export const COLUNAS: Record<string, string[]> = {
  escolas: ['nome', 'cidade', 'uf', 'inep', 'responsavel', 'telefone', 'status'],
  filiais: ['nome', 'tipo', 'cnpj', 'cidade', 'uf', 'status'],
  produtos: ['nome', 'categoria', 'preco', 'status'],
  fornecedores: ['nome', 'categoria', 'telefone', 'status'],
  estoque: ['item', 'unidade', 'quantidade', 'minimo'],
  leads: ['escola', 'cidade', 'uf', 'contato', 'telefone', 'alunos', 'vendedora_id', 'etapa', 'observacao'],
  contratos: ['escola', 'cidade', 'uf', 'vendedora_id', 'alunos', 'comissao_pct', 'data', 'status', 'observacao'],
  tarefas_operacionais: ['titulo', 'escola', 'cidade', 'responsavel_id', 'prioridade', 'prazo', 'status'],
  ordens_producao: ['escola', 'alunos', 'fotos', 'etapa', 'responsavel_id', 'prazo'],
  qualidade: ['ordem', 'tipo', 'descricao', 'quantidade', 'responsavel_id', 'data'],
  vendas_ebooks: ['responsavel', 'aluno', 'escola', 'telefone', 'pacote', 'valor', 'parcelas', 'cobrador_id', 'data'],
  titulos: ['cliente', 'aluno', 'escola', 'telefone', 'parcela', 'valor', 'vencimento', 'status', 'cobrador_id'],
  acordos: ['cliente', 'escola', 'telefone', 'titulo_id', 'valor_original', 'valor_acordo', 'parcelas', 'primeiro_vencimento', 'status'],
  contas_pagar: ['descricao', 'fornecedor', 'categoria', 'valor', 'vencimento'],
  comissoes: ['escola', 'referencia', 'base_calculo', 'percentual', 'valor', 'vencimento'],
  aprovacoes: [],
}

export const TABELAS_COLECAO = Object.keys(COLUNAS)

const ESPECIAIS_PARA_BANCO: Record<string, string> = { refColecao: 'ref_tabela', criadoEm: 'created_at', indicador: 'indicador_id' }
const ESPECIAIS_PARA_FRONT: Record<string, string> = Object.fromEntries(Object.entries(ESPECIAIS_PARA_BANCO).map(([a, b]) => [b, a]))

const paraSnake = (k: string) => ESPECIAIS_PARA_BANCO[k] ?? k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
const paraCamel = (k: string) => ESPECIAIS_PARA_FRONT[k] ?? k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

// Linha do banco → Registro do front (null vira '' para formulários e exibição)
export function registroDoBanco(linha: Record<string, unknown>): Registro {
  const r: Record<string, Valor> = {}
  for (const [k, v] of Object.entries(linha)) {
    if (k === 'updated_at') continue
    r[paraCamel(k)] = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : (v as Valor)
  }
  return r as Registro
}

// Dados do front → colunas permitidas da tabela ('' vira null para datas/uuids)
export function registroParaBanco(tabela: string, dados: Record<string, Valor | undefined>) {
  const permitidas = COLUNAS[tabela] ?? []
  const saida: Record<string, Valor> = {}
  for (const [k, v] of Object.entries(dados)) {
    const col = paraSnake(k)
    if (!permitidas.includes(col) || v === undefined) continue
    saida[col] = v === '' ? null : v
  }
  return saida
}

type Linha = Record<string, unknown>
const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export function colaboradorDoBanco(l: Linha, metas: Linha[]): Colaborador {
  const minhas: Record<string, Meta> = {}
  for (const m of metas) if (m.colaborador_id === l.id) minhas[txt(m.indicador_id)] = { diaria: Number(m.diaria), mensal: Number(m.mensal) }
  return {
    id: txt(l.id),
    nome: txt(l.nome),
    email: txt(l.email),
    senha: '',
    cpf: txt(l.cpf),
    telefone: txt(l.telefone),
    funcao: txt(l.funcao),
    setor: l.setor as Colaborador['setor'],
    perfil: l.perfil as Colaborador['perfil'],
    status: l.status as Colaborador['status'],
    dataAdmissao: txt(l.data_admissao),
    metas: minhas,
    foto: txt(l.foto_url),
    criadoEm: txt(l.created_at),
  }
}

export function lancamentoDoBanco(l: Linha): Lancamento {
  return {
    id: txt(l.id),
    setor: l.setor as Lancamento['setor'],
    indicador: txt(l.indicador_id),
    colaboradorId: txt(l.colaborador_id),
    quantidade: Number(l.quantidade),
    descricao: txt(l.descricao),
    data: txt(l.data),
    criadoEm: txt(l.created_at),
    origem: l.origem === 'automatico' ? 'automatico' : 'manual',
    autorId: txt(l.autor_id),
  }
}

export function auditoriaDoBanco(l: Linha): LogAuditoria {
  return {
    id: txt(l.id),
    data: txt(l.data),
    tipo: l.tipo as LogAuditoria['tipo'],
    usuarioId: txt(l.usuario_id),
    usuarioNome: txt(l.usuario_nome) || 'sistema',
    setor: (l.setor as LogAuditoria['setor']) ?? '',
    descricao: txt(l.descricao),
    ip: txt(l.ip),
  }
}

export function notificacaoDoBanco(l: Linha, lidas: Set<string>, usuarioId: string): Notificacao {
  return {
    id: txt(l.id),
    data: txt(l.created_at),
    setores: (l.setores as Notificacao['setores']) ?? [],
    tipo: l.tipo as Notificacao['tipo'],
    titulo: txt(l.titulo),
    descricao: txt(l.descricao),
    link: txt(l.link),
    lidaPor: lidas.has(txt(l.id)) ? [usuarioId] : [],
  }
}

export function matrizDoBanco(linhas: Linha[]): MatrizPermissoes {
  const m: MatrizPermissoes = { GERENTE: {}, COLABORADOR: { setor_proprio: [] } }
  for (const l of linhas) {
    const acao = l.acao as MatrizPermissoes['COLABORADOR']['setor_proprio'][number]
    if (l.perfil === 'GERENTE') {
      const g = m.GERENTE as Record<string, typeof acao[]>
      ;(g[txt(l.modulo)] ??= []).push(acao)
    } else if (l.perfil === 'COLABORADOR' && l.modulo === 'setor_proprio') {
      m.COLABORADOR.setor_proprio.push(acao)
    }
  }
  return m
}
