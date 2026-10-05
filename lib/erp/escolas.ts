// ESCOLAS das Operações: o cadastro (tabela "escolas", o mesmo dos Cadastros Centrais) junto com o histórico
// de contratos e visitas de cada escola — quase todo ano a empresa volta na mesma escola.
// A escola é reconhecida pelo INEP ou por nome + cidade + UF (sem acento e sem diferença de maiúsculas),
// a mesma chave do SQL 027 (public.chave_escola). Escola que só aparece nos contratos/agenda também entra na lista.

import type { ErpState, Registro } from './types'
import { colecao } from './metrics'

const semAcento = (t: unknown) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
export const chaveEscola = (nome: unknown, cidade: unknown, uf: unknown) => `${semAcento(nome)}|${semAcento(cidade)}|${String(uf ?? '').trim().toUpperCase()}`
const inepDe = (r: Registro) => String(r.inep ?? '').replace(/\D/g, '')

export type SituacaoAno = 'Fotografada' | 'Agendada' | 'Contrato em conferência' | 'Sem contrato'

export interface EscolaComHistorico {
  id: string // id do cadastro, ou "h:<chave>" quando a escola só existe nos contratos/agenda
  registro?: Registro // cadastro da escola (quando existe)
  nome: string
  cidade: string
  uf: string
  inep: string
  endereco: string
  telefone: string
  responsavel: string
  status: string // Ativa / Inativa
  contratos: Registro[] // do mais novo para o mais antigo
  visitas: Registro[] // do mais novo para o mais antigo
  anos: string[] // anos em que a escola foi fotografada
  ultimaVisita?: Registro // última visita fotografada
  esteAno: SituacaoAno
}

const fotografada = (v: Registro) => v.status === 'Fotografada' || v.status === 'Fechamento enviado'

export function escolasComHistorico(s: ErpState, ano: string): EscolaComHistorico[] {
  const lista: EscolaComHistorico[] = []
  const porChave = new Map<string, EscolaComHistorico>()
  const porInep = new Map<string, EscolaComHistorico>()
  const guardar = (e: EscolaComHistorico) => {
    lista.push(e)
    porChave.set(chaveEscola(e.nome, e.cidade, e.uf), e)
    if (e.inep) porInep.set(e.inep, e)
    return e
  }
  // 1) o cadastro
  for (const r of colecao(s, 'escolas'))
    guardar({
      id: r.id,
      registro: r,
      nome: String(r.nome ?? ''),
      cidade: String(r.cidade ?? ''),
      uf: String(r.uf ?? ''),
      inep: inepDe(r),
      endereco: String(r.endereco ?? ''),
      telefone: String(r.telefone ?? ''),
      responsavel: String(r.responsavel ?? ''),
      status: String(r.status || 'Ativa'),
      contratos: [],
      visitas: [],
      anos: [],
      esteAno: 'Sem contrato',
    })
  // 2) os contratos (escola que ainda não está no cadastro entra com os dados do contrato)
  const contratos = [...colecao(s, 'contratos_escola')].sort((a, b) => String(b.criadoEm ?? '').localeCompare(String(a.criadoEm ?? '')))
  const daEscola = new Map<string, EscolaComHistorico>() // contrato → escola
  for (const c of contratos) {
    const chave = chaveEscola(c.escola, c.cidade, c.uf)
    let e = (inepDe(c) && porInep.get(inepDe(c))) || porChave.get(chave)
    if (!e)
      e = guardar({
        id: `h:${chave}`,
        nome: String(c.escola ?? ''),
        cidade: String(c.cidade ?? ''),
        uf: String(c.uf ?? ''),
        inep: inepDe(c),
        endereco: String(c.endereco ?? ''),
        telefone: String(c.telefone ?? ''),
        responsavel: String(c.responsavel ?? ''),
        status: 'Ativa',
        contratos: [],
        visitas: [],
        anos: [],
        esteAno: 'Sem contrato',
      })
    e.contratos.push(c)
    daEscola.set(c.id, e)
    // cadastro sem algum dado: completa com o contrato mais novo (só para mostrar)
    if (!e.endereco && c.endereco) e.endereco = String(c.endereco)
    if (!e.telefone && c.telefone) e.telefone = String(c.telefone)
    if (!e.responsavel && c.responsavel) e.responsavel = String(c.responsavel)
    if (!e.inep && inepDe(c)) e.inep = inepDe(c)
  }
  // 3) as visitas (pelo contrato; sem contrato, pelo nome da escola)
  for (const v of colecao(s, 'agenda_visitas')) {
    let e = v.contratoId ? daEscola.get(String(v.contratoId)) : undefined
    if (!e) e = porChave.get(chaveEscola(v.escola, v.cidade, v.uf))
    if (!e && v.status === 'Cancelada') continue // visita cancelada de escola que não está em lugar nenhum: não vira escola
    if (!e)
      e = guardar({
        id: `h:${chaveEscola(v.escola, v.cidade, v.uf)}`,
        nome: String(v.escola ?? ''),
        cidade: String(v.cidade ?? ''),
        uf: String(v.uf ?? ''),
        inep: '',
        endereco: String(v.endereco ?? ''),
        telefone: String(v.telefone ?? ''),
        responsavel: String(v.responsavel ?? ''),
        status: 'Ativa',
        contratos: [],
        visitas: [],
        anos: [],
        esteAno: 'Sem contrato',
      })
    e.visitas.push(v)
  }
  // 4) anos, última visita e a situação deste ano
  for (const e of lista) {
    e.visitas.sort((a, b) => String(b.data).localeCompare(String(a.data)))
    const feitas = e.visitas.filter(fotografada)
    e.anos = [...new Set(feitas.map((v) => String(v.data).slice(0, 4)))].sort()
    e.ultimaVisita = feitas[0]
    const doAno = e.visitas.filter((v) => String(v.data).startsWith(ano) && v.status !== 'Cancelada')
    if (doAno.some(fotografada)) e.esteAno = 'Fotografada'
    else if (doAno.some((v) => v.status === 'Agendada')) e.esteAno = 'Agendada'
    else if (e.contratos.some((c) => c.status === 'Em conferência' && String(c.criadoEm ?? '').startsWith(ano))) e.esteAno = 'Contrato em conferência'
    else e.esteAno = 'Sem contrato'
  }
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

// Novo contrato de uma escola que volta: os dados da escola + do último contrato (PIX, bonificação e vendedor)
export function dadosNovoContrato(e: EscolaComHistorico): Record<string, string> {
  const ultimo = e.contratos.find((c) => c.status !== 'Cancelado') ?? e.contratos[0]
  const de = (k: string) => (ultimo && ultimo[k] !== null && ultimo[k] !== undefined ? String(ultimo[k]) : '')
  return {
    escola: e.nome,
    inep: e.inep,
    cidade: e.cidade,
    uf: e.uf || 'PR',
    endereco: e.endereco,
    telefone: e.telefone,
    responsavel: e.responsavel,
    vendedorId: de('vendedorId'),
    bonificacaoPorFicha: de('bonificacaoPorFicha'),
    pixNome: de('pixNome'),
    pixChave: de('pixChave'),
    pixBanco: de('pixBanco'),
  }
}
