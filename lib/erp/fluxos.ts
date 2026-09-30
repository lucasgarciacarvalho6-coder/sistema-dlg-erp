// Regras de negócio que ligam os setores (o "Núcleo ERP").
// Todas as funções recebem um rascunho do estado e o alteram diretamente;
// o store (store.ts) cuida de persistir e avisar as telas em tempo real.
// No backend, estas regras viram triggers/functions do Supabase.

import type { ErpState, Lancamento, Notificacao, Registro, Setor, TipoLog } from './types'
import { ETAPAS_PRODUCAO, VALOR_APROVACAO_CONTA, indicador } from './config'
import { camposFaltando, lerJSON, responsavelOperacional, type Beneficiario } from './operacional'
import { addDias, addMeses, hoje, uid } from './format'
import { metaColaborador, somar } from './metrics'

export interface Contexto {
  autorId: string
  autorNome: string
  autorSetor: Setor | ''
  silencioso?: boolean // seed: não gera notificações
}

const agora = () => new Date().toISOString()

export function col(d: ErpState, nome: string) {
  if (!d.colecoes[nome]) d.colecoes[nome] = []
  return d.colecoes[nome]
}

export function inserir(d: ErpState, nome: string, dados: Omit<Registro, 'id' | 'criadoEm'>): Registro {
  // aceita um id definido antes (ex.: fechamento salvo e enviado na mesma ação)
  const r = { ...dados, id: typeof dados.id === 'string' && dados.id ? dados.id : uid(), criadoEm: agora() } as Registro
  col(d, nome).unshift(r)
  return r
}

export function auditar(d: ErpState, ctx: Contexto, tipo: TipoLog, descricao: string, setor: Setor | '' = ctx.autorSetor) {
  d.auditoria.unshift({
    id: uid(),
    data: agora(),
    tipo,
    usuarioId: ctx.autorId,
    usuarioNome: ctx.autorNome,
    setor,
    descricao,
    ip: 'local (mock)',
  })
  if (d.auditoria.length > 2000) d.auditoria.length = 2000
}

export function notificar(d: ErpState, ctx: Contexto, n: Omit<Notificacao, 'id' | 'data' | 'lidaPor'>) {
  if (ctx.silencioso) return
  d.notificacoes.unshift({ ...n, id: uid(), data: agora(), lidaPor: [] })
  if (d.notificacoes.length > 300) d.notificacoes.length = 300
}

export function lancar(
  d: ErpState,
  ctx: Contexto,
  l: Omit<Lancamento, 'id' | 'criadoEm' | 'autorId' | 'origem'> & { origem?: Lancamento['origem'] },
) {
  const colab = d.colaboradores.find((c) => c.id === l.colaboradorId)
  const antes = colab ? somar(d.lancamentos, { setor: l.setor, indicador: l.indicador, colaboradorId: colab.id, data: l.data }) : 0

  d.lancamentos.push({ origem: 'automatico', ...l, id: uid(), criadoEm: agora(), autorId: ctx.autorId })

  // Meta diária batida → avisa ADM, Gerência e o próprio setor
  if (colab && l.data === hoje()) {
    const meta = metaColaborador(colab, l.indicador).diaria
    if (meta > 0 && antes < meta && antes + l.quantidade >= meta) {
      notificar(d, ctx, {
        setores: ['adm', 'gerencia', l.setor],
        tipo: 'sucesso',
        titulo: 'Meta diária batida 🎯',
        descricao: `${colab.nome} atingiu a meta diária de ${indicador(l.setor, l.indicador)?.label.toLowerCase()}.`,
        link: `/${l.setor === 'operacional' ? 'operacional/metas' : l.setor}`,
      })
    }
  }
}

// ---------------- Automação após criar registros ----------------

type PosCriar = (d: ErpState, r: Registro, ctx: Contexto) => void

export const APOS_CRIAR: Record<string, PosCriar> = {
  // VENDA (contrato com a escola) → Operacional, Produção e ADM
  contratos(d, r, ctx) {
    const data = String(r.data || hoje())
    lancar(d, ctx, { setor: 'vendas', indicador: 'contratos', colaboradorId: String(r.vendedoraId ?? ''), quantidade: 1, descricao: `Contrato: ${r.escola}`, data })
    inserir(d, 'tarefas_operacionais', {
      titulo: 'Agendar sessão fotográfica',
      escola: r.escola,
      cidade: r.cidade,
      responsavelId: '',
      prioridade: 'Alta',
      prazo: addDias(data, 7),
      status: 'Pendente',
      contratoId: r.id,
    })
    notificar(d, ctx, {
      setores: ['operacional', 'adm', 'gerencia'],
      tipo: 'info',
      titulo: 'Novo contrato fechado',
      descricao: `${r.escola} (${r.cidade}) — ${r.alunos} alunos. Sessão fotográfica criada.`,
      link: '/operacional/tarefas',
    })
  },

  // VENDA DE E-BOOK AOS PAIS → Contas a receber (parcelas).
  // (A escola NÃO recebe % sobre a venda: ela recebe a bonificação por ficha no fechamento operacional.)
  // Canal Interno (vendas antigas registradas pela empresa): meta do Rebolo e títulos na hora.
  // Canal Externo (app do vendedor de books): espera a CONFERÊNCIA do Financeiro para gerar os títulos (mesma regra do SQL 009).
  // Canal Rebolo: nasce "Aguardando contrato"; a vendedora anexa o contrato assinado e envia ao Financeiro (SQL 012).
  vendas_ebooks(d, r, ctx) {
    const canal = String(r.canal || 'Interno')
    r.canal = canal
    r.formaPagamento = String(r.formaPagamento || 'Boleto')
    if (!r.pacote) r.pacote = 'Book'
    const valor = Number(r.valor) || 0
    if (canal === 'Rebolo') {
      r.conferencia = 'Aguardando contrato'
      const ficha = col(d, 'rebolo_fichas').find((f) => f.id === r.fichaReboloId)
      if (ficha) {
        ficha.situacao = 'Venda a efetivar'
        ficha.vendaId = r.id
      }
      return
    }
    if (canal === 'Interno') {
      r.conferencia = r.conferencia || 'Conferida'
      contarVendaRebolo(d, r, ctx)
      gerarTitulosVenda(d, r, ctx)
      notificar(d, ctx, { setores: ['cobranca', 'financeiro', 'adm'], tipo: 'info', titulo: 'Venda interna de book', descricao: `${r.responsavel} (${r.escola}) • ${r.formaPagamento} • R$ ${valor.toFixed(2).replace('.', ',')}`, link: '/financeiro/vendas-books' })
    } else {
      r.conferencia = r.conferencia || 'Aguardando conferência'
      notificar(d, ctx, { setores: ['financeiro', 'adm'], tipo: 'aprovacao', titulo: 'Venda externa para conferir', descricao: `${r.responsavel} (${r.escola}) • R$ ${valor.toFixed(2).replace('.', ',')} — confira contrato, assinatura, documento e promissória.`, link: '/financeiro/conferencia' })
    }
  },

  acordos(d, r, ctx) {
    pedirAprovacao(d, ctx, {
      tipo: 'Acordo de cobrança',
      setorOrigem: 'cobranca',
      descricao: `${r.cliente}: ${r.parcelas}x — valor acordado`,
      valor: Number(r.valorAcordo) || 0,
      refColecao: 'acordos',
      refId: r.id,
    })
  },

  contas_pagar(d, r, ctx) {
    if ((Number(r.valor) || 0) >= VALOR_APROVACAO_CONTA) {
      r.status = 'Aguardando aprovação'
      pedirAprovacao(d, ctx, {
        tipo: 'Conta a pagar',
        setorOrigem: 'financeiro',
        descricao: `${r.descricao} — ${r.fornecedor}`,
        valor: Number(r.valor) || 0,
        refColecao: 'contas_pagar',
        refId: r.id,
      })
    }
  },
}

export function aposAtualizar(d: ErpState, nome: string, r: Registro, ctx: Contexto) {
  if (nome === 'estoque' && Number(r.quantidade) < Number(r.minimo)) {
    notificar(d, ctx, {
      setores: ['producao', 'adm'],
      tipo: 'alerta',
      titulo: 'Estoque baixo',
      descricao: `${r.item}: ${r.quantidade} ${r.unidade} (mínimo ${r.minimo}).`,
      link: '/producao/materia-prima',
    })
  }
}

// ---------------- Ações específicas ----------------

function pedirAprovacao(
  d: ErpState,
  ctx: Contexto,
  a: { tipo: string; setorOrigem: Setor; descricao: string; valor: number; refColecao: string; refId: string },
) {
  inserir(d, 'aprovacoes', { ...a, solicitante: ctx.autorNome, status: 'Pendente', decididoPor: '', decididoEm: '' })
  notificar(d, ctx, {
    setores: ['gerencia', 'adm'],
    tipo: 'aprovacao',
    titulo: 'Aprovação pendente',
    descricao: `${a.tipo}: ${a.descricao}`,
    link: '/gerencia/aprovacoes',
  })
}

export function decidirAprovacao(d: ErpState, id: string, aprovado: boolean, ctx: Contexto) {
  const a = col(d, 'aprovacoes').find((x) => x.id === id)
  if (!a || a.status !== 'Pendente') return
  a.status = aprovado ? 'Aprovado' : 'Rejeitado'
  a.decididoPor = ctx.autorNome
  a.decididoEm = hoje()
  const ref = col(d, String(a.refColecao)).find((x) => x.id === a.refId)
  if (ref) {
    if (a.refColecao === 'acordos') ref.status = aprovado ? 'Ativo' : 'Rejeitado'
    if (a.refColecao === 'contas_pagar') ref.status = aprovado ? 'A pagar' : 'Rejeitada'
    if (a.refColecao === 'rebolo_fichas') ref.descontoStatus = aprovado ? 'Aprovado' : 'Rejeitado'
  }
  lancar(d, ctx, {
    setor: 'gerencia',
    indicador: 'aprovacoes',
    colaboradorId: ctx.autorSetor === 'gerencia' ? ctx.autorId : '',
    quantidade: 1,
    descricao: `${a.tipo} ${aprovado ? 'aprovado' : 'rejeitado'}`,
    data: hoje(),
  })
  auditar(d, ctx, 'EDITAR', `${aprovado ? 'Aprovou' : 'Rejeitou'} ${a.tipo}: ${a.descricao}`, 'gerencia')
  notificar(d, ctx, {
    setores: [a.setorOrigem as Setor, 'adm'],
    tipo: aprovado ? 'sucesso' : 'alerta',
    titulo: `${a.tipo} ${aprovado ? 'aprovado' : 'rejeitado'}`,
    descricao: `${a.descricao} — por ${ctx.autorNome}`,
    link: a.refColecao === 'acordos' ? '/cobranca/acordos' : a.refColecao === 'rebolo_fichas' ? '/rebolo/contatos' : '/financeiro/contas-pagar',
  })
}

export function baixarTitulo(d: ErpState, id: string, ctx: Contexto, data = hoje()) {
  const t = col(d, 'titulos').find((x) => x.id === id)
  if (!t || t.status === 'Pago') return
  t.status = 'Pago'
  t.dataPagamento = data
  if (t.cobradorId) {
    lancar(d, ctx, {
      setor: 'cobranca',
      indicador: 'valor_recebido',
      colaboradorId: String(t.cobradorId),
      quantidade: Number(t.valor) || 0,
      descricao: `Baixa ${t.parcela} — ${t.cliente}`,
      data,
    })
  }
  auditar(d, ctx, 'EDITAR', `Baixa do título ${t.parcela} de ${t.cliente}`, 'cobranca')
}

export function negociarTitulo(d: ErpState, id: string, parcelas: number, ctx: Contexto) {
  const t = col(d, 'titulos').find((x) => x.id === id)
  if (!t) return
  t.status = 'Em acordo'
  const valor = Number(t.valor) || 0
  const acordo = inserir(d, 'acordos', {
    cliente: t.cliente,
    escola: t.escola,
    telefone: t.telefone,
    valorOriginal: valor,
    valorAcordo: valor,
    parcelas,
    primeiroVencimento: addDias(hoje(), 7),
    status: 'Aguardando aprovação',
    tituloId: t.id,
  })
  APOS_CRIAR.acordos(d, acordo, ctx)
  auditar(d, ctx, 'CRIAR', `Acordo gerado para ${t.cliente}`, 'cobranca')
}

export function pagarConta(d: ErpState, nome: 'contas_pagar' | 'comissoes', id: string, ctx: Contexto, data = hoje()) {
  const r = col(d, nome).find((x) => x.id === id)
  if (!r || r.status === 'Pago') return
  r.status = 'Pago'
  r.dataPagamento = data
  lancar(d, ctx, {
    setor: 'financeiro',
    indicador: 'contas_processadas',
    colaboradorId: ctx.autorSetor === 'financeiro' ? ctx.autorId : '',
    quantidade: 1,
    descricao: nome === 'comissoes' ? `Comissão paga: ${r.escola}` : `Conta paga: ${r.descricao}`,
    data,
  })
  auditar(d, ctx, 'EDITAR', `Pagamento registrado (${nome === 'comissoes' ? 'comissão' : 'conta'}): ${r.escola ?? r.descricao}`, 'financeiro')
  // Fechamento operacional: quando todas as contas dele forem pagas, ele fica "Pago"
  if (r.fechamentoId) {
    const doFechamento = col(d, 'contas_pagar').filter((c) => c.fechamentoId === r.fechamentoId)
    const fech = col(d, 'fechamentos').find((f) => f.id === r.fechamentoId)
    if (fech && doFechamento.every((c) => c.status === 'Pago')) {
      fech.status = 'Pago'
      notificar(d, ctx, { setores: ['operacional', 'adm'], tipo: 'sucesso', titulo: 'Fechamento pago', descricao: `${fech.referencia}: todos os pagamentos foram feitos pelo Financeiro.`, link: '/operacional/fechamento' })
    }
  }
}

export function avancarOrdem(d: ErpState, id: string, ctx: Contexto) {
  const o = col(d, 'ordens_producao').find((x) => x.id === id)
  if (!o) return
  const i = ETAPAS_PRODUCAO.indexOf(String(o.etapa))
  if (i < 0 || i >= ETAPAS_PRODUCAO.length - 1) return
  o.etapa = ETAPAS_PRODUCAO[i + 1]
  if (o.etapa === 'E-book gerado') {
    lancar(d, ctx, { setor: 'producao', indicador: 'ebooks_gerados', colaboradorId: String(o.responsavelId ?? ''), quantidade: 1, descricao: `E-book: ${o.escola}`, data: hoje() })
  }
  if (o.etapa === 'Concluído') {
    notificar(d, ctx, {
      setores: ['cobranca', 'adm'],
      tipo: 'sucesso',
      titulo: 'E-books liberados para venda',
      descricao: `Produção da escola ${o.escola} concluída. Cobrança já pode ofertar aos pais.`,
      link: '/cobranca/vendas-ebooks',
    })
  }
  auditar(d, ctx, 'EDITAR', `Ordem ${o.escola} avançou para "${o.etapa}"`, 'producao')
}

// =====================================================================
// PROCESSO OPERACIONAL (contrato de escola → agenda → visita → fechamento)
// No Supabase, as mesmas regras estão em docs/supabase/004_operacional.sql.
// =====================================================================

// Diretora confirmou: contrato sai da conferência e vira visita na Agenda Fotográfica
export function confirmarContratoEscola(d: ErpState, id: string, ctx: Contexto): string | null {
  const c = col(d, 'contratos_escola').find((x) => x.id === id)
  if (!c) return 'Contrato não encontrado.'
  if (c.status !== 'Em conferência') return 'Este contrato já foi enviado para a agenda.'
  const faltam = camposFaltando(c)
  if (faltam.length) return `Complete antes de enviar para a agenda: ${faltam.join(', ')}.`
  c.status = 'Na agenda'
  const visita = inserir(d, 'agenda_visitas', {
    contratoId: c.id,
    escola: c.escola,
    cidade: c.cidade,
    uf: c.uf,
    endereco: c.endereco,
    telefone: c.telefone,
    responsavel: c.responsavel,
    vendedorId: c.vendedorId,
    data: c.dataPrevista,
    fichasPrevistas: c.fichasPrevistas,
    fichasConfirmadas: 0,
    fichasFotografadas: 0,
    equipe: '',
    carro: '',
    fotografoIds: '',
    motoristaId: '',
    status: 'Agendada',
  })
  APOS_CRIAR.agenda_visitas(d, visita, ctx)
  auditar(d, ctx, 'EDITAR', `Contrato confirmado e enviado para a agenda: ${c.escola}`, 'operacional')
  return null
}

// ---- Títulos (parcelas) de uma venda de book — mesma regra do SQL 009 (idempotente) ----
// entrada → pago • cartão → pago • boleto → parcelas em aberto • PIX/dinheiro → pago à vista; parcelado → em aberto
export function gerarTitulosVenda(d: ErpState, v: Registro, ctx: Contexto) {
  if (col(d, 'titulos').some((t) => t.vendaId === v.id)) return
  const data = String(v.data || hoje())
  const forma = String(v.formaPagamento || 'Boleto')
  const n = Math.max(1, Number(v.parcelas) || 1)
  const entrada = Number(v.entrada) || 0
  const restante = Math.round(((Number(v.valor) || 0) - entrada) * 100) / 100
  const primeiro = String(v.primeiroVencimento || data)
  const interno = v.canal !== 'Externo'
  const base = { cliente: v.responsavel, aluno: v.aluno ?? '', escola: v.escola, telefone: v.telefone, cobradorId: v.cobradorId ?? '', vendaId: v.id, formaPagamento: forma }
  const recebido = (valor: number, descricao: string) => {
    if (interno) lancar(d, ctx, { setor: 'cobranca', indicador: 'valor_recebido', colaboradorId: String(v.cobradorId ?? ''), quantidade: valor, descricao, data })
  }
  if (entrada > 0) {
    inserir(d, 'titulos', { ...base, parcela: 'Entrada', valor: entrada, vencimento: data, status: 'Pago', dataPagamento: data })
    recebido(entrada, `Entrada — ${v.responsavel}`)
  }
  if (restante <= 0) return
  const aberto = forma === 'Boleto' || ((forma === 'PIX' || forma === 'Dinheiro') && (n > 1 || primeiro > data))
  if (aberto) {
    const parcela = Math.round((restante / n) * 100) / 100
    for (let i = 1; i <= n; i++) {
      inserir(d, 'titulos', {
        ...base,
        parcela: `${i}/${n}`,
        valor: i === n ? Math.round((restante - parcela * (n - 1)) * 100) / 100 : parcela,
        vencimento: addMeses(primeiro, i - 1),
        status: 'Aberto',
        dataPagamento: '',
      })
    }
  } else {
    inserir(d, 'titulos', { ...base, parcela: forma === 'Cartão de crédito' && n > 1 ? `${n}x no cartão` : '1/1', valor: restante, vencimento: data, status: 'Pago', dataPagamento: data })
    recebido(restante, `Recebido na venda — ${v.responsavel}`)
  }
}

// Conferência da venda externa pelo Financeiro: conferir (gera os títulos) ou devolver ao vendedor com o motivo
export function conferirVendaBook(d: ErpState, id: string, acao: 'conferir' | 'devolver', motivo: string, ctx: Contexto): string | null {
  const v = col(d, 'vendas_ebooks').find((x) => x.id === id)
  if (!v) return 'Venda não encontrada.'
  if (v.conferencia !== 'Aguardando conferência') return 'Esta venda não está aguardando conferência.'
  if (acao === 'devolver' && !motivo.trim()) return 'Informe o motivo da devolução.'
  v.conferencia = acao === 'conferir' ? 'Conferida' : 'Devolvida'
  v.conferenciaMotivo = acao === 'conferir' ? '' : motivo.trim()
  v.conferidoPor = ctx.autorId
  v.conferidoEm = agora()
  if (acao === 'conferir') {
    gerarTitulosVenda(d, v, ctx)
    if (v.canal === 'Rebolo') {
      contarVendaRebolo(d, v, ctx)
      const ficha = col(d, 'rebolo_fichas').find((f) => f.id === v.fichaReboloId)
      if (ficha) ficha.situacao = 'Vendida'
    }
  }
  if (v.canal === 'Rebolo') {
    notificar(d, ctx, {
      setores: ['rebolo'],
      tipo: acao === 'conferir' ? 'sucesso' : 'alerta',
      titulo: acao === 'conferir' ? 'Venda aprovada pelo Financeiro' : 'Venda devolvida pelo Financeiro',
      descricao: `${v.responsavel}${acao === 'conferir' ? ' — pronta para envio.' : `: ${motivo.trim()}`}`,
      link: acao === 'conferir' ? '/rebolo/envios' : '/rebolo/vendas',
    })
  }
  auditar(d, ctx, 'EDITAR', `Venda de book ${acao === 'conferir' ? 'conferida' : `devolvida (${motivo.trim()})`}: ${v.responsavel}`, 'financeiro')
  return null
}

// ---- Cancelar / excluir contrato de escola (mesmas regras do SQL 006) ----
const jaFotografado = (d: ErpState, contratoId: string) =>
  col(d, 'agenda_visitas').some((v) => v.contratoId === contratoId && (v.status === 'Fotografada' || v.status === 'Fechamento enviado'))

export function cancelarContratoEscola(d: ErpState, id: string, motivo: string, ctx: Contexto): string | null {
  const c = col(d, 'contratos_escola').find((x) => x.id === id)
  if (!c) return 'Contrato não encontrado.'
  if (c.status === 'Cancelado') return 'Este contrato já está cancelado.'
  if (jaFotografado(d, id)) return 'Esta escola já foi fotografada: o contrato não pode ser cancelado (fichas e pagamentos dependem dele).'
  const estavaNaAgenda = c.status === 'Na agenda'
  c.status = 'Cancelado'
  c.observacao = [String(c.observacao || '').trim(), `Cancelado${motivo.trim() ? `: ${motivo.trim()}` : ''}`].filter(Boolean).join(' • ')
  for (const v of col(d, 'agenda_visitas').filter((x) => x.contratoId === id && x.status === 'Agendada')) {
    v.status = 'Cancelada'
    inserir(d, 'agenda_historico', { visitaId: v.id, tipo: 'Visita cancelada', descricao: `Contrato cancelado${motivo.trim() ? `: ${motivo.trim()}` : ''}.`, autor: ctx.autorNome })
  }
  d.colecoes.ordens_producao = col(d, 'ordens_producao').filter((o) => !(o.contratoId === id && o.etapa === ETAPAS_PRODUCAO[0]))
  if (estavaNaAgenda) {
    notificar(d, ctx, { setores: ['producao', 'adm', 'gerencia'], tipo: 'alerta', titulo: 'Visita cancelada', descricao: `${c.escola}: contrato cancelado, a visita saiu da agenda.`, link: '/operacional/agenda' })
  }
  auditar(d, ctx, 'EDITAR', `Contrato cancelado: ${c.escola}`, 'operacional')
  return null
}

export function excluirContratoEscola(d: ErpState, id: string, ctx: Contexto): string | null {
  const c = col(d, 'contratos_escola').find((x) => x.id === id)
  if (!c) return 'Contrato não encontrado.'
  if (jaFotografado(d, id)) return 'Esta escola já foi fotografada: o contrato não pode ser excluído (fichas e pagamentos dependem dele).'
  const visitas = new Set(col(d, 'agenda_visitas').filter((v) => v.contratoId === id).map((v) => v.id))
  d.colecoes.ordens_producao = col(d, 'ordens_producao').filter((o) => !(o.contratoId === id && o.etapa === ETAPAS_PRODUCAO[0]))
  d.colecoes.agenda_historico = col(d, 'agenda_historico').filter((h) => !visitas.has(String(h.visitaId)))
  d.colecoes.agenda_visitas = col(d, 'agenda_visitas').filter((v) => !visitas.has(v.id))
  d.colecoes.contratos_escola = col(d, 'contratos_escola').filter((x) => x.id !== id)
  auditar(d, ctx, 'EXCLUIR', `Contrato de escola excluído: ${c.escola}`, 'operacional')
  return null
}

APOS_CRIAR.agenda_visitas = (d, v, ctx) => {
  notificar(d, ctx, {
    setores: ['adm', 'gerencia'],
    tipo: 'info',
    titulo: 'Nova visita na agenda',
    descricao: `${v.escola} (${v.cidade}) em ${String(v.data).split('-').reverse().join('/')} — ${v.fichasPrevistas} fichas previstas.`,
    link: '/operacional/agenda',
  })
}

// Histórico de contatos e fichas da visita. Se informar fichas, atualiza as fichas autorizadas.
export function registrarHistoricoVisita(d: ErpState, visitaId: string, h: { tipo: string; fichas?: number; descricao: string }, ctx: Contexto) {
  const v = col(d, 'agenda_visitas').find((x) => x.id === visitaId)
  if (!v) return
  const antes = Number(v.fichasConfirmadas) || 0
  inserir(d, 'agenda_historico', {
    visitaId,
    data: hoje(),
    tipo: h.tipo,
    fichasAntes: h.fichas === undefined ? null : antes,
    fichasDepois: h.fichas === undefined ? null : h.fichas,
    descricao: h.descricao,
    autor: ctx.autorNome,
  })
  if (h.fichas !== undefined) v.fichasConfirmadas = h.fichas
  auditar(d, ctx, 'EDITAR', `Histórico da visita ${v.escola}: ${h.tipo}`, 'operacional')
}

// Visita realizada: fichas fotografadas entram na meta do Operacional e a Produção é liberada
export function encerrarVisita(d: ErpState, visitaId: string, fichas: number, ctx: Contexto) {
  const v = col(d, 'agenda_visitas').find((x) => x.id === visitaId)
  if (!v || v.status !== 'Agendada') return
  v.status = 'Fotografada'
  v.fichasFotografadas = fichas
  // As fichas contam na meta da RMC (dona dos contratos do Operacional)
  lancar(d, ctx, { setor: 'operacional', indicador: 'fichas', colaboradorId: responsavelOperacional(d)?.id ?? '', quantidade: fichas, descricao: `Visita fotografada: ${v.escola}`, data: String(v.data) })
  inserir(d, 'agenda_historico', { visitaId, data: hoje(), tipo: 'Visita encerrada', fichasAntes: null, fichasDepois: null, descricao: `${fichas} fichas fotografadas.`, autor: ctx.autorNome })
  notificar(d, ctx, {
    setores: ['adm', 'gerencia'],
    tipo: 'sucesso',
    titulo: 'Visita fotografada',
    descricao: `${v.escola}: ${fichas} fichas. As fotos seguem para os editores.`,
    link: '/operacional/agenda',
  })
  auditar(d, ctx, 'EDITAR', `Visita encerrada: ${v.escola} (${fichas} fichas)`, 'operacional')
}

// Retorno: as fichas que faltaram voltam para a agenda como uma visita nova (mesma escola e contrato)
// — mesma regra do SQL 016 (agendar_retorno)
export function agendarRetorno(d: ErpState, visitaId: string, fichas: number, data: string, ctx: Contexto): string | null {
  const v = col(d, 'agenda_visitas').find((x) => x.id === visitaId)
  if (!v) return 'Visita não encontrada.'
  if (v.status !== 'Fotografada' && v.status !== 'Fechamento enviado') return 'Só dá para agendar o retorno de uma visita encerrada.'
  if (!(fichas > 0)) return 'Informe quantas fichas ficaram para o retorno.'
  if (!data) return 'Informe a data do retorno.'
  if (data <= String(v.data)) return 'A data do retorno tem que ser depois da visita.'
  const ja = col(d, 'agenda_visitas').find((x) => x.retornoDe === visitaId && x.status !== 'Cancelada')
  if (ja) return `Esta visita já tem retorno agendado para ${String(ja.data).split('-').reverse().join('/')}.`
  const nova = inserir(d, 'agenda_visitas', {
    contratoId: v.contratoId,
    escola: v.escola,
    cidade: v.cidade,
    uf: v.uf,
    endereco: v.endereco,
    telefone: v.telefone,
    responsavel: v.responsavel,
    vendedorId: v.vendedorId,
    data,
    fichasPrevistas: fichas,
    fichasConfirmadas: 0,
    fichasFotografadas: 0,
    equipe: '',
    carro: '',
    fotografoIds: '',
    motoristaId: '',
    status: 'Agendada',
    retornoDe: v.id,
  })
  const br = (iso: unknown) => String(iso).split('-').reverse().join('/')
  inserir(d, 'agenda_historico', { visitaId: v.id, data: hoje(), tipo: 'Retorno agendado', fichasAntes: null, fichasDepois: null, descricao: `${fichas} fichas para o retorno em ${br(data)}.`, autor: ctx.autorNome })
  inserir(d, 'agenda_historico', { visitaId: nova.id, data: hoje(), tipo: 'Retorno', fichasAntes: null, fichasDepois: null, descricao: `Retorno da visita de ${br(v.data)}: ${fichas} fichas que ficaram para o retorno.`, autor: ctx.autorNome })
  APOS_CRIAR.agenda_visitas(d, nova, ctx)
  auditar(d, ctx, 'CRIAR', `Retorno agendado: ${v.escola} (${fichas} fichas em ${br(data)})`, 'operacional')
  return null
}

// Envia o fechamento: cada beneficiário vira uma conta a pagar no Financeiro (com os dados PIX)
export function enviarFechamento(d: ErpState, id: string, ctx: Contexto): string | null {
  const f = col(d, 'fechamentos').find((x) => x.id === id)
  if (!f) return 'Fechamento não encontrado.'
  if (f.status !== 'Rascunho') return 'Este fechamento já foi enviado.'
  const beneficiarios = lerJSON<Beneficiario[]>(f.beneficiarios, [])
  if (!beneficiarios.length) return 'Nada a pagar neste fechamento.'
  const semPix = beneficiarios.filter((b) => !b.pixChave.trim()).map((b) => b.nome)
  if (semPix.length) return `Informe a chave PIX de: ${semPix.join(', ')}.`
  f.status = 'Enviado ao financeiro'
  f.enviadoEm = new Date().toISOString()
  for (const b of beneficiarios) {
    const conta = inserir(d, 'contas_pagar', {
      descricao: b.descricao,
      fornecedor: b.nome,
      favorecido: b.nome,
      categoria: b.categoria,
      valor: b.valor,
      vencimento: hoje(),
      status: 'A pagar',
      dataPagamento: '',
      pixChave: b.pixChave,
      pixBanco: b.pixBanco,
      fechamentoId: f.id,
    })
    APOS_CRIAR.contas_pagar(d, conta, ctx)
  }
  if (f.tipo === 'escola') {
    const v = col(d, 'agenda_visitas').find((x) => x.id === f.refId)
    if (v) v.status = 'Fechamento enviado'
  }
  notificar(d, ctx, {
    setores: ['financeiro', 'adm'],
    tipo: 'info',
    titulo: 'Fechamento operacional recebido',
    descricao: `${f.referencia}: ${beneficiarios.length} pagamento(s) PIX para realizar.`,
    link: '/financeiro/pagamentos',
  })
  auditar(d, ctx, 'EDITAR', `Fechamento enviado ao financeiro: ${f.referencia}`, 'operacional')
  return null
}

// Financeiro devolve o fechamento para a Operações corrigir (mesma regra do SQL 018):
// saem todos os pagamentos do fechamento, ele volta para "Rascunho" com o motivo e a Operações é avisada.
export function devolverFechamento(d: ErpState, contaId: string, motivo: string, ctx: Contexto): string | null {
  if (!motivo.trim()) return 'Informe o motivo da devolução.'
  const c = col(d, 'contas_pagar').find((x) => x.id === contaId)
  if (!c) return 'Pagamento não encontrado.'
  if (!c.fechamentoId) return 'Este pagamento não veio de um fechamento da Operações.'
  const f = col(d, 'fechamentos').find((x) => x.id === c.fechamentoId)
  if (!f) return 'Fechamento não encontrado.'
  if (f.status !== 'Enviado ao financeiro') return 'Este fechamento não está no Financeiro.'
  const contas = col(d, 'contas_pagar').filter((x) => x.fechamentoId === f.id)
  if (contas.some((x) => x.status === 'Pago')) return 'Já existe PIX pago neste fechamento: não dá para devolver.'
  const ids = new Set(contas.map((x) => x.id))
  d.colecoes.aprovacoes = col(d, 'aprovacoes').filter((a) => !(a.refColecao === 'contas_pagar' && a.status === 'Pendente' && ids.has(String(a.refId))))
  d.colecoes.contas_pagar = col(d, 'contas_pagar').filter((x) => !ids.has(x.id))
  f.status = 'Rascunho'
  f.devolucaoMotivo = motivo.trim()
  f.devolvidoEm = new Date().toISOString()
  f.devolvidoPor = ctx.autorNome
  if (f.tipo === 'escola') {
    const v = col(d, 'agenda_visitas').find((x) => x.id === f.refId)
    if (v && v.status === 'Fechamento enviado') v.status = 'Fotografada'
  }
  notificar(d, ctx, { setores: ['operacional', 'adm'], tipo: 'alerta', titulo: 'Fechamento devolvido pelo Financeiro', descricao: `${f.referencia}: ${motivo.trim()}`, link: '/operacional/fechamento' })
  auditar(d, ctx, 'EDITAR', `Fechamento devolvido à Operações: ${f.referencia} — ${motivo.trim()}`, 'financeiro')
  return null
}

// ---------------- Vendas Rebolo (mesmas regras do SQL 012) ----------------

// Venda aprovada (ou venda interna antiga) conta na meta da vendedora: books e valor vendido
export function contarVendaRebolo(d: ErpState, v: Registro, ctx: Contexto) {
  const colaboradorId = String(v.cobradorId ?? '')
  const data = String(v.data || hoje())
  lancar(d, ctx, { setor: 'rebolo', indicador: 'books_vendidos', colaboradorId, quantidade: Number(v.quantidade) || 1, descricao: `${v.pacote} — ${v.responsavel}`, data })
  if ((Number(v.valor) || 0) > 0) lancar(d, ctx, { setor: 'rebolo', indicador: 'valor_vendido', colaboradorId, quantidade: Number(v.valor), descricao: `${v.pacote} — ${v.responsavel}`, data })
}

export type ResultadoContato = 'Sem resposta' | 'Em negociação' | 'Agendado' | 'Descarte'
const SITUACAO_DO_RESULTADO: Record<ResultadoContato, string> = { 'Sem resposta': 'Tentar de novo', 'Em negociação': 'Em negociação', Agendado: 'Agendado', Descarte: 'Descarte' }

export function registrarContatoRebolo(
  d: ErpState,
  fichaId: string,
  c: { resultado: ResultadoContato; observacao: string; motivo?: string; agendadoPara?: string },
  ctx: Contexto,
): string | null {
  const f = col(d, 'rebolo_fichas').find((x) => x.id === fichaId)
  if (!f) return 'Ficha não encontrada.'
  if (!['Aguardando contato', 'Tentar de novo', 'Em negociação', 'Agendado'].includes(String(f.situacao))) return 'Esta ficha não está na fila de contatos.'
  if (c.resultado === 'Descarte' && !c.motivo) return 'Escolha o motivo do descarte.'
  if (c.resultado === 'Agendado' && !c.agendadoPara) return 'Informe a data e a hora do agendamento.'
  inserir(d, 'rebolo_contatos', {
    fichaId,
    vendedoraId: ctx.autorId,
    resultado: c.resultado === 'Descarte' ? `Descarte: ${c.motivo}` : c.resultado,
    observacao: c.observacao.trim(),
    agendadoPara: c.agendadoPara ?? '',
    data: agora(),
  })
  f.situacao = SITUACAO_DO_RESULTADO[c.resultado]
  f.ultimoContato = agora()
  if (c.resultado === 'Sem resposta') f.tentativas = (Number(f.tentativas) || 0) + 1
  f.agendadoPara = c.resultado === 'Agendado' ? String(c.agendadoPara) : ''
  f.motivoDescarte = c.resultado === 'Descarte' ? String(c.motivo) : ''
  if (c.observacao.trim()) f.observacao = c.observacao.trim()
  return null
}

// Supervisora/ADM devolve um descarte para a fila
export function reabrirFichaRebolo(d: ErpState, fichaId: string, ctx: Contexto): string | null {
  const f = col(d, 'rebolo_fichas').find((x) => x.id === fichaId)
  if (!f || f.situacao !== 'Descarte') return 'Só fichas em descarte podem ser reabertas.'
  f.situacao = 'Aguardando contato'
  f.motivoDescarte = ''
  inserir(d, 'rebolo_contatos', { fichaId, vendedoraId: ctx.autorId, resultado: 'Reaberta', observacao: `Descarte reaberto por ${ctx.autorNome}`, agendadoPara: '', data: agora() })
  return null
}

export function pedirDescontoRebolo(d: ErpState, fichaId: string, valor: number, motivo: string, ctx: Contexto): string | null {
  const f = col(d, 'rebolo_fichas').find((x) => x.id === fichaId)
  if (!f) return 'Ficha não encontrada.'
  if (!(valor > 0)) return 'Informe o valor com desconto.'
  if (f.descontoStatus === 'Pendente') return 'Já existe um pedido de desconto aguardando a Gerência.'
  f.descontoValor = valor
  f.descontoStatus = 'Pendente'
  f.descontoMotivo = motivo.trim()
  pedirAprovacao(d, ctx, {
    tipo: 'Desconto rebolo',
    setorOrigem: 'rebolo',
    descricao: `Ficha ${f.numeroFicha} (${f.aluno}) por R$ ${valor.toFixed(2).replace('.', ',')}${motivo.trim() ? ` — ${motivo.trim()}` : ''}`,
    valor,
    refColecao: 'rebolo_fichas',
    refId: fichaId,
  })
  return null
}

// A vendedora anexa o contrato assinado e envia ao Financeiro, ou cancela a venda
export function atualizarVendaRebolo(d: ErpState, vendaId: string, acao: 'enviar' | 'cancelar', dados: { contrato?: string; motivo?: string }, ctx: Contexto): string | null {
  const v = col(d, 'vendas_ebooks').find((x) => x.id === vendaId)
  if (!v || v.canal !== 'Rebolo') return 'Venda não encontrada.'
  if (!['Aguardando contrato', 'Devolvida'].includes(String(v.conferencia))) return 'Esta venda já está com o Financeiro.'
  const ficha = col(d, 'rebolo_fichas').find((f) => f.id === v.fichaReboloId)
  if (acao === 'cancelar') {
    v.conferencia = 'Cancelada'
    v.conferenciaMotivo = String(dados.motivo ?? '').trim()
    if (ficha) ficha.situacao = 'Cancelada'
    auditar(d, ctx, 'EDITAR', `Venda rebolo cancelada: ${v.responsavel}`, 'rebolo')
    return null
  }
  if (!dados.contrato) return 'Anexe o contrato assinado.'
  v.anexos = JSON.stringify({ contratoAssinado: dados.contrato })
  v.conferencia = 'Aguardando conferência'
  v.conferenciaMotivo = ''
  notificar(d, ctx, { setores: ['financeiro', 'adm'], tipo: 'aprovacao', titulo: 'Venda do rebolo para conferir', descricao: `${v.responsavel} • ${v.pacote} • R$ ${(Number(v.valor) || 0).toFixed(2).replace('.', ',')}`, link: '/financeiro/conferencia' })
  auditar(d, ctx, 'EDITAR', `Venda rebolo enviada ao Financeiro: ${v.responsavel}`, 'rebolo')
  return null
}

export function registrarEnvioRebolo(d: ErpState, fichaId: string, rastreio: string, ctx: Contexto): string | null {
  const f = col(d, 'rebolo_fichas').find((x) => x.id === fichaId)
  if (!f || f.situacao !== 'Vendida') return 'Só vendas aprovadas podem ser enviadas.'
  if (!rastreio.trim()) return 'Informe o código de rastreio.'
  f.rastreio = rastreio.trim().toUpperCase()
  f.enviadoEm = agora()
  auditar(d, ctx, 'EDITAR', `Álbum enviado (rastreio ${f.rastreio}): ficha ${f.numeroFicha}`, 'rebolo')
  return null
}
