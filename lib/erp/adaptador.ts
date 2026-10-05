// Conversão entre o formato do front (camelCase, lib/erp/types.ts) e as tabelas do
// Supabase (snake_case, docs/supabase/schema.sql). Único ponto de mapeamento.

import type { Colaborador, LogAuditoria, Lancamento, Meta, MatrizPermissoes, Notificacao, Registro, Valor } from './types'

// Colunas graváveis pelo front em cada tabela (as demais são geradas pelo banco)
export const COLUNAS: Record<string, string[]> = {
  escolas: ['nome', 'cidade', 'uf', 'inep', 'responsavel', 'telefone', 'status', 'endereco', 'observacao'],
  filiais: ['nome', 'tipo', 'cnpj', 'cidade', 'uf', 'status'],
  produtos: ['nome', 'categoria', 'preco', 'status'],
  fornecedores: ['nome', 'categoria', 'telefone', 'status'],
  estoque: ['item', 'unidade', 'quantidade', 'minimo'],
  leads: ['escola', 'cidade', 'uf', 'contato', 'telefone', 'alunos', 'vendedora_id', 'etapa', 'observacao'],
  contratos: ['escola', 'cidade', 'uf', 'vendedora_id', 'alunos', 'comissao_pct', 'data', 'status', 'observacao'],
  tarefas_operacionais: ['titulo', 'escola', 'cidade', 'responsavel_id', 'prioridade', 'prazo', 'status'],
  ordens_producao: ['escola', 'alunos', 'fotos', 'etapa', 'responsavel_id', 'prazo'],
  qualidade: ['ordem', 'tipo', 'descricao', 'quantidade', 'responsavel_id', 'data'],
  vendas_ebooks: ['responsavel', 'aluno', 'escola', 'telefone', 'pacote', 'valor', 'parcelas', 'cobrador_id', 'data', 'canal', 'vendedor_externo_id', 'forma_pagamento', 'cpf', 'email', 'endereco', 'quantidade', 'primeiro_vencimento', 'observacao',
    // contrato de compra (app do vendedor de books) + conferência do Financeiro
    'numero_ficha', 'modelo', 'qtd_maletas', 'qtd_fotos', 'qtd_molduras', 'rg', 'data_nascimento', 'whatsapp', 'referencias', 'bairro', 'cep', 'cidade', 'nome_pai', 'nome_mae',
    'entrada', 'forma_parcelamento', 'anexos', 'assinatura', 'assinatura_em', 'assinatura_lat', 'assinatura_lng', 'conferencia', 'conferencia_motivo',
    // venda do rebolo (ligada à ficha)
    'uf', 'ficha_rebolo_id'],
  titulos: ['cliente', 'aluno', 'escola', 'telefone', 'parcela', 'valor', 'vencimento', 'status', 'cobrador_id', 'forma_pagamento'],
  acordos: ['cliente', 'escola', 'telefone', 'titulo_id', 'valor_original', 'valor_acordo', 'parcelas', 'primeiro_vencimento', 'status'],
  contas_pagar: ['descricao', 'fornecedor', 'categoria', 'valor', 'vencimento', 'favorecido', 'pix_chave', 'pix_banco'],
  comissoes: ['escola', 'referencia', 'base_calculo', 'percentual', 'valor', 'vencimento'],
  aprovacoes: [],
  // ---- Operacional (processo de campo) ----
  pj_vendedores: ['nome', 'telefone', 'cidade', 'uf', 'status', 'valor_por_ficha', 'pix_nome', 'pix_chave', 'pix_banco', 'ultimo_contato', 'observacao', 'tipo', 'email', 'usuario_id'],
  freelancers: ['tipo', 'nome', 'cidade', 'uf', 'telefone', 'status', 'nivel', 'diaria', 'pix_nome', 'pix_chave', 'pix_banco'],
  historico_contatos: ['pessoa_id', 'data', 'assunto', 'autor'],
  pendencias_resolucoes: ['pendencia_id', 'area', 'titulo', 'acao', 'observacao', 'data', 'volta_em', 'autor'],
  contratos_escola: ['escola', 'inep', 'cidade', 'uf', 'endereco', 'telefone', 'responsavel', 'vendedor_id', 'fichas_previstas', 'data_prevista', 'bonificacao_por_ficha', 'pix_nome', 'pix_chave', 'pix_banco', 'arquivo', 'observacao', 'status', 'paginas', 'origem'],
  agenda_visitas: ['data', 'fichas_previstas', 'equipe', 'carro', 'veiculo_id', 'fotografo_ids', 'motorista_id', 'telefone', 'responsavel', 'endereco', 'status'],
  veiculos: ['modelo', 'placa', 'ano', 'cor', 'lugares', 'status', 'observacao', 'gasto_fixo_mes'],
  agenda_historico: [],
  fechamentos: ['id', 'tipo', 'ref_id', 'periodo', 'referencia', 'data', 'quantidade', 'valor_unitario', 'subtotal', 'ajudantes', 'beneficiarios', 'total', 'pix_nome', 'pix_chave', 'pix_banco', 'observacao'],
  rotas: ['vendedor_id', 'uf', 'nome', 'status'],
  rota_cidades: ['rota_id', 'cidade', 'ordem', 'data_visita', 'visitada', 'fechou', 'contratos', 'motivo', 'observacao'],
  // ---- App dos vendedores externos ----
  documentos_externos: ['vendedor_id', 'tipo', 'escola', 'descricao', 'paginas', 'status'],
  devolucoes_books: ['vendedor_id', 'escola', 'quantidade', 'data', 'observacao', 'status'],
  // ---- Vendas Rebolo ----
  rebolo_pacotes: ['tipo', 'vendedora_id', 'observacao'], // numero é gerado pelo banco
  rebolo_fichas: ['pacote_id', 'vendedora_id', 'escola', 'data_visita', 'numero_ficha', 'aluno', 'serie', 'data_nascimento', 'qtd_fotos',
    'cep', 'rua', 'numero', 'apto', 'fazenda', 'proprietario_fazenda', 'bairro', 'cidade', 'uf', 'ponto_referencia',
    'whatsapp1', 'whatsapp2', 'whatsapp3', 'telefone', 'nome_pai', 'nome_mae', 'horario', 'observacao'],
  // contatos, situação, desconto e envio mudam só pelas funções do banco (registrar_contato_rebolo etc.)
  rebolo_contatos: [],
  // ---- Produção (setor 'edicao'): editores são só um cadastro; os lotes mudam pelas funções do banco (SQL 020) ----
  editores: ['nome', 'telefone', 'observacao', 'status'],
  producao_lotes: [],
  producao_historico: [],
  producao_fichas: ['lote_id', 'codigo', 'nome', 'qtd_fotos'], // fichas dos alunos (cadastro à mão)
  producao_caixas: [], // caixas da Revelação: mudam só pelas funções do banco (SQL 023)
  producao_cores_cidade: ['cor'], // cor de cada cidade no comprovante (a 1ª vem do banco; a Produção pode trocar)
  producao_fotos: [], // fotos de cada fotógrafo na escola: lança pela função do banco (SQL 025)
  // ---- Estoque de álbuns e cargas dos vendedores de books: mudam só pelas funções do banco (SQL 029) ----
  estoque_cargas: [],
  estoque_carga_caixas: [],
  estoque_carga_acertos: [],
  estoque_envios_rebolo: [],
  estoque_movimentos: [],
}

// Colunas jsonb: o front guarda como texto JSON; o banco recebe a lista de verdade
const COLUNAS_JSON: Record<string, string[]> = {
  fechamentos: ['ajudantes', 'beneficiarios'],
  contratos_escola: ['paginas'],
  documentos_externos: ['paginas'],
  vendas_ebooks: ['referencias', 'anexos'],
  veiculos: ['gasto_fixo_mes'],
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
    if (COLUNAS_JSON[tabela]?.includes(col) && typeof v === 'string') {
      try {
        saida[col] = JSON.parse(v)
      } catch {
        saida[col] = null
      }
    }
  }
  return saida
}

type Linha = Record<string, unknown>
const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export function colaboradorDoBanco(l: Linha, metas: Linha[]): Colaborador {
  const minhas: Record<string, Meta> = {}
  const porMes: Record<string, Record<string, Meta>> = {}
  for (const m of metas) {
    if (m.colaborador_id !== l.id) continue
    const meta = { diaria: Number(m.diaria), mensal: Number(m.mensal), piso: Number(m.piso ?? 0) }
    const mes = txt(m.mes)
    if (!mes || mes === '*') minhas[txt(m.indicador_id)] = meta // meta padrão
    else (porMes[mes] ??= {})[txt(m.indicador_id)] = meta // meta de um mês específico
  }
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
    metasMes: porMes,
    foto: txt(l.foto_url),
    semMeta: l.sem_meta === true,
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
