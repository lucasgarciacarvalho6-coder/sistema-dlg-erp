'use client'

import { useMemo, useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { atualizarRegistro, conferirCaixa, useErp, usePode } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { dataBR, hoje, num } from '@/lib/erp/format'
import { diasUteisDepois } from '@/lib/erp/calendario'
import { PALETA_CIDADES, corDaCidade, lotesProducao, nomeDaCor } from '@/lib/erp/producao'
import { EmptyState, PageHeader, Panel, StatCard, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import Icon from '@/components/erp/Icon'
import { imprimirComprovantes, type Comprovante } from '@/components/edicao/comprovante'
import { FichaEstoqueEscola, TabelaEstoqueEscolas } from '@/components/erp/EstoqueAlbuns'
import { estoquePorEscola } from '@/lib/erp/estoque'

// PRODUÇÃO › Estoque: a Revelação solta as caixas (app dela) → a Produção confere cada caixa →
// confirmou: imprime o comprovante (etiqueta na COR DA CIDADE: cidade, escola, álbuns e pôster/brindes),
// lacra e a caixa entra no ESTOQUE. Cada cidade tem a sua cor (dá para trocar em "Cores das cidades").
// Dá para marcar vários comprovantes e imprimir juntos: 2 por folha A4 (economiza a folha).
// Situação por escola (SÓ PARA CONFERIR): as caixas que saíram com os vendedores, vendidos, o que voltou e o Rebolo.
// Quem monta a carga, acerta e encaminha ao Rebolo é o Financeiro (Financeiro › Estoque e Cargas).

type Aba = 'conferir' | 'estoque' | 'situacao'
const cidadeDe = (l?: Registro) => (l ? `${String(l.cidade)}${l.uf ? `/${String(l.uf)}` : ''}` : '')

// bolinha com a cor da cidade (a mesma do comprovante)
function SeloCor({ cor, nome }: { cor: string; nome?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-block w-3.5 h-3.5 rounded-full ring-1 ring-white/40" style={{ backgroundColor: cor }}></span>
      {nome && <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">{nome}</span>}
    </span>
  )
}

export default function EstoquePage() {
  const s = useErp()
  const [aba, setAba] = useState<Aba>('conferir')
  const [busca, setBusca] = useState('')
  const [cidade, setCidade] = useState('')
  const [conferidas, setConferidas] = useState<string[]>([]) // conferidas agora: botão do comprovante no topo
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set()) // comprovantes marcados para imprimir juntos
  const [fichaEscola, setFichaEscola] = useState<string | null>(null) // situação por escola (só ver)
  const situacao = useMemo(() => estoquePorEscola(s), [s])

  const lotes = new Map(lotesProducao(s).map((l) => [l.id, l]))
  const nome = (id: unknown) => s.colaboradores.find((c) => c.id === id)?.nome ?? ''
  const caixas = colecao(s, 'producao_caixas').filter((c) => lotes.has(String(c.loteId)))
  const aguardando = caixas.filter((c) => c.status === 'Aguardando conferência')
  // amarelo só quando tem caixa esperando a conferência há mais de 1 dia útil (mesma regra do gerente virtual)
  const aguardandoMaisDeUmDia = aguardando.some((c) => diasUteisDepois(String(c.data).slice(0, 10), hoje()) > 1)
  const estoque = caixas.filter((c) => c.status === 'Em estoque')
  const comVendedores = caixas.filter((c) => c.status === 'Em carga') // saíram na carga do Financeiro
  const cidades = [...new Set(caixas.map((c) => cidadeDe(lotes.get(String(c.loteId)))).filter(Boolean))].sort()
  const soma = (ls: Registro[], campo: string) => ls.reduce((a, c) => a + (Number(c[campo]) || 0), 0)

  const termo = busca.trim().toLowerCase()
  const filtrar = (ls: Registro[]) =>
    ls.filter((c) => {
      const l = lotes.get(String(c.loteId))
      if (cidade && cidadeDe(l) !== cidade) return false
      return !termo || [l?.escola, cidadeDe(l), nome(c.registradoPor), nome(c.conferidoPor)].some((x) => String(x ?? '').toLowerCase().includes(termo))
    })
  const corDe = (l?: Registro) => corDaCidade(s, l?.cidade, l?.uf)
  const dadosComprovante = (c: Registro): Comprovante => {
    const l = lotes.get(String(c.loteId))
    return {
      escola: String(l?.escola ?? ''),
      cidade: String(l?.cidade ?? ''),
      uf: String(l?.uf ?? ''),
      numero: Number(c.numero),
      albuns: Number(c.conferidoAlbuns ?? c.albuns),
      posteres: Number(c.conferidoPosteres ?? c.posteres) || 0,
      data: String(c.conferidoEm),
      cor: corDe(l).cor,
    }
  }
  const comprovante = (c: Registro) => imprimirComprovantes([dadosComprovante(c)])
  const recentes = caixas.filter((c) => conferidas.includes(c.id) && c.status === 'Em estoque')

  // marcar vários comprovantes e imprimir juntos (2 por folha), na ordem da lista: escola e número da caixa
  const alternar = (id: string) => {
    const n = new Set(marcadas)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setMarcadas(n)
  }
  const marcarTodas = (ids: string[]) => {
    const n = new Set(marcadas)
    const todas = ids.every((id) => n.has(id))
    for (const id of ids) {
      if (todas) n.delete(id)
      else n.add(id)
    }
    setMarcadas(n)
  }
  const selecionadas = estoque
    .filter((c) => marcadas.has(c.id))
    .sort((a, b) => {
      const la = lotes.get(String(a.loteId))
      const lb = lotes.get(String(b.loteId))
      return String(la?.escola).localeCompare(String(lb?.escola)) || String(a.loteId).localeCompare(String(b.loteId)) || Number(a.numero) - Number(b.numero)
    })
  const folhas = Math.ceil(selecionadas.length / 2)
  const imprimirSelecionados = () => {
    if (imprimirComprovantes(selecionadas.map(dadosComprovante))) setMarcadas(new Set()) // impressos: desmarca para não repetir
  }
  const todasMarcadas = (ids: string[]) => ids.length > 0 && ids.every((id) => marcadas.has(id))

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard tom={aguardandoMaisDeUmDia ? 'yellow' : 'zinc'} label="Aguardando conferência" valor={num(aguardando.length)} detalhe={`caixa(s) • ${num(soma(aguardando, 'albuns'))} álbuns`} />
        <StatCard label="Em estoque" valor={num(estoque.length)} detalhe={`caixa(s) • ${num(estoque.reduce((a, c) => a + (Number(c.conferidoAlbuns ?? c.albuns) || 0), 0))} álbuns`} />
        <StatCard label="Com os vendedores" valor={num(comVendedores.length)} detalhe={`caixa(s) em venda • ${num(comVendedores.reduce((a, c) => a + (Number(c.conferidoAlbuns ?? c.albuns) || 0), 0))} álbuns`} />
      </div>

      {/* acabou de conferir: o comprovante para imprimir e lacrar */}
      {recentes.length > 0 && (
        <div className="rounded-2xl border border-white/[0.1] bg-white/[0.03] p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Conferidas agora — imprima o comprovante e lacre a caixa</p>
            {recentes.length > 1 && (
              <button onClick={() => marcarTodas(recentes.map((c) => c.id))} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">
                {todasMarcadas(recentes.map((c) => c.id)) ? 'Desmarcar todas' : 'Selecionar todas'}
              </button>
            )}
          </div>
          {recentes.map((c) => {
            const l = lotes.get(String(c.loteId))
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3">
                <label className="text-sm text-white flex flex-wrap items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={marcadas.has(c.id)} onChange={() => alternar(c.id)} className="w-4 h-4 accent-blue-500" />
                  <SeloCor cor={corDe(l).cor} nome={corDe(l).nome} />
                  <strong>Caixa {String(c.numero)}</strong> • {String(l?.escola)} • {cidadeDe(l)} • <strong>{num(Number(c.conferidoAlbuns))} álbuns</strong>
                </label>
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
          {aba1('situacao', 'Situação por escola', situacao.length)}
        </div>
        <div className={`flex flex-col sm:flex-row gap-3 ${aba === 'situacao' ? 'hidden' : ''}`}>
          <div className="relative sm:w-80">
            <Icon nome="search" className="icone-busca w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar escola, responsável ou cidade" className={`campo-busca ${inputCls} !py-2.5 pl-10`} />
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
              .map((c) => (
                <CaixaConferir key={c.id} caixa={c} lote={lotes.get(String(c.loteId))} cor={corDe(lotes.get(String(c.loteId)))} revelacao={nome(c.registradoPor)} onConferida={() => setConferidas((x) => [...x, c.id])} />
              ))
          )}
        </div>
      ) : aba === 'estoque' ? (
        <EmEstoque caixas={filtrar(estoque)} lotes={lotes} nome={nome} corDe={corDe} onImprimir={comprovante} marcadas={marcadas} onAlternar={alternar} onMarcarTodas={marcarTodas} />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">Só para conferir se bate com as caixas: quem monta a carga do vendedor, acerta na volta e encaminha ao Rebolo é o Financeiro.</p>
          <TabelaEstoqueEscolas escolas={situacao} onAbrir={setFichaEscola} />
        </div>
      )}
      {fichaEscola && situacao.find((e) => e.lote.id === fichaEscola) && (
        <FichaEstoqueEscola s={s} e={situacao.find((e) => e.lote.id === fichaEscola)!} podeMexer={false} onFechar={() => setFichaEscola(null)} />
      )}

      <CoresDasCidades />

      {/* selecionados: imprime todos juntos, 2 por folha (fica preso no rodapé da tela) */}
      {selecionadas.length > 0 && (
        <div className="sticky bottom-4 z-30 mx-auto max-w-3xl rounded-2xl border border-blue-500/40 bg-black/95 shadow-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white">
            <strong>{selecionadas.length === 1 ? '1 comprovante selecionado' : `${num(selecionadas.length)} comprovantes selecionados`}</strong> •{' '}
            {folhas === 1 ? '1 folha A4' : `${num(folhas)} folhas A4`}
            <span className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">2 por folha: 1 em cima e 1 embaixo</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setMarcadas(new Set())} className={btnSecundario}>
              Limpar
            </button>
            <button onClick={imprimirSelecionados} className={btnPrimario}>
              🖨 Imprimir selecionados
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Cores das cidades: a 1ª caixa de cada cidade ganha uma cor sozinha; aqui a Produção pode trocar
function CoresDasCidades() {
  const s = useErp()
  const podeFazer = usePode()
  const cores = colecao(s, 'producao_cores_cidade').sort((a, b) => String(a.cidade).localeCompare(String(b.cidade)))
  if (!cores.length) return null
  const cidadeTxt = (c: Registro) => `${String(c.cidade)}${c.uf ? `-${String(c.uf)}` : ''}`
  const usadaPor = (cor: string, menos: string) =>
    cores.filter((c) => c.id !== menos && String(c.cor).toLowerCase() === cor.toLowerCase()).map(cidadeTxt)
  return (
    <Panel titulo="Cores das cidades" subtitulo="cada cidade sai sempre na mesma cor no comprovante • a 1ª caixa da cidade ganha a cor sozinha">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {cores.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <span className="w-9 h-9 rounded-xl shrink-0 ring-1 ring-white/30" style={{ backgroundColor: String(c.cor) }}></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-white truncate">{cidadeTxt(c)}</p>
              {podeFazer('edicao', 'editar') ? (
                <select
                  value={String(c.cor).toUpperCase()}
                  onChange={(e) => void atualizarRegistro('producao_cores_cidade', c.id, { cor: e.target.value }, 'edicao')}
                  className="mt-1 w-full bg-black/50 border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white"
                >
                  {PALETA_CIDADES.map((p) => {
                    const outras = usadaPor(p.cor, c.id)
                    return (
                      <option key={p.cor} value={p.cor.toUpperCase()}>
                        {p.nome}
                        {outras.length ? ` (também: ${outras.join(', ')})` : ''}
                      </option>
                    )
                  })}
                </select>
              ) : (
                <p className="text-[11px] text-zinc-400">{nomeDaCor(String(c.cor))}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

// Uma caixa para conferir (igual ao controle de conferência antigo): informado × conferido
function CaixaConferir({ caixa: c, lote: l, cor, revelacao, onConferida }: { caixa: Registro; lote?: Registro; cor: { cor: string; nome: string }; revelacao: string; onConferida: () => void }) {
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
            <span className="px-3 py-1 rounded-full text-white text-[10px] font-black uppercase tracking-widest ring-1 ring-white/30" style={{ backgroundColor: cor.cor }} title={`Cor da cidade: ${cor.nome}`}>
              📍 {cidadeDe(l)} • {cor.nome}
            </span>
            <span className="px-3 py-1 rounded-full border border-white/[0.15] bg-white/[0.04] text-zinc-200 text-[10px] font-black uppercase tracking-widest">🏫 {String(l?.escola ?? '')}</span>
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
          <button disabled={enviando || (!bate && !obs.trim())} onClick={confirmar} className={btnPrimario}>
            ✓ Confirmar conferência
          </button>
        </div>
      )}
    </div>
  )
}

// Caixas conferidas e lacradas, agrupadas por escola (com o comprovante para reimprimir, um ou vários juntos)
function EmEstoque({
  caixas,
  lotes,
  nome,
  corDe,
  onImprimir,
  marcadas,
  onAlternar,
  onMarcarTodas,
}: {
  caixas: Registro[]
  lotes: Map<string, Registro>
  nome: (id: unknown) => string
  corDe: (l?: Registro) => { cor: string; nome: string }
  onImprimir: (c: Registro) => void
  marcadas: Set<string>
  onAlternar: (id: string) => void
  onMarcarTodas: (ids: string[]) => void
}) {
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
        const ids = cx.map((c) => c.id)
        return (
          <Panel
            key={loteId}
            semPadding
            titulo={
              <span className="flex items-center gap-2">
                <SeloCor cor={corDe(l).cor} /> {String(l?.escola ?? '')}
              </span>
            }
            subtitulo={`${cidadeDe(l)} • cor ${corDe(l).nome} • ${cx.length} caixa(s) • ${num(total)} de ${num(Number(l?.albuns) || 0)} álbuns em estoque`}
            acoes={
              cx.length > 1 && (
                <button onClick={() => onMarcarTodas(ids)} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">
                  {ids.every((id) => marcadas.has(id)) ? 'Desmarcar todas' : 'Selecionar todas'}
                </button>
              )
            }
          >
            <div className="divide-y divide-white/[0.04]">
              {cx
                .sort((a, b) => Number(a.numero) - Number(b.numero))
                .map((c) => (
                  <div key={c.id} className={`px-6 py-3 flex flex-wrap items-center justify-between gap-3 ${marcadas.has(c.id) ? 'bg-blue-500/[0.06]' : ''}`}>
                    <label className="flex items-center gap-4 text-sm cursor-pointer">
                      <input type="checkbox" checked={marcadas.has(c.id)} onChange={() => onAlternar(c.id)} className="w-4 h-4 shrink-0 accent-blue-500" />
                      <span>
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
                      </span>
                    </label>
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
