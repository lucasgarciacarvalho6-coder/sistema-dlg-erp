// Tipos centrais do ERP. Espelham as tabelas que serão criadas no Supabase
// (ver docs/SUPABASE_PROMPT.md), para que a troca do mock pelo backend seja direta.

export type Setor = 'adm' | 'gerencia' | 'operacional' | 'vendas' | 'producao' | 'financeiro' | 'cobranca'

export type Perfil = 'ADM' | 'GERENTE' | 'COLABORADOR'

export type Acao = 'visualizar' | 'criar' | 'editar' | 'excluir' | 'exportar'

export type Modulo =
  | Setor
  | 'usuarios'
  | 'permissoes'
  | 'metas'
  | 'cadastros'
  | 'relatorios'
  | 'auditoria'
  | 'configuracoes'

// ADM tem acesso total (não editável). Colaborador só atua no próprio setor.
export interface MatrizPermissoes {
  GERENTE: Partial<Record<Modulo, Acao[]>>
  COLABORADOR: { setor_proprio: Acao[] }
}

export type Tom = 'blue' | 'emerald' | 'orange' | 'red' | 'violet' | 'yellow' | 'cyan' | 'zinc'

export interface Meta {
  diaria: number
  mensal: number
  piso?: number // PISO do mês: mínimo que precisa ser feito para não dar prejuízo (piso diário = piso ÷ dias úteis)
}

// Parâmetros do negócio editáveis pelo ADM (bonificação, diárias, alimentação...). Ver PARAMETROS em config.ts
export type Parametros = Record<string, number>

export interface Colaborador {
  id: string
  nome: string
  email: string
  senha: string // mock: no backend será senha_hash gerida pelo Supabase Auth
  cpf: string
  telefone: string
  funcao: string
  setor: Setor
  perfil: Perfil
  status: 'ATIVO' | 'INATIVO'
  dataAdmissao: string
  metas: Record<string, Meta> // meta padrão (vale para qualquer mês sem meta própria); chave = id do indicador
  metasMes?: Record<string, Record<string, Meta>> // metas de um mês específico: 'YYYY-MM' → indicador → meta
  foto?: string // URL da foto de perfil (Supabase Storage) ou data URL (modo demo)
  criadoEm: string
}

// Registro de produção/resultado. Alimenta metas e dashboards (inclusive o do ADM).
export interface Lancamento {
  id: string
  setor: Setor
  indicador: string
  colaboradorId: string // '' = lançamento do setor, sem colaborador
  quantidade: number // para indicadores em R$, é o valor
  descricao: string
  data: string // YYYY-MM-DD
  criadoEm: string
  origem: 'manual' | 'automatico'
  autorId: string
}

export type Valor = string | number | boolean | null

// Registro genérico das coleções de cada módulo (leads, contratos, títulos...)
export type Registro = { id: string; criadoEm: string; [campo: string]: Valor }

export type TipoLog =
  | 'LOGIN'
  | 'LOGIN_FALHOU'
  | 'LOGOUT'
  | 'ACESSO'
  | 'CRIAR'
  | 'EDITAR'
  | 'EXCLUIR'
  | 'SENHA'
  | 'SISTEMA'

export interface LogAuditoria {
  id: string
  data: string
  tipo: TipoLog
  usuarioId: string
  usuarioNome: string
  setor: Setor | ''
  descricao: string
  ip: string
}

export interface Notificacao {
  id: string
  data: string
  setores: Setor[] // destinatários; ADM e Gerência veem todas
  tipo: 'info' | 'alerta' | 'sucesso' | 'aprovacao'
  titulo: string
  descricao: string
  link: string
  lidaPor: string[]
}

export interface Empresa {
  nome: string
  cnpj: string
  email: string
  telefone: string
  cidade: string
  uf: string
  parametros?: Parametros
}

export interface ErpState {
  versao: number
  empresa: Empresa
  colaboradores: Colaborador[]
  lancamentos: Lancamento[]
  colecoes: Record<string, Registro[]>
  permissoes: MatrizPermissoes
  auditoria: LogAuditoria[]
  notificacoes: Notificacao[]
}

export interface Sessao {
  colaboradorId: string
  inicio: string
  expira: string
}
