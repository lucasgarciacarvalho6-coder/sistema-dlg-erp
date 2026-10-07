'use client'

// Cobrança › Configurações › Escritórios externos (SQL 039): terceirizadas e advogados que recebem cobranças.
// ADM e Gerência alteram; o escritório fica ligado às categorias de Terceirizada/Advogado.

import { useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { excluirRegistro, salvarEscritorioCobranca, useErp } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { formatarTelefone } from '@/lib/erp/rebolo'
import { TIPOS_ESCRITORIO } from '@/lib/erp/cobranca-config'
import { Badge, EmptyState, Modal, Panel, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

const verdade = (v: unknown) => v === true || v === 'true'

export default function EscritoriosCobranca({ editavel }: { editavel: boolean }) {
  const s = useErp()
  const escritorios = colecao(s, 'cobranca_escritorios')
  const categorias = colecao(s, 'cobranca_categorias')
  const [aberto, setAberto] = useState<Registro | 'novo' | null>(null)
  const lista = [...escritorios].sort((a, b) => String(a.tipo).localeCompare(String(b.tipo)) || String(a.nome).localeCompare(String(b.nome)))

  return (
    <div className="space-y-6">
      {editavel && (
        <div className="flex justify-end">
          <button onClick={() => setAberto('novo')} className={btnPrimario}>Novo escritório</button>
        </div>
      )}
      <Panel semPadding titulo="Escritórios externos" subtitulo="Empresas de cobrança terceirizada e advogados">
        {lista.length === 0 ? (
          <EmptyState titulo="Nenhum escritório" descricao="Os escritórios do sistema antigo entram pelo arquivo de importação, junto com as categorias." />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-5 py-4 font-bold">Escritório</th>
                  <th className="px-5 py-4 font-bold">Tipo</th>
                  <th className="px-5 py-4 font-bold">Contato</th>
                  <th className="px-5 py-4 font-bold">Telefone / e-mail</th>
                  <th className="px-5 py-4 font-bold">Categorias</th>
                  <th className="px-5 py-4 font-bold">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {lista.map((e) => (
                  <tr key={e.id} onClick={() => setAberto(e)} className="hover:bg-white/[0.02] cursor-pointer align-top">
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-white">{String(e.nome)}</p>
                      {e.observacao ? <p className="text-[11px] text-zinc-500">{String(e.observacao)}</p> : null}
                    </td>
                    <td className="px-5 py-3.5"><Badge texto={String(e.tipo)} tom="zinc" /></td>
                    <td className="px-5 py-3.5 text-xs">{String(e.contato || '—')}</td>
                    <td className="px-5 py-3.5 text-xs">
                      <p>{String(e.telefone || '—')}</p>
                      {e.email ? <p className="text-zinc-500">{String(e.email)}</p> : null}
                    </td>
                    <td className="px-5 py-3.5 text-xs">{categorias.filter((c) => c.escritorioId === e.id).length}</td>
                    <td className="px-5 py-3.5"><Badge texto={verdade(e.ativo) ? 'Ativo' : 'Inativo'} tom={verdade(e.ativo) ? 'emerald' : 'zinc'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal aberto={!!aberto} titulo={aberto === 'novo' ? 'Novo escritório' : aberto ? String(aberto.nome) : ''} subtitulo={editavel ? 'ADM e Gerência alteram' : 'Somente leitura'} onFechar={() => setAberto(null)}>
        {aberto && (
          <EscritorioForm
            key={aberto === 'novo' ? 'novo' : aberto.id}
            escritorio={aberto === 'novo' ? null : aberto}
            emUso={aberto === 'novo' ? 0 : categorias.filter((c) => c.escritorioId === aberto.id).length}
            editavel={editavel}
            onFechar={() => setAberto(null)}
          />
        )}
      </Modal>
    </div>
  )
}

function EscritorioForm({ escritorio, emUso, editavel, onFechar }: { escritorio: Registro | null; emUso: number; editavel: boolean; onFechar: () => void }) {
  const [d, setD] = useState({
    nome: String(escritorio?.nome ?? ''),
    tipo: String(escritorio?.tipo ?? 'Terceirizada'),
    contato: String(escritorio?.contato ?? ''),
    telefone: String(escritorio?.telefone ?? ''),
    email: String(escritorio?.email ?? ''),
    observacao: String(escritorio?.observacao ?? ''),
    ativo: escritorio ? verdade(escritorio.ativo) : true,
  })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const mudar = (k: keyof typeof d, v: string | boolean) => setD((x) => ({ ...x, [k]: v }))

  const salvar = async () => {
    setErro('')
    setSalvando(true)
    const falha = await salvarEscritorioCobranca(d, escritorio ? String(escritorio.id) : undefined)
    setSalvando(false)
    if (falha) return setErro(falha)
    onFechar()
  }
  const excluir = async () => {
    if (!escritorio) return
    if (emUso > 0) return setErro(`Este escritório está em ${emUso} categoria(s). Troque o escritório dessas categorias ou deixe-o inativo.`)
    if (!window.confirm(`Excluir o escritório "${escritorio.nome}"?`)) return
    const falha = await excluirRegistro('cobranca_escritorios', String(escritorio.id), 'cobranca')
    if (falha) return setErro(falha)
    onFechar()
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1 md:col-span-2">
          <label className={labelCls}>Nome *</label>
          <input value={d.nome} disabled={!editavel} onChange={(e) => mudar('nome', e.target.value)} className={inputCls} autoFocus={editavel && !escritorio} />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Tipo</label>
          <select value={d.tipo} disabled={!editavel} onChange={(e) => mudar('tipo', e.target.value)} className={`${inputCls} appearance-none`}>
            {TIPOS_ESCRITORIO.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Contato (pessoa)</label>
          <input value={d.contato} disabled={!editavel} onChange={(e) => mudar('contato', e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Telefone</label>
          <input value={d.telefone} disabled={!editavel} inputMode="tel" onChange={(e) => mudar('telefone', formatarTelefone(e.target.value))} placeholder="(00) 00000-0000" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>E-mail</label>
          <input type="email" value={d.email} disabled={!editavel} onChange={(e) => mudar('email', e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1 md:col-span-3">
          <label className={labelCls}>Observação</label>
          <input value={d.observacao} disabled={!editavel} onChange={(e) => mudar('observacao', e.target.value)} className={inputCls} />
        </div>
      </div>
      <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3 cursor-pointer w-fit">
        <input type="checkbox" disabled={!editavel} checked={d.ativo} onChange={(e) => mudar('ativo', e.target.checked)} className="w-4 h-4 accent-blue-500" />
        <span className="text-sm text-white font-bold">Ativo</span>
      </label>
      {erro && <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400">{erro}</p>}
      <div className="flex flex-wrap justify-between gap-3">
        <div>{editavel && escritorio && <button onClick={() => void excluir()} className="text-xs font-bold text-red-400 hover:text-red-300">Excluir escritório</button>}</div>
        <div className="flex gap-3">
          <button onClick={onFechar} className={btnSecundario}>{editavel ? 'Cancelar' : 'Fechar'}</button>
          {editavel && (
            <button onClick={() => void salvar()} disabled={salvando} className={btnPrimario}>
              {salvando ? 'Salvando...' : escritorio ? 'Salvar' : 'Cadastrar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
