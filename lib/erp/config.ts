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
  edicao: {
    id: 'edicao',
    // PRODUÇÃO nova: controla as fotos de cada escola (editor → análise de qualidade → conferência final → Revelação).
    // Id 'edicao' por dentro, porque 'producao' ficou com a Revelação.
    nome: 'Produção',
    descricao: 'Fotos das escolas: editor, análise de qualidade e envio para a Revelação',
    home: '/edicao',
    tom: 'pink',
    // cada colaboradora tem a sua meta: álbuns aprovados por ela e confirmados na conferência final (bônus a partir de 1.000)
    indicadores: [{ id: 'albuns_entregues', label: 'Álbuns entregues', unidade: 'qtd', metaPadrao: { diaria: 0, mensal: 1000 } }],
    funcoes: ['Análise de qualidade'],
  },
  producao: {
    id: 'producao',
    // Antiga "Produção": agora se chama REVELAÇÃO na tela. Por dentro continua 'producao'
    // (enum do banco, RLS, app, metas e lançamentos) — nada muda no funcionamento.
    nome: 'Revelação',
    descricao: 'Revelação dos álbuns (lançados pelo app)',
    home: '/producao',
    tom: 'violet',
    // A equipe só informa, pelo app, quantos álbuns revelou no dia
    indicadores: [{ id: 'books', label: 'Álbuns revelados', unidade: 'qtd', metaPadrao: { diaria: 20, mensal: 440 } }],
    funcoes: ['Produtor(a) de books', 'Montador(a) de álbuns', 'Impressão'],
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
    descricao: 'Venda de books aos pais e recebimentos',
    home: '/cobranca',
    tom: 'orange',
    // a venda de books aos pais passou para o setor Vendas Rebolo
    indicadores: [{ id: 'valor_recebido', label: 'Valor recebido', unidade: 'brl', metaPadrao: { diaria: 1500, mensal: 33000 } }],
    funcoes: ['Cobrador(a)', 'Atendente de cobrança', 'Supervisor(a) de cobrança'],
  },
  rebolo: {
    id: 'rebolo',
    nome: 'Vendas Rebolo',
    descricao: 'Revenda dos books que o vendedor externo não vendeu',
    home: '/rebolo',
    tom: 'cyan',
    // meta do time = soma das metas individuais (ADM › Metas)
    indicadores: [
      { id: 'valor_vendido', label: 'Valor vendido', unidade: 'brl', metaPadrao: { diaria: 0, mensal: 0 } },
      { id: 'books_vendidos', label: 'Books vendidos', unidade: 'qtd', metaPadrao: { diaria: 0, mensal: 0 } },
    ],
    funcoes: ['Vendedor(a) rebolo', 'Supervisor(a) rebolo'],
  },
  externo: {
    id: 'externo',
    nome: 'Vendedores externos',
    descricao: 'App do vendedor de contrato e de books',
    home: '/app/vendedor',
    tom: 'orange',
    indicadores: [],
    funcoes: ['Vendedor de contrato', 'Vendedor de books'],
  },
}

// Setores do ERP (sem os vendedores externos, que usam só o app)
export const SETORES_ERP: Setor[] = ['adm', 'gerencia', 'operacional', 'vendas', 'edicao', 'producao', 'rebolo', 'financeiro', 'cobranca']

// Setores com produção própria (aparecem nos painéis consolidados)
export const SETORES_PRODUTIVOS: Setor[] = ['vendas', 'operacional', 'edicao', 'producao', 'rebolo', 'cobranca', 'financeiro', 'gerencia']

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
        { label: 'Vendedores Externos', href: '/adm/vendedores', icone: 'handshake', modulo: 'usuarios' },
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
        { label: 'App dos Vendedores', href: '/operacional/app-vendedores', icone: 'upload' },
        { label: 'GPS dos Vendedores', href: '/operacional/gps', icone: 'target' },
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
  edicao: [
    {
      titulo: 'Produção',
      itens: [
        { label: 'Controle da produção', href: '/edicao', icone: 'dashboard' },
        { label: 'Metas e bônus', href: '/edicao/metas', icone: 'target' },
        { label: 'Editores', href: '/edicao/editores', icone: 'users' },
        { label: 'Histórico', href: '/edicao/historico', icone: 'log' },
      ],
    },
  ],
  producao: [
    {
      titulo: 'Revelação',
      itens: [
        { label: 'Álbuns revelados', href: '/producao', icone: 'dashboard' },
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
        { label: 'Conferência de Vendas', href: '/financeiro/conferencia', icone: 'check' },
        { label: 'Vendas de Books', href: '/financeiro/vendas-books', icone: 'book' },
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
        { label: 'Contas a Receber', href: '/cobranca/titulos', icone: 'wallet' },
        { label: 'Inadimplência', href: '/cobranca/inadimplencia', icone: 'alert' },
        { label: 'Acordos', href: '/cobranca/acordos', icone: 'handshake' },
        { label: 'Histórico', href: '/cobranca/historico', icone: 'log' },
      ],
    },
  ],
  rebolo: [
    {
      titulo: 'Vendas Rebolo',
      itens: [
        { label: 'Dashboard Rebolo', href: '/rebolo', icone: 'dashboard' },
        { label: 'Gestão Diária', href: '/rebolo/gestao', icone: 'chart' },
        { label: 'Pacotes e Fichas', href: '/rebolo/pacotes', icone: 'book' },
        { label: 'Contatos', href: '/rebolo/contatos', icone: 'users' },
        { label: 'Vendas', href: '/rebolo/vendas', icone: 'doc' },
        { label: 'Envios', href: '/rebolo/envios', icone: 'upload' },
        { label: 'Tabela de Preços', href: '/rebolo/precos', icone: 'tag' },
      ],
    },
  ],
  externo: [], // usam o app /app/vendedor
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
// Valores PADRÃO. Os que valem de verdade são os PARAMETROS abaixo, editáveis em ADM › Configurações.
// Escola recebe bonificação (doação) por aluno fotografado, definida no contrato
export const BONIFICACAO_ESCOLA_MIN = 8
export const BONIFICACAO_ESCOLA_MAX = 10
// Freelancers (fotógrafos e motoristas): diária + alimentação por dia trabalhado
export const ALIMENTACAO_DIARIA = 80
export const DIARIA_FOTOGRAFO_MIN = 150
export const DIARIA_FOTOGRAFO_MAX = 200
export const DIARIA_MOTORISTA_PADRAO = 200

// Parâmetros editáveis pelo ADM (nada é fixo: mudam conforme a negociação/temporada)
export interface DefParametro {
  chave: string
  grupo: string
  label: string
  ajuda: string
  padrao: number
}
export const PARAMETROS: DefParametro[] = [
  { chave: 'bonificacaoEscolaMin', grupo: 'Operacional • Escolas', label: 'Bonificação à escola — mínimo (R$)', ajuda: 'Por aluno fotografado, escolhida no contrato', padrao: BONIFICACAO_ESCOLA_MIN },
  { chave: 'bonificacaoEscolaMax', grupo: 'Operacional • Escolas', label: 'Bonificação à escola — máximo (R$)', ajuda: 'Por aluno fotografado, escolhida no contrato', padrao: BONIFICACAO_ESCOLA_MAX },
  { chave: 'alimentacaoDiaria', grupo: 'Operacional • Freelancers', label: 'Alimentação por dia trabalhado (R$)', ajuda: 'Somada à diária no adiantamento semanal', padrao: ALIMENTACAO_DIARIA },
  { chave: 'diariaFotografoMin', grupo: 'Operacional • Freelancers', label: 'Diária do fotógrafo — mínimo (R$)', ajuda: 'Iniciante', padrao: DIARIA_FOTOGRAFO_MIN },
  { chave: 'diariaFotografoMax', grupo: 'Operacional • Freelancers', label: 'Diária do fotógrafo — máximo (R$)', ajuda: 'Profissional', padrao: DIARIA_FOTOGRAFO_MAX },
  { chave: 'diariaMotorista', grupo: 'Operacional • Freelancers', label: 'Diária do motorista (R$)', ajuda: 'Valor sugerido no cadastro', padrao: DIARIA_MOTORISTA_PADRAO },
]

export const STATUS_CONTRATO_ESCOLA = ['Em conferência', 'Na agenda', 'Cancelado'] as const
export const STATUS_VISITA = ['Agendada', 'Fotografada', 'Fechamento enviado', 'Cancelada'] as const
export const STATUS_VENDEDOR_PJ = ['Ativo', 'Em negociação', 'Inativo'] as const
export const STATUS_FECHAMENTO = ['Rascunho', 'Enviado ao financeiro', 'Pago'] as const
export const TIPOS_FECHAMENTO = { escola: 'Escola (diário)', vendedor: 'Vendedor (semanal)', freelancer: 'Freelancer (semanal)' } as const

// Categorias das contas geradas pelos fechamentos (aparecem em Financeiro › Pagamentos Operacionais)
export const CATEGORIAS_OPERACIONAIS = ['Bonificação escola', 'Ajudante', 'Vendedor PJ', 'Freelancer'] as const
