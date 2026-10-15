// Regras de negócio que ligam os setores (o "Núcleo ERP").
// Todas as funções recebem um rascunho do estado e o alteram diretamente;
// o store (store.ts) cuida de persistir e avisar as telas em tempo real.
// No backend, estas regras viram triggers/functions do Supabase.

import type { ErpState, Lancamento, Notificacao, Registro, Setor, TipoLog } from './types'
import { ETAPAS_PRODUCAO, VALOR_APROVACAO_CONTA, indicador } from './config'
import { avisosRascunhoVisita, bloqueioVisitaEncerrada, camposFaltando, lerJSON, responsavelOperacional, type Beneficiario } from './operacional'
import { addDias, addMeses, brl, dataBR, diaLocal, hoje, uid } from './format'
import { metaColaborador, somar } from './metrics'
import { ETAPAS_LOTE, ETAPA_DA_ACAO, PALETA_CIDADES, chaveCidade, etapaDoLote, type AcaoLote, type DadosAcaoLote, type EtapaLote } from './producao'
import { chaveEscola } from './escolas'
import { proximoPacote } from './rebolo'
import { REGRAS_COBRANCA, rotuloRegra, tipoEscritorioDoGrupo, validarRegrasCobranca } from './cobranca-config'
import { documentoValido, textoBusca } from './documento'
import { calcularCarteira } from './carteira'
import { calcularAcordo, type DadosAcordo } from './acordo'

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

  const novo: Lancamento = { origem: 'automatico', ...l, id: uid(), criadoEm: agora(), autorId: ctx.autorId }
  d.lancamentos.push(novo)

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
  return novo.id
}

// ---------------- Automação após criar registros ----------------

type PosCriar = (d: ErpState, r: Registro, ctx: Contexto) => void

// Cadastro de escolas (demo): registra a escola do contrato se ainda não existir (pelo INEP ou por nome + cidade + UF)
export function registrarEscolaDemo(d: ErpState, c: Registro) {
  const nome = String(c.escola ?? '').trim()
  if (!nome) return
  const inep = String(c.inep ?? '').replace(/\D/g, '')
  const chave = chaveEscola(nome, c.cidade, c.uf)
  const ja = col(d, 'escolas').find((e) => (inep && String(e.inep ?? '').replace(/\D/g, '') === inep) || chaveEscola(e.nome, e.cidade, e.uf) === chave)
  if (ja) {
    for (const k of ['endereco', 'telefone', 'responsavel'] as const) if (!ja[k] && c[k]) ja[k] = c[k]
    if (!ja.inep && inep) ja.inep = inep
    return
  }
  inserir(d, 'escolas', { nome, cidade: String(c.cidade ?? ''), uf: String(c.uf || 'PR').toUpperCase(), inep, endereco: String(c.endereco ?? ''), telefone: String(c.telefone ?? ''), responsavel: String(c.responsavel ?? ''), status: 'Ativa', observacao: '' })
}

export const APOS_CRIAR: Record<string, PosCriar> = {
  // Contrato de escola → a escola entra no cadastro de escolas (se ainda não estiver) — mesma regra do SQL 027
  contratos_escola(d, r) {
    registrarEscolaDemo(d, r)
  },
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
      gerarCobrancaVenda(d, r, ctx)
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

export function aposAtualizar(d: ErpState, nome: string, r: Registro, ctx: Contexto, antes?: Registro) {
  // contrato que já está na agenda: o que mudou vai para a visita agendada (SQL 028)
  if (nome === 'contratos_escola' && antes) contratoAtualizaVisita(d, r, antes, ctx)
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
    if (a.refColecao === 'acordos') {
      ref.status = aprovado ? 'Ativo' : 'Rejeitado'
      if (!aprovado) reabrirParcelasDoAcordo(d, ref.id) // como o gatilho do SQL 042
    }
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

// ---- Carteira de cobranças no modo demonstração — mesmas regras dos SQLs 041 e 042 ----
const CONTAS_VALIDAS = ['CA Beatriz', 'CA Diogo']
const FORMAS_VALIDAS = ['Boleto', 'PIX', 'Dinheiro', 'Cartão', 'Transferência', 'Outro']
const centavos = (v: number) => Math.round(v * 100) / 100
const nomeComparavel = (v: unknown) => textoBusca(v).replace(/\s+/g, ' ').trim()
const soNumeros = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const reais = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

// como o gatilho cobranca_parcela_antes: Aberta / Parcial / Paga saem do que foi baixado
function ajustarParcela(p: Registro, pagoEm = hoje()) {
  if (p.situacao === 'Em acordo' || p.situacao === 'Cancelada') return
  const baixado = Number(p.baixado) || 0
  if (baixado >= (Number(p.valor) || 0)) {
    p.situacao = 'Paga'
    p.pagoEm = p.pagoEm || pagoEm
  } else {
    p.situacao = baixado > 0 ? 'Parcial' : 'Aberta'
    p.pagoEm = ''
  }
}

function regraCobrancaDemo(d: ErpState, chave: string) {
  const salva = col(d, 'cobranca_regras').find((r) => r.chave === chave)
  return salva ? Number(salva.valor) : (REGRAS_COBRANCA.find((r) => r.chave === chave)?.padrao ?? 0)
}

function registrarHistoricoCategoria(d: ErpState, cobrancaId: string, anterior: string, nova: string, ctx: Contexto) {
  inserir(d, 'cobranca_categorias_historico', { cobrancaId, categoriaAnteriorId: anterior, categoriaId: nova, alteradoPor: ctx.autorId, alteradoPorNome: ctx.autorNome || 'sistema' })
}

// cobrador da dívida (14/10, SQL 045): tem que ser alguém do setor Cobrança. Com 1 cobrador ativo só, a dívida é sempre dele
// (a vendedora do Rebolo/interna não vira cobradora da própria venda).
function cobradorDaCobranca(d: ErpState, sugerido: string): string {
  const doSetor = d.colaboradores.filter((x) => x.setor === 'cobranca' && x.status === 'ATIVO')
  if (doSetor.length === 1) return doSetor[0].id
  return doSetor.some((x) => x.id === sugerido) ? sugerido : ''
}

function novaCobranca(d: ErpState, dados: Record<string, string>, ctx: Contexto) {
  const c = inserir(d, 'cobrancas', { situacao: 'Aguardando cobrança', observacao: '', referencia: '', codigoVenda: '', vendaId: '', conta: 'CA Beatriz', ...dados, cobradorId: cobradorDaCobranca(d, String(dados.cobradorId ?? '')) })
  registrarHistoricoCategoria(d, c.id, '', String(c.categoriaId), ctx)
  return c
}

function novaParcela(d: ErpState, dados: Record<string, string | number>) {
  const p = inserir(d, 'cobranca_parcelas', { multa: regraCobrancaDemo(d, 'multa_padrao'), baixado: 0, situacao: 'Aberta', pagoEm: '', acordoId: '', cobraJuros: true, ...dados })
  ajustarParcela(p, String(dados.pagoEm || hoje()))
  return p
}

// cliente da venda: pelo CPF/CNPJ; sem documento, pelo mesmo nome + telefone; senão cadastra
function clienteDaVenda(d: ErpState, v: Registro) {
  const clientes = col(d, 'clientes')
  const doc = soNumeros(v.cpf)
  const temDoc = doc.length === 11 || doc.length === 14
  const tel = soNumeros(v.whatsapp || v.telefone)
  let c = temDoc ? clientes.find((x) => soNumeros(x.documento) === doc) : undefined
  if (!c && !temDoc && tel.length >= 10)
    c = clientes.find((x) => !soNumeros(x.documento) && nomeComparavel(x.nome) === nomeComparavel(v.responsavel) && [soNumeros(x.telefone1), soNumeros(x.whatsapp)].includes(tel))
  if (c) {
    const completar: [string, unknown][] = [['telefone1', v.telefone], ['whatsapp', v.whatsapp], ['email', v.email], ['rua', v.endereco], ['bairro', v.bairro], ['cep', v.cep], ['cidade', v.cidade]]
    for (const [campo, valor] of completar) if (!c[campo] && valor) c[campo] = String(valor)
    return c.id
  }
  const uf = String(v.uf ?? '').trim().toUpperCase()
  return inserir(d, 'clientes', {
    nome: String(v.responsavel ?? '').replace(/\s+/g, ' ').trim().toUpperCase() || 'CLIENTE SEM NOME',
    documento: temDoc ? doc : '',
    tipoPessoa: doc.length === 14 ? 'Jurídica' : 'Física',
    telefone1: String(v.telefone ?? ''), telefone2: '', telefone3: '', whatsapp: String(v.whatsapp ?? ''), email: String(v.email ?? ''),
    cep: String(v.cep ?? ''), rua: String(v.endereco ?? ''), numero: '', complemento: '', bairro: String(v.bairro ?? ''), cidade: String(v.cidade ?? ''),
    uf: /^[A-Z]{2}$/.test(uf) ? uf : '', origem: v.canal === 'Rebolo' ? 'Rebolo' : v.canal === 'Externo' ? 'Vendedor externo' : 'Cadastro manual',
    codigoContaAzul: '', codigoSistemaAntigo: '', observacao: '',
  }).id
}

function categoriaDaVenda(d: ErpState, canal: unknown) {
  const ativas = col(d, 'cobranca_categorias').filter((c) => c.ativa !== false)
  const nome = nomeComparavel(canal === 'Rebolo' ? 'Receita de Vendas Online (Rebolo)' : 'Receita de Recordação Escolar')
  return ativas.find((c) => nomeComparavel(c.nome) === nome)?.id ?? ativas.find((c) => c.grupo === 'Cobrança DLG')?.id ?? ''
}

const formaDoRecebimento = (forma: unknown) => {
  const f = String(forma ?? '')
  return ['Boleto', 'PIX', 'Dinheiro'].includes(f) ? f : f.startsWith('Cartão') ? 'Cartão' : 'Outro'
}

function recebimentoDaVenda(d: ErpState, ctx: Contexto, p: Registro, cobrancaId: string, valor: number, data: string, formaVenda: unknown, cobradorMeta: string, descricao: string, observacao = '') {
  const lancamentoId = cobradorMeta ? lancar(d, ctx, { setor: 'cobranca', indicador: 'valor_recebido', colaboradorId: cobradorMeta, quantidade: valor, descricao, data }) : ''
  inserir(d, 'cobranca_pagamentos', {
    parcelaId: p.id, cobrancaId, valor, principal: valor, encargos: 0, desconto: 0, data, forma: formaDoRecebimento(formaVenda), observacao, origem: 'Sistema',
    lancamentoId, registradoPor: ctx.autorId, registradoPorNome: ctx.autorNome || 'na venda', estornadoEm: '', estornadoPorNome: '', estornoMotivo: '',
  })
}

// Venda → cobrança + parcelas (entrada e à vista/cartão pagos; boleto e PIX/dinheiro parcelado em aberto) — idempotente
export function gerarCobrancaVenda(d: ErpState, v: Registro, ctx: Contexto) {
  if (col(d, 'cobrancas').some((c) => c.vendaId === v.id)) return
  const categoriaId = categoriaDaVenda(d, v.canal)
  if (!categoriaId) return
  const data = String(v.data || hoje())
  const forma = String(v.formaPagamento || 'Boleto')
  const n = Math.max(1, Number(v.parcelas) || 1)
  const entrada = Number(v.entrada) || 0
  const restante = centavos((Number(v.valor) || 0) - entrada)
  const primeiro = String(v.primeiroVencimento || data)
  const meta = v.canal !== 'Externo' ? String(v.cobradorId ?? '') : ''
  const c = novaCobranca(
    d,
    {
      clienteId: clienteDaVenda(d, v), vendaId: v.id, origem: 'Venda', codigoVenda: String(v.numeroFicha ?? ''), categoriaId, cobradorId: String(v.cobradorId ?? ''),
      referencia: [v.aluno, v.escola, v.pacote].map((x) => String(x ?? '').trim()).filter(Boolean).join(' • '),
    },
    ctx,
  )
  if (entrada > 0) {
    const p = novaParcela(d, { cobrancaId: c.id, numero: 0, total: n, valor: entrada, vencimento: data, multa: 0, baixado: entrada, pagoEm: data })
    recebimentoDaVenda(d, ctx, p, c.id, entrada, data, forma, meta, `Entrada — ${v.responsavel}`, 'Entrada da venda')
  }
  if (restante <= 0) return
  const aberto = forma === 'Boleto' || ((forma === 'PIX' || forma === 'Dinheiro') && (n > 1 || primeiro > data))
  if (aberto) {
    const parcela = centavos(restante / n)
    for (let i = 1; i <= n; i++)
      novaParcela(d, { cobrancaId: c.id, numero: i, total: n, valor: i === n ? centavos(restante - parcela * (n - 1)) : parcela, vencimento: addMeses(primeiro, i - 1) })
  } else {
    const p = novaParcela(d, { cobrancaId: c.id, numero: 1, total: 1, valor: restante, vencimento: data, multa: 0, baixado: restante, pagoEm: data })
    recebimentoDaVenda(d, ctx, p, c.id, restante, data, forma, meta, `Recebido na venda — ${v.responsavel}`, forma === 'Cartão de crédito' && n > 1 ? `${n}x no cartão` : '')
  }
}

// Recebimento pelo Financeiro (pode ser parcial). Passou do saldo: o resto é juros/multa. Com "quitar", o que faltar vira desconto.
export function registrarPagamentoParcela(
  d: ErpState,
  parcelaId: string,
  valorInformado: number,
  data: string,
  forma: string,
  observacao: string,
  quitar: boolean,
  ctx: Contexto,
): string | null {
  const valor = centavos(Number(valorInformado) || 0)
  if (valor <= 0) return 'Informe o valor recebido.'
  if (!FORMAS_VALIDAS.includes(forma)) return 'Forma de recebimento inválida (Boleto, PIX, Dinheiro, Cartão, Transferência ou Outro).'
  if (!data || data > hoje()) return 'Informe a data do recebimento (não pode ser no futuro).'
  const p = col(d, 'cobranca_parcelas').find((x) => x.id === parcelaId)
  if (!p) return 'Parcela não encontrada.'
  if (p.situacao !== 'Aberta' && p.situacao !== 'Parcial') return `Esta parcela está ${String(p.situacao).toLowerCase()} e não recebe pagamento.`
  const c = col(d, 'cobrancas').find((x) => x.id === p.cobrancaId)
  const saldo = centavos((Number(p.valor) || 0) - (Number(p.baixado) || 0))
  const principal = valor >= saldo ? saldo : valor
  const encargos = valor >= saldo ? centavos(valor - saldo) : 0
  const desconto = valor < saldo && quitar ? centavos(saldo - valor) : 0
  const cliente = col(d, 'clientes').find((x) => x.id === c?.clienteId)
  // meta do cobrador (SQL 049): só a entrada confirmada dos acordos em SPC; pagamento de parcela não lança meta
  void cliente
  const lancamentoId = ''
  inserir(d, 'cobranca_pagamentos', {
    parcelaId: p.id, cobrancaId: String(p.cobrancaId), valor, principal, encargos, desconto, data, forma, observacao: observacao.trim(), origem: 'Sistema', lancamentoId,
    registradoPor: ctx.autorId, registradoPorNome: ctx.autorNome, estornadoEm: '', estornadoPorNome: '', estornoMotivo: '',
  })
  p.baixado = centavos((Number(p.baixado) || 0) + principal + desconto)
  p.pagoEm = Number(p.baixado) >= Number(p.valor) ? data : ''
  ajustarParcela(p, data)
  auditar(d, ctx, 'CRIAR', `Recebimento de ${reais(valor)} na parcela ${p.numero}/${p.total} de ${cliente?.nome ?? ''}`, ctx.autorSetor)
  return null
}

export function estornarPagamentoParcela(d: ErpState, pagamentoId: string, motivo: string, ctx: Contexto): string | null {
  if (!motivo.trim()) return 'Informe o motivo do estorno.'
  const g = col(d, 'cobranca_pagamentos').find((x) => x.id === pagamentoId)
  if (!g) return 'Recebimento não encontrado.'
  if (g.estornadoEm) return 'Este recebimento já foi estornado.'
  g.estornadoEm = agora()
  g.estornoMotivo = motivo.trim()
  g.estornadoPorNome = ctx.autorNome
  if (g.lancamentoId) d.lancamentos = d.lancamentos.filter((l) => l.id !== g.lancamentoId)
  g.lancamentoId = ''
  const p = col(d, 'cobranca_parcelas').find((x) => x.id === g.parcelaId)
  if (p) {
    p.baixado = Math.max(0, centavos((Number(p.baixado) || 0) - (Number(g.principal) || 0) - (Number(g.desconto) || 0)))
    if (p.situacao === 'Paga' || p.situacao === 'Parcial') p.situacao = 'Aberta'
    p.pagoEm = ''
    ajustarParcela(p)
  }
  auditar(d, ctx, 'EDITAR', `Recebimento estornado (${motivo.trim()})`, ctx.autorSetor)
  return null
}

export function editarParcela(d: ErpState, id: string, dados: { valor: number; vencimento: string; multa: number }, ctx: Contexto): string | null {
  const p = col(d, 'cobranca_parcelas').find((x) => x.id === id)
  if (!p) return 'Parcela não encontrada.'
  if (!(dados.valor >= 0) || !dados.vencimento || !(dados.multa >= 0)) return 'Confira o valor, o vencimento e a multa.'
  if (dados.valor < (Number(p.baixado) || 0)) return 'O valor não pode ficar menor que o que já foi recebido.'
  p.valor = centavos(dados.valor)
  p.vencimento = dados.vencimento
  p.multa = centavos(dados.multa)
  ajustarParcela(p)
  auditar(d, ctx, 'EDITAR', `Parcela ${p.numero}/${p.total} alterada`, ctx.autorSetor)
  return null
}

export function mudarSituacaoParcela(d: ErpState, id: string, situacao: 'Cancelada' | 'Aberta', ctx: Contexto): string | null {
  const p = col(d, 'cobranca_parcelas').find((x) => x.id === id)
  if (!p) return 'Parcela não encontrada.'
  p.situacao = situacao
  if (situacao === 'Aberta') ajustarParcela(p)
  auditar(d, ctx, 'EDITAR', `Parcela ${p.numero}/${p.total} ${situacao === 'Cancelada' ? 'cancelada' : 'reaberta'}`, ctx.autorSetor)
  return null
}

export interface DadosLancarCobranca {
  clienteId: string
  categoriaId: string
  cobradorId: string
  conta: string
  referencia: string
  valor: number
  parcelas: number
  primeiroVencimento: string
  observacao: string
}

export function conferirLancamentoCobranca(d: ErpState, x: DadosLancarCobranca): string | null {
  if (!x.clienteId) return 'Escolha o cliente.'
  if (!col(d, 'cobranca_categorias').some((c) => c.id === x.categoriaId && c.ativa !== false)) return 'Escolha a categoria.'
  if (!CONTAS_VALIDAS.includes(x.conta)) return 'Escolha a conta (CA Beatriz ou CA Diogo).'
  if (!(x.valor > 0)) return 'Informe o valor.'
  if (!Number.isInteger(x.parcelas) || x.parcelas < 1 || x.parcelas > 120) return 'Informe de 1 a 120 parcelas.'
  if (!x.primeiroVencimento) return 'Informe o 1º vencimento.'
  return null
}

export function lancarCobranca(d: ErpState, x: DadosLancarCobranca, ctx: Contexto): string | null {
  const erro = conferirLancamentoCobranca(d, x)
  if (erro) return erro
  if (!col(d, 'clientes').some((c) => c.id === x.clienteId)) return 'Escolha o cliente.'
  const valor = centavos(x.valor)
  const c = novaCobranca(
    d,
    { clienteId: x.clienteId, origem: 'Lançamento manual', categoriaId: x.categoriaId, cobradorId: x.cobradorId, conta: x.conta, referencia: x.referencia.trim(), observacao: x.observacao.trim() },
    ctx,
  )
  const parcela = centavos(valor / x.parcelas)
  for (let i = 1; i <= x.parcelas; i++)
    novaParcela(d, { cobrancaId: c.id, numero: i, total: x.parcelas, valor: i === x.parcelas ? centavos(valor - parcela * (x.parcelas - 1)) : parcela, vencimento: addMeses(x.primeiroVencimento, i - 1) })
  auditar(d, ctx, 'CRIAR', `Cobrança lançada: ${reais(valor)} em ${x.parcelas}x`, ctx.autorSetor)
  return null
}

export interface DadosEditarCobranca {
  categoriaId: string
  cobradorId: string
  conta: string
  referencia: string
  observacao: string
}

export function editarCobranca(d: ErpState, id: string, x: DadosEditarCobranca, ctx: Contexto): string | null {
  const c = col(d, 'cobrancas').find((y) => y.id === id)
  if (!c) return 'Cobrança não encontrada.'
  if (!CONTAS_VALIDAS.includes(x.conta)) return 'Escolha a conta (CA Beatriz ou CA Diogo).'
  if (!col(d, 'cobranca_categorias').some((y) => y.id === x.categoriaId)) return 'Escolha a categoria.'
  if (c.categoriaId !== x.categoriaId) registrarHistoricoCategoria(d, c.id, String(c.categoriaId), x.categoriaId, ctx)
  Object.assign(c, { categoriaId: x.categoriaId, cobradorId: cobradorDaCobranca(d, x.cobradorId), conta: x.conta, referencia: x.referencia.trim(), observacao: x.observacao.trim() })
  auditar(d, ctx, 'EDITAR', 'Cobrança alterada', ctx.autorSetor)
  return null
}

export function excluirCobranca(d: ErpState, id: string, ctx: Contexto): string | null {
  if (col(d, 'cobranca_pagamentos').some((g) => g.cobrancaId === id && !g.estornadoEm)) return 'Tem recebimento registrado: estorne os recebimentos antes de excluir.'
  d.colecoes.cobrancas = col(d, 'cobrancas').filter((c) => c.id !== id)
  d.colecoes.cobranca_parcelas = col(d, 'cobranca_parcelas').filter((p) => p.cobrancaId !== id)
  d.colecoes.cobranca_pagamentos = col(d, 'cobranca_pagamentos').filter((g) => g.cobrancaId !== id)
  d.colecoes.cobranca_categorias_historico = col(d, 'cobranca_categorias_historico').filter((h) => h.cobrancaId !== id)
  auditar(d, ctx, 'EXCLUIR', 'Cobrança excluída', ctx.autorSetor)
  return null
}

// Negociar: as parcelas vencidas da cobrança ficam "Em acordo" e o acordo vai para a aprovação (só se pode renegociar)
export function negociarCobranca(d: ErpState, cobrancaId: string, parcelas: number, ctx: Contexto, hj = hoje()): string | null {
  const c = calcularCarteira(d, hj).cobrancas.find((x) => x.id === cobrancaId)
  if (!c) return 'Cobrança não encontrada.'
  if (!c.podeRenegociar)
    return `Esta cobrança ainda não pode ser renegociada: precisa de ${regraCobrancaDemo(d, 'reneg_min_boletos')} boletos vencidos e ${regraCobrancaDemo(d, 'reneg_min_dias')} dias de atraso, na Cobrança DLG.`
  const acordo = inserir(d, 'acordos', {
    cliente: c.cliente, escola: '', telefone: c.telefone, valorOriginal: c.vencido, valorAcordo: c.atualizado, parcelas, primeiroVencimento: addDias(hj, 7),
    status: 'Aguardando aprovação', tituloId: '', cobrancaId,
  })
  for (const p of col(d, 'cobranca_parcelas'))
    if (p.cobrancaId === cobrancaId && (p.situacao === 'Aberta' || p.situacao === 'Parcial') && String(p.vencimento) < hj) {
      p.situacao = 'Em acordo'
      p.acordoId = acordo.id
    }
  APOS_CRIAR.acordos(d, acordo, ctx)
  auditar(d, ctx, 'CRIAR', `Acordo gerado para ${c.cliente}`, 'cobranca')
  return null
}

function reabrirParcelasDoAcordo(d: ErpState, acordoId: string) {
  for (const p of col(d, 'cobranca_parcelas'))
    if (p.acordoId === acordoId && p.situacao === 'Em acordo') {
      p.situacao = 'Aberta'
      p.acordoId = ''
      ajustarParcela(p)
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
    gerarCobrancaVenda(d, v, ctx)
    if (v.canal === 'Rebolo') {
      // já contou na assinatura; a venda de antes do SQL 044 conta agora, no dia da assinatura
      contarVendaRebolo(d, v, ctx, v.assinaturaEm ? diaLocal(String(v.assinaturaEm)) : undefined)
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
// (visita com data futura não é encerrada: corrige-se a data antes — mesma regra do SQL 028)
export function encerrarVisita(d: ErpState, visitaId: string, fichas: number, ctx: Contexto): string | null {
  const v = col(d, 'agenda_visitas').find((x) => x.id === visitaId)
  if (!v || v.status !== 'Agendada') return 'Esta visita não está agendada.'
  if (String(v.data) > hoje()) return `Esta visita está marcada para ${dataBR(String(v.data))} (data futura). Se ela já foi feita, corrija a data em "Editar agendamento" antes de encerrar.`
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
  // A escola entra na PRODUÇÃO (aguardando as fotos) — mesma regra do SQL 020
  if (criarLoteProducao(d, v, ctx, 'Chegou das Operações'))
    notificar(d, ctx, { setores: ['edicao'], tipo: 'info', titulo: 'Escola chegou na Produção', descricao: `${v.escola}: ${fichas} alunos fotografados. Aguardando as fotos.`, link: '/edicao' })
  return null
}

// =====================================================================
// EDITAR E CANCELAR NAS OPERAÇÕES (mesmas regras do SQL 028)
// =====================================================================

const motivoTxt = (m: string) => m.trim()

// Contrato que já está na agenda: o que mudou no contrato vai para a visita agendada
// (dados da escola e vendedor também no retorno agendado; data e fichas previstas só na visita)
export function contratoAtualizaVisita(d: ErpState, novo: Registro, antes: Registro, ctx: Contexto) {
  if (novo.status !== 'Na agenda' || antes.status !== 'Na agenda') return
  const mudou = (k: string) => String(novo[k] ?? '') !== String(antes[k] ?? '')
  const difere = (v: Registro, k: string, vk = k) => String(v[vk] ?? '') !== String(novo[k] ?? '')
  for (const v of col(d, 'agenda_visitas').filter((x) => x.contratoId === novo.id && x.status === 'Agendada')) {
    const mud: string[] = []
    if (!v.retornoDe && mudou('dataPrevista') && novo.dataPrevista && difere(v, 'dataPrevista', 'data')) {
      mud.push(`data ${dataBR(String(v.data))} → ${dataBR(String(novo.dataPrevista))}`)
      v.data = novo.dataPrevista
    }
    if (!v.retornoDe && mudou('fichasPrevistas') && Number(v.fichasPrevistas) !== Number(novo.fichasPrevistas)) {
      mud.push(`fichas previstas ${Number(v.fichasPrevistas) || 0} → ${Number(novo.fichasPrevistas) || 0}`)
      v.fichasPrevistas = Number(novo.fichasPrevistas) || 0
    }
    if (mudou('escola') && difere(v, 'escola')) {
      mud.push(`escola: ${novo.escola}`)
      v.escola = novo.escola
    }
    if ((mudou('cidade') && difere(v, 'cidade')) || (mudou('uf') && difere(v, 'uf'))) {
      mud.push(`cidade: ${novo.cidade}-${novo.uf}`)
      if (mudou('cidade')) v.cidade = novo.cidade
      if (mudou('uf')) v.uf = novo.uf
    }
    for (const [k, rot] of [['endereco', 'endereço'], ['telefone', 'telefone'], ['responsavel', 'responsável']] as const) {
      if (mudou(k) && difere(v, k)) {
        mud.push(`${rot}: ${String(novo[k] || '—')}`)
        v[k] = novo[k]
      }
    }
    if (mudou('vendedorId') && difere(v, 'vendedorId')) {
      mud.push(`vendedor: ${String(col(d, 'pj_vendedores').find((p) => p.id === novo.vendedorId)?.nome ?? '—')}`)
      v.vendedorId = novo.vendedorId
    }
    if (mud.length) inserir(d, 'agenda_historico', { visitaId: v.id, data: hoje(), tipo: 'Atualizado pelo contrato', fichasAntes: null, fichasDepois: null, descricao: `${mud.join(' • ')}.`, autor: ctx.autorNome })
  }
}

export interface DadosAgendamento {
  data: string
  fichasPrevistas: number
  fichasConfirmadas: number
  escola: string
  cidade: string
  uf: string
  endereco: string
  telefone: string
  responsavel: string
}

// Editar agendamento (visita ou retorno ainda agendado). A visita leva a data, as fichas previstas e os dados da escola
// para o contrato; o retorno tem data e fichas próprias e não mexe no contrato.
export function editarAgendamento(d: ErpState, visitaId: string, x: DadosAgendamento, motivo: string, ctx: Contexto): string | null {
  const v = col(d, 'agenda_visitas').find((r) => r.id === visitaId)
  if (!v) return 'Visita não encontrada.'
  if (v.status !== 'Agendada') return `Só dá para editar uma visita agendada (esta está "${v.status}").`
  const novo = {
    data: x.data,
    fichasPrevistas: Number(x.fichasPrevistas) || 0,
    fichasConfirmadas: Number(x.fichasConfirmadas) || 0,
    escola: x.escola.trim(),
    cidade: x.cidade.trim(),
    uf: x.uf.trim().toUpperCase() || String(v.uf ?? ''),
    endereco: x.endereco.trim(),
    telefone: x.telefone.trim(),
    responsavel: x.responsavel.trim(),
  }
  if (!novo.data) return 'Informe a data da visita.'
  if (!novo.escola) return 'Informe o nome da escola.'
  if (!novo.cidade) return 'Informe a cidade.'
  if (novo.fichasPrevistas <= 0) return 'Informe as fichas previstas.'
  if (novo.fichasConfirmadas < 0) return 'Fichas confirmadas inválidas.'
  const origem = v.retornoDe ? col(d, 'agenda_visitas').find((r) => r.id === v.retornoDe) : undefined
  if (origem && novo.data <= String(origem.data)) return `O retorno tem que ser depois da visita de ${dataBR(String(origem.data))}.`
  const txt = (k: string) => String(v[k] ?? '').trim()
  const mud: string[] = []
  if (novo.data !== String(v.data)) mud.push(`data ${dataBR(String(v.data))} → ${dataBR(novo.data)}`)
  if (novo.fichasPrevistas !== (Number(v.fichasPrevistas) || 0)) mud.push(`fichas previstas ${Number(v.fichasPrevistas) || 0} → ${novo.fichasPrevistas}`)
  const confirmadasAntes = Number(v.fichasConfirmadas) || 0
  if (novo.fichasConfirmadas !== confirmadasAntes) mud.push(`fichas confirmadas ${confirmadasAntes} → ${novo.fichasConfirmadas}`)
  if (novo.escola !== txt('escola')) mud.push(`escola: ${txt('escola')} → ${novo.escola}`)
  if (novo.cidade !== txt('cidade') || novo.uf !== txt('uf')) mud.push(`cidade: ${txt('cidade')}-${txt('uf')} → ${novo.cidade}-${novo.uf}`)
  if (novo.endereco !== txt('endereco')) mud.push(`endereço: ${novo.endereco || '—'}`)
  if (novo.telefone !== txt('telefone')) mud.push(`telefone: ${novo.telefone || '—'}`)
  if (novo.responsavel !== txt('responsavel')) mud.push(`responsável: ${novo.responsavel || '—'}`)
  if (!mud.length) return 'Nada mudou.'
  Object.assign(v, novo)
  inserir(d, 'agenda_historico', {
    visitaId: v.id,
    data: hoje(),
    tipo: 'Agendamento editado',
    fichasAntes: novo.fichasConfirmadas !== confirmadasAntes ? confirmadasAntes : null,
    fichasDepois: novo.fichasConfirmadas !== confirmadasAntes ? novo.fichasConfirmadas : null,
    descricao: `${mud.join(' • ')}.${motivoTxt(motivo) ? ` Motivo: ${motivoTxt(motivo)}.` : ''}`,
    autor: ctx.autorNome,
  })
  const c = !v.retornoDe && v.contratoId ? col(d, 'contratos_escola').find((r) => r.id === v.contratoId) : undefined
  if (c) {
    const antes = { ...c }
    Object.assign(c, { dataPrevista: novo.data, fichasPrevistas: novo.fichasPrevistas, escola: novo.escola, cidade: novo.cidade, uf: novo.uf, endereco: novo.endereco, telefone: novo.telefone, responsavel: novo.responsavel })
    contratoAtualizaVisita(d, c, antes, ctx)
  }
  auditar(d, ctx, 'EDITAR', `Agendamento editado: ${v.escola} (${mud.join(' • ')})`, 'operacional')
  return null
}

// Cancelar agendamento (com motivo). Visita: o contrato volta para a conferência (reagendar, editar ou excluir).
// Retorno: só o retorno é cancelado (a visita de origem pode agendar outro).
export function cancelarAgendamento(d: ErpState, visitaId: string, motivo: string, ctx: Contexto): string | null {
  if (!motivoTxt(motivo)) return 'Informe o motivo do cancelamento.'
  const v = col(d, 'agenda_visitas').find((r) => r.id === visitaId)
  if (!v) return 'Visita não encontrada.'
  if (v.status !== 'Agendada') return `Só dá para cancelar uma visita agendada (esta está "${v.status}").`
  const tipo = v.retornoDe ? 'Retorno cancelado' : 'Visita cancelada'
  v.status = 'Cancelada'
  inserir(d, 'agenda_historico', { visitaId: v.id, data: hoje(), tipo, fichasAntes: null, fichasDepois: null, descricao: `Motivo: ${motivoTxt(motivo)}.`, autor: ctx.autorNome })
  if (v.retornoDe) {
    inserir(d, 'agenda_historico', { visitaId: String(v.retornoDe), data: hoje(), tipo: 'Retorno cancelado', fichasAntes: null, fichasDepois: null, descricao: `O retorno de ${dataBR(String(v.data))} (${Number(v.fichasPrevistas) || 0} fichas) foi cancelado. Motivo: ${motivoTxt(motivo)}.`, autor: ctx.autorNome })
  } else if (v.contratoId) {
    const c = col(d, 'contratos_escola').find((r) => r.id === v.contratoId)
    const outras = col(d, 'agenda_visitas').some((o) => o.contratoId === v.contratoId && o.id !== v.id && o.status !== 'Cancelada')
    if (c && c.status === 'Na agenda' && !outras) {
      c.status = 'Em conferência'
      c.observacao = [String(c.observacao || '').trim(), `Agendamento de ${dataBR(String(v.data))} cancelado: ${motivoTxt(motivo)}`].filter(Boolean).join(' • ')
    }
  }
  notificar(d, ctx, { setores: ['adm', 'gerencia'], tipo: 'alerta', titulo: tipo, descricao: `${v.escola} (${dataBR(String(v.data))}): ${motivoTxt(motivo)}`, link: '/operacional/agenda' })
  auditar(d, ctx, 'EDITAR', `${tipo}: ${v.escola} — ${motivoTxt(motivo)}`, 'operacional')
  return null
}

// O lançamento automático da meta que a visita gerou ao ser encerrada
function lancamentoDaVisita(d: ErpState, v: Registro) {
  return d.lancamentos
    .filter((l) => l.setor === 'operacional' && l.indicador === 'fichas' && l.origem === 'automatico' && l.data === String(v.data) && l.descricao === `Visita fotografada: ${v.escola}` && l.quantidade === (Number(v.fichasFotografadas) || 0))
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))[0]
}

// Corrigir as fichas fotografadas: a meta das Operações e a escola na Produção acompanham
// (enquanto os álbuns não entraram na meta da Produção). Devolve o erro, ou o aviso de rascunho de fechamento a conferir.
export function corrigirFichasVisita(d: ErpState, visitaId: string, fichas: number, motivo: string, ctx: Contexto): { erro: string } | { aviso: string | null } {
  if (!motivoTxt(motivo)) return { erro: 'Informe o motivo da correção.' }
  if (!(fichas > 0)) return { erro: 'Informe quantas fichas foram fotografadas.' }
  const v = col(d, 'agenda_visitas').find((r) => r.id === visitaId)
  if (!v) return { erro: 'Visita não encontrada.' }
  if (v.status !== 'Fotografada' && v.status !== 'Fechamento enviado') return { erro: 'Só dá para corrigir as fichas de uma visita encerrada.' }
  const bloqueio = bloqueioVisitaEncerrada(d, v)
  if (bloqueio) return { erro: bloqueio }
  const antes = Number(v.fichasFotografadas) || 0
  if (fichas === antes) return { erro: `Nada mudou: a visita já está com ${fichas} fichas.` }
  const lote = col(d, 'producao_lotes').find((l) => l.visitaId === v.id)
  if (lote && Number(lote.albunsContados) > 0) return { erro: 'A Produção já contou os álbuns desta escola na meta (conferência final): as fichas não mudam mais.' }
  const aviso = avisosRascunhoVisita(d, v)
  const l = lancamentoDaVisita(d, v)
  if (l) l.quantidade = fichas
  if (lote) {
    const albuns = Math.max(0, (Number(lote.albuns) || 0) + (fichas - antes))
    inserir(d, 'producao_historico', {
      loteId: lote.id,
      data: new Date().toISOString(),
      etapa: lote.etapa,
      acao: 'Fichas corrigidas',
      quantidade: fichas,
      descricao: `As Operações corrigiram as fichas fotografadas: ${antes} → ${fichas} (álbuns ${Number(lote.albuns) || 0} → ${albuns}). Motivo: ${motivoTxt(motivo)}.`,
      autor: ctx.autorNome,
    })
    lote.alunos = fichas
    lote.albuns = albuns
    notificar(d, ctx, { setores: ['edicao'], tipo: 'alerta', titulo: 'Fichas corrigidas pelas Operações', descricao: `${v.escola}: ${antes} → ${fichas} alunos fotografados (${motivoTxt(motivo)}).`, link: '/edicao' })
  }
  v.fichasFotografadas = fichas
  inserir(d, 'agenda_historico', { visitaId: v.id, data: hoje(), tipo: 'Fichas corrigidas', fichasAntes: null, fichasDepois: null, descricao: `Fichas fotografadas: ${antes} → ${fichas}. Motivo: ${motivoTxt(motivo)}.`, autor: ctx.autorNome })
  notificar(d, ctx, { setores: ['adm', 'gerencia'], tipo: 'info', titulo: 'Fichas corrigidas', descricao: `${v.escola} (${dataBR(String(v.data))}): ${antes} → ${fichas} fichas fotografadas. Motivo: ${motivoTxt(motivo)}`, link: '/operacional/agenda' })
  auditar(d, ctx, 'EDITAR', `Fichas corrigidas: ${v.escola} (${antes} → ${fichas})`, 'operacional')
  return { aviso }
}

// Desfazer encerramento (encerrou por engano): a visita volta para agendada, as fichas saem da meta, a escola sai da
// Produção (se ainda aguardava o envio ao editor) e o rascunho do fechamento da escola é apagado.
export function desfazerEncerramento(d: ErpState, visitaId: string, motivo: string, ctx: Contexto): { erro: string } | { aviso: string | null } {
  if (!motivoTxt(motivo)) return { erro: 'Informe o motivo.' }
  const v = col(d, 'agenda_visitas').find((r) => r.id === visitaId)
  if (!v) return { erro: 'Visita não encontrada.' }
  if (v.status !== 'Fotografada' && v.status !== 'Fechamento enviado') return { erro: 'Esta visita não está encerrada.' }
  const bloqueio = bloqueioVisitaEncerrada(d, v)
  if (bloqueio) return { erro: bloqueio }
  const ret = col(d, 'agenda_visitas')
    .filter((r) => r.retornoDe === v.id && r.status !== 'Cancelada')
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))[0]
  if (ret) return { erro: `Esta visita tem retorno em ${dataBR(String(ret.data))} (${String(ret.status).toLowerCase()}): cancele ou desfaça o retorno antes.` }
  const lote = col(d, 'producao_lotes').find((l) => l.visitaId === v.id)
  if (lote && lote.etapa !== 'Aguardando fotos') return { erro: `A Produção já está com esta escola em "${lote.etapa}": não dá para desfazer o encerramento. Se o número de fichas está errado, use "Corrigir fichas".` }
  const aviso = avisosRascunhoVisita(d, v, false) // o rascunho da escola é apagado aqui: fica só o aviso do vendedor
  const l = lancamentoDaVisita(d, v)
  if (l) d.lancamentos = d.lancamentos.filter((x) => x.id !== l.id)
  if (lote) {
    for (const nome of ['producao_lotes', 'producao_historico', 'producao_fotos', 'producao_fichas', 'producao_caixas'])
      d.colecoes[nome] = col(d, nome).filter((x) => (nome === 'producao_lotes' ? x.id !== lote.id : x.loteId !== lote.id))
    notificar(d, ctx, { setores: ['edicao'], tipo: 'alerta', titulo: 'Escola saiu da Produção', descricao: `${v.escola}: as Operações desfizeram o encerramento da visita de ${dataBR(String(v.data))} (${motivoTxt(motivo)}).`, link: '/edicao' })
  }
  d.colecoes.fechamentos = col(d, 'fechamentos').filter((f) => !(f.tipo === 'escola' && f.refId === v.id && f.status === 'Rascunho'))
  const antes = Number(v.fichasFotografadas) || 0
  v.status = 'Agendada'
  v.fichasFotografadas = 0
  inserir(d, 'agenda_historico', { visitaId: v.id, data: hoje(), tipo: 'Encerramento desfeito', fichasAntes: null, fichasDepois: null, descricao: `A visita voltou para agendada (estava com ${antes} fichas fotografadas). Motivo: ${motivoTxt(motivo)}.`, autor: ctx.autorNome })
  notificar(d, ctx, { setores: ['adm', 'gerencia'], tipo: 'alerta', titulo: 'Encerramento desfeito', descricao: `${v.escola} (${dataBR(String(v.data))}): a visita voltou para agendada. Motivo: ${motivoTxt(motivo)}`, link: '/operacional/agenda' })
  auditar(d, ctx, 'EDITAR', `Encerramento desfeito: ${v.escola} — ${motivoTxt(motivo)}`, 'operacional')
  return { aviso }
}

// ---------------- PRODUÇÃO (setor 'edicao') ----------------
// Cada visita encerrada vira um lote: a base que a Produção recebe das Operações (escola, data, vendedor, alunos).
// Não duplica: a mesma visita nunca entra duas vezes.
export function criarLoteProducao(d: ErpState, v: Registro, ctx: Contexto, origem: string): Registro | null {
  if (col(d, 'producao_lotes').some((l) => l.visitaId === v.id)) return null
  const alunos = Number(v.fichasFotografadas) || 0
  const vendedor = col(d, 'pj_vendedores').find((p) => p.id === v.vendedorId)
  const lote = inserir(d, 'producao_lotes', {
    visitaId: v.id,
    escola: v.escola,
    cidade: v.cidade,
    uf: v.uf,
    dataFoto: v.data,
    vendedorId: v.vendedorId ?? '',
    vendedor: vendedor ? String(vendedor.nome) : '',
    retorno: !!v.retornoDe,
    alunos,
    albuns: alunos,
    posteres: 0,
    etapa: 'Aguardando fotos',
    fotosRecebidasEm: '',
    editorId: '',
    enviadoEditorEm: '',
    devolvidoEditorEm: '',
    voltas: 0,
    reprovados: 0,
    aprovadoQualidadeEm: '',
    aprovadoQualidadePor: '',
    confirmadoEm: '',
    confirmadoPor: '',
    revelandoEm: '',
    naCaixaEm: '',
    observacao: '',
    albunsContados: 0, // álbuns que já entraram na meta (na conferência final, 1 vez por escola)
    entregaPrevista: '', // prazo do editor
    driveEnvio: '',
    driveDevolucao: '',
    atrasoAvisado: '', // data prevista que já gerou o aviso de atraso
  })
  inserir(d, 'producao_historico', {
    loteId: lote.id,
    data: agora(),
    etapa: 'Aguardando fotos',
    acao: origem,
    quantidade: alunos,
    descricao: `${alunos} alunos fotografados em ${String(v.data).split('-').reverse().join('/')}${v.retornoDe ? ' (retorno)' : ''}.`,
    autor: ctx.autorNome,
  })
  return lote
}

// Traz para a Produção as visitas já encerradas antes (escolas que estavam em andamento na planilha)
export function trazerParaProducao(d: ErpState, visitaIds: string[], ctx: Contexto): number {
  let n = 0
  for (const id of visitaIds) {
    const v = col(d, 'agenda_visitas').find((x) => x.id === id)
    if (!v || (v.status !== 'Fotografada' && v.status !== 'Fechamento enviado')) continue
    if (criarLoteProducao(d, v, ctx, 'Trazida para a Produção')) n++
  }
  if (n) auditar(d, ctx, 'CRIAR', `${n} escola(s) trazida(s) para a Produção`, 'edicao')
  return n
}

const SO_ADM_CONFERENCIA = 'Só o ADM faz a conferência final.'

function historicoLote(d: ErpState, l: Registro, ctx: Contexto, h: { etapa: string; acao: string; quantidade: number | null; descricao: string }) {
  inserir(d, 'producao_historico', { loteId: l.id, data: agora(), ...h, autor: ctx.autorNome })
  auditar(d, ctx, 'EDITAR', `Produção • ${l.escola}: ${h.acao}`, 'edicao')
}

// Botões das etapas da Produção — mesmas regras do SQL 030 (producao_avancar).
// Na conferência final (só o ADM) os álbuns entram na meta de quem aprovou a análise de qualidade, 1 vez por escola.
export function avancarLote(d: ErpState, loteId: string, acao: AcaoLote, dados: DadosAcaoLote, ctx: Contexto): string | null {
  const l = col(d, 'producao_lotes').find((x) => x.id === loteId)
  if (!l) return 'Escola não encontrada na Produção.'
  if (etapaDoLote(l) !== ETAPA_DA_ACAO[acao]) return `Esta escola está em "${etapaDoLote(l)}": atualize a tela.`
  const eu = d.colaboradores.find((c) => c.id === ctx.autorId)
  const daProducao = (id: string) => d.colaboradores.find((c) => c.id === id && c.setor === 'edicao' && c.status === 'ATIVO')
  const nomeEditor = String(col(d, 'editores').find((e) => e.id === l.editorId)?.nome ?? '')
  const dia = hoje()
  const albuns = Number(l.albuns) || 0
  const drive = (dados.drive ?? '').trim()
  const prevista = dados.prevista ?? ''
  // prazo do editor: obrigatório ao enviar e ao devolver álbuns reprovados
  if (acao === 'enviar_editor' || acao === 'reprovar_qualidade' || acao === 'reprovar_conferencia') {
    if (!prevista) return 'Informe a data prevista da entrega do editor.'
    if (prevista < dia) return 'A data prevista da entrega não pode ser antes de hoje.'
  }
  let h: { etapa: EtapaLote; acao: string; quantidade: number | null; descricao: string }

  switch (acao) {
    case 'fotos':
      if (l.fotosRecebidasEm) return 'As fotos já foram marcadas como recebidas.'
      l.fotosRecebidasEm = dia
      h = { etapa: 'Aguardando fotos', acao: 'Fotos recebidas', quantidade: null, descricao: 'Fotos recebidas dos fotógrafos.' }
      break
    case 'enviar_editor': {
      const ed = col(d, 'editores').find((e) => e.id === dados.editorId && e.status === 'Ativo')
      if (!ed) return 'Escolha o editor.'
      Object.assign(l, {
        editorId: ed.id,
        enviadoEditorEm: dia,
        devolvidoEditorEm: '',
        fotosRecebidasEm: l.fotosRecebidasEm || dia,
        etapa: 'Em edição',
        entregaPrevista: prevista,
        driveEnvio: drive,
        driveDevolucao: '',
        atrasoAvisado: '',
      })
      h = { etapa: 'Em edição', acao: 'Enviado ao editor', quantidade: null, descricao: `Fotos enviadas para ${ed.nome}${drive ? ` (${drive})` : ''} • entrega prevista ${dataBR(prevista)}.` }
      break
    }
    case 'editor_devolveu': {
      const recebido = dados.data || dia
      if (recebido > dia) return 'A data do recebimento não pode ser depois de hoje.'
      if (l.enviadoEditorEm && recebido < String(l.enviadoEditorEm)) return `A data do recebimento não pode ser antes do envio (${dataBR(String(l.enviadoEditorEm))}).`
      const atrasou = l.entregaPrevista && recebido > String(l.entregaPrevista) ? Math.round((Date.parse(recebido) - Date.parse(String(l.entregaPrevista))) / 86400000) : 0
      Object.assign(l, { devolvidoEditorEm: recebido, driveDevolucao: drive, etapa: 'Análise de qualidade' })
      h = {
        etapa: 'Análise de qualidade',
        acao: 'Editor devolveu',
        quantidade: null,
        descricao: `${nomeEditor || 'O editor'} devolveu os álbuns montados em ${dataBR(recebido)}${drive ? ` (${drive})` : ''}${atrasou ? ` • ${atrasou} dia(s) depois do previsto` : ''}.`,
      }
      break
    }
    case 'aprovar_qualidade': {
      // quem é da Produção aprova por si; o ADM/Gerência escolhe quem fez a análise (a meta é dela)
      let analista = eu?.setor === 'edicao' ? eu : undefined
      if (!analista && dados.analistaId) {
        analista = daProducao(dados.analistaId)
        if (!analista) return 'Quem fez a análise precisa ser da Produção.'
      } else if (!analista && d.colaboradores.some((c) => c.setor === 'edicao' && c.status === 'ATIVO')) return 'Escolha quem fez a análise de qualidade.'
      Object.assign(l, { aprovadoQualidadeEm: dia, aprovadoQualidadePor: analista?.id ?? '', etapa: 'Pronto para conferência Beatriz', enviadoConferenciaEm: '', driveConferencia: '' })
      h = {
        etapa: 'Pronto para conferência Beatriz',
        acao: 'Aprovado na análise de qualidade',
        quantidade: albuns,
        descricao: `${albuns} álbuns aprovados${analista ? ` por ${analista.nome}` : ''}. Pronto para enviar para a conferência.`,
      }
      break
    }
    case 'enviar_conferencia':
      Object.assign(l, { enviadoConferenciaEm: dia, driveConferencia: drive, etapa: 'Conferência final' })
      h = { etapa: 'Conferência final', acao: 'Enviado para a conferência', quantidade: albuns, descricao: `${albuns} álbuns enviados para a conferência final${drive ? ` (${drive})` : ''}.` }
      notificar(d, ctx, { setores: ['adm'], tipo: 'info', titulo: 'Escola pronta para a conferência final', descricao: `${l.escola}: ${albuns} álbuns enviados para a conferência.`, link: '/edicao' })
      break
    case 'reprovar_qualidade':
    case 'reprovar_conferencia': {
      if (acao === 'reprovar_conferencia' && eu?.perfil !== 'ADM') return SO_ADM_CONFERENCIA
      const q = Math.floor(Number(dados.quantidade) || 0)
      const motivo = (dados.motivo ?? '').trim()
      if (q <= 0) return 'Informe quantos álbuns voltam para o editor.'
      if (q > albuns) return `São só ${albuns} álbuns nesta escola.`
      if (!motivo) return 'Informe o motivo.'
      Object.assign(l, {
        etapa: 'Em edição',
        voltas: (Number(l.voltas) || 0) + 1,
        reprovados: (Number(l.reprovados) || 0) + q,
        enviadoEditorEm: dia,
        devolvidoEditorEm: '',
        driveDevolucao: '',
        entregaPrevista: prevista,
        atrasoAvisado: '',
        aprovadoQualidadeEm: '',
        aprovadoQualidadePor: '',
        enviadoConferenciaEm: '',
        driveConferencia: '',
      })
      h = {
        etapa: 'Em edição',
        acao: acao === 'reprovar_qualidade' ? 'Reprovado na análise de qualidade' : 'Reprovado na conferência final',
        quantidade: q,
        descricao: `${q} álbum(ns) de volta para ${nomeEditor || 'o editor'}. Motivo: ${motivo} • nova entrega prevista ${dataBR(prevista)}.`,
      }
      if (acao === 'reprovar_conferencia')
        notificar(d, ctx, { setores: ['edicao'], tipo: 'alerta', titulo: 'Conferência final devolveu ao editor', descricao: `${l.escola}: ${q} álbum(ns) com erro. Motivo: ${motivo}`, link: '/edicao' })
      break
    }
    case 'confirmar': {
      if (eu?.perfil !== 'ADM') return SO_ADM_CONFERENCIA
      let analista = l.aprovadoQualidadePor ? d.colaboradores.find((c) => c.id === l.aprovadoQualidadePor) : undefined
      if (!l.aprovadoQualidadePor && dados.analistaId) {
        analista = daProducao(dados.analistaId)
        if (!analista) return 'Quem fez a análise precisa ser da Produção.'
      }
      Object.assign(l, { confirmadoEm: dia, confirmadoPor: ctx.autorId, etapa: 'Aguardando revelação', aprovadoQualidadePor: analista?.id ?? '' })
      let descricao = `${albuns} álbuns liberados para a Revelação`
      if (Number(l.albunsContados) > 0) descricao += ' (já tinham entrado na meta).'
      else if (analista && albuns > 0) {
        lancar(d, ctx, { setor: 'edicao', indicador: 'albuns_entregues', colaboradorId: analista.id, quantidade: albuns, descricao: `Álbuns entregues: ${l.escola}`, data: dia })
        l.albunsContados = albuns
        descricao += `. Contam na meta de ${analista.nome}.`
      } else descricao += ' (sem analista: não entrou na meta).'
      h = { etapa: 'Aguardando revelação', acao: 'Conferência final aprovada', quantidade: albuns, descricao }
      notificar(d, ctx, { setores: ['edicao'], tipo: 'sucesso', titulo: 'Conferência final aprovada', descricao: `${l.escola}: ${albuns} álbuns liberados para a Revelação.`, link: '/edicao' })
      break
    }
    case 'revelando':
      Object.assign(l, { revelandoEm: dia, etapa: 'Revelando' })
      h = { etapa: 'Revelando', acao: 'Revelando', quantidade: null, descricao: 'A Revelação pegou o HD para revelar.' }
      break
    case 'na_caixa':
      Object.assign(l, { naCaixaEm: dia, etapa: 'Na caixa' })
      h = { etapa: 'Na caixa', acao: 'Na caixa', quantidade: null, descricao: 'Álbuns revelados e na caixa.' }
      break
  }
  historicoLote(d, l, ctx, h)
  return null
}

// Álbuns (contam na meta) e pôsteres (não contam) + observação — mesma regra do SQL 021 (producao_ajustar).
// Depois que os álbuns entram na meta (conferência final), a quantidade de álbuns não muda mais.
export function ajustarLote(d: ErpState, loteId: string, albuns: number, posteres: number, observacao: string, ctx: Contexto): string | null {
  const l = col(d, 'producao_lotes').find((x) => x.id === loteId)
  if (!l) return 'Escola não encontrada na Produção.'
  const a = Math.floor(albuns)
  const p = Math.floor(posteres)
  if (!(a >= 0) || !(p >= 0)) return 'Informe quantidades válidas (0 ou mais).'
  if (Number(l.albunsContados) > 0 && a !== Number(l.albuns)) return 'Os álbuns desta escola já entraram na meta: a quantidade não muda mais.'
  const obs = observacao.trim()
  const mudouQtd = a !== Number(l.albuns) || p !== Number(l.posteres)
  if (!mudouQtd && obs === String(l.observacao ?? '')) return 'Nada mudou.'
  const antes = `${l.albuns} álbuns + ${l.posteres} pôster`
  Object.assign(l, { albuns: a, posteres: p, observacao: obs })
  historicoLote(d, l, ctx, {
    etapa: etapaDoLote(l),
    acao: mudouQtd ? 'Quantidade ajustada' : 'Observação',
    quantidade: mudouQtd ? a : null,
    descricao: mudouQtd ? `${antes} → ${a} álbuns + ${p} pôster.${obs ? ` Obs.: ${obs}` : ''}` : obs || 'Observação apagada.',
  })
  return null
}

// ADM corrige a etapa (escola trazida de antes do controle ou botão clicado por engano).
// As datas das etapas seguintes são apagadas; os álbuns que já entraram na meta não contam de novo.
// Mesma regra do SQL 030 (producao_corrigir_etapa).
export function corrigirEtapaLote(d: ErpState, loteId: string, etapa: EtapaLote, editorId: string, motivo: string, ctx: Contexto): string | null {
  if (d.colaboradores.find((c) => c.id === ctx.autorId)?.perfil !== 'ADM') return 'Só o ADM corrige a etapa.'
  const l = col(d, 'producao_lotes').find((x) => x.id === loteId)
  if (!l) return 'Escola não encontrada na Produção.'
  const k = ETAPAS_LOTE.indexOf(etapa)
  if (k < 0) return 'Etapa inválida.'
  const ed = editorId ? col(d, 'editores').find((e) => e.id === editorId) : undefined
  if (editorId && !ed) return 'Editor não encontrado.'
  const de = etapaDoLote(l)
  const editorAntes = String(l.editorId ?? '')
  const editorFinal = k >= 1 ? (ed?.id ?? editorAntes) : ''
  if (de === etapa && editorFinal === editorAntes) return 'Nada mudou.'
  Object.assign(l, {
    etapa,
    editorId: editorFinal,
    enviadoEditorEm: k >= 1 ? l.enviadoEditorEm : '',
    entregaPrevista: k >= 1 ? l.entregaPrevista : '',
    driveEnvio: k >= 1 ? l.driveEnvio : '',
    devolvidoEditorEm: k >= 2 ? l.devolvidoEditorEm : '',
    driveDevolucao: k >= 2 ? l.driveDevolucao : '',
    aprovadoQualidadeEm: k >= 3 ? l.aprovadoQualidadeEm : '',
    aprovadoQualidadePor: k >= 3 ? l.aprovadoQualidadePor : '',
    enviadoConferenciaEm: k >= 4 ? l.enviadoConferenciaEm : '',
    driveConferencia: k >= 4 ? l.driveConferencia : '',
    confirmadoEm: k >= 5 ? l.confirmadoEm : '',
    confirmadoPor: k >= 5 ? l.confirmadoPor : '',
    revelandoEm: k >= 6 ? l.revelandoEm : '',
    naCaixaEm: k >= 7 ? l.naCaixaEm : '',
  })
  // o editor só aparece no histórico quando mudou
  const nomeEd = editorFinal && editorFinal !== editorAntes ? String(col(d, 'editores').find((e) => e.id === editorFinal)?.nome ?? '') : ''
  historicoLote(d, l, ctx, {
    etapa,
    acao: 'Etapa corrigida',
    quantidade: null,
    descricao: `${de} → ${etapa}${nomeEd ? ` • editor ${nomeEd}` : ''}${motivo.trim() ? `. ${motivo.trim()}` : ''}`,
  })
  return null
}

// Aviso de atraso do editor: passou da data prevista e continua "Em edição" — 1 aviso por prazo.
// Mesma regra do SQL 022 (producao_avisar_atrasos); roda quando alguém da Produção ou o ADM abre o sistema.
export function avisarAtrasosProducao(d: ErpState, ctx: Contexto): number {
  const dia = hoje()
  let n = 0
  for (const l of col(d, 'producao_lotes')) {
    const prevista = String(l.entregaPrevista ?? '')
    if (etapaDoLote(l) !== 'Em edição' || !prevista || prevista >= dia || String(l.atrasoAvisado ?? '') === prevista) continue
    l.atrasoAvisado = prevista
    const dias = Math.round((Date.parse(dia) - Date.parse(prevista)) / 86400000)
    const editor = String(col(d, 'editores').find((e) => e.id === l.editorId)?.nome ?? 'o editor')
    notificar(d, ctx, {
      setores: ['edicao', 'adm'],
      tipo: 'alerta',
      titulo: 'Entrega do editor atrasada',
      descricao: `${l.escola}: ${editor} não entregou — prevista para ${dataBR(prevista)} (${dias} dia(s) de atraso).`,
      link: '/edicao',
    })
    inserir(d, 'producao_historico', { loteId: l.id, data: agora(), etapa: 'Em edição', acao: 'Entrega atrasada', quantidade: null, descricao: `Passou da data prevista (${dataBR(prevista)}).`, autor: 'Sistema' })
    n++
  }
  return n
}

// ---------------- PRODUÇÃO › Estoque: caixas da Revelação (mesmas regras do SQL 023) ----------------
const ETAPAS_COM_REVELACAO = ['Aguardando revelação', 'Revelando', 'Na caixa']

// Cor da cidade no comprovante: a que já tem; senão a próxima livre (todas usadas → a menos usada) — igual ao SQL 024
export function corDaCidadeDemo(d: ErpState, cidade: unknown, uf: unknown): string {
  const chave = chaveCidade(cidade, uf)
  const cores = col(d, 'producao_cores_cidade')
  const ja = cores.find((c) => c.chave === chave)
  if (ja) return String(ja.cor)
  const uso = (cor: string) => cores.filter((c) => String(c.cor).toLowerCase() === cor.toLowerCase()).length
  const cor = [...PALETA_CIDADES].sort((a, b) => uso(a.cor) - uso(b.cor) || PALETA_CIDADES.indexOf(a) - PALETA_CIDADES.indexOf(b))[0].cor
  inserir(d, 'producao_cores_cidade', { chave, cidade: String(cidade ?? '').trim(), uf: String(uf ?? '').trim().toUpperCase(), cor })
  return cor
}

// A Revelação solta uma caixa: conta na meta dela (álbuns revelados) e vai para a conferência da Produção.
// 1ª caixa → a escola fica "Revelando"; as caixas somam todos os álbuns → "Na caixa".
export function registrarCaixa(d: ErpState, loteId: string, dados: { albuns: number; posteres: number; observacao: string; data: string }, ctx: Contexto): string | null {
  const l = col(d, 'producao_lotes').find((x) => x.id === loteId)
  if (!l) return 'Escola não encontrada.'
  const etapa = etapaDoLote(l)
  if (!ETAPAS_COM_REVELACAO.includes(etapa)) return `Esta escola ainda não foi liberada para a Revelação (está em "${etapa}").`
  const albuns = Math.floor(Number(dados.albuns) || 0)
  const posteres = Math.floor(Number(dados.posteres) || 0)
  if (albuns <= 0) return 'Informe quantos álbuns tem na caixa.'
  if (posteres < 0) return 'Pôster/brindes não pode ser negativo.'
  const dia = hoje()
  const data = dados.data || dia
  if (data > dia) return 'A data não pode ser depois de hoje.'
  const eu = d.colaboradores.find((c) => c.id === ctx.autorId)
  corDaCidadeDemo(d, l.cidade, l.uf) // cor do comprovante (1ª caixa da cidade ganha a cor)
  const caixas = col(d, 'producao_caixas').filter((c) => c.loteId === loteId)
  const numero = Math.max(0, ...caixas.map((c) => Number(c.numero) || 0)) + 1
  lancar(d, ctx, { setor: 'producao', indicador: 'books', colaboradorId: eu?.setor === 'producao' ? eu.id : '', quantidade: albuns, descricao: `Caixa ${numero} — ${l.escola}`, data })
  const lancamento = d.lancamentos[d.lancamentos.length - 1]
  inserir(d, 'producao_caixas', {
    loteId,
    numero,
    data,
    albuns,
    posteres,
    observacao: dados.observacao.trim(),
    registradoPor: ctx.autorId,
    lancamentoId: lancamento.id,
    status: 'Aguardando conferência',
    conferidoAlbuns: null,
    conferidoPosteres: null,
    conferenciaObs: '',
    conferidoPor: '',
    conferidoEm: '',
  })
  const hist = (etapaH: string, acao: string, descricao: string, quantidade: number | null = null) =>
    inserir(d, 'producao_historico', { loteId, data: agora(), etapa: etapaH, acao, quantidade, descricao, autor: ctx.autorNome })
  hist(etapa, 'Caixa da Revelação', `Caixa ${numero}: ${albuns} álbuns${posteres > 0 ? ` + ${posteres} pôster/brindes` : ''}. Aguardando a conferência da Produção.`, albuns)
  if (etapa === 'Aguardando revelação') {
    Object.assign(l, { etapa: 'Revelando', revelandoEm: l.revelandoEm || data })
    hist('Revelando', 'Revelando', 'A Revelação começou a soltar as caixas.')
  }
  const total = col(d, 'producao_caixas').filter((c) => c.loteId === loteId && !c.origemCargaId).reduce((a, c) => a + (Number(c.albuns) || 0), 0)
  if (l.etapa === 'Revelando' && total >= (Number(l.albuns) || 0)) {
    Object.assign(l, { etapa: 'Na caixa', naCaixaEm: dia })
    hist('Na caixa', 'Na caixa', `Todos os álbuns revelados: ${total} em ${numero} caixa(s).`)
  }
  notificar(d, ctx, { setores: ['edicao'], tipo: 'info', titulo: 'Caixa para conferir', descricao: `${l.escola}: caixa ${numero} com ${albuns} álbuns. Confira no Estoque.`, link: '/edicao/estoque' })
  auditar(d, ctx, 'CRIAR', `Caixa ${numero} da Revelação: ${l.escola}`, 'producao')
  return null
}

// Produção: lança (ou troca) quantas fotos o fotógrafo tirou na escola — mesma regra do SQL 025 (producao_salvar_fotos)
export function salvarFotosFotografo(d: ErpState, loteId: string, fotografoId: string, quantidade: number, ctx: Contexto): string | null {
  const l = col(d, 'producao_lotes').find((x) => x.id === loteId)
  if (!l) return 'Escola não encontrada na Produção.'
  const f = col(d, 'freelancers').find((x) => x.id === fotografoId && x.tipo === 'Fotógrafo')
  if (!f) return 'Escolha o fotógrafo.'
  const q = Math.floor(Number(quantidade))
  if (!(q > 0)) return 'Informe a quantidade de fotos (maior que zero).'
  const ja = col(d, 'producao_fotos').find((x) => x.loteId === loteId && x.fotografoId === fotografoId)
  if (ja) Object.assign(ja, { quantidade: q, fotografoNome: f.nome })
  else inserir(d, 'producao_fotos', { loteId, fotografoId, fotografoNome: f.nome, quantidade: q })
  auditar(d, ctx, ja ? 'EDITAR' : 'CRIAR', `Produção • ${l.escola}: ${q} fotos de ${f.nome}`, 'edicao')
  return null
}

// Caixa registrada errado (ainda sem conferência): sai da meta junto
export function excluirCaixa(d: ErpState, caixaId: string, ctx: Contexto): string | null {
  const c = col(d, 'producao_caixas').find((x) => x.id === caixaId)
  if (!c) return 'Caixa não encontrada.'
  if (c.status !== 'Aguardando conferência') return 'Esta caixa já foi conferida e está no estoque: não dá para apagar.'
  d.lancamentos = d.lancamentos.filter((x) => x.id !== c.lancamentoId)
  d.colecoes.producao_caixas = col(d, 'producao_caixas').filter((x) => x.id !== caixaId)
  const l = col(d, 'producao_lotes').find((x) => x.id === c.loteId)
  inserir(d, 'producao_historico', { loteId: c.loteId, data: agora(), etapa: l ? etapaDoLote(l) : 'Revelando', acao: 'Caixa apagada', quantidade: Number(c.albuns), descricao: `Caixa ${c.numero} (${c.albuns} álbuns) apagada pela Revelação.`, autor: ctx.autorNome })
  auditar(d, ctx, 'EXCLUIR', `Caixa ${c.numero} apagada`, 'producao')
  return null
}

// A Produção confere a caixa: confirmou → ESTOQUE (o comprovante sai na tela)
export function conferirCaixa(d: ErpState, caixaId: string, dados: { albuns: number; posteres: number; observacao: string }, ctx: Contexto): string | null {
  const c = col(d, 'producao_caixas').find((x) => x.id === caixaId)
  if (!c) return 'Caixa não encontrada.'
  if (c.status !== 'Aguardando conferência') return 'Esta caixa já foi conferida.'
  const albuns = Math.floor(Number(dados.albuns))
  const posteres = Math.floor(Number(dados.posteres))
  if (!(albuns >= 0) || !(posteres >= 0)) return 'Informe quantidades válidas (0 ou mais).'
  const obs = dados.observacao.trim()
  if ((albuns !== Number(c.albuns) || posteres !== Number(c.posteres)) && !obs) return 'A conferência não bate com o informado pela Revelação: escreva a observação.'
  Object.assign(c, { status: 'Em estoque', conferidoAlbuns: albuns, conferidoPosteres: posteres, conferenciaObs: obs, conferidoPor: ctx.autorId, conferidoEm: hoje() })
  const l = col(d, 'producao_lotes').find((x) => x.id === c.loteId)
  inserir(d, 'producao_historico', {
    loteId: c.loteId,
    data: agora(),
    etapa: l ? etapaDoLote(l) : 'Na caixa',
    acao: 'Caixa conferida',
    quantidade: albuns,
    descricao: `Caixa ${c.numero} conferida: ${albuns} álbuns${posteres > 0 ? ` + ${posteres} pôster/brindes` : ''} • em estoque${obs ? `. Obs.: ${obs}` : ''}`,
    autor: ctx.autorNome,
  })
  auditar(d, ctx, 'EDITAR', `Caixa ${c.numero} conferida: ${l?.escola ?? ''}`, 'edicao')
  return null
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

// Venda conta na meta da vendedora: books e valor vendido (mesmas regras do SQL 044).
// Rebolo: conta no dia em que o contrato assinado é anexado (não espera o Financeiro); uma vez só por venda.
// data = dia em que conta (padrão: o dia da venda — venda interna antiga)
export function contarVendaRebolo(d: ErpState, v: Registro, ctx: Contexto, dia?: string) {
  const vendaId = String(v.id ?? '')
  if (vendaId && d.lancamentos.some((l) => l.vendaId === vendaId)) return
  const colaboradorId = String(v.cobradorId ?? '')
  const data = dia || String(v.data || hoje())
  const descricao = `${v.pacote} — ${v.responsavel}`
  lancar(d, ctx, { setor: 'rebolo', indicador: 'books_vendidos', colaboradorId, quantidade: Number(v.quantidade) || 1, descricao, data, vendaId })
  if ((Number(v.valor) || 0) > 0) lancar(d, ctx, { setor: 'rebolo', indicador: 'valor_vendido', colaboradorId, quantidade: Number(v.valor), descricao, data, vendaId })
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

// Número do pacote por vendedora (mesma regra do SQL 034): pega o próximo dela e anda o contador
export function numerarPacoteRebolo(d: ErpState, vendedoraId: string): number {
  const atual = col(d, 'rebolo_numeracao').find((n) => n.vendedoraId === vendedoraId)
  const numero = proximoPacote(atual, col(d, 'rebolo_pacotes').filter((p) => p.vendedoraId === vendedoraId))
  if (atual) atual.proximo = numero + 1
  else inserir(d, 'rebolo_numeracao', { vendedoraId, proximo: numero + 1 })
  return numero
}
export function definirProximoPacoteRebolo(d: ErpState, vendedoraId: string, proximo: number): string | null {
  if (!Number.isInteger(proximo) || proximo < 1) return 'Informe um número a partir de 1.'
  if (col(d, 'rebolo_pacotes').some((p) => p.vendedoraId === vendedoraId && Number(p.numero) === proximo)) return `Esta vendedora já tem o pacote P${proximo}. Escolha outro número.`
  const atual = col(d, 'rebolo_numeracao').find((n) => n.vendedoraId === vendedoraId)
  if (atual) atual.proximo = proximo
  else inserir(d, 'rebolo_numeracao', { vendedoraId, proximo })
  return null
}

// Supervisora/ADM devolve um descarte para a fila
// Mesma regra do SQL 031 (reabrir_ficha_rebolo): volta para Em negociação ou Tentar de novo, com a observação no histórico
export function reabrirFichaRebolo(d: ErpState, fichaId: string, situacao: string, observacao: string, ctx: Contexto): string | null {
  const f = col(d, 'rebolo_fichas').find((x) => x.id === fichaId)
  if (!f || f.situacao !== 'Descarte') return 'Só fichas em descarte podem ser reabertas.'
  if (!['Em negociação', 'Tentar de novo'].includes(situacao)) return 'Escolha para onde a ficha volta: Em negociação ou Tentar de novo.'
  const motivo = String(f.motivoDescarte || 'sem motivo')
  Object.assign(f, { situacao, motivoDescarte: '', ultimoContato: agora() })
  const obs = [`Descarte (${motivo}) reaberto → ${situacao}`, observacao.trim()].filter(Boolean).join(' • ')
  inserir(d, 'rebolo_contatos', { fichaId, vendedoraId: ctx.autorId, resultado: 'Reaberta', observacao: obs, agendadoPara: '', data: agora() })
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
    d.lancamentos = d.lancamentos.filter((l) => l.vendaId !== v.id) // cancelada não conta
    auditar(d, ctx, 'EDITAR', `Venda rebolo cancelada: ${v.responsavel}`, 'rebolo')
    return null
  }
  if (!dados.contrato) return 'Anexe o contrato assinado.'
  v.anexos = JSON.stringify({ contratoAssinado: dados.contrato })
  v.conferencia = 'Aguardando conferência'
  v.conferenciaMotivo = ''
  v.assinaturaEm = v.assinaturaEm || agora()
  // contrato assinado = venda feita: conta na meta hoje (devolvida e reenviada não conta de novo)
  contarVendaRebolo(d, v, ctx, hoje())
  notificar(d, ctx, { setores: ['financeiro', 'adm'], tipo: 'aprovacao', titulo: 'Venda do rebolo para conferir', descricao: `${v.responsavel} • ${v.pacote} • R$ ${(Number(v.valor) || 0).toFixed(2).replace('.', ',')}`, link: '/financeiro/conferencia' })
  auditar(d, ctx, 'EDITAR', `Venda rebolo enviada ao Financeiro: ${v.responsavel}`, 'rebolo')
  return null
}

// Venda fechada corrigida sem cancelar (mesmas regras do SQL 032): só a efetivar ou devolvida;
// produto, valor, pagamento e dados do comprador; o histórico da ficha registra o que mudou
export interface EdicaoVendaRebolo {
  pacote: string
  valor: number
  formaPagamento: string
  parcelas: number
  formaParcelamento: string
  primeiroVencimento: string
  responsavel: string
  cpf: string
  rg: string
  whatsapp: string
  observacao: string
}
export function editarVendaRebolo(d: ErpState, vendaId: string, e: EdicaoVendaRebolo, ctx: Contexto): string | null {
  const v = col(d, 'vendas_ebooks').find((x) => x.id === vendaId)
  if (!v || v.canal !== 'Rebolo') return 'Venda não encontrada.'
  if (!['Aguardando contrato', 'Devolvida'].includes(String(v.conferencia))) return `Só dá para editar a venda a efetivar ou devolvida (esta está: ${v.conferencia}).`
  const pix = e.formaPagamento === 'PIX'
  if (!e.pacote.trim()) return 'Escolha o produto.'
  if (!(e.valor > 0)) return 'Informe o valor da venda.'
  if (!['PIX', 'Cartão de crédito', 'Boleto'].includes(e.formaPagamento)) return 'Forma de pagamento inválida.'
  const parcelas = pix ? 1 : e.parcelas
  if (!(parcelas >= 1 && parcelas <= 24)) return 'Número de parcelas inválido.'
  if (e.formaPagamento === 'Boleto' && !e.primeiroVencimento) return 'Informe o 1º vencimento do boleto.'
  if (!e.responsavel.trim()) return 'Informe o nome do comprador.'
  if (e.cpf.replace(/\D/g, '').length !== 11) return 'Informe o CPF do comprador (11 dígitos).'
  const parcelamento = pix ? 'À vista' : e.formaParcelamento.trim()
  const resumo = (pacote: unknown, forma: unknown, parc: unknown, valor: unknown) =>
    [pacote, forma, parc, `R$ ${(Number(valor) || 0).toFixed(2).replace('.', ',')}`].filter(Boolean).join(' • ')
  const antes = resumo(v.pacote, v.formaPagamento, v.formaParcelamento, v.valor)
  const depois = resumo(e.pacote.trim(), e.formaPagamento, parcelamento, e.valor)
  Object.assign(v, {
    pacote: e.pacote.trim(),
    valor: e.valor,
    formaPagamento: e.formaPagamento,
    parcelas,
    formaParcelamento: parcelamento,
    primeiroVencimento: e.formaPagamento === 'Boleto' ? e.primeiroVencimento : '',
    responsavel: e.responsavel.trim().toUpperCase(),
    cpf: e.cpf.trim(),
    rg: e.rg.trim(),
    whatsapp: e.whatsapp.trim(),
    telefone: e.whatsapp.trim() || v.telefone,
    observacao: e.observacao.trim(),
  })
  // a venda devolvida já contou na assinatura: a meta acompanha o valor e o nome novos
  for (const l of d.lancamentos)
    if (l.vendaId === v.id) {
      if (l.indicador === 'valor_vendido') l.quantidade = e.valor
      l.descricao = `${v.pacote} — ${v.responsavel}`
    }
  inserir(d, 'rebolo_contatos', {
    fichaId: v.fichaReboloId,
    vendedoraId: ctx.autorId,
    resultado: 'Venda editada',
    observacao: antes === depois ? 'Dados do comprador corrigidos' : `${antes} → ${depois}`,
    agendadoPara: '',
    data: agora(),
  })
  auditar(d, ctx, 'EDITAR', `Venda rebolo editada: ${v.responsavel}`, 'rebolo')
  return null
}

// Acompanhamento do envio (SQL 037): registrar ou corrigir. Quem lança: a dona da ficha ou a supervisão do rebolo.
// O boleto enviado só vale na venda no boleto e a taxa do cartão só na venda no cartão.
export interface DadosEnvioRebolo {
  rastreio: string
  custoPostagem: number | null
  previsaoEntrega: string
  situacaoEntrega: string
  boletoEnviado: boolean
  taxaCartao: number | null
}
export function salvarEnvioRebolo(d: ErpState, fichaId: string, x: DadosEnvioRebolo, ctx: Contexto): string | null {
  const f = col(d, 'rebolo_fichas').find((y) => y.id === fichaId)
  if (!f) return 'Ficha não encontrada.'
  const eu = d.colaboradores.find((c) => c.id === ctx.autorId)
  const supervisao = !!eu && (eu.perfil === 'ADM' || eu.perfil === 'GERENTE' || (eu.setor === 'rebolo' && /^supervisor/i.test(eu.funcao)))
  if (f.vendedoraId !== ctx.autorId && !supervisao) return 'Esta ficha é de outra vendedora.'
  if (f.situacao !== 'Vendida') return 'Só vendas aprovadas podem ser enviadas.'
  if (!x.rastreio.trim()) return 'Informe o código de rastreio.'
  const situacao = x.situacaoEntrega || 'Pendente'
  if (!['Pendente', 'Cliente recebeu', 'Não recebeu'].includes(situacao)) return 'Situação da entrega inválida.'
  if ((x.custoPostagem ?? 0) < 0 || (x.taxaCartao ?? 0) < 0) return 'Os valores não podem ser negativos.'
  const forma = String(col(d, 'vendas_ebooks').find((v) => v.id === f.vendaId)?.formaPagamento ?? '')
  const antes = String(f.situacaoEntrega || 'Pendente')
  f.rastreio = x.rastreio.trim().toUpperCase()
  f.enviadoEm = f.enviadoEm || agora()
  f.custoPostagem = x.custoPostagem ?? ''
  f.previsaoEntrega = x.previsaoEntrega
  f.entregaEm = situacao === 'Pendente' ? '' : situacao === antes ? f.entregaEm || agora() : agora()
  f.situacaoEntrega = situacao
  f.boletoEnviadoEm = /^boleto/i.test(forma) && x.boletoEnviado ? f.boletoEnviadoEm || agora() : ''
  f.taxaCartao = /^cart/i.test(forma) ? (x.taxaCartao ?? '') : ''
  auditar(d, ctx, 'EDITAR', `Envio do álbum (rastreio ${f.rastreio}, ${situacao}): ficha ${f.numeroFicha}`, 'rebolo')
  return null
}

// ---------------- Cobrança › Configurações (mesmas regras do SQL 039) ----------------
const limparNome = (t: unknown) => String(t ?? '').replace(/\s+/g, ' ').trim()

// várias regras de uma vez (tudo ou nada); cada mudança vai para o histórico
export function salvarRegrasCobranca(d: ErpState, novos: Record<string, number>, atuais: Record<string, number>, ctx: Contexto): string | null {
  for (const k of Object.keys(novos)) if (!REGRAS_COBRANCA.some((r) => r.chave === k)) return `Regra desconhecida: ${k}`
  const final = { ...atuais, ...novos }
  const erro = validarRegrasCobranca(final)
  if (erro) return erro
  const lista = col(d, 'cobranca_regras')
  for (const [chave, valor] of Object.entries(novos)) {
    const r = lista.find((x) => x.chave === chave)
    const antes = r ? Number(r.valor) : null
    if (antes === valor) continue
    if (r) Object.assign(r, { valor, atualizadoPor: ctx.autorId })
    else inserir(d, 'cobranca_regras', { chave, valor, atualizadoPor: ctx.autorId })
    inserir(d, 'cobranca_regras_historico', { chave, valorAntigo: antes ?? '', valorNovo: valor, alteradoPor: ctx.autorId, alteradoPorNome: ctx.autorNome })
    auditar(d, ctx, 'EDITAR', `Regra da cobrança: ${rotuloRegra(chave)} ${antes ?? '—'} → ${valor}`, 'cobranca')
  }
  return null
}

export interface DadosCategoriaCobranca {
  nome: string
  grupo: string
  contaInadimplencia: boolean
  podeSpc: boolean
  escritorioId: string
  nomesAntigos: string[]
  ativa: boolean
  observacao: string
}
// confere como o banco: nome único (sem acento/maiúscula), nome antigo em uma categoria só, escritório só em Terceirizada/Advogado
export function conferirCategoriaCobranca(d: ErpState, x: DadosCategoriaCobranca, id?: string): string | null {
  const nome = limparNome(x.nome)
  if (!nome) return 'Informe o nome da categoria.'
  const outras = col(d, 'cobranca_categorias').filter((c) => c.id !== id)
  if (outras.some((c) => textoBusca(c.nome) === textoBusca(nome))) return 'Já existe uma categoria com esse nome.'
  if (x.escritorioId && !tipoEscritorioDoGrupo(x.grupo)) return 'Só categorias de Terceirizada ou Advogado têm escritório.'
  for (const n of x.nomesAntigos.map(limparNome).filter(Boolean)) {
    const dona = outras.find((c) => lerLista(c.nomesAntigos).some((a) => textoBusca(a) === textoBusca(n)))
    if (dona) return `O nome antigo "${n}" já está na categoria "${dona.nome}".`
  }
  return null
}
const lerLista = (v: unknown): string[] => {
  try {
    const l = typeof v === 'string' ? JSON.parse(v || '[]') : v
    return Array.isArray(l) ? l.map(String) : []
  } catch {
    return []
  }
}
export const nomesAntigosLimpos = (lista: string[]) => {
  const vistos = new Set<string>()
  return lista.map(limparNome).filter((n) => n && !vistos.has(textoBusca(n)) && vistos.add(textoBusca(n))).sort()
}

export function conferirEscritorioCobranca(d: ErpState, nome: string, id?: string): string | null {
  const n = limparNome(nome)
  if (!n) return 'Informe o nome do escritório.'
  if (col(d, 'cobranca_escritorios').some((e) => e.id !== id && textoBusca(e.nome) === textoBusca(n))) return 'Já existe um escritório com esse nome.'
  return null
}

// Custo mensal da vendedora (SQL 037): o salário do holerite que o Financeiro lança; vazio apaga (volta para a estimativa)
export function salvarCustoReboloMes(d: ErpState, vendedoraId: string, mes: string, salario: number | null, observacao: string, ctx: Contexto): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return 'Mês inválido.'
  if (salario !== null && salario < 0) return 'O salário não pode ser negativo.'
  const lista = col(d, 'rebolo_custos_mes')
  const atual = lista.find((c) => c.vendedoraId === vendedoraId && c.mes === mes)
  const nome = d.colaboradores.find((c) => c.id === vendedoraId)?.nome ?? 'vendedora'
  if (salario === null) {
    if (atual) d.colecoes.rebolo_custos_mes = lista.filter((c) => c !== atual)
  } else if (atual) Object.assign(atual, { salario, observacao })
  else inserir(d, 'rebolo_custos_mes', { vendedoraId, mes, salario, observacao })
  auditar(d, ctx, salario === null ? 'EXCLUIR' : 'EDITAR', `Custo de ${nome} em ${mes}: ${salario === null ? 'apagado (volta para a estimativa)' : `salário R$ ${salario}`}`, 'financeiro')
  return null
}

// =====================================================================
// ESTOQUE DE ÁLBUNS E CARGAS DOS VENDEDORES DE BOOKS (mesmas regras do SQL 029)
// Só o Financeiro mexe: carga (vendedor + caixas de várias escolas) → em venda → acerto na volta → Rebolo.
// =====================================================================

const vazioCx = (v: unknown) => v === '' || v === null || v === undefined
const albunsCx = (c: Registro) => Number(vazioCx(c.conferidoAlbuns) ? c.albuns : c.conferidoAlbuns) || 0
const posteresCx = (c: Registro) => Number(vazioCx(c.conferidoPosteres) ? c.posteres : c.conferidoPosteres) || 0
const nomeEscola = (d: ErpState, loteId: unknown) => String(col(d, 'producao_lotes').find((l) => l.id === loteId)?.escola ?? '')

// extrato: uma linha por escola com as caixas da carga
function movCaixas(d: ErpState, carga: Registro, caixaIds: string[], tipo: string, ctx: Contexto, texto = '') {
  const porLote = new Map<string, { albuns: number; posteres: number; numeros: number[] }>()
  for (const k of col(d, 'estoque_carga_caixas').filter((x) => x.cargaId === carga.id && caixaIds.includes(String(x.caixaId)))) {
    const g = porLote.get(String(k.loteId)) ?? { albuns: 0, posteres: 0, numeros: [] }
    g.albuns += Number(k.albuns) || 0
    g.posteres += Number(k.posteres) || 0
    g.numeros.push(Number(col(d, 'producao_caixas').find((c) => c.id === k.caixaId)?.numero) || 0)
    porLote.set(String(k.loteId), g)
  }
  for (const [loteId, g] of porLote)
    inserir(d, 'estoque_movimentos', {
      loteId,
      cargaId: carga.id,
      tipo,
      albuns: g.albuns,
      posteres: g.posteres,
      descricao: `Carga ${carga.numero} • ${carga.vendedor} • caixa(s) ${g.numeros.sort((a, b) => a - b).join(', ')}${texto ? ` • ${texto}` : ''}`,
      autor: ctx.autorNome,
    })
}

function conferirCaixasDemo(d: ErpState, ids: string[]): string | null {
  const cxs = col(d, 'producao_caixas').filter((c) => ids.includes(c.id))
  if (cxs.length !== ids.length) return 'Alguma caixa não foi encontrada: atualize a tela.'
  const fora = cxs.filter((c) => c.status !== 'Em estoque').map((c) => `${nomeEscola(d, c.loteId)} (caixa ${c.numero})`)
  return fora.length ? `Estas caixas não estão no estoque: ${fora.join(', ')}.` : null
}

function colocarNaCarga(d: ErpState, carga: Registro, ids: string[]) {
  for (const c of col(d, 'producao_caixas').filter((x) => ids.includes(x.id))) {
    inserir(d, 'estoque_carga_caixas', { cargaId: carga.id, caixaId: c.id, loteId: c.loteId, albuns: albunsCx(c), posteres: posteresCx(c) })
    c.status = 'Em carga'
  }
}

const vendedorDeBooks = (d: ErpState, id: string) => col(d, 'pj_vendedores').find((v) => v.id === id && v.tipo === 'Books')

export function criarCarga(d: ErpState, vendedorId: string, caixaIds: string[], rota: string, observacao: string, ctx: Contexto): { erro: string } | { id: string } {
  const vd = vendedorDeBooks(d, vendedorId)
  if (!vd) return { erro: 'Escolha o vendedor de books da carga.' }
  const ids = [...new Set(caixaIds)]
  if (!ids.length) return { erro: 'Escolha as caixas da carga.' }
  const erro = conferirCaixasDemo(d, ids)
  if (erro) return { erro }
  const numero = Math.max(0, ...col(d, 'estoque_cargas').map((c) => Number(c.numero) || 0)) + 1
  const carga = inserir(d, 'estoque_cargas', {
    numero,
    vendedorId: vd.id,
    vendedor: vd.nome,
    rota: rota.trim(),
    observacao: observacao.trim(),
    dataSaida: hoje(),
    status: 'Em venda',
    criadaPor: ctx.autorNome,
    acertoEm: '',
    acertoPor: '',
    acertoObs: '',
    canceladaEm: '',
    canceladaPor: '',
    motivoCancelamento: '',
  })
  colocarNaCarga(d, carga, ids)
  movCaixas(d, carga, ids, 'Saiu na carga', ctx)
  auditar(d, ctx, 'CRIAR', `Carga ${numero} montada: ${vd.nome} (${ids.length} caixa(s))`, 'financeiro')
  return { id: carga.id }
}

export interface EdicaoCarga {
  vendedorId: string
  adicionar: string[]
  remover: string[]
  rota: string
  observacao: string
}

export function editarCarga(d: ErpState, cargaId: string, x: EdicaoCarga, ctx: Contexto): string | null {
  const c = col(d, 'estoque_cargas').find((r) => r.id === cargaId)
  if (!c) return 'Carga não encontrada.'
  if (c.status !== 'Em venda') return `Só dá para mudar uma carga em venda (esta está "${c.status}").`
  const naCarga = () => col(d, 'estoque_carga_caixas').filter((k) => k.cargaId === c.id).map((k) => String(k.caixaId))
  const remover = [...new Set(x.remover)].filter((id) => naCarga().includes(id))
  const adicionar = [...new Set(x.adicionar)].filter((id) => !naCarga().includes(id))
  if (naCarga().filter((id) => !remover.includes(id)).length + adicionar.length === 0) return 'A carga ficaria sem caixas: use "Cancelar carga".'
  if (adicionar.length) {
    const erro = conferirCaixasDemo(d, adicionar)
    if (erro) return erro
  }
  if (x.vendedorId && x.vendedorId !== c.vendedorId) {
    const vd = vendedorDeBooks(d, x.vendedorId)
    if (!vd) return 'Escolha o vendedor de books da carga.'
    for (const loteId of new Set(col(d, 'estoque_carga_caixas').filter((k) => k.cargaId === c.id).map((k) => String(k.loteId))))
      inserir(d, 'estoque_movimentos', { loteId, cargaId: c.id, tipo: 'Vendedor trocado', albuns: 0, posteres: 0, descricao: `Carga ${c.numero}: ${c.vendedor} → ${vd.nome}`, autor: ctx.autorNome })
    c.vendedorId = vd.id
    c.vendedor = vd.nome
  }
  if (remover.length) {
    movCaixas(d, c, remover, 'Voltou ao estoque', ctx, 'tirada(s) da carga')
    d.colecoes.estoque_carga_caixas = col(d, 'estoque_carga_caixas').filter((k) => !(k.cargaId === c.id && remover.includes(String(k.caixaId))))
    for (const cx of col(d, 'producao_caixas').filter((r) => remover.includes(r.id) && r.status === 'Em carga')) cx.status = 'Em estoque'
  }
  if (adicionar.length) {
    colocarNaCarga(d, c, adicionar)
    movCaixas(d, c, adicionar, 'Saiu na carga', ctx, 'colocada(s) na carga')
  }
  c.rota = x.rota.trim()
  c.observacao = x.observacao.trim()
  auditar(d, ctx, 'EDITAR', `Carga ${c.numero} alterada`, 'financeiro')
  return null
}

export function cancelarCarga(d: ErpState, cargaId: string, motivo: string, ctx: Contexto): string | null {
  if (!motivo.trim()) return 'Informe o motivo do cancelamento.'
  const c = col(d, 'estoque_cargas').find((r) => r.id === cargaId)
  if (!c) return 'Carga não encontrada.'
  if (c.status !== 'Em venda') return `Só dá para cancelar uma carga em venda (esta está "${c.status}").`
  const ids = col(d, 'estoque_carga_caixas').filter((k) => k.cargaId === c.id).map((k) => String(k.caixaId))
  movCaixas(d, c, ids, 'Carga cancelada', ctx, `voltou para o estoque • motivo: ${motivo.trim()}`)
  for (const cx of col(d, 'producao_caixas').filter((r) => ids.includes(r.id) && r.status === 'Em carga')) cx.status = 'Em estoque'
  Object.assign(c, { status: 'Cancelada', canceladaEm: hoje(), canceladaPor: ctx.autorNome, motivoCancelamento: motivo.trim() })
  auditar(d, ctx, 'EDITAR', `Carga ${c.numero} cancelada: ${motivo.trim()}`, 'financeiro')
  return null
}

export interface AcertoDigitado {
  loteId: string
  albunsVendidos: number
  albunsVoltaram: number
  posteresVendidos: number
  posteresVoltaram: number
  observacao: string
  destino?: DestinoVolta // 056: o que voltou vai para o estoque ou para o Rebolo (vazio = aguardando, como antes)
}
export type DestinoVolta = 'Estoque' | 'Rebolo' | ''

export function acertarCarga(d: ErpState, cargaId: string, escolas: AcertoDigitado[], observacao: string, ctx: Contexto): string | null {
  const c = col(d, 'estoque_cargas').find((r) => r.id === cargaId)
  if (!c) return 'Carga não encontrada.'
  if (c.status !== 'Em venda') return `Só dá para acertar uma carga em venda (esta está "${c.status}").`
  const itens = col(d, 'estoque_carga_caixas').filter((k) => k.cargaId === c.id)
  const lotes = [...new Set(itens.map((k) => String(k.loteId)))].sort((a, b) => nomeEscola(d, a).localeCompare(nomeEscola(d, b), 'pt-BR'))
  if (escolas.some((e) => !lotes.includes(e.loteId))) return 'Tem escola no acerto que não está nesta carga: atualize a tela.'
  const linhas: Omit<Registro, 'id' | 'criadoEm'>[] = []
  for (const loteId of lotes) {
    const escola = nomeEscola(d, loteId)
    const e = escolas.find((x) => x.loteId === loteId)
    if (!e) return `Informe o acerto de ${escola}.`
    const daEscola = itens.filter((k) => k.loteId === loteId)
    const levA = daEscola.reduce((a, k) => a + (Number(k.albuns) || 0), 0)
    const levP = daEscola.reduce((a, k) => a + (Number(k.posteres) || 0), 0)
    const [av, ar, pv, pr] = [e.albunsVendidos, e.albunsVoltaram, e.posteresVendidos, e.posteresVoltaram].map((v) => Number(v))
    if ([av, ar, pv, pr].some((v) => !Number.isInteger(v) || v < 0)) return `${escola}: informe os álbuns vendidos e os que voltaram (0 ou mais).`
    if (av + ar > levA) return `${escola}: vendidos + voltaram (${av + ar} álbuns) passa do que foi levado (${levA}).`
    if (pv + pr > levP) return `${escola}: vendidos + voltaram (${pv + pr} pôsteres/brindes) passa do que foi levado (${levP}).`
    if (e.destino && e.destino !== 'Estoque' && e.destino !== 'Rebolo') return `${escola}: destino inválido.`
    const destino = ar + pr > 0 ? e.destino || '' : ''
    linhas.push({ cargaId: c.id, loteId, albunsLevados: levA, posteresLevados: levP, albunsVendidos: av, albunsVoltaram: ar, posteresVendidos: pv, posteresVoltaram: pr, albunsDiferenca: levA - av - ar, posteresDiferenca: levP - pv - pr, observacao: e.observacao.trim(), destino })
  }
  const texto = `Carga ${c.numero} • ${c.vendedor}`
  for (const l of linhas) {
    inserir(d, 'estoque_carga_acertos', l)
    const mov = (tipo: string, albuns: number, posteres: number, descricao: string) => {
      if (albuns + posteres > 0) inserir(d, 'estoque_movimentos', { loteId: l.loteId, cargaId: c.id, tipo, albuns, posteres, descricao, autor: ctx.autorNome })
    }
    mov('Vendidos', Number(l.albunsVendidos), Number(l.posteresVendidos), texto)
    const ar = Number(l.albunsVoltaram), pr = Number(l.posteresVoltaram)
    mov('Voltaram', ar, pr, `${texto} • ${l.destino === 'Estoque' ? 'voltou para o estoque' : l.destino === 'Rebolo' ? 'enviado para o Rebolo' : 'aguardando o Rebolo'}`)
    mov('Diferença', Math.max(0, Number(l.albunsDiferenca)), Math.max(0, Number(l.posteresDiferenca)), `${texto}${l.observacao ? ` • ${l.observacao}` : ''}`)
    if (l.destino === 'Estoque') {
      // o que voltou vira uma caixa da escola, já conferida e em estoque (não é revelação: sem meta)
      const numero = Math.max(0, ...col(d, 'producao_caixas').filter((x) => x.loteId === l.loteId).map((x) => Number(x.numero) || 0)) + 1
      inserir(d, 'producao_caixas', {
        loteId: l.loteId, numero, data: hoje(), albuns: ar, posteres: pr, observacao: `Volta da carga nº ${c.numero} • ${c.vendedor}`, registradoPor: '',
        lancamentoId: '', status: 'Em estoque', conferidoAlbuns: ar, conferidoPosteres: pr, conferenciaObs: 'Volta da carga (acerto do Financeiro)',
        conferidoPor: ctx.autorId, conferidoEm: hoje(), origemCargaId: c.id,
      })
      mov('Voltou ao estoque', ar, pr, `${texto} • caixa ${numero}`)
    } else if (l.destino === 'Rebolo') {
      inserir(d, 'estoque_envios_rebolo', { loteId: l.loteId, albuns: ar, posteres: pr, data: hoje(), observacao: `Volta da carga nº ${c.numero}`, autor: ctx.autorNome, cargaId: c.id })
      mov('Enviado ao Rebolo', ar, pr, `${texto} • direto no acerto`)
      const lt = col(d, 'producao_lotes').find((x) => x.id === l.loteId)
      notificar(d, ctx, {
        setores: ['rebolo'],
        tipo: 'info',
        titulo: 'Álbuns para o Rebolo',
        descricao: `${lt?.escola ?? ''} (${lt?.cidade ?? ''}): ${ar} álbuns${pr ? ` e ${pr} pôsteres/brindes` : ''} voltaram da carga nº ${c.numero} e foram encaminhados ao Rebolo.`,
        link: '/rebolo',
      })
    }
  }
  const ids = itens.map((k) => String(k.caixaId))
  for (const cx of col(d, 'producao_caixas').filter((r) => ids.includes(r.id))) cx.status = 'Acertada'
  Object.assign(c, { status: 'Encerrada', acertoEm: hoje(), acertoPor: ctx.autorNome, acertoObs: observacao.trim() })
  auditar(d, ctx, 'EDITAR', `Carga ${c.numero} acertada`, 'financeiro')
  return null
}

// o que voltou e ainda não foi encaminhado ao Rebolo (por escola); semCarga = sem o acerto desta carga
function aguardandoRebolo(d: ErpState, loteId: string, semCarga = '') {
  // o que voltou para o estoque (056) não fica aguardando o Rebolo
  const voltou = col(d, 'estoque_carga_acertos').filter((a) => a.loteId === loteId && a.cargaId !== semCarga && a.destino !== 'Estoque')
  const foi = col(d, 'estoque_envios_rebolo').filter((r) => r.loteId === loteId && (!semCarga || r.cargaId !== semCarga))
  const soma = (xs: Registro[], k: string) => xs.reduce((a, x) => a + (Number(x[k]) || 0), 0)
  return { albuns: soma(voltou, 'albunsVoltaram') - soma(foi, 'albuns'), posteres: soma(voltou, 'posteresVoltaram') - soma(foi, 'posteres') }
}

export function desfazerAcerto(d: ErpState, cargaId: string, motivo: string, ctx: Contexto): string | null {
  if (!motivo.trim()) return 'Informe o motivo.'
  const c = col(d, 'estoque_cargas').find((r) => r.id === cargaId)
  if (!c) return 'Carga não encontrada.'
  if (c.status !== 'Encerrada') return 'Esta carga não foi acertada.'
  // a caixa da volta já saiu em outra carga: não dá para desfazer
  const voltas = col(d, 'producao_caixas').filter((x) => x.origemCargaId === c.id)
  const saiu = voltas.filter((x) => x.status !== 'Em estoque' || col(d, 'estoque_carga_caixas').some((k) => k.caixaId === x.id))
  if (saiu.length) return `O que voltou para o estoque desta carga já saiu em outra carga (${[...new Set(saiu.map((x) => nomeEscola(d, x.loteId)))].join(', ')}): desfaça aquela carga antes.`
  const acs = col(d, 'estoque_carga_acertos').filter((a) => a.cargaId === c.id)
  const bloq = acs.filter((a) => {
    const r = aguardandoRebolo(d, String(a.loteId), c.id)
    return r.albuns < 0 || r.posteres < 0
  })
  if (bloq.length) return `O que voltou desta carga já foi encaminhado ao Rebolo (${bloq.map((a) => nomeEscola(d, a.loteId)).join(', ')}): desfaça o envio ao Rebolo antes.`
  for (const a of acs) inserir(d, 'estoque_movimentos', { loteId: a.loteId, cargaId: c.id, tipo: 'Acerto desfeito', albuns: 0, posteres: 0, descricao: `Carga ${c.numero} • ${c.vendedor} • motivo: ${motivo.trim()}`, autor: ctx.autorNome })
  d.colecoes.estoque_carga_acertos = col(d, 'estoque_carga_acertos').filter((a) => a.cargaId !== c.id)
  d.colecoes.producao_caixas = col(d, 'producao_caixas').filter((x) => x.origemCargaId !== c.id)
  d.colecoes.estoque_envios_rebolo = col(d, 'estoque_envios_rebolo').filter((x) => x.cargaId !== c.id)
  const ids = col(d, 'estoque_carga_caixas').filter((k) => k.cargaId === c.id).map((k) => String(k.caixaId))
  for (const cx of col(d, 'producao_caixas').filter((r) => ids.includes(r.id))) cx.status = 'Em carga'
  Object.assign(c, { status: 'Em venda', acertoEm: '', acertoPor: '', acertoObs: '' })
  auditar(d, ctx, 'EDITAR', `Acerto da carga ${c.numero} desfeito: ${motivo.trim()}`, 'financeiro')
  return null
}

export function enviarRebolo(d: ErpState, loteId: string, albuns: number, posteres: number, observacao: string, ctx: Contexto): string | null {
  const l = col(d, 'producao_lotes').find((x) => x.id === loteId)
  if (!l) return 'Escola não encontrada.'
  if (!Number.isInteger(albuns) || !Number.isInteger(posteres) || albuns < 0 || posteres < 0 || albuns + posteres === 0) return 'Informe quantos álbuns (e pôsteres/brindes) vão para o Rebolo.'
  const r = aguardandoRebolo(d, loteId)
  if (albuns > r.albuns || posteres > r.posteres) return `Esta escola tem só ${r.albuns} álbuns e ${r.posteres} pôsteres/brindes aguardando o Rebolo.`
  inserir(d, 'estoque_envios_rebolo', { loteId, albuns, posteres, data: hoje(), observacao: observacao.trim(), autor: ctx.autorNome })
  inserir(d, 'estoque_movimentos', { loteId, cargaId: '', tipo: 'Enviado ao Rebolo', albuns, posteres, descricao: observacao.trim() || 'O Rebolo pega as caixas e tenta vender', autor: ctx.autorNome })
  notificar(d, ctx, {
    setores: ['rebolo'],
    tipo: 'info',
    titulo: 'Álbuns para o Rebolo',
    descricao: `${l.escola} (${l.cidade}): ${albuns} álbuns${posteres ? ` e ${posteres} pôsteres/brindes` : ''} voltaram das cargas e foram encaminhados ao Rebolo.`,
    link: '/rebolo',
  })
  auditar(d, ctx, 'CRIAR', `Encaminhado ao Rebolo: ${l.escola} (${albuns} álbuns)`, 'financeiro')
  return null
}

export function desfazerEnvioRebolo(d: ErpState, envioId: string, ctx: Contexto): string | null {
  const r = col(d, 'estoque_envios_rebolo').find((x) => x.id === envioId)
  if (!r) return 'Envio não encontrado.'
  if (r.cargaId) return 'Este envio foi feito no acerto da carga: para mudar, desfaça o acerto da carga.'
  d.colecoes.estoque_envios_rebolo = col(d, 'estoque_envios_rebolo').filter((x) => x.id !== envioId)
  inserir(d, 'estoque_movimentos', { loteId: r.loteId, cargaId: '', tipo: 'Envio ao Rebolo desfeito', albuns: r.albuns, posteres: r.posteres, descricao: `Envio de ${dataBR(String(r.data))} desfeito: voltou a ficar aguardando o Rebolo`, autor: ctx.autorNome })
  auditar(d, ctx, 'EXCLUIR', `Envio ao Rebolo desfeito: ${nomeEscola(d, r.loteId)}`, 'financeiro')
  return null
}

// ---------------- Cobrança: registrar contato (SQL 046 — mesmas regras do banco) ----------------
export interface DadosContatoCobranca {
  cobrancas: string[]
  tipo: string
  data: string
  situacao: string
  observacao: string
  retornoEm: string
  promessaEm: string
  promessaValor: number
}

export function conferirContatoCobranca(x: DadosContatoCobranca, hj = hoje()): string | null {
  if (!x.cobrancas.length) return 'Escolha a cobrança.'
  if (!['WhatsApp', 'Ligação', 'E-mail', 'Outro'].includes(x.tipo)) return 'Escolha o tipo do contato (WhatsApp, Ligação, E-mail ou Outro).'
  if (!x.data || x.data > hj) return 'Informe a data do contato (não pode ser no futuro).'
  if (!['Contato realizado sem acordo', 'Aguardando retorno', 'Pagamento de boleto agendado', 'Não localizado', 'Ficha não encontrada SPC'].includes(x.situacao))
    return 'Escolha a situação da cobrança.'
  if (['Contato realizado sem acordo', 'Não localizado'].includes(x.situacao) && !x.observacao.trim())
    return 'Observação obrigatória para "Cliente não localizado" e "Contato realizado sem acordo".'
  if (x.situacao === 'Aguardando retorno' && (!x.retornoEm || x.retornoEm < hj)) return 'Informe a data do retorno (hoje ou depois).'
  if (x.situacao === 'Pagamento de boleto agendado' && (!x.promessaEm || x.promessaEm < hj)) return 'Informe a data do pagamento agendado (hoje ou depois).'
  if (x.promessaValor < 0) return 'O valor prometido tem que ser maior que zero.'
  return null
}

export function registrarContatoCobranca(d: ErpState, x: DadosContatoCobranca, ctx: Contexto): string | null {
  const erro = conferirContatoCobranca(x)
  if (erro) return erro
  const calc = calcularCarteira(d).cobrancas
  const alvo = x.cobrancas.map((id) => calc.find((c) => c.id === id))
  if (alvo.some((c) => !c)) return 'Cobrança não encontrada.'
  if (new Set(alvo.map((c) => c!.clienteId)).size > 1) return 'As cobranças têm que ser do mesmo cliente.'
  for (const c of alvo) {
    if (c!.carteira !== 'Cobrança DLG') return `Esta dívida está na carteira ${c!.carteira} (a Cobrança só consulta).`
    if (c!.vencido <= 0) return 'Esta cobrança não tem boleto vencido.'
    if (['Renegociação feita (aguardando entrada)', 'Entrada confirmada', 'Renegociação efetivada'].includes(c!.situacao))
      return `Esta cobrança tem acordo em andamento (${c!.situacao}): o contato não muda a situação.`
  }
  const ret = x.situacao === 'Aguardando retorno' ? x.retornoEm : ''
  const pro = x.situacao === 'Pagamento de boleto agendado' ? x.promessaEm : ''
  const val = x.situacao === 'Pagamento de boleto agendado' && x.promessaValor > 0 ? centavos(x.promessaValor) : 0
  for (const c of alvo) {
    const bruta = col(d, 'cobrancas').find((y) => y.id === c!.id)!
    inserir(d, 'cobranca_contatos', {
      cobrancaId: c!.id, clienteId: c!.clienteId, tipo: x.tipo, data: x.data, situacao: x.situacao, situacaoAntes: String(bruta.situacao ?? ''),
      observacao: x.observacao.trim(), retornoEm: ret, promessaEm: pro, promessaValor: val, registradoPor: ctx.autorId, registradoPorNome: ctx.autorNome,
    })
    const ultimo = String(bruta.ultimoContatoEm ?? '')
    Object.assign(bruta, { situacao: x.situacao, retornoEm: ret, promessaEm: pro, promessaValor: val, ultimoContatoEm: ultimo > x.data ? ultimo : x.data })
  }
  auditar(d, ctx, 'EDITAR', `Contato de cobrança registrado (${x.situacao})`, ctx.autorSetor)
  return null
}

// ---------------- Cobrança: simulação e acordo (SQL 047 — mesmas regras do banco) ----------------
export type ModoAcordo = 'simular' | 'fechar' | 'data' | 'recalcular'
const ACORDO_ABERTO = ['Simulada', 'Aguardando entrada', 'Entrada confirmada']

export function salvarAcordoCobranca(d: ErpState, cobrancaId: string, modo: ModoAcordo, x: DadosAcordo, ctx: Contexto): string | null {
  const hj = hoje()
  const acordos = col(d, 'cobranca_acordos')
  const a = acordos.find((y) => y.cobrancaId === cobrancaId && ACORDO_ABERTO.includes(String(y.situacao)))
  const evento = (acao: string, extra: Record<string, unknown> = {}) => [...((a?.historico as unknown as unknown[]) ?? []), { em: agora(), por: ctx.autorNome, acao, ...extra }]
  if (modo === 'data') {
    if (!a || a.situacao !== 'Aguardando entrada') return 'Só dá para mudar a data da entrada de um acordo aguardando a entrada.'
    if (!x.entradaPrazo || x.entradaPrazo < hj) return 'Informe o prazo para pagar a entrada (hoje ou depois).'
    Object.assign(a, { entradaPrazo: x.entradaPrazo, historico: evento('Data da entrada alterada', { de: a.entradaPrazo, para: x.entradaPrazo }) })
    return null
  }
  if (modo === 'recalcular' && (!a || a.situacao !== 'Aguardando entrada')) return 'Só dá para recalcular um acordo aguardando a entrada.'
  if (a?.situacao === 'Entrada confirmada') return 'A entrada deste acordo já foi confirmada pelo Financeiro: não muda mais.'
  if ((modo === 'simular' || modo === 'fechar') && a?.situacao === 'Aguardando entrada') return 'Esta cobrança já tem acordo fechado: use "Editar renegociação".'
  const calc = calcularCarteira(d)
  const c = calc.cobrancas.find((y) => y.id === cobrancaId)
  if (!c) return 'Cobrança não encontrada.'
  if (c.carteira !== 'Cobrança DLG') return `Esta dívida está na carteira ${c.carteira} (a Cobrança só consulta).`
  if (c.vencido <= 0) return 'Esta cobrança não tem boleto vencido.'
  if (x.desconto < 0 || (x.descontoTipo === '%' && x.desconto > 100)) return 'O desconto vai de 0 a 100%.'
  if (x.entrada < 0) return 'A entrada não pode ser negativa.'
  if (x.entrada > 0 && !x.entradaForma) return 'Escolha a forma de pagamento da entrada (PIX, Cartão ou Dinheiro).'
  if (x.entrada > 0 && (!x.entradaPrazo || x.entradaPrazo < hj)) return 'Informe o prazo para pagar a entrada (hoje ou depois).'
  if (x.entrada > 0 && x.pagadorTipo === 'Outra pessoa' && (!x.pagadorNome.trim() || !documentoValido(x.pagadorDocumento)))
    return 'Informe o nome e um CPF/CNPJ válido de quem vai pagar a entrada.'
  if (modo === 'simular' && (!x.retornoEm || x.retornoEm < hj)) return 'Informe a data do retorno do cliente (hoje ou depois).'
  const conta = calcularAcordo(c.totalDivida, x)
  if (!conta.quitacaoAVista) {
    if (x.simularPor === 'Valor' && !(x.valorDesejado > 0)) return 'Informe o valor desejado da parcela.'
    if (conta.parcelasQtd < 1) return 'Informe o número de parcelas.'
    if (!x.primeiroVencimento) return 'Informe o vencimento do primeiro boleto.'
  }
  const snapshot = calc.parcelas.filter((p) => p.cobrancaId === cobrancaId && (p.situacao === 'Aberta' || p.situacao === 'Parcial'))
  const doc = x.pagadorDocumento.replace(/\D/g, '')
  const dados = {
    cobrancaId, clienteId: c.clienteId, situacao: modo === 'simular' ? 'Simulada' : 'Aguardando entrada', conta: c.conta, dataCalculo: hj, parcelasSnapshot: snapshot,
    valorOriginalAtraso: c.vencido, multa: c.multa, juros: c.juros, atualizado: c.atualizado, aVencer: c.aVencer, totalDivida: c.totalDivida,
    descontoTipo: x.descontoTipo, descontoInformado: x.desconto, desconto: conta.desconto, valorAposDesconto: conta.valorAposDesconto,
    entrada: x.entrada, entradaPrazo: x.entradaPrazo, entradaForma: x.entrada > 0 ? x.entradaForma : '',
    pagadorTipo: x.pagadorTipo, pagadorNome: x.pagadorTipo === 'Outra pessoa' ? x.pagadorNome.trim() : '', pagadorDocumento: x.pagadorTipo === 'Outra pessoa' ? doc : '',
    valorPrazo: conta.valorPrazo, simularPor: x.simularPor, parcelasQtd: conta.parcelasQtd, parcelaValor: conta.parcelaValor,
    formaPagamento: conta.quitacaoAVista ? '' : x.formaPagamento, primeiroVencimento: conta.quitacaoAVista ? '' : x.primeiroVencimento,
    quitacaoAVista: conta.quitacaoAVista, totalAPagar: conta.totalAPagar, observacao: x.observacao.trim(), retornoEm: modo === 'simular' ? x.retornoEm : '',
    parcelasVencidasCongeladas: c.parcelasVencidas, categoriaGrupoCongelado: c.grupo, estavaSpc: c.grupo === 'Registro SPC',
  }
  const acao = modo === 'simular' ? 'Simulação salva' : modo === 'fechar' ? 'Acordo fechado' : 'Acordo recalculado'
  if (a) Object.assign(a, dados, { fechadoEm: modo === 'simular' ? '' : a.fechadoEm || agora(), historico: evento(acao) })
  else {
    const versao = Math.max(0, ...acordos.filter((y) => y.cobrancaId === cobrancaId).map((y) => Number(y.versao) || 0)) + 1
    inserir(d, 'cobranca_acordos', {
      ...dados, versao, cobradorId: String(col(d, 'cobrancas').find((y) => y.id === cobrancaId)?.cobradorId ?? ''), criadoPor: ctx.autorId, criadoPorNome: ctx.autorNome,
      fechadoEm: modo === 'simular' ? '' : agora(), fichaImpressoes: 0, historico: [{ em: agora(), por: ctx.autorNome, acao }],
    } as never)
  }
  const bruta = col(d, 'cobrancas').find((y) => y.id === cobrancaId)!
  Object.assign(bruta, { situacao: modo === 'simular' ? 'Renegociação simulada' : 'Renegociação feita (aguardando entrada)', retornoEm: modo === 'simular' ? x.retornoEm : '', promessaEm: '', promessaValor: 0 })
  auditar(d, ctx, 'EDITAR', `Renegociação: ${acao.toLowerCase()}`, ctx.autorSetor)
  return null
}

export function registrarImpressaoFicha(d: ErpState, acordoId: string): string | null {
  const a = col(d, 'cobranca_acordos').find((y) => y.id === acordoId)
  if (!a || !['Aguardando entrada', 'Entrada confirmada', 'Efetivada'].includes(String(a.situacao))) return 'A ficha só sai de acordo fechado.'
  Object.assign(a, { fichaImpressoes: (Number(a.fichaImpressoes) || 0) + 1, fichaImpressaEm: a.fichaImpressaEm || agora() })
  return null
}

// ---------------- Financeiro: conferir a entrada e efetivar o acordo (SQL 048 — mesmas regras do banco) ----------------
export type AcaoFinanceiroAcordo = 'confirmar' | 'devolver' | 'reverter' | 'efetivar' | 'quebrar' | 'boletos_enviados'

function eventoAcordo(a: Registro, ctx: Contexto, acao: string, extra: Record<string, unknown> = {}) {
  return [...((a.historico as unknown as unknown[]) ?? []), { em: agora(), por: ctx.autorNome, acao, ...extra }] as never
}

function efetivarAcordoDemo(d: ErpState, a: Registro, ctx: Contexto) {
  const velha = col(d, 'cobrancas').find((y) => y.id === a.cobrancaId)!
  for (const p of col(d, 'cobranca_parcelas').filter((y) => y.cobrancaId === velha.id && (y.situacao === 'Aberta' || y.situacao === 'Parcial'))) Object.assign(p, { situacao: 'Em acordo', cobrancaAcordoId: a.id })
  const nova = novaCobranca(
    d,
    {
      clienteId: String(velha.clienteId), origem: 'Acordo', codigoVenda: String(velha.codigoVenda ?? ''), categoriaId: String(velha.categoriaId), cobradorId: String(velha.cobradorId ?? ''),
      conta: String(velha.conta ?? ''), referencia: [`Acordo v${a.versao}`, String(velha.referencia ?? '')].filter(Boolean).join(' • '), observacao: String(a.observacao ?? ''), acordoOrigemId: a.id,
    },
    ctx,
  )
  const qtd = Number(a.parcelasQtd) || 0
  if (Number(a.entrada) > 0) {
    const p = novaParcela(d, { cobrancaId: nova.id, numero: 0, total: Math.max(qtd, 1), valor: Number(a.entrada), vencimento: String(a.entradaRecebidaEm), multa: 0, cobraJuros: false as never, cobrancaAcordoId: a.id, baixado: Number(a.entrada), pagoEm: String(a.entradaRecebidaEm) })
    inserir(d, 'cobranca_pagamentos', {
      parcelaId: p.id, cobrancaId: nova.id, valor: Number(a.entrada), principal: Number(a.entrada), encargos: 0, desconto: 0, data: String(a.entradaRecebidaEm), forma: String(a.entradaConfirmadaForma),
      observacao: `Entrada do acordo v${a.versao} (confirmada pelo Financeiro)`, origem: 'Sistema', lancamentoId: '', registradoPor: ctx.autorId, registradoPorNome: ctx.autorNome,
      estornadoEm: '', estornadoPorNome: '', estornoMotivo: '',
    })
  }
  for (let i = 1; i <= qtd; i++) {
    const valor = i === qtd ? centavos(Number(a.valorPrazo) - Number(a.parcelaValor) * (qtd - 1)) : Number(a.parcelaValor)
    novaParcela(d, { cobrancaId: nova.id, numero: i, total: qtd, valor, vencimento: addMeses(String(a.primeiroVencimento), i - 1), cobrancaAcordoId: a.id })
  }
  Object.assign(a, { situacao: 'Efetivada', efetivadoEm: agora(), efetivadoPorNome: ctx.autorNome, cobrancaNovaId: nova.id, historico: eventoAcordo(a, ctx, 'Renegociação efetivada') })
  velha.situacao = 'Renegociação efetivada'
}

export function financeiroAcordo(d: ErpState, id: string, acao: AcaoFinanceiroAcordo, x: { valor?: number; forma?: string; data?: string; motivo?: string }, ctx: Contexto): string | null {
  const a = col(d, 'cobranca_acordos').find((y) => y.id === id)
  if (!a) return 'Acordo não encontrado.'
  const motivo = (x.motivo ?? '').trim()
  if (['devolver', 'reverter', 'quebrar'].includes(acao) && motivo.length < 8) return 'Informe o motivo (pelo menos 8 letras).'
  const cob = col(d, 'cobrancas').find((y) => y.id === a.cobrancaId)!
  if (acao === 'confirmar') {
    if (a.situacao !== 'Aguardando entrada') return `Este acordo está "${a.situacao}": não confirma entrada.`
    if (!(Number(a.entrada) > 0)) return 'Este acordo não tem entrada.'
    if (centavos(Number(x.valor) || 0) !== Number(a.entrada)) return `O valor recebido tem que ser exatamente ${brl(Number(a.entrada))} (o combinado). Diferente disso: devolva ao cobrador.`
    if (x.forma !== a.entradaForma) return `A forma tem que ser ${a.entradaForma} (a combinada). Diferente disso: devolva ao cobrador.`
    if (!x.data || x.data > hoje()) return 'Informe a data real do recebimento (não pode ser no futuro).'
    Object.assign(a, {
      situacao: 'Entrada confirmada', entradaConfirmadaValor: Number(a.entrada), entradaConfirmadaForma: x.forma, entradaRecebidaEm: x.data, confirmadoEm: agora(), confirmadoPorNome: ctx.autorNome,
      historico: eventoAcordo(a, ctx, 'Entrada confirmada pelo Financeiro', { valor: x.valor, forma: x.forma, data: x.data }),
    })
    cob.situacao = 'Entrada confirmada'
    if (a.estavaSpc && a.cobradorId) {
      const nomeCli = String(col(d, 'clientes').find((y) => y.id === a.clienteId)?.nome ?? '')
      a.metaLancamentoId = lancar(d, ctx, { setor: 'cobranca', indicador: 'valor_recebido', colaboradorId: String(a.cobradorId), quantidade: Number(a.entrada), descricao: `Entrada do acordo v${a.versao} — ${nomeCli}`, data: String(x.data) })
    }
    if (a.quitacaoAVista) efetivarAcordoDemo(d, a, ctx)
  } else if (acao === 'devolver') {
    if (a.situacao !== 'Aguardando entrada') return 'Só devolve acordo aguardando a entrada.'
    Object.assign(a, { situacao: 'Simulada', motivo, devolvidoEm: agora(), retornoEm: hoje(), fechadoEm: '', historico: eventoAcordo(a, ctx, 'Devolvido ao cobrador pelo Financeiro', { motivo }) })
    Object.assign(cob, { situacao: 'Renegociação simulada', retornoEm: hoje() })
  } else if (acao === 'reverter') {
    if (a.situacao !== 'Entrada confirmada') return 'Só reverte entrada confirmada e ainda não efetivada.'
    Object.assign(a, { situacao: 'Aguardando entrada', entradaConfirmadaValor: 0, entradaConfirmadaForma: '', entradaRecebidaEm: '', confirmadoEm: '', confirmadoPorNome: '', motivo, historico: eventoAcordo(a, ctx, 'Confirmação revertida', { motivo }) })
    cob.situacao = 'Renegociação feita (aguardando entrada)'
    if (a.metaLancamentoId) {
      d.lancamentos = d.lancamentos.filter((l) => l.id !== a.metaLancamentoId)
      a.metaLancamentoId = ''
    }
  } else if (acao === 'efetivar') {
    if (a.situacao !== 'Entrada confirmada') return 'Só efetiva acordo com a entrada confirmada.'
    efetivarAcordoDemo(d, a, ctx)
  } else if (acao === 'quebrar') {
    if (a.situacao !== 'Aguardando entrada') return 'Só marca como quebrado acordo aguardando a entrada.'
    Object.assign(a, { situacao: 'Quebrada', motivo, historico: eventoAcordo(a, ctx, 'Acordo quebrado (entrada não paga)', { motivo }) })
    Object.assign(cob, { situacao: 'Acordo quebrado', retornoEm: '' })
  } else if (acao === 'boletos_enviados') {
    if (a.situacao !== 'Efetivada') return 'Só marca boletos enviados de acordo efetivado.'
    Object.assign(a, { boletosEnviadosEm: a.boletosEnviadosEm ? '' : x.data || hoje(), historico: eventoAcordo(a, ctx, a.boletosEnviadosEm ? 'Envio de boletos desmarcado' : 'Boletos enviados ao cliente') })
  } else return 'Ação inválida.'
  auditar(d, ctx, 'EDITAR', `Acordo da cobrança: ${acao}`, ctx.autorSetor)
  return null
}

// ---------------- SPC (SQL 050 — mesmas regras do banco) ----------------
export type AcaoCobrancaSpc = 'incluir' | 'ficha_localizada' | 'desmarcar'
export type AcaoFinanceiroSpc = 'enviar' | 'confirmar' | 'divergencia' | 'solicitar_retirada' | 'confirmar_retirada'

function eventoSpc(x: Registro, ctx: Contexto, acao: string, obs: string) {
  return [...((x.spcHistorico as unknown as unknown[]) ?? []), { em: agora(), por: ctx.autorNome, acao, obs }] as never
}

export function cobrancaSpc(d: ErpState, id: string, acao: AcaoCobrancaSpc, observacao: string, ctx: Contexto): string | null {
  const c = calcularCarteira(d).cobrancas.find((y) => y.id === id)
  const x = col(d, 'cobrancas').find((y) => y.id === id)
  if (!c || !x) return 'Cobrança não encontrada.'
  const obs = observacao.trim()
  const contato = (texto: string) =>
    inserir(d, 'cobranca_contatos', {
      cobrancaId: id, clienteId: c.clienteId, tipo: 'Outro', data: hoje(), situacao: 'Contato realizado sem acordo', situacaoAntes: String(x.situacao ?? ''),
      observacao: obs || texto, retornoEm: '', promessaEm: '', promessaValor: 0, registradoPor: ctx.autorId, registradoPorNome: ctx.autorNome,
    })
  if (acao === 'incluir') {
    if (x.spcEstado && x.spcEstado !== 'Removido') return `Esta cobrança já está no fluxo do SPC (${x.spcEstado}).`
    if (!c.podeIrSpc) return 'Inclusão no SPC bloqueada: esta cobrança não está elegível (carteira DLG, 2 boletos vencidos, 61 dias, CPF/CNPJ válido, fora do Registro SPC).'
    if (['Renegociação feita (aguardando entrada)', 'Entrada confirmada'].includes(String(x.situacao))) return 'Esta cobrança tem acordo em andamento.'
    contato('Cliente sem interesse - enviar ao SPC')
    Object.assign(x, { spcEstado: 'Inclusão marcada', spcMarcadoEm: hoje(), situacao: 'Contato realizado sem acordo', retornoEm: '', promessaEm: '', promessaValor: 0, ultimoContatoEm: hoje(), spcHistorico: eventoSpc(x, ctx, 'Marcado para inclusão no SPC (cliente sem interesse)', obs) })
  } else if (acao === 'ficha_localizada') {
    if (x.situacao !== 'Ficha não encontrada SPC') return 'Só libera cobrança que está como "Ficha não encontrada".'
    contato('Ficha localizada — liberar para SPC')
    Object.assign(x, { situacao: 'Contato realizado sem acordo', spcHistorico: eventoSpc(x, ctx, 'Ficha localizada — liberar para SPC', obs) })
  } else if (acao === 'desmarcar') {
    if (x.spcEstado !== 'Inclusão marcada') return 'Só desmarca antes de o Financeiro enviar.'
    Object.assign(x, { spcEstado: '', spcMarcadoEm: '', spcHistorico: eventoSpc(x, ctx, 'Inclusão no SPC desmarcada', obs) })
  } else return 'Ação inválida.'
  auditar(d, ctx, 'EDITAR', `SPC (Cobrança): ${acao}`, ctx.autorSetor)
  return null
}

export function financeiroSpc(d: ErpState, id: string, acao: AcaoFinanceiroSpc, observacao: string, ctx: Contexto): string | null {
  const x = col(d, 'cobrancas').find((y) => y.id === id)
  if (!x) return 'Cobrança não encontrada.'
  const obs = observacao.trim()
  const est = String(x.spcEstado ?? '')
  if (acao === 'enviar') {
    if (est !== 'Inclusão marcada') return 'Só envia cobrança marcada pela Cobrança.'
    Object.assign(x, { spcEstado: 'Enviado', spcEnviadoEm: hoje(), spcHistorico: eventoSpc(x, ctx, 'Enviado ao SPC pelo Financeiro', obs) })
  } else if (acao === 'confirmar') {
    if (est !== 'Enviado' && est !== 'Divergência') return 'Só confirma registro de cobrança enviada (ou em divergência).'
    const cat = col(d, 'cobranca_categorias').filter((y) => y.grupo === 'Registro SPC' && y.ativa !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome)))[0]
    if (!cat) return 'Cadastre uma categoria do grupo Registro SPC em Configurações.'
    if (x.categoriaId !== cat.id) registrarHistoricoCategoria(d, id, String(x.categoriaId), String(cat.id), ctx)
    Object.assign(x, { spcEstado: 'Registrado', spcRegistradoEm: hoje(), categoriaId: cat.id, spcHistorico: eventoSpc(x, ctx, 'Registro no SPC confirmado', obs) })
  } else if (acao === 'divergencia') {
    if (!obs) return 'Informe o que não bateu.'
    Object.assign(x, { spcEstado: 'Divergência', spcHistorico: eventoSpc(x, ctx, 'Divergência na conferência do SPC', obs) })
  } else if (acao === 'solicitar_retirada') {
    if (est !== 'Registrado' && est !== 'Divergência') return 'Só pede retirada de quem está registrado no SPC.'
    Object.assign(x, { spcEstado: 'Retirada solicitada', spcHistorico: eventoSpc(x, ctx, 'Solicitação de retirada do SPC', obs) })
  } else if (acao === 'confirmar_retirada') {
    if (est !== 'Retirada solicitada') return 'Só confirma retirada já solicitada.'
    Object.assign(x, { spcEstado: 'Removido', spcHistorico: eventoSpc(x, ctx, 'Retirada do SPC confirmada', obs) })
  } else return 'Ação inválida.'
  auditar(d, ctx, 'EDITAR', `SPC (Financeiro): ${acao}`, ctx.autorSetor)
  return null
}
