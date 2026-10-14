'use client'

// Cobrança › Configurações › Categorias (SQL 039): grupo, se conta na inadimplência, se pode ir ao SPC, escritório e os
// nomes antigos (de-para da migração: os nomes do sistema antigo que viram esta categoria). ADM e Gerência alteram.

import { useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { excluirRegistro, salvarCategoriaCobranca, useErp } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { textoBusca } from '@/lib/erp/documento'
import { lerJSON } from '@/lib/erp/operacional'
import { GRUPOS_CATEGORIA, tipoEscritorioDoGrupo } from '@/lib/erp/cobranca-config'
import { Badge, EmptyState, Modal, Panel, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

const chip = (ativo: boolean) =>
  `whitespace-nowrap px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border ${
    ativo ? 'bg-blue-600/10 text-blue-400 border-blue-500/30' : 'text-zinc-500 hover:text-white hover:bg-white/[0.02] border-white/[0.05]'
  }`
const simNao = (v: unknown) => (v === true || v === 'true' ? 'Sim' : 'Não')
const verdade = (v: unknown) => v === true || v === 'true'
export const nomesAntigosDe = (c: Registro) => lerJSON<string[]>(c.nomesAntigos, [])

export default function CategoriasCobranca({ editavel }: { editavel: boolean }) {
  const s = useErp()
  const categorias = colecao(s, 'cobranca_categorias')
  const escritorios = colecao(s, 'cobranca_escritorios')
  const [grupo, setGrupo] = useState('')
  const [busca, setBusca] = useState('')
  const [inativas, setInativas] = useState(false)
  const [aberta, setAberta] = useState<Registro | 'nova' | null>(null)
  const t = textoBusca(busca.trim())
  const lista = categorias
    .filter((c) => (!grupo || c.grupo === grupo) && (inativas || verdade(c.ativa)))
    .filter((c) => !t || textoBusca(`${c.nome} ${nomesAntigosDe(c).join(' ')}`).includes(t))
    .sort((a, b) => GRUPOS_CATEGORIA.findIndex((g) => g.id === a.grupo) - GRUPOS_CATEGORIA.findIndex((g) => g.id === b.grupo) || String(a.nome).localeCompare(String(b.nome)))
  const nomeEscritorio = (id: unknown) => String(escritorios.find((e) => e.id === id)?.nome ?? '')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setGrupo('')} className={chip(grupo === '')}>Todos ({categorias.length})</button>
          {GRUPOS_CATEGORIA.map((g) => (
            <button key={g.id} onClick={() => setGrupo(g.id)} title={g.descricao} className={chip(grupo === g.id)}>
              {g.id} ({categorias.filter((c) => c.grupo === g.id).length})
            </button>
          ))}
        </div>
        {editavel && <button onClick={() => setAberta('nova')} className={btnPrimario}>Nova categoria</button>}
      </div>
      <Panel
        semPadding
        titulo={grupo || 'Todas as categorias'}
        subtitulo={grupo ? GRUPOS_CATEGORIA.find((g) => g.id === grupo)?.descricao : 'Cada cobrança tem uma categoria: ela decide a carteira, a inadimplência e o SPC.'}
        acoes={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 cursor-pointer">
              <input type="checkbox" checked={inativas} onChange={(e) => setInativas(e.target.checked)} className="accent-blue-500" /> Mostrar inativas
            </label>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Pesquisar categorias" placeholder="Buscar categoria ou nome antigo..." className="campo-busca bg-black/50 border border-white/[0.05] rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-blue-500/50 w-64" />
          </div>
        }
      >
        {lista.length === 0 ? (
          <EmptyState titulo="Nenhuma categoria" descricao={categorias.length ? 'Nada com esse filtro.' : 'As categorias do sistema antigo entram pelo arquivo de importação (depois de conferir a lista).'} />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-5 py-4 font-bold">Categoria</th>
                  <th className="px-5 py-4 font-bold">Grupo</th>
                  <th className="px-5 py-4 font-bold">Conta na inadimplência</th>
                  <th className="px-5 py-4 font-bold">Pode ir ao SPC</th>
                  <th className="px-5 py-4 font-bold">Escritório</th>
                  <th className="px-5 py-4 font-bold">Nomes antigos</th>
                  <th className="px-5 py-4 font-bold">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {lista.map((c) => {
                  const antigos = nomesAntigosDe(c)
                  return (
                    <tr key={c.id} onClick={() => setAberta(c)} className="hover:bg-white/[0.02] cursor-pointer align-top">
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-white">{String(c.nome)}</p>
                        {c.observacao ? <p className="text-[11px] text-zinc-500">{String(c.observacao)}</p> : null}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap"><Badge texto={String(c.grupo)} tom="zinc" /></td>
                      <td className="px-5 py-3.5">{simNao(c.contaInadimplencia)}</td>
                      <td className="px-5 py-3.5">{simNao(c.podeSpc)}</td>
                      <td className="px-5 py-3.5 text-xs">{nomeEscritorio(c.escritorioId) || '—'}</td>
                      <td className="px-5 py-3.5 text-xs text-zinc-400 max-w-[280px]" title={antigos.join('\n')}>
                        {antigos.length ? `${antigos.slice(0, 2).join(' • ')}${antigos.length > 2 ? ` (+${antigos.length - 2})` : ''}` : '—'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap"><Badge texto={verdade(c.ativa) ? 'Ativa' : 'Inativa'} tom={verdade(c.ativa) ? 'emerald' : 'zinc'} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal aberto={!!aberta} titulo={aberta === 'nova' ? 'Nova categoria' : aberta ? String(aberta.nome) : ''} subtitulo={editavel ? 'ADM e Gerência alteram' : 'Somente leitura'} onFechar={() => setAberta(null)} largura="max-w-2xl">
        {aberta && <CategoriaForm key={aberta === 'nova' ? 'nova' : aberta.id} categoria={aberta === 'nova' ? null : aberta} escritorios={escritorios} editavel={editavel} onFechar={() => setAberta(null)} />}
      </Modal>
    </div>
  )
}

function CategoriaForm({ categoria, escritorios, editavel, onFechar }: { categoria: Registro | null; escritorios: Registro[]; editavel: boolean; onFechar: () => void }) {
  const [nome, setNome] = useState(String(categoria?.nome ?? ''))
  const [grupo, setGrupo] = useState(String(categoria?.grupo ?? 'Cobrança DLG'))
  const [inad, setInad] = useState(categoria ? verdade(categoria.contaInadimplencia) : true)
  const [spc, setSpc] = useState(categoria ? verdade(categoria.podeSpc) : true)
  const [escritorioId, setEscritorioId] = useState(String(categoria?.escritorioId ?? ''))
  const [antigos, setAntigos] = useState(categoria ? nomesAntigosDe(categoria).join('\n') : '')
  const [ativa, setAtiva] = useState(categoria ? verdade(categoria.ativa) : true)
  const [observacao, setObservacao] = useState(String(categoria?.observacao ?? ''))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const tipo = tipoEscritorioDoGrupo(grupo)
  const opcoes = escritorios.filter((e) => e.tipo === tipo && (verdade(e.ativo) || e.id === escritorioId))

  // trocar o grupo sugere as marcas de costume (a cobrança normal conta na inadimplência e pode ir ao SPC)
  const trocarGrupo = (g: string) => {
    setGrupo(g)
    const normal = g === 'Cobrança DLG' || g === 'Registro SPC'
    setInad(normal)
    setSpc(normal)
    if (!tipoEscritorioDoGrupo(g)) setEscritorioId('')
  }

  const salvar = async () => {
    setErro('')
    setSalvando(true)
    const falha = await salvarCategoriaCobranca(
      { nome, grupo, contaInadimplencia: inad, podeSpc: spc, escritorioId: tipo ? escritorioId : '', nomesAntigos: antigos.split('\n'), ativa, observacao },
      categoria ? String(categoria.id) : undefined,
    )
    setSalvando(false)
    if (falha) return setErro(falha)
    onFechar()
  }

  const excluir = async () => {
    if (!categoria || !window.confirm(`Excluir a categoria "${categoria.nome}"?`)) return
    const falha = await excluirRegistro('cobranca_categorias', String(categoria.id), 'cobranca')
    if (falha) return setErro(falha)
    onFechar()
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <label className={labelCls}>Nome da categoria *</label>
        <input value={nome} disabled={!editavel} onChange={(e) => setNome(e.target.value)} className={inputCls} autoFocus={editavel && !categoria} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={labelCls}>Grupo</label>
          <select value={grupo} disabled={!editavel} onChange={(e) => trocarGrupo(e.target.value)} className={`${inputCls} appearance-none`}>
            {GRUPOS_CATEGORIA.map((g) => (
              <option key={g.id} value={g.id}>{g.id}</option>
            ))}
          </select>
          <p className="text-[11px] text-zinc-500">{GRUPOS_CATEGORIA.find((g) => g.id === grupo)?.descricao}</p>
        </div>
        {tipo && (
          <div className="space-y-1">
            <label className={labelCls}>Escritório ({tipo})</label>
            <select value={escritorioId} disabled={!editavel} onChange={(e) => setEscritorioId(e.target.value)} className={`${inputCls} appearance-none`}>
              <option value="">— sem escritório —</option>
              {opcoes.map((e) => (
                <option key={e.id} value={e.id}>{String(e.nome)}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3 cursor-pointer">
          <input type="checkbox" disabled={!editavel} checked={inad} onChange={(e) => setInad(e.target.checked)} className="w-4 h-4 accent-blue-500" />
          <span className="text-sm text-white font-bold">Conta na inadimplência</span>
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3 cursor-pointer">
          <input type="checkbox" disabled={!editavel} checked={spc} onChange={(e) => setSpc(e.target.checked)} className="w-4 h-4 accent-blue-500" />
          <span className="text-sm text-white font-bold">Pode ir ao SPC</span>
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3 cursor-pointer">
          <input type="checkbox" disabled={!editavel} checked={ativa} onChange={(e) => setAtiva(e.target.checked)} className="w-4 h-4 accent-blue-500" />
          <span className="text-sm text-white font-bold">Ativa</span>
        </label>
      </div>
      <div className="space-y-1">
        <label className={labelCls}>Nomes antigos (um por linha)</label>
        <textarea value={antigos} disabled={!editavel} onChange={(e) => setAntigos(e.target.value)} rows={4} placeholder="Ex.: RECEITA DE RECORDAÇÃO ESCOLAR" className={`${inputCls} font-mono text-xs`} />
        <p className="text-[11px] text-zinc-500">Como a categoria aparecia no sistema antigo. Na migração, cada cobrança com um desses nomes vem para esta categoria.</p>
      </div>
      <div className="space-y-1">
        <label className={labelCls}>Observação</label>
        <input value={observacao} disabled={!editavel} onChange={(e) => setObservacao(e.target.value)} className={inputCls} />
      </div>
      {erro && <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400">{erro}</p>}
      <div className="flex flex-wrap justify-between gap-3">
        <div>{editavel && categoria && <button onClick={() => void excluir()} className="text-xs font-bold text-red-400 hover:text-red-300">Excluir categoria</button>}</div>
        <div className="flex gap-3">
          <button onClick={onFechar} className={btnSecundario}>{editavel ? 'Cancelar' : 'Fechar'}</button>
          {editavel && (
            <button onClick={() => void salvar()} disabled={salvando} className={btnPrimario}>
              {salvando ? 'Salvando...' : categoria ? 'Salvar' : 'Criar categoria'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
