// GERENTE VIRTUAL: o que está ATRASADO ou PARADO, para o ADM ver na Visão TV sem precisar perguntar.
// Regras aprovadas pelo ADM (02/10/2026):
//  🔴 setor parado: ninguém do setor registrou nada no último dia útil nem hoje
//  🔴/🟡 pessoa com meta sem registrar: 3 ou mais dias úteis = vermelho • 2 = amarelo
//  🔴 visita de dia anterior sem encerrar • 🔴 entrega do editor atrasada • 🔴 pessoas abaixo do piso
//  🟡 escola parada na Produção além do prazo (2, 3 ou 5 dias úteis) • 🟡 caixa esperando conferência há mais de 1 dia útil
// "Registrar" = criar, editar ou excluir qualquer coisa no sistema (entrar no sistema não conta).
// A última atividade de cada pessoa vem do banco (SQL 026); sem ela, da auditoria carregada na tela.

import type { ErpState, Setor } from './types'
import { SETORES, SETORES_PRODUTIVOS } from './config'
import { colecao, equipe, equipeComMeta, resumo, situacaoResumo } from './metrics'
import { addDias, dataBR, diaLocal, num } from './format'
import { diasUteisDepois, ehDiaUtil, ultimoDiaUtilAntes } from './calendario'
import { diasAtraso, escolasParadas, lotesProducao } from './producao'

export type NivelAlerta = 'critico' | 'atencao'
export interface AlertaGerente {
  id: string
  nivel: NivelAlerta
  area: string // setor ou assunto
  titulo: string
  itens: string[] // detalhes: pessoas, escolas, datas
  link: string
}

// Última atividade (dia e hora) de cada pessoa + desde quando a informação cobre (antes disso não dá para afirmar nada)
export interface AtividadeEquipe {
  ultima: Map<string, string> // colaboradorId → data/hora ISO
  cobertura: string // dia mais antigo coberto ('YYYY-MM-DD')
}

const TIPOS_REGISTRO = new Set(['CRIAR', 'EDITAR', 'EXCLUIR'])

// a partir da auditoria carregada na tela (demo, ou enquanto a função do banco não responde)
export function atividadeDaAuditoria(s: ErpState): AtividadeEquipe {
  const ultima = new Map<string, string>()
  let cobertura = ''
  for (const a of s.auditoria) {
    if (!cobertura || a.data < cobertura) cobertura = a.data
    if (!a.usuarioId || !TIPOS_REGISTRO.has(a.tipo)) continue
    const atual = ultima.get(a.usuarioId)
    if (!atual || a.data > atual) ultima.set(a.usuarioId, a.data)
  }
  return { ultima, cobertura: cobertura ? diaLocal(cobertura) : '' }
}

// junta a do banco (60 dias) com a da tela (mais nova): vale a mais recente de cada pessoa
export function juntarAtividade(banco: AtividadeEquipe | null, tela: AtividadeEquipe): AtividadeEquipe {
  if (!banco) return tela
  const ultima = new Map(banco.ultima)
  for (const [id, data] of tela.ultima) if (!ultima.get(id) || data > ultima.get(id)!) ultima.set(id, data)
  const coberturas = [banco.cobertura, tela.cobertura].filter(Boolean).sort()
  return { ultima, cobertura: coberturas[0] ?? '' }
}

// dias úteis que a pessoa ficou sem registrar, sem contar hoje (registrou na segunda → na quinta são 2: terça e quarta)
const diasSemRegistro = (dia: string, hojeISO: string) => Math.max(0, diasUteisDepois(dia, hojeISO) - (ehDiaUtil(hojeISO) ? 1 : 0))

const lista = (itens: string[], max = 6) => (itens.length > max ? [...itens.slice(0, max), `e mais ${num(itens.length - max)}`] : itens)

export function alertasGerente(s: ErpState, atividade: AtividadeEquipe | null, hojeISO: string): AlertaGerente[] {
  const mes = hojeISO.slice(0, 7)
  const criticos: AlertaGerente[] = []
  const atencao: AlertaGerente[] = []
  const nomeSetor = (setor: Setor) => SETORES[setor].nome

  // 1) setores parados e pessoas sem registrar (só quando dá para saber: a informação cobre o período)
  const parados = new Set<Setor>()
  if (atividade) {
    const ultimoUtil = ultimoDiaUtilAntes(hojeISO)
    const cobre = (dia: string) => !!atividade.cobertura && atividade.cobertura <= dia
    const diaDe = (id: string) => {
      const u = atividade.ultima.get(id)
      return u ? diaLocal(u) : ''
    }
    // setores que produzem todo dia (têm alguém com meta); vale o registro de qualquer pessoa ativa do setor
    for (const setor of SETORES_PRODUTIVOS) {
      if (!equipeComMeta(s, setor, mes).length) continue
      const dias = equipe(s, setor)
        .map((c) => diaDe(c.id))
        .filter(Boolean)
        .sort()
      const ultimo = dias.at(-1) ?? ''
      if (ultimo ? ultimo < ultimoUtil : cobre(ultimoUtil)) {
        parados.add(setor)
        criticos.push({
          id: `parado-${setor}`,
          nivel: 'critico',
          area: nomeSetor(setor),
          titulo: `Setor ${nomeSetor(setor)} parado: ninguém registrou nada no último dia útil (${dataBR(ultimoUtil)}) nem hoje`,
          itens: [ultimo ? `último registro do setor em ${dataBR(ultimo)}` : 'nenhum registro do setor nos últimos dias'],
          link: '/adm/auditoria',
        })
      }
    }
    // pessoas com meta sem registrar (quem está num setor parado já aparece no aviso do setor)
    const vermelhas: string[] = []
    const amarelas: string[] = []
    for (const setor of SETORES_PRODUTIVOS) {
      if (parados.has(setor)) continue
      for (const c of equipeComMeta(s, setor, mes)) {
        const dia = diaDe(c.id)
        // nunca registrou: conta desde a admissão (ou desde onde a informação cobre)
        const base = dia || [c.dataAdmissao?.slice(0, 10), atividade.cobertura].filter(Boolean).sort().at(-1) || ''
        if (!base || (!dia && !cobre(addDias(hojeISO, -3)))) continue
        const sem = diasSemRegistro(base, hojeISO)
        const texto = `${c.nome} (${nomeSetor(setor)}) — ${dia ? `último registro em ${dataBR(dia)}` : 'sem registro'}`
        if (sem >= 3) vermelhas.push(texto)
        else if (sem >= 2) amarelas.push(texto)
      }
    }
    if (vermelhas.length)
      criticos.push({ id: 'pessoas-3d', nivel: 'critico', area: 'Equipe', titulo: `${num(vermelhas.length)} pessoa(s) há 3 ou mais dias úteis sem registrar nada`, itens: lista(vermelhas), link: '/adm/auditoria' })
    if (amarelas.length)
      atencao.push({ id: 'pessoas-2d', nivel: 'atencao', area: 'Equipe', titulo: `${num(amarelas.length)} pessoa(s) há 2 dias úteis sem registrar nada`, itens: lista(amarelas), link: '/adm/auditoria' })
  }

  // 2) visitas de dias anteriores que não foram encerradas
  const visitas = colecao(s, 'agenda_visitas')
    .filter((v) => v.status === 'Agendada' && String(v.data) < hojeISO)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))
  if (visitas.length)
    criticos.push({
      id: 'visitas-abertas',
      nivel: 'critico',
      area: nomeSetor('operacional'),
      titulo: `${num(visitas.length)} visita(s) de dias anteriores sem encerrar`,
      itens: lista(visitas.map((v) => `${String(v.escola)} (${dataBR(String(v.data))})`)),
      link: '/operacional/agenda',
    })

  // 3) entregas do editor atrasadas
  const atrasadas = lotesProducao(s)
    .map((l) => ({ l, dias: diasAtraso(l, hojeISO) }))
    .filter((x) => x.dias > 0)
    .sort((a, b) => b.dias - a.dias)
  if (atrasadas.length)
    criticos.push({
      id: 'editor-atrasado',
      nivel: 'critico',
      area: nomeSetor('edicao'),
      titulo: `${num(atrasadas.length)} entrega(s) do editor atrasada(s)`,
      itens: lista(atrasadas.map((x) => `${String(x.l.escola)} — ${num(x.dias)} dia(s)`)),
      link: '/edicao',
    })

  // 4) pessoas abaixo do piso (mesma régua dos cards)
  const abaixo = SETORES_PRODUTIVOS.flatMap((setor) =>
    equipeComMeta(s, setor, mes)
      .filter((c) => situacaoResumo(resumo(s, setor, SETORES[setor].indicadores[0].id, mes, c.id), mes) === 'critico')
      .map((c) => `${c.nome} (${nomeSetor(setor)})`),
  )
  if (abaixo.length) criticos.push({ id: 'abaixo-piso', nivel: 'critico', area: 'Metas', titulo: `${num(abaixo.length)} pessoa(s) abaixo do piso`, itens: lista(abaixo), link: '/adm' })

  // 5) escolas paradas na Produção além do prazo
  const paradas = escolasParadas(s, hojeISO)
  if (paradas.length)
    atencao.push({
      id: 'producao-parada',
      nivel: 'atencao',
      area: nomeSetor('edicao'),
      titulo: `${num(paradas.length)} escola(s) parada(s) na Produção além do prazo`,
      itens: lista(paradas.map((x) => `${String(x.lote.escola)} — ${x.etapa} há ${num(x.dias)} dias úteis`)),
      link: '/edicao',
    })

  // 6) caixas da Revelação esperando a conferência há mais de 1 dia útil
  const caixas = colecao(s, 'producao_caixas').filter((c) => c.status === 'Aguardando conferência' && diasUteisDepois(String(c.data).slice(0, 10), hojeISO) > 1)
  if (caixas.length) {
    const escolas = new Map(lotesProducao(s).map((l) => [l.id, String(l.escola)]))
    atencao.push({
      id: 'caixas-conferir',
      nivel: 'atencao',
      area: 'Estoque',
      titulo: `${num(caixas.length)} caixa(s) esperando conferência há mais de 1 dia útil`,
      itens: lista(caixas.map((c) => `${escolas.get(String(c.loteId)) ?? 'Escola'} — caixa ${String(c.numero)} (${dataBR(String(c.data).slice(0, 10))})`)),
      link: '/edicao/estoque',
    })
  }

  return [...criticos, ...atencao]
}
