'use client'

import { useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { conferirCaixa, useErp, usePode } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { dataBR, num } from '@/lib/erp/format'
import { lotesProducao } from '@/lib/erp/producao'
import { EmptyState, PageHeader, Panel, StatCard, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import Icon from '@/components/erp/Icon'
import { imprimirComprovante } from '@/components/edicao/comprovante'

// PRODUÇÃO › Estoque: a Revelação solta as caixas (app dela) → a Produção confere cada caixa →
// confirmou: imprime o comprovante (logo, cidade, escola, caixa, álbuns, data), lacra e a caixa entra no ESTOQUE.

type Aba = 'conferir' | 'estoque'
const cidadeDe = (l?: Registro) => (l ? `${String(l.cidade)}${l.uf ? `/${String(l.uf)}` : ''}` : '')

export default function EstoquePage() {
  const s = useErp()
  const [aba, setAba] = useState<Aba>('conferir')
  const [busca, setBusca] = useState('')
  const [cidade, setCidade] = useState('')
  const [conferidas, setConferidas] = useState<string[]>([]) // conferidas agora: botão do comprovante no topo

  const lotes = new Map(lotesProducao(s).map((l) => [l.id, l]))
  const nome = (id: unknown) => s.colaboradores.find((c) => c.id === id)?.nome ?? ''
  const caixas = colecao(s, 'producao_caixas').filter((c) => lotes.has(String(c.loteId)))
  const aguardando = caixas.filter((c) => c.status !== 'Em estoque')
  const estoque = caixas.filter((c) => c.status === 'Em estoque')
  const cidades = [...new Set(caixas.map((c) => cidadeDe(lotes.get(String(c.loteId)))).filter(Boolean))].sort()
  const soma = (ls: Registro[], campo: string) => ls.reduce((a, c) => a + (Number(c[campo]) || 0), 0)

  const termo = busca.trim().toLowerCase()
  const filtrar = (ls: Registro[]) =>
    ls.filter((c) => {
      const l = lotes.get(String(c.loteId))
      if (cidade && cidadeDe(l) !== cidade) return false
      return !termo || [l?.escola, cidadeDe(l), nome(c.registradoPor), nome(c.conferidoPor)].some((x) => String(x ?? '').toLowerCase().includes(termo))
    })
  const comprovante = (c: Registro) => {
    const l = lotes.get(String(c.loteId))
    imprimirComprovante({ escola: String(l?.escola ?? ''), cidade: cidadeDe(l), numero: Number(c.numero), albuns: Number(c.conferidoAlbuns ?? c.albuns), data: String(c.conferidoEm) })
  }
  const recentes = caixas.filter((c) => conferidas.includes(c.id) && c.status === 'Em estoque')

  const aba1 = (id: Aba, rotulo: string, n: number) => (
    <button
      onClick={() => setAba(id)}
      className={`whitespace-nowrap px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${aba === id ? 'bg-blue-600/10 text-blue-400 border-blue-500/30' : 'text-zinc-500 hover:text-white border-transparent'}`}
    >
      {rotulo} ({n})
    </button>
  )

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Módulo / Produção"
        titulo="Estoque"
        descricao="As caixas que a Revelação solta chegam aqui. Confira os álbuns de cada caixa, confirme, imprima o comprovante, lacre e a caixa entra no estoque."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <StatCard tom="orange" label="Aguardando conferência" valor={num(aguardando.length)} detalhe={`caixa(s) • ${num(soma(aguardando, 'albuns'))} álbuns`} />
        <StatCard tom="emerald" label="Em estoque" valor={num(estoque.length)} detalhe={`caixa(s) • ${num(estoque.reduce((a, c) => a + (Number(c.conferidoAlbuns ?? c.albuns) || 0), 0))} álbuns`} />
      </div>

      {/* acabou de conferir: o comprovante para imprimir e lacrar */}
      {recentes.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Conferidas agora — imprima o comprovante e lacre a caixa</p>
          {recentes.map((c) => {
            const l = lotes.get(String(c.loteId))
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-white">
                  <strong>Caixa {String(c.numero)}</strong> • {String(l?.escola)} • {cidadeDe(l)} • <strong>{num(Number(c.conferidoAlbuns))} álbuns</strong>
                </span>
                <button onClick={() => comprovante(c)} className={btnPrimario}>
                  🖨 Imprimir comprovante
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex gap-2 overflow-x-auto custom-scrollbar">
          {aba1('conferir', 'Aguardando conferência', aguardando.length)}
          {aba1('estoque', 'Em estoque', estoque.length)}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative sm:w-80">
            <Icon nome="search" className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar escola, responsável ou cidade" className={`${inputCls} !py-2.5 pl-10`} />
          </div>
          <select value={cidade} onChange={(e) => setCidade(e.target.value)} className={`${inputCls} !py-2.5 sm:w-56`}>
            <option value="">Todas as cidades</option>
            {cidades.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {aba === 'conferir' ? (
        <div className="space-y-4">
          {filtrar(aguardando).length === 0 ? (
            <Panel>
              <EmptyState titulo="Nenhuma caixa aguardando" descricao="Quando a Revelação soltar uma caixa no app dela, ela aparece aqui para a conferência." />
            </Panel>
          ) : (
            filtrar(aguardando)
              .sort((a, b) => String(a.data).localeCompare(String(b.data)) || Number(a.numero) - Number(b.numero))
              .map((c) => <CaixaConferir key={c.id} caixa={c} lote={lotes.get(String(c.loteId))} revelacao={nome(c.registradoPor)} onConferida={() => setConferidas((x) => [...x, c.id])} />)
          )}
        </div>
      ) : (
        <EmEstoque caixas={filtrar(estoque)} lotes={lotes} nome={nome} onImprimir={comprovante} />
      )}
    </div>
  )
}

// Uma caixa para conferir (igual ao controle de conferência antigo): informado × conferido
function CaixaConferir({ caixa: c, lote: l, revelacao, onConferida }: { caixa: Registro; lote?: Registro; revelacao: string; onConferida: () => void }) {
  const podeFazer = usePode()
  const [albuns, setAlbuns] = useState(String(c.albuns))
  const [posteres, setPosteres] = useState(String(c.posteres ?? 0))
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const informado = (Number(c.albuns) || 0) + (Number(c.posteres) || 0)
  const conferido = (Number(albuns) || 0) + (Number(posteres) || 0)
  const bate = Number(albuns) === Number(c.albuns) && Number(posteres) === Number(c.posteres)
  const confirmar = async () => {
    setEnviando(true)
    const erro = await conferirCaixa(c.id, { albuns: Number(albuns), posteres: Number(posteres), observacao: obs })
    setEnviando(false)
    if (!erro) onConferida()
  }
  return (
    <div className="bg-painel/80 border border-white/[0.06] rounded-3xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Data <span className="text-white">{dataBR(String(c.data))}</span>
            {revelacao ? <> • solta por <span className="text-white">{revelacao}</span></> : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full border border-orange-500/40 bg-orange-500/10 text-orange-300 text-[10px] font-black uppercase tracking-widest">📍 {cidadeDe(l)}</span>
            <span className="px-3 py-1 rounded-full border border-blue-500/40 bg-blue-500/10 text-blue-300 text-[10px] font-black uppercase tracking-widest">🏫 {String(l?.escola ?? '')}</span>
            <span className="px-3 py-1 rounded-full border border-white/20 bg-white/[0.05] text-white text-[10px] font-black uppercase tracking-widest">📦 Caixa {String(c.numero)}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Qtd. informada</p>
          <p className="text-xl font-black text-white">
            {num(Number(c.albuns))} álbuns{Number(c.posteres) > 0 ? <span className="text-sm text-zinc-400"> + {num(Number(c.posteres))} pôster/brinde</span> : null}
          </p>
        </div>
      </div>
      {!!c.observacao && <p className="text-xs text-zinc-400">Obs. da Revelação: {String(c.observacao)}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="space-y-1.5">
          <span className={labelCls}>Álbuns</span>
          <input type="number" min={0} value={albuns} onChange={(e) => setAlbuns(e.target.value)} className={inputCls} />
        </label>
        <label className="space-y-1.5">
          <span className={labelCls}>Pôster/Brinde</span>
          <input type="number" min={0} value={posteres} onChange={(e) => setPosteres(e.target.value)} className={inputCls} />
        </label>
        <div className="space-y-1.5">
          <span className={labelCls}>Total</span>
          <p className={`rounded-xl border-2 px-4 py-3 text-sm font-black ${bate ? 'border-emerald-500/60 text-emerald-300' : 'border-red-500/60 text-red-300'}`}>
            {num(conferido)} / {num(informado)}
            {!bate && <span className="ml-2 text-[10px] uppercase tracking-widest">não bate</span>}
          </p>
        </div>
      </div>
      <label className="block space-y-1.5">
        <span className={labelCls}>Observação{bate ? ' (opcional)' : ' (obrigatória: não bateu)'}</span>
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder={bate ? 'Observação (opcional)' : 'Explique a diferença: ex.: faltou 1 álbum, veio 1 pôster a mais'} className={inputCls} />
      </label>
      {podeFazer('edicao', 'editar') && (
        <div className="flex justify-end">
          <button disabled={enviando || (!bate && !obs.trim())} onClick={confirmar} className={`${btnPrimario} !bg-red-600 hover:!bg-red-500`}>
            ✓ Confirmar conferência
          </button>
        </div>
      )}
    </div>
  )
}

// Caixas conferidas e lacradas, agrupadas por escola (com o comprovante para reimprimir)
function EmEstoque({ caixas, lotes, nome, onImprimir }: { caixas: Registro[]; lotes: Map<string, Registro>; nome: (id: unknown) => string; onImprimir: (c: Registro) => void }) {
  if (caixas.length === 0)
    return (
      <Panel>
        <EmptyState titulo="Nenhuma caixa em estoque" descricao="As caixas conferidas aparecem aqui, com o comprovante para reimprimir." />
      </Panel>
    )
  const porEscola = new Map<string, Registro[]>()
  for (const c of caixas) porEscola.set(String(c.loteId), [...(porEscola.get(String(c.loteId)) ?? []), c])
  const grupos = [...porEscola.entries()].sort((a, b) => String(lotes.get(a[0])?.escola).localeCompare(String(lotes.get(b[0])?.escola)))
  return (
    <div className="space-y-4">
      {grupos.map(([loteId, cx]) => {
        const l = lotes.get(loteId)
        const total = cx.reduce((a, c) => a + (Number(c.conferidoAlbuns ?? c.albuns) || 0), 0)
        return (
          <Panel key={loteId} semPadding titulo={String(l?.escola ?? '')} subtitulo={`${cidadeDe(l)} • ${cx.length} caixa(s) • ${num(total)} álbuns em estoque`}>
            <div className="divide-y divide-white/[0.04]">
              {cx
                .sort((a, b) => Number(a.numero) - Number(b.numero))
                .map((c) => (
                  <div key={c.id} className="px-6 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm">
                      <span className="font-black text-white">📦 Caixa {String(c.numero)}</span>
                      <span className="text-zinc-300">
                        {' '}
                        • {num(Number(c.conferidoAlbuns))} álbuns
                        {Number(c.conferidoPosteres) > 0 ? ` + ${num(Number(c.conferidoPosteres))} pôster/brinde` : ''}
                      </span>
                      <span className="block text-[11px] text-zinc-500">
                        conferida em {dataBR(String(c.conferidoEm))}
                        {nome(c.conferidoPor) ? ` por ${nome(c.conferidoPor)}` : ''}
                        {c.conferenciaObs ? ` • Obs.: ${String(c.conferenciaObs)}` : ''}
                      </span>
                    </div>
                    <button onClick={() => onImprimir(c)} className={btnSecundario}>
                      🖨 Comprovante
                    </button>
                  </div>
                ))}
            </div>
          </Panel>
        )
      })}
    </div>
  )
}
