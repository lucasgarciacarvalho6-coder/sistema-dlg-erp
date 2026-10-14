// Leitura do núcleo no Supabase → ErpState (o mesmo formato que as telas já usam).
// O RLS do banco decide o que cada usuário recebe: um colaborador de Vendas,
// por exemplo, recebe listas vazias das tabelas de Cobrança.

import { sb } from '@/lib/supabase/client'
import type { ErpState, Registro } from './types'
import {
  TABELAS_COLECAO,
  auditoriaDoBanco,
  colaboradorDoBanco,
  lancamentoDoBanco,
  matrizDoBanco,
  notificacaoDoBanco,
  registroDoBanco,
} from './adaptador'
import { estadoVazio, VERSAO_DADOS } from './seed'
import { isoData } from './format'

type Linha = Record<string, unknown>
const PASSO = 1000 // limite padrão de linhas por requisição do Supabase

interface Opcoes {
  ordem?: string
  asc?: boolean
  desde?: [coluna: string, valor: string]
  limite?: number
}

async function todas(tabela: string, o: Opcoes = {}): Promise<Linha[]> {
  const limite = o.limite ?? 100_000
  const saida: Linha[] = []
  for (let de = 0; de < limite; de += PASSO) {
    const base = sb().from(tabela).select('*')
    const filtrada = o.desde ? base.gte(o.desde[0], o.desde[1]) : base
    const ordenada = o.ordem ? filtrada.order(o.ordem, { ascending: o.asc ?? true }) : filtrada
    const { data, error } = await ordenada.range(de, Math.min(de + PASSO, limite) - 1)
    if (error) throw new Error(`${tabela}: ${traduzirErro(error)}`)
    saida.push(...((data ?? []) as Linha[]))
    if (!data || data.length < PASSO) break
  }
  return saida
}

// Não derruba o carregamento inteiro se uma tabela falhar (ex.: script ainda não aplicado)
async function segura(tabela: string, o: Opcoes, erros: string[]) {
  try {
    return await todas(tabela, o)
  } catch (e) {
    erros.push(e instanceof Error ? e.message : String(e))
    return []
  }
}

export function traduzirErro(e: { message: string; code?: string }) {
  if (e.code === '42501' || /row-level security|permission denied/i.test(e.message)) return 'Sem permissão para esta ação (bloqueado pelo servidor).'
  if (e.code === '23505') return 'Registro duplicado.'
  if (e.code === '23503') return 'Registro vinculado a outros dados — não pode ser removido.'
  if (e.code === 'PGRST202' || /Could not find the function/i.test(e.message)) return 'Função do banco não encontrada: rode o SQL mais recente de docs/supabase no SQL Editor.'
  if (e.code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(e.message)) return 'Tabela não encontrada — rode docs/supabase/schema.sql no SQL Editor.'
  return e.message
}

export async function carregarDoSupabase(usuarioId: string): Promise<{ estado: ErpState; empresaId: string | null; erros: string[] }> {
  const erros: string[] = []
  const agora = new Date()
  // Histórico dos últimos 3 meses (suficiente para metas e dashboards)
  const desde = isoData(new Date(agora.getFullYear(), agora.getMonth() - 3, 1))

  const colaboradores = await todas('colaboradores') // obrigatório
  // 14/10 (lentidão): a auditoria só vem para o ADM (era lida a cada recarga por todo mundo, 1,4 s cada vez)
  const ehAdm = colaboradores.some((c) => c.id === usuarioId && c.perfil === 'ADM')
  const [metas, permissoes, lancamentos, auditoria, notificacoes, leituras, empresas, ...colecoes] = await Promise.all([
    segura('metas', {}, erros),
    segura('permissoes', {}, erros),
    segura('lancamentos', { desde: ['data', desde], ordem: 'created_at' }, erros),
    ehAdm ? segura('auditoria', { ordem: 'data', asc: false, limite: 500 }, erros) : Promise.resolve([] as Linha[]),
    segura('notificacoes', { ordem: 'created_at', asc: false, limite: 200 }, erros),
    segura('notificacao_leituras', {}, erros),
    segura('empresas', { limite: 1 }, erros),
    ...TABELAS_COLECAO.map((t) => segura(t, { ordem: 'created_at', asc: false }, erros)),
  ])

  const colabs = colaboradores.map((c) => colaboradorDoBanco(c, metas))
  const nomeDe = (id: unknown) => colabs.find((c) => c.id === id)?.nome ?? ''
  const lidas = new Set(leituras.map((l) => String(l.notificacao_id)))

  const mapaColecoes: Record<string, Registro[]> = {}
  TABELAS_COLECAO.forEach((t, i) => {
    mapaColecoes[t] = colecoes[i].map((linha) => {
      const r = registroDoBanco(linha)
      if (t === 'aprovacoes') r.decididoPor = nomeDe(linha.decidido_por) // uuid → nome para exibição
      return r
    })
  })

  const base = estadoVazio()
  const emp = empresas[0]
  return {
    empresaId: emp ? String(emp.id) : null,
    erros,
    estado: {
      versao: VERSAO_DADOS,
      empresa: emp
        ? {
            nome: String(emp.nome ?? ''),
            cnpj: String(emp.cnpj ?? ''),
            email: String(emp.email ?? ''),
            telefone: String(emp.telefone ?? ''),
            cidade: String(emp.cidade ?? ''),
            uf: String(emp.uf ?? ''),
            parametros: emp.parametros && typeof emp.parametros === 'object' ? (emp.parametros as Record<string, number>) : {},
          }
        : base.empresa,
      colaboradores: colabs,
      lancamentos: lancamentos.map(lancamentoDoBanco),
      colecoes: mapaColecoes,
      permissoes: permissoes.length ? matrizDoBanco(permissoes) : base.permissoes,
      auditoria: auditoria.map(auditoriaDoBanco),
      notificacoes: notificacoes.map((n) => notificacaoDoBanco(n, lidas, usuarioId)),
    },
  }
}

// 14/10 (lentidão): quando o aviso em tempo real diz QUAL tabela mudou, recarrega só ela (não o sistema inteiro)
export const TABELAS_RECARGA_PARCIAL = new Set(TABELAS_COLECAO)
export async function carregarColecao(tabela: string, colaboradores: { id: string; nome: string }[]): Promise<Registro[]> {
  const linhas = await todas(tabela, { ordem: 'created_at', asc: false })
  return linhas.map((linha) => {
    const r = registroDoBanco(linha)
    if (tabela === 'aprovacoes') r.decididoPor = colaboradores.find((c) => c.id === linha.decidido_por)?.nome ?? ''
    return r
  })
}
