// Cadastro de clientes (Cobrança + Financeiro) — SQL 036.
// A tela NÃO baixa a tabela inteira: busca 50 por vez no servidor, com a pesquisa e o total feitos no banco.
// No modo demonstração, as mesmas regras rodam em memória (coleção "clientes").

import { useEffect, useState } from 'react'
import { sb } from '@/lib/supabase/client'
import type { Registro, Valor } from './types'
import { MODO, atualizarRegistro, avisar, criarRegistro, lerEstado, useErp } from './store'
import { colecao } from './metrics'
import { traduzirErro } from './supabase-sync'
import { documentoValido, soDigitos, termosBusca, textoBusca } from './documento'

export interface Cliente {
  id: string
  nome: string
  documento: string // só números (CPF 11 / CNPJ 14) ou ''
  tipoPessoa: 'Física' | 'Jurídica'
  telefone1: string
  telefone2: string
  telefone3: string
  whatsapp: string
  email: string
  cep: string
  rua: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  origem: string
  codigoContaAzul: string
  codigoSistemaAntigo: string
  observacao: string
  documentoOk: boolean
  criadoEm: string
}
export type DadosCliente = Omit<Cliente, 'id' | 'documentoOk' | 'criadoEm'>

export interface FiltroClientes {
  termo: string
  uf: string
  tipo: '' | 'Física' | 'Jurídica'
  aCorrigir: boolean // sem documento ou com documento inválido
}
export const FILTRO_VAZIO: FiltroClientes = { termo: '', uf: '', tipo: '', aCorrigir: false }
export const POR_PAGINA = 50
export const ORIGENS_CLIENTE = ['Cadastro manual', 'Conta Azul', 'Rebolo', 'Vendedor externo', 'Sistema antigo']

const CAMPOS: (keyof DadosCliente)[] = ['nome', 'documento', 'tipoPessoa', 'telefone1', 'telefone2', 'telefone3', 'whatsapp', 'email', 'cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'origem', 'codigoContaAzul', 'codigoSistemaAntigo', 'observacao']
const paraSnake = (k: string) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
const COLUNAS = ['id', ...CAMPOS.map(paraSnake), 'documento_ok', 'created_at'].join(', ')
const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v))

function doBanco(l: Record<string, unknown>): Cliente {
  const c: Record<string, unknown> = { id: l.id, documentoOk: !!l.documento_ok, criadoEm: txt(l.created_at) }
  for (const k of CAMPOS) c[k] = txt(l[paraSnake(k)])
  return c as unknown as Cliente
}

// mesma arrumação do gatilho do banco (clientes_antes)
export function normalizarCliente(d: DadosCliente): DadosCliente {
  const limpo = (v: unknown) => txt(v).trim()
  const documento = soDigitos(d.documento)
  return {
    ...d,
    nome: limpo(d.nome).replace(/\s+/g, ' ').toUpperCase(),
    documento,
    tipoPessoa: documento ? (documento.length === 14 ? 'Jurídica' : 'Física') : d.tipoPessoa || 'Física',
    telefone1: limpo(d.telefone1),
    telefone2: limpo(d.telefone2),
    telefone3: limpo(d.telefone3),
    whatsapp: limpo(d.whatsapp),
    email: limpo(d.email).toLowerCase(),
    cep: limpo(d.cep),
    rua: limpo(d.rua),
    numero: limpo(d.numero),
    complemento: limpo(d.complemento),
    bairro: limpo(d.bairro),
    cidade: limpo(d.cidade),
    uf: limpo(d.uf).toUpperCase(),
    origem: limpo(d.origem) || 'Cadastro manual',
    codigoContaAzul: limpo(d.codigoContaAzul),
    codigoSistemaAntigo: limpo(d.codigoSistemaAntigo),
    observacao: limpo(d.observacao),
  }
}

// ---------------- modo demonstração (em memória) ----------------
const buscaDemo = (c: Registro) =>
  [textoBusca(c.nome), soDigitos(c.documento), soDigitos(c.telefone1), soDigitos(c.telefone2), soDigitos(c.telefone3), soDigitos(c.whatsapp), textoBusca(c.cidade), txt(c.email).toLowerCase()].join(' ')
const doDemo = (r: Registro): Cliente => {
  const c: Record<string, unknown> = { id: r.id, criadoEm: txt(r.criadoEm), documentoOk: documentoValido(r.documento) }
  for (const k of CAMPOS) c[k] = txt(r[k])
  if (!c.tipoPessoa) c.tipoPessoa = 'Física'
  if (!c.origem) c.origem = 'Cadastro manual'
  return c as unknown as Cliente
}
const clientesDemo = () => colecao(lerEstado(), 'clientes')

function filtrarDemo(f: FiltroClientes) {
  const termos = termosBusca(f.termo)
  return clientesDemo()
    .filter((c) => {
      if (f.uf && c.uf !== f.uf) return false
      if (f.tipo && (c.tipoPessoa || 'Física') !== f.tipo) return false
      if (f.aCorrigir && documentoValido(c.documento)) return false
      const b = buscaDemo(c)
      return termos.every((t) => b.includes(t))
    })
    .sort((a, b) => txt(a.nome).localeCompare(txt(b.nome), 'pt-BR') || txt(a.id).localeCompare(txt(b.id)))
}

// ---------------- leitura ----------------
export async function buscarClientes(f: FiltroClientes, pagina: number): Promise<{ linhas: Cliente[]; total: number; erro?: string }> {
  const de = pagina * POR_PAGINA
  if (MODO !== 'supabase') {
    const todos = filtrarDemo(f)
    return { linhas: todos.slice(de, de + POR_PAGINA).map(doDemo), total: todos.length }
  }
  let consulta = sb().from('clientes').select(COLUNAS, { count: 'exact' })
  for (const t of termosBusca(f.termo)) consulta = consulta.like('busca', `%${t}%`)
  if (f.uf) consulta = consulta.eq('uf', f.uf)
  if (f.tipo) consulta = consulta.eq('tipo_pessoa', f.tipo)
  if (f.aCorrigir) consulta = consulta.eq('documento_ok', false)
  const { data, count, error } = await consulta.order('nome').order('id').range(de, de + POR_PAGINA - 1)
  if (error) return { linhas: [], total: 0, erro: traduzirErro(error) }
  return { linhas: ((data ?? []) as unknown as Record<string, unknown>[]).map(doBanco), total: count ?? 0 }
}

export async function contarClientes(): Promise<{ total: number; aCorrigir: number; juridicas: number }> {
  if (MODO !== 'supabase') {
    const todos = clientesDemo()
    return { total: todos.length, aCorrigir: todos.filter((c) => !documentoValido(c.documento)).length, juridicas: todos.filter((c) => c.tipoPessoa === 'Jurídica').length }
  }
  const contar = async (coluna?: string, valor?: string | boolean) => {
    let q = sb().from('clientes').select('id', { count: 'exact', head: true })
    if (coluna) q = q.eq(coluna, valor)
    const { count } = await q
    return count ?? 0
  }
  const [total, aCorrigir, juridicas] = await Promise.all([contar(), contar('documento_ok', false), contar('tipo_pessoa', 'Jurídica')])
  return { total, aCorrigir, juridicas }
}

export async function lerCliente(id: string): Promise<Cliente | null> {
  if (MODO !== 'supabase') {
    const r = clientesDemo().find((c) => c.id === id)
    return r ? doDemo(r) : null
  }
  const { data } = await sb().from('clientes').select(COLUNAS).eq('id', id).maybeSingle()
  return data ? doBanco(data as unknown as Record<string, unknown>) : null
}

// ---------------- gravação ----------------
// Documento: vazio é aceito (fica "a corrigir"); preenchido precisa ser CPF/CNPJ válido — a não ser que seja
// o mesmo que já estava (cliente migrado com documento inválido pode ser editado sem trocar o documento).
export async function salvarCliente(dados: DadosCliente, id?: string, documentoAnterior = ''): Promise<string | null> {
  const d = normalizarCliente(dados)
  if (!d.nome) return 'Informe o nome do cliente.'
  if (d.documento && d.documento !== soDigitos(documentoAnterior)) {
    if (d.documento.length !== 11 && d.documento.length !== 14) return 'O CPF tem 11 números e o CNPJ tem 14.'
    if (!documentoValido(d.documento)) return d.documento.length === 11 ? 'CPF inválido: confira os números.' : 'CNPJ inválido: confira os números.'
  }
  if (d.uf && !/^[A-Z]{2}$/.test(d.uf)) return 'UF inválida.'

  if (MODO !== 'supabase') {
    const repetido = d.documento && clientesDemo().find((c) => soDigitos(c.documento) === d.documento && c.id !== id)
    if (repetido) return `Já existe um cliente com este ${d.documento.length === 14 ? 'CNPJ' : 'CPF'}: ${repetido.nome}.`
    const registro = d as unknown as Record<string, Valor>
    const erro = id ? await atualizarRegistro('clientes', id, registro, 'cobranca') : await criarRegistro('clientes', registro, 'cobranca')
    if (!erro) avisar(id ? 'Cliente atualizado.' : 'Cliente cadastrado.', 'ok')
    return erro
  }

  if (d.documento) {
    let q = sb().from('clientes').select('id, nome').eq('documento', d.documento)
    if (id) q = q.neq('id', id)
    const { data: repetido } = await q.limit(1)
    if (repetido?.length) return `Já existe um cliente com este ${d.documento.length === 14 ? 'CNPJ' : 'CPF'}: ${repetido[0].nome}.`
  }
  const linha: Record<string, string | null> = {}
  for (const k of CAMPOS) linha[paraSnake(k)] = d[k] === '' ? null : String(d[k])
  linha.tipo_pessoa = d.tipoPessoa
  linha.origem = d.origem
  const { error } = id ? await sb().from('clientes').update(linha).eq('id', id) : await sb().from('clientes').insert(linha)
  if (error) {
    const msg = error.code === '23505' ? 'Já existe um cliente com este CPF/CNPJ.' : traduzirErro(error)
    avisar(msg)
    return msg
  }
  avisar(id ? 'Cliente atualizado.' : 'Cliente cadastrado.', 'ok')
  return null
}

// ---------------- gancho da tela ----------------
// Refaz a busca quando o filtro, a página ou a "versão" mudam (a versão sobe depois de salvar).
// No modo demonstração, também quando os dados em memória mudam.
export function useClientes(f: FiltroClientes, pagina: number, versao: number) {
  const s = useErp()
  const [res, setRes] = useState<{ chave: string; linhas: Cliente[]; total: number; erro?: string } | null>(null)
  const dadosDemo = MODO === 'supabase' ? null : s.colecoes.clientes
  const chave = `${JSON.stringify(f)}|${pagina}|${versao}`
  useEffect(() => {
    let vale = true
    void buscarClientes(f, pagina).then((r) => {
      if (vale) setRes({ ...r, chave })
    })
    return () => {
      vale = false
    }
  }, [f, pagina, chave, dadosDemo])
  // enquanto a nova busca não chega, a lista anterior continua na tela (meio apagada)
  return { linhas: res?.linhas ?? [], total: res?.total ?? 0, erro: res?.erro, carregando: !res || res.chave !== chave }
}

export function useContadoresClientes(versao: number) {
  const s = useErp()
  const [c, setC] = useState<{ total: number; aCorrigir: number; juridicas: number } | null>(null)
  const dadosDemo = MODO === 'supabase' ? null : s.colecoes.clientes
  useEffect(() => {
    let vale = true
    void contarClientes().then((r) => {
      if (vale) setC(r)
    })
    return () => {
      vale = false
    }
  }, [versao, dadosDemo])
  return c
}
