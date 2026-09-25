import type { Meta, Modulo, Perfil, Setor, Tom } from './types'

export interface Indicador {
  id: string
  label: string
  unidade: 'qtd' | 'brl'
  metaPadrao: Meta // meta individual padrão de cada colaborador do setor
}

export interface ConfigSetor {
  id: Setor
  nome: string
  descricao: string
  home: string
  tom: Tom // cor do setor nos gráficos consolidados (ADM / Gerência)
  indicadores: Indicador[]
  funcoes: string[]
}

export const SETORES: Record<Setor, ConfigSetor> = {
  adm: {
    id: 'adm',
    nome: 'Administração',
    descricao: 'Diretoria • visão mestra',
    home: '/adm',
    tom: 'blue',
    indicadores: [],
    funcoes: ['Diretor(a)', 'Administrador(a)'],
  },
  gerencia: {
    id: 'gerencia',
    nome: 'Gerência',
    descricao: 'Gestão tática das equipes',
    home: '/gerencia',
    tom: 'yellow',
    indicadores: [{ id: 'aprovacoes', label: 'Aprovações analisadas', unidade: 'qtd', metaPadrao: { diaria: 3, mensal: 60 } }],
    funcoes: ['Gerente geral', 'Gerente de área'],
  },
  operacional: {
    id: 'operacional',
    nome: 'Operacional',
    descricao: 'Campo, rotas e sessões fotográficas',
    home: '/operacional/metas',
    tom: 'blue',
    indicadores: [{ id: 'fichas', label: 'Fichas fotografadas', unidade: 'qtd', metaPadrao: { diaria: 20, mensal: 440 } }],
    funcoes: ['Fotógrafo(a)', 'Motorista', 'Coordenação / RMC', 'Auxiliar de campo'],
  },
  vendas: {
    id: 'vendas',
    nome: 'Vendas',
    descricao: 'Contratos com escolas e leads',
    home: '/vendas',
    tom: 'emerald',
    indicadores: [
      { id: 'contratos', label: 'Contratos fechados', unidade: 'qtd', metaPadrao: { diaria: 1, mensal: 20 } },
      { id: 'visitas', label: 'Escolas visitadas', unidade: 'qtd', metaPadrao: { diaria: 4, mensal: 80 } },
    ],
    funcoes: ['Vendedor(a)', 'Supervisor(a) de vendas'],
  },
  producao: {
    id: 'producao',
    nome: 'Produção',
    descricao: 'Edição, diagramação e e-books',
    home: '/producao',
    tom: 'violet',
    indicadores: [
      { id: 'fotos_editadas', label: 'Fotos editadas', unidade: 'qtd', metaPadrao: { diaria: 300, mensal: 6600 } },
      { id: 'ebooks_gerados', label: 'E-books gerados', unidade: 'qtd', metaPadrao: { diaria: 2, mensal: 40 } },
    ],
    funcoes: ['Editor(a) de imagens', 'Diagramador(a)', 'Produtor(a) de foto'],
  },
  financeiro: {
    id: 'financeiro',
    nome: 'Financeiro',
    descricao: 'Contas, pagamentos operacionais e fluxo de caixa',
    home: '/financeiro',
    tom: 'cyan',
    indicadores: [{ id: 'contas_processadas', label: 'Pagamentos processados', unidade: 'qtd', metaPadrao: { diaria: 5, mensal: 110 } }],
    funcoes: ['Analista financeiro', 'Assistente financeiro'],
  },
  cobranca: {
    id: 'cobranca',
    nome: 'Cobrança',
    descricao: 'Venda de e-books aos pais e recebimentos',
    home: '/cobranca',
    tom: 'orange',
    indicadores: [
      { id: 'ebooks_vendidos', label: 'E-books vendidos', unidade: 'qtd', metaPadrao: { diaria: 6, mensal: 130 } },
      { id: 'valor_recebido', label: 'Valor recebido', unidade: 'brl', metaPadrao: { diaria: 1500, mensal: 33000 } },
    ],
    funcoes: ['Cobrador(a)', 'Atendente de vendas', 'Supervisor(a) de cobrança'],
  },
}

// Setores com produção própria (aparecem nos painéis consolidados)
export const SETORES_PRODUTIVOS: Setor[] = ['vendas', 'operacional', 'producao', 'cobranca', 'financeiro', 'gerencia']

export function perfilDoSetor(setor: Setor): Perfil {
  if (setor === 'adm') return 'ADM'
  if (setor === 'gerencia') return 'GERENTE'
  return 'COLABORADOR'
}

export function indicador(setor: Setor, id: string) {
  return SETORES[setor].indicadores.find((i) => i.id === id)
}

// ---------------- Menus (cada setor enxerga apenas o seu) ----------------

export interface ItemMenu {
  label: string
  href: string
  icone: string
  modulo?: Modulo // quando definido, o item só aparece se o usuário puder visualizar
}

export interface GrupoMenu {
  titulo: string
  itens: ItemMenu[]
}

export const MENUS: Record<Setor, GrupoMenu[]> = {
  adm: [
    {
      titulo: 'Diretoria',
      itens: [
        { label: 'Visão TV', href: '/adm', icone: 'tv' },
        { label: 'Colaboradores', href: '/adm/colaboradores', icone: 'users', modulo: 'usuarios' },
        { label: 'Matriz de Acesso', href: '/adm/permissoes', icone: 'shield', modulo: 'permissoes' },
        { label: 'Metas', href: '/adm/metas', icone: 'target', modulo: 'metas' },
      ],
    },
    {
      titulo: 'Núcleo Central',
      itens: [
        { label: 'Cadastros', href: '/adm/cadastros', icone: 'database', modulo: 'cadastros' },
        { label: 'Relatórios', href: '/adm/relatorios', icone: 'report', modulo: 'relatorios' },
        { label: 'Auditoria', href: '/adm/auditoria', icone: 'log', modulo: 'auditoria' },
        { label: 'Configurações', href: '/adm/configuracoes', icone: 'cog', modulo: 'configuracoes' },
      ],
    },
  ],
  gerencia: [
    {
      titulo: 'Gerência',
      itens: [
        { label: 'Dashboard Tático', href: '/gerencia', icone: 'dashboard' },
        { label: 'Metas das Equipes', href: '/gerencia/metas', icone: 'target' },
        { label: 'Aprovações', href: '/gerencia/aprovacoes', icone: 'check' },
        { label: 'Relatórios', href: '/gerencia/relatorios', icone: 'report', modulo: 'relatorios' },
      ],
    },
  ],
  operacional: [
    {
      titulo: 'Operações',
      itens: [
        { label: 'Dashboard & Metas', href: '/operacional/metas', icone: 'dashboard' },
        { label: 'Controle Operacional', href: '/operacional/controle', icone: 'cog' },
        { label: 'Contratos de Escola', href: '/operacional/contratos', icone: 'doc' },
        { label: 'Agenda Fotográfica', href: '/operacional/agenda', icone: 'calendar' },
        { label: 'Fechamento Operacional', href: '/operacional/fechamento', icone: 'wallet' },
        { label: 'Tarefas Avulsas', href: '/operacional/tarefas', icone: 'check' },
        { label: 'Histórico', href: '/operacional/historico', icone: 'log' },
      ],
    },
  ],
  vendas: [
    {
      titulo: 'Comercial',
      itens: [
        { label: 'Dashboard de Vendas', href: '/vendas', icone: 'dashboard' },
        { label: 'Leads & Prospecção', href: '/vendas/leads', icone: 'funnel' },
        { label: 'Contratos (Pedidos)', href: '/vendas/contratos', icone: 'doc' },
        { label: 'Tabela de Preços', href: '/vendas/precos', icone: 'tag' },
        { label: 'Histórico', href: '/vendas/historico', icone: 'log' },
      ],
    },
  ],
  producao: [
    {
      titulo: 'Produção',
      itens: [
        { label: 'Dashboard da Produção', href: '/producao', icone: 'dashboard' },
        { label: 'Ordens de Produção', href: '/producao/ordens', icone: 'layers' },
        { label: 'Matéria-prima', href: '/producao/materia-prima', icone: 'box' },
        { label: 'Qualidade & Perdas', href: '/producao/qualidade', icone: 'shield' },
        { label: 'Histórico', href: '/producao/historico', icone: 'log' },
      ],
    },
  ],
  financeiro: [
    {
      titulo: 'Financeiro',
      itens: [
        { label: 'Dashboard Financeiro', href: '/financeiro', icone: 'dashboard' },
        { label: 'Contas a Pagar', href: '/financeiro/contas-pagar', icone: 'wallet' },
        { label: 'Pagamentos Operacionais', href: '/financeiro/pagamentos', icone: 'percent' },
        { label: 'Fluxo de Caixa', href: '/financeiro/fluxo-caixa', icone: 'chart' },
        { label: 'Histórico', href: '/financeiro/historico', icone: 'log' },
      ],
    },
  ],
  cobranca: [
    {
      titulo: 'Cobrança',
      itens: [
        { label: 'Dashboard de Cobrança', href: '/cobranca', icone: 'dashboard' },
        { label: 'Vendas de E-books', href: '/cobranca/vendas-ebooks', icone: 'book' },
        { label: 'Contas a Receber', href: '/cobranca/titulos', icone: 'wallet' },
        { label: 'Inadimplência', href: '/cobranca/inadimplencia', icone: 'alert' },
        { label: 'Acordos', href: '/cobranca/acordos', icone: 'handshake' },
        { label: 'Histórico', href: '/cobranca/historico', icone: 'log' },
      ],
    },
  ],
}

// Etapas das ordens de produção (fluxo Vendas → Operacional → Produção → Cobrança)
export const ETAPAS_PRODUCAO = [
  'Aguardando fotos',
  'Tratamento',
  'Diagramação',
  'E-book gerado',
  'Revisão de qualidade',
  'Concluído',
]

export const ETAPAS_LEAD = ['Novo', 'Contato feito', 'Visita agendada', 'Proposta', 'Negociação', 'Convertido', 'Perdido']

export const VALOR_APROVACAO_CONTA = 5000 // contas acima disso exigem aprovação da gerência

// ---------------- Operacional (processo de campo) ----------------
// Escola recebe bonificação (doação) por aluno fotografado, definida no contrato
export const BONIFICACAO_ESCOLA_MIN = 8
export const BONIFICACAO_ESCOLA_MAX = 10
// Freelancers (fotógrafos e motoristas): diária + alimentação por dia trabalhado
export const ALIMENTACAO_DIARIA = 80
export const DIARIA_FOTOGRAFO_MIN = 150
export const DIARIA_FOTOGRAFO_MAX = 200
export const DIARIA_MOTORISTA_PADRAO = 200

export const STATUS_CONTRATO_ESCOLA = ['Em conferência', 'Na agenda', 'Cancelado'] as const
export const STATUS_VISITA = ['Agendada', 'Fotografada', 'Fechamento enviado', 'Cancelada'] as const
export const STATUS_VENDEDOR_PJ = ['Ativo', 'Em negociação', 'Inativo'] as const
export const STATUS_FECHAMENTO = ['Rascunho', 'Enviado ao financeiro', 'Pago'] as const
export const TIPOS_FECHAMENTO = { escola: 'Escola (diário)', vendedor: 'Vendedor (semanal)', freelancer: 'Freelancer (semanal)' } as const

// Categorias das contas geradas pelos fechamentos (aparecem em Financeiro › Pagamentos Operacionais)
export const CATEGORIAS_OPERACIONAIS = ['Bonificação escola', 'Ajudante', 'Vendedor PJ', 'Freelancer'] as const
