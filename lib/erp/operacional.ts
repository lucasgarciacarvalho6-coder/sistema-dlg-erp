// Regras do processo OPERACIONAL (cálculos puros, usados pelas telas e pelos fluxos).
//
// Processo: vendedor PJ fecha o contrato → Operações importa e confere (Contratos de Escola)
// → diretora confirma → vai para a Agenda Fotográfica → fichas autorizadas são atualizadas
// no histórico → visita é fotografada → Fechamento (escola diário, vendedor semanal,
// freelancers semanal) → enviado ao Financeiro, que paga.

import type { ErpState, Registro } from './types'
import { ALIMENTACAO_DIARIA } from './config'
import { addDias, dataBR, hoje, inicioSemana } from './format'
import { colecao } from './metrics'

export interface Beneficiario {
  categoria: 'Bonificação escola' | 'Ajudante' | 'Vendedor PJ' | 'Freelancer'
  nome: string
  valor: number
  pixChave: string
  pixBanco: string
  descricao: string
}

export interface Ajudante {
  nome: string
  valor: number
  pixChave: string
  pixBanco: string
}

const n = (v: unknown) => Number(v) || 0
const t = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export function lerJSON<T>(valor: unknown, padrao: T): T {
  if (!valor) return padrao
  if (typeof valor !== 'string') return valor as T
  try {
    return JSON.parse(valor) as T
  } catch {
    return padrao
  }
}

// ---------------- Contratos de escola ----------------

// Campos operacionais obrigatórios para enviar à agenda (PIX pode ser completado depois)
export const CAMPOS_OBRIGATORIOS_CONTRATO: { chave: string; label: string; numero?: boolean }[] = [
  { chave: 'escola', label: 'Nome da escola' },
  { chave: 'cidade', label: 'Cidade' },
  { chave: 'endereco', label: 'Endereço' },
  { chave: 'telefone', label: 'Telefone' },
  { chave: 'responsavel', label: 'Responsável (diretora)' },
  { chave: 'vendedorId', label: 'Vendedor de contrato' },
  { chave: 'fichasPrevistas', label: 'Fichas previstas', numero: true },
  { chave: 'dataPrevista', label: 'Data agendada' },
  { chave: 'bonificacaoPorFicha', label: 'Bonificação por ficha', numero: true },
]

export function camposFaltando(c: Registro) {
  return CAMPOS_OBRIGATORIOS_CONTRATO.filter((f) => (f.numero ? n(c[f.chave]) <= 0 : !t(c[f.chave]).trim())).map((f) => f.label)
}

export const pixCompleto = (r: Registro) => !!t(r.pixChave).trim() && !!t(r.pixNome).trim()

export function contratoDaVisita(s: ErpState, visita: Registro) {
  return colecao(s, 'contratos_escola').find((c) => c.id === visita.contratoId)
}

export const fotografosDa = (visita: Registro) => t(visita.fotografoIds).split(',').filter(Boolean)

export const nomePJ = (s: ErpState, id: unknown) =>
  [...colecao(s, 'pj_vendedores'), ...colecao(s, 'freelancers')].find((p) => p.id === id)?.nome ?? '—'

// ---------------- Fechamento diário da escola ----------------

export function calcularFechamentoEscola(p: {
  escola: string
  data: string
  fichasBonificadas: number
  valorUnitario: number
  pixNome: string
  pixChave: string
  pixBanco: string
  ajudantes: Ajudante[]
}) {
  const totalEscola = Math.round(p.fichasBonificadas * p.valorUnitario * 100) / 100
  const ajudantesValidos = p.ajudantes.filter((a) => a.nome.trim() && a.valor > 0)
  const totalAjudantes = ajudantesValidos.reduce((acc, a) => acc + a.valor, 0)
  const beneficiarios: Beneficiario[] = [
    ...(totalEscola > 0
      ? [
          {
            categoria: 'Bonificação escola' as const,
            nome: p.pixNome || p.escola,
            valor: totalEscola,
            pixChave: p.pixChave,
            pixBanco: p.pixBanco,
            descricao: `Bonificação ${p.escola} — ${p.fichasBonificadas} fichas × ${p.valorUnitario.toFixed(2).replace('.', ',')} (${dataBR(p.data)})`,
          },
        ]
      : []),
    ...ajudantesValidos.map((a) => ({
      categoria: 'Ajudante' as const,
      nome: a.nome,
      valor: a.valor,
      pixChave: a.pixChave,
      pixBanco: a.pixBanco,
      descricao: `Ajudante na visita ${p.escola} (${dataBR(p.data)})`,
    })),
  ]
  return { totalEscola, totalAjudantes, total: totalEscola + totalAjudantes, beneficiarios }
}

// ---------------- Fechamento semanal do vendedor PJ ----------------

// Alunos fotografados nas escolas do vendedor, na semana (segunda a domingo)
export function fichasVendedorSemana(s: ErpState, vendedorId: string, semanaInicio: string) {
  const fim = addDias(semanaInicio, 6)
  const visitas = colecao(s, 'agenda_visitas').filter(
    (v) => v.vendedorId === vendedorId && ['Fotografada', 'Fechamento enviado'].includes(t(v.status)) && t(v.data) >= semanaInicio && t(v.data) <= fim,
  )
  return { visitas, fichas: visitas.reduce((a, v) => a + n(v.fichasFotografadas), 0) }
}

// ---------------- Adiantamento semanal do freelancer ----------------

// Dias trabalhados = datas distintas de visitas em que o freelancer estava na equipe
export function diasFreelancerSemana(s: ErpState, freelancerId: string, semanaInicio: string) {
  const fim = addDias(semanaInicio, 6)
  const datas = new Set<string>()
  for (const v of colecao(s, 'agenda_visitas')) {
    if (t(v.status) === 'Cancelada' || t(v.data) < semanaInicio || t(v.data) > fim) continue
    if (v.motoristaId === freelancerId || fotografosDa(v).includes(freelancerId)) datas.add(t(v.data))
  }
  return [...datas].sort()
}

export const valorDiaFreelancer = (diaria: number) => diaria + ALIMENTACAO_DIARIA

// Semanas (segunda-feira) que tiveram visitas fotografadas — base para os fechamentos semanais
export function semanasComVisitas(s: ErpState) {
  const semanas = new Set<string>([inicioSemana(hoje())])
  for (const v of colecao(s, 'agenda_visitas')) if (t(v.status) !== 'Cancelada' && v.data) semanas.add(inicioSemana(t(v.data)))
  return [...semanas].sort().reverse()
}

export function fechamentoExistente(s: ErpState, tipo: string, refId: string, periodo: string) {
  return colecao(s, 'fechamentos').find((f) => f.tipo === tipo && f.refId === refId && f.periodo === periodo)
}

// ---------------- Gestão diária: somente pendências acionáveis ----------------

export interface Pendencia {
  id: string
  prioridade: 'alta' | 'media'
  area: 'Contratos' | 'Agenda' | 'Fechamento' | 'Vendedores' | 'Tarefas'
  titulo: string
  detalhe: string
  link: string
}

// Calculada a partir dos dados: quando a pendência é resolvida na origem, ela some sozinha.
export function pendenciasDoDia(s: ErpState): Pendencia[] {
  const hj = hoje()
  const lista: Pendencia[] = []

  for (const c of colecao(s, 'contratos_escola')) {
    if (c.status !== 'Em conferência') continue
    const faltam = camposFaltando(c)
    lista.push({
      id: `contrato-${c.id}`,
      prioridade: t(c.dataPrevista) && t(c.dataPrevista) <= addDias(hj, 7) ? 'alta' : 'media',
      area: 'Contratos',
      titulo: faltam.length ? `Completar contrato: ${c.escola}` : `Confirmar com a diretora: ${c.escola}`,
      detalhe: faltam.length ? `Faltam: ${faltam.join(', ')}` : `Ligar para ${c.responsavel || 'a diretora'} (${c.telefone}) e enviar para a agenda.`,
      link: '/operacional/contratos',
    })
  }
  for (const c of colecao(s, 'contratos_escola')) {
    if (c.status === 'Na agenda' && !pixCompleto(c)) {
      lista.push({
        id: `pix-${c.id}`,
        prioridade: 'media',
        area: 'Contratos',
        titulo: `Completar PIX da escola: ${c.escola}`,
        detalhe: 'Necessário para o fechamento (pagamento da bonificação).',
        link: '/operacional/contratos',
      })
    }
  }

  for (const v of colecao(s, 'agenda_visitas')) {
    const data = t(v.data)
    if (v.status === 'Agendada') {
      if (data < hj) {
        lista.push({ id: `encerrar-${v.id}`, prioridade: 'alta', area: 'Agenda', titulo: `Encerrar visita: ${v.escola}`, detalhe: `Visita de ${dataBR(data)} — informar as fichas fotografadas.`, link: `/operacional/agenda?visita=${v.id}` })
      } else if (data <= addDias(hj, 3) && n(v.fichasConfirmadas) <= 0) {
        lista.push({ id: `fichas-${v.id}`, prioridade: 'alta', area: 'Agenda', titulo: `Confirmar fichas autorizadas: ${v.escola}`, detalhe: `Visita em ${dataBR(data)} — falar com ${v.responsavel || 'a diretora'} (${v.telefone}).`, link: `/operacional/agenda?visita=${v.id}` })
      }
      if (data <= addDias(hj, 3) && (!t(v.motoristaId) || !fotografosDa(v).length)) {
        lista.push({ id: `equipe-${v.id}`, prioridade: data <= addDias(hj, 1) ? 'alta' : 'media', area: 'Agenda', titulo: `Definir equipe: ${v.escola}`, detalhe: `Visita em ${dataBR(data)} sem ${!fotografosDa(v).length ? 'fotógrafo' : 'motorista'} definido.`, link: `/operacional/agenda?visita=${v.id}` })
      }
    }
    if (v.status === 'Fotografada' && !fechamentoExistente(s, 'escola', v.id, data)) {
      lista.push({ id: `fech-${v.id}`, prioridade: 'media', area: 'Fechamento', titulo: `Preparar fechamento: ${v.escola}`, detalhe: `${n(v.fichasFotografadas)} fichas fotografadas em ${dataBR(data)}.`, link: `/operacional/fechamento?visita=${v.id}` })
    }
  }

  for (const f of colecao(s, 'fechamentos')) {
    if (f.status === 'Rascunho') {
      lista.push({ id: `rasc-${f.id}`, prioridade: 'media', area: 'Fechamento', titulo: `Enviar ao financeiro: ${f.referencia}`, detalhe: `Fechamento em rascunho (${f.tipo === 'escola' ? 'escola' : f.tipo === 'vendedor' ? 'vendedor' : 'freelancer'}).`, link: '/operacional/fechamento' })
    }
  }

  for (const vd of colecao(s, 'pj_vendedores')) {
    if (vd.status === 'Ativo' && (!t(vd.ultimoContato) || t(vd.ultimoContato) < addDias(hj, -7))) {
      lista.push({ id: `vend-${vd.id}`, prioridade: 'media', area: 'Vendedores', titulo: `Falar com o vendedor: ${vd.nome}`, detalhe: vd.ultimoContato ? `Último contato em ${dataBR(t(vd.ultimoContato))}.` : 'Nenhum contato registrado.', link: '/operacional/controle?aba=vendedores' })
    }
  }

  for (const tf of colecao(s, 'tarefas_operacionais')) {
    if (tf.status !== 'Concluída' && t(tf.prazo) && t(tf.prazo) <= hj) {
      lista.push({ id: `tarefa-${tf.id}`, prioridade: t(tf.prazo) < hj ? 'alta' : 'media', area: 'Tarefas', titulo: t(tf.titulo), detalhe: `${tf.escola ? `${tf.escola} • ` : ''}prazo ${dataBR(t(tf.prazo))}`, link: '/operacional/tarefas' })
    }
  }

  return lista.sort((a, b) => (a.prioridade === b.prioridade ? 0 : a.prioridade === 'alta' ? -1 : 1))
}
