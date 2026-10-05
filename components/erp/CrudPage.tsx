'use client'

import { useMemo, useState, type ReactNode } from 'react'
import type { Acao, ErpState, Modulo, Registro, Setor, Tom, Valor } from '@/lib/erp/types'
import { atualizarRegistro, criarRegistro, excluirRegistro, useErp, usePode } from '@/lib/erp/store'
import { brl, dataBR, hoje, num } from '@/lib/erp/format'
import { colecao } from '@/lib/erp/metrics'
import { exportarCSV } from '@/lib/erp/export'
import Icon from './Icon'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, btnBranco, btnPrimario, btnSecundario, inputCls, labelCls } from './ui'

export interface Opcao {
  valor: string
  label: string
}

export interface Campo {
  chave: string
  label: string
  tipo: 'texto' | 'email' | 'telefone' | 'numero' | 'moeda' | 'percentual' | 'data' | 'select' | 'textarea'
  opcoes?: string[] | ((s: ErpState) => Opcao[])
  obrigatorio?: boolean
  tabela?: boolean // exibir na tabela (padrão: true)
  formulario?: boolean // exibir no formulário (padrão: true)
  padrao?: (s: ErpState) => Valor
  exibir?: (r: Registro, s: ErpState) => ReactNode
}

export interface AcaoLinha {
  label: string
  icone?: string
  tom?: 'blue' | 'emerald' | 'orange' | 'red'
  permissao?: Acao
  visivel?: (r: Registro) => boolean
  executar: (r: Registro) => void
}

export interface KPI {
  label: string
  valor: ReactNode
  tom?: Tom
  detalhe?: ReactNode
}

export interface CrudProps {
  colecao: string
  modulo: Modulo
  setor?: Setor
  moduloLabel: string
  titulo: string
  descricao?: string
  campos: Campo[]
  acoes?: AcaoLinha[]
  status?: { campo: string; tons: Record<string, Tom>; valor?: (r: Registro) => string }
  filtro?: (r: Registro, s: ErpState) => boolean
  kpis?: (registros: Registro[], s: ErpState) => KPI[]
  podeCriar?: boolean
  podeEditar?: boolean
  podeExcluir?: boolean
  rotuloNovo?: string
  embutido?: boolean // sem cabeçalho de página (usado dentro de abas)
  topo?: ReactNode
  // cadastro com histórico não é excluído: devolve onde ele aparece (ex.: "visitas na agenda") e a tela sugere inativar
  historico?: (r: Registro, s: ErpState) => string | null
  inativar?: { campo: string; valor: string }
}

function opcoesDe(c: Campo, s: ErpState): Opcao[] {
  if (!c.opcoes) return []
  return typeof c.opcoes === 'function' ? c.opcoes(s) : c.opcoes.map((o) => ({ valor: o, label: o }))
}

function formatarCelula(c: Campo, v: Valor, s: ErpState) {
  if (v === null || v === undefined || v === '') return '—'
  if (c.tipo === 'moeda') return brl(Number(v))
  if (c.tipo === 'percentual') return `${num(Number(v))}%`
  if (c.tipo === 'numero') return num(Number(v))
  if (c.tipo === 'data') return dataBR(String(v))
  if (c.tipo === 'select' && typeof c.opcoes === 'function') return opcoesDe(c, s).find((o) => o.valor === v)?.label ?? String(v)
  return String(v)
}

// Indicadores do topo: cor só para alerta (regra do ADM). Amarelo/vermelho só quando o número não é zero;
// os que só enfeitavam (verde de "pagas", azul de "cadastrados"...) ficam neutros.
const ZERO = /^(R\$\s*)?0(,00)?(\s*dias?)?$/
function tomDoKpi(tom: Tom | undefined, valor: ReactNode): Tom {
  if (tom !== 'red' && tom !== 'yellow') return 'zinc'
  const texto = String(valor ?? '').replace(/\s/g, ' ').trim()
  return valor === 0 || ZERO.test(texto) ? 'zinc' : tom
}

export default function CrudPage(p: CrudProps) {
  const s = useErp()
  const podeFazer = usePode()
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [editando, setEditando] = useState<Registro | null>(null)
  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [confirmarExclusao, setConfirmarExclusao] = useState<Registro | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)

  const pCriar = (p.podeCriar ?? true) && podeFazer(p.modulo, 'criar')
  const pEditar = (p.podeEditar ?? true) && podeFazer(p.modulo, 'editar')
  const pExcluir = (p.podeExcluir ?? true) && podeFazer(p.modulo, 'excluir')
  const pExportar = podeFazer(p.modulo, 'exportar')

  const statusDe = (r: Registro) => (p.status ? (p.status.valor ? p.status.valor(r) : String(r[p.status.campo] ?? '')) : '')
  const usoDoExcluido = confirmarExclusao && p.historico ? p.historico(confirmarExclusao, s) : null

  const todos = useMemo(() => colecao(s, p.colecao).filter((r) => !p.filtro || p.filtro(r, s)), [s, p])
  const registros = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return todos.filter((r) => {
      if (filtroStatus && statusDe(r) !== filtroStatus) return false
      if (!termo) return true
      return p.campos.some((c) => String(formatarCelula(c, r[c.chave], s)).toLowerCase().includes(termo))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, busca, filtroStatus, s])

  const colunasTabela = p.campos.filter((c) => c.tabela !== false)
  const camposForm = p.campos.filter((c) => c.formulario !== false)
  const acoesVisiveis = (r: Registro) => (p.acoes ?? []).filter((a) => (!a.permissao || podeFazer(p.modulo, a.permissao)) && (!a.visivel || a.visivel(r)))

  const abrirNovo = () => {
    const inicial: Record<string, string> = {}
    for (const c of camposForm) {
      const v = c.padrao?.(s)
      inicial[c.chave] = v === undefined || v === null ? (c.tipo === 'data' ? hoje() : c.tipo === 'select' ? (opcoesDe(c, s)[0]?.valor ?? '') : '') : String(v)
    }
    setForm(inicial)
    setEditando(null)
    setErroForm(null)
    setAberto(true)
  }

  const abrirEdicao = (r: Registro) => {
    const inicial: Record<string, string> = {}
    for (const c of camposForm) inicial[c.chave] = r[c.chave] === null || r[c.chave] === undefined ? '' : String(r[c.chave])
    setForm(inicial)
    setEditando(r)
    setErroForm(null)
    setAberto(true)
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const dados: Record<string, Valor> = {}
    for (const c of camposForm) {
      const v = form[c.chave] ?? ''
      dados[c.chave] = ['numero', 'moeda', 'percentual'].includes(c.tipo) ? Number(v.replace(',', '.')) || 0 : v
    }
    if (!editando) {
      // campos que não aparecem no formulário recebem o valor padrão
      for (const c of p.campos) if (c.formulario === false && c.padrao) dados[c.chave] = c.padrao(s)
    }
    setSalvando(true)
    const erro = editando ? await atualizarRegistro(p.colecao, editando.id, dados, p.setor) : await criarRegistro(p.colecao, dados, p.setor)
    setSalvando(false)
    setErroForm(erro)
    if (!erro) setAberto(false)
  }

  const exportar = () =>
    exportarCSV(
      p.colecao,
      p.campos.map((c) => ({ chave: c.chave, label: c.label })),
      registros.map((r) => Object.fromEntries(p.campos.map((c) => [c.chave, formatarCelula(c, r[c.chave], s)]))),
    )

  const statusDisponiveis = p.status ? [...new Set(todos.map(statusDe))].filter(Boolean) : []
  const kpis = p.kpis?.(todos, s)

  const botaoNovo = pCriar && (
    <button onClick={abrirNovo} className={p.embutido ? btnPrimario : btnBranco}>
      <Icon nome="plus" className="w-5 h-5" /> {p.rotuloNovo ?? 'Novo registro'}
    </button>
  )

  return (
    <div className={`space-y-8 ${p.embutido ? 'animate-fade-in' : 'animate-fade-in-up'}`}>
      {!p.embutido && <PageHeader modulo={p.moduloLabel} titulo={p.titulo} descricao={p.descricao} acoes={botaoNovo} />}

      {kpis && kpis.length > 0 && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${kpis.length >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'} gap-6`}>
          {kpis.map((k) => (
            <StatCard key={k.label} label={k.label} valor={k.valor} tom={tomDoKpi(k.tom, k.valor)} detalhe={k.detalhe} />
          ))}
        </div>
      )}

      {p.topo}

      <Panel
        semPadding
        titulo={p.embutido ? p.titulo : `Base • ${registros.length} registro(s)`}
        subtitulo={p.embutido ? p.descricao : undefined}
        acoes={
          <>
            {statusDisponiveis.length > 1 && (
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="bg-black/50 border border-white/[0.05] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl px-4 py-2.5 outline-none focus:border-blue-500/50">
                <option value="">Todos os status</option>
                {statusDisponiveis.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            )}
            <div className="relative group">
              <Icon nome="search" className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-blue-500 transition-colors" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} type="text" placeholder="Filtrar..." className="bg-black/50 border border-white/[0.05] rounded-xl pl-11 pr-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 w-56 transition-all" />
            </div>
            {pExportar && (
              <button onClick={exportar} className={btnSecundario} title="Exportar CSV">
                <Icon nome="download" className="w-4 h-4" /> CSV
              </button>
            )}
            {p.embutido && botaoNovo}
          </>
        }
      >
        {registros.length === 0 ? (
          <EmptyState titulo="Nenhum registro" descricao={pCriar ? 'Use o botão de novo registro para começar.' : 'Não há dados para exibir.'} />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  {colunasTabela.map((c) => (
                    <th key={c.chave} className="px-6 py-4 font-bold whitespace-nowrap">{c.label}</th>
                  ))}
                  {p.status && <th className="px-6 py-4 font-bold">Status</th>}
                  <th className="px-6 py-4 font-bold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {registros.map((r) => {
                  const st = statusDe(r)
                  return (
                    <tr key={r.id} className="hover:bg-white/[0.02] transition-colors group">
                      {colunasTabela.map((c, i) => (
                        <td key={c.chave} className={`px-6 py-4 ${i === 0 ? 'text-white font-bold tracking-wide' : 'text-zinc-400'} whitespace-nowrap`}>
                          {c.exibir ? c.exibir(r, s) : formatarCelula(c, r[c.chave], s)}
                        </td>
                      ))}
                      {p.status && (
                        <td className="px-6 py-4">
                          <Badge texto={st} tom={p.status.tons[st]} />
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          {acoesVisiveis(r).map((a) => (
                            <button
                              key={a.label}
                              onClick={() => a.executar(r)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap transition-all ${
                                // ações: azul da interface; vermelho só para a ação que desfaz ou recusa (rejeitar, bloquear)
                                a.tom === 'red' ? 'text-red-400 border-red-500/20 bg-red-500/10 hover:bg-red-500/20' : 'text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20'
                              }`}
                            >
                              {a.label}
                            </button>
                          ))}
                          {pEditar && (
                            <button onClick={() => abrirEdicao(r)} title="Editar" className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.05] transition-all">
                              <Icon nome="edit" className="w-4 h-4" />
                            </button>
                          )}
                          {pExcluir && (
                            <button onClick={() => setConfirmarExclusao(r)} title="Excluir" className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                              <Icon nome="trash" className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        aberto={aberto}
        titulo={editando ? `Editar • ${p.titulo}` : p.rotuloNovo ?? 'Novo registro'}
        subtitulo={p.moduloLabel}
        onFechar={() => setAberto(false)}
        rodape={
          <>
            <button onClick={() => setAberto(false)} className={btnSecundario}>Cancelar</button>
            <button form={`form-${p.colecao}`} type="submit" disabled={salvando} className={btnPrimario}>{salvando ? 'Salvando...' : 'Salvar'}</button>
          </>
        }
      >
        <form id={`form-${p.colecao}`} onSubmit={salvar} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {camposForm.map((c) => (
            <div key={c.chave} className={`space-y-2 ${c.tipo === 'textarea' ? 'md:col-span-2' : ''}`}>
              <label className={labelCls}>
                {c.label} {c.obrigatorio && <span className="text-blue-500">*</span>}
              </label>
              {c.tipo === 'select' ? (
                <select required={c.obrigatorio} value={form[c.chave] ?? ''} onChange={(e) => setForm({ ...form, [c.chave]: e.target.value })} className={`${inputCls} appearance-none`}>
                  {!c.obrigatorio && <option value="">—</option>}
                  {opcoesDe(c, s).map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              ) : c.tipo === 'textarea' ? (
                <textarea rows={3} required={c.obrigatorio} value={form[c.chave] ?? ''} onChange={(e) => setForm({ ...form, [c.chave]: e.target.value })} className={inputCls} />
              ) : (
                <input
                  type={c.tipo === 'data' ? 'date' : c.tipo === 'email' ? 'email' : ['numero', 'moeda', 'percentual'].includes(c.tipo) ? 'number' : 'text'}
                  step={c.tipo === 'moeda' ? '0.01' : undefined}
                  min={['numero', 'moeda', 'percentual'].includes(c.tipo) ? 0 : undefined}
                  required={c.obrigatorio}
                  value={form[c.chave] ?? ''}
                  onChange={(e) => setForm({ ...form, [c.chave]: e.target.value })}
                  className={inputCls}
                />
              )}
            </div>
          ))}
          {erroForm && <p className="md:col-span-2 text-xs font-bold text-red-400">{erroForm}</p>}
        </form>
      </Modal>

      <Modal
        aberto={!!confirmarExclusao}
        titulo={usoDoExcluido ? 'Não dá para excluir' : 'Confirmar exclusão'}
        subtitulo="Esta ação ficará registrada na auditoria"
        onFechar={() => setConfirmarExclusao(null)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setConfirmarExclusao(null)} className={btnSecundario}>{usoDoExcluido ? 'Voltar' : 'Cancelar'}</button>
            {usoDoExcluido ? (
              p.inativar &&
              confirmarExclusao &&
              String(confirmarExclusao[p.inativar.campo] ?? '') !== p.inativar.valor && (
                <button
                  onClick={() => {
                    if (confirmarExclusao && p.inativar) atualizarRegistro(p.colecao, confirmarExclusao.id, { [p.inativar.campo]: p.inativar.valor }, p.setor)
                    setConfirmarExclusao(null)
                  }}
                  className={btnPrimario}
                >
                  Inativar
                </button>
              )
            ) : (
              <button
                onClick={() => {
                  if (confirmarExclusao) excluirRegistro(p.colecao, confirmarExclusao.id, p.setor)
                  setConfirmarExclusao(null)
                }}
                className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all"
              >
                Excluir
              </button>
            )}
          </>
        }
      >
        {usoDoExcluido ? (
          <p className="text-sm text-zinc-300">
            Este cadastro já tem histórico (<strong className="text-white">{usoDoExcluido}</strong>): excluir apagaria o que aconteceu.{' '}
            {p.inativar
              ? String(confirmarExclusao?.[p.inativar.campo] ?? '') === p.inativar.valor
                ? 'Ele já está inativo.'
                : 'Inative: ele sai das listas de escolha e o histórico continua.'
              : ''}
          </p>
        ) : (
          <p className="text-sm text-zinc-300">Tem certeza que deseja excluir este registro? Não é possível desfazer.</p>
        )}
      </Modal>
    </div>
  )
}
