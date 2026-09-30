'use client'

import { useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { trazerParaProducao, useErp, usePode } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { dataBR, mesAtual, num } from '@/lib/erp/format'
import { ETAPAS_EM_PRODUCAO, ETAPAS_LOTE, TOM_ETAPA, etapaDoLote, indiceEtapa, lotesProducao, visitasForaDaProducao, type EtapaLote } from '@/lib/erp/producao'
import { Badge, EmptyState, PageHeader, Panel, StatCard, TONS, btnPrimario, btnSecundario, inputCls } from '@/components/erp/ui'
import LoteDetalhe from '@/components/edicao/LoteDetalhe'

// PRODUÇÃO › Controle: a planilha da Produção dentro do sistema. Uma linha por escola (visita encerrada nas Operações),
// com a etapa em que está: Aguardando fotos → Em edição → Análise de qualidade → Conferência final → Aguardando revelação
// → Revelando → Na caixa. Retorno fica em laranja, como na planilha.

type Filtro = 'andamento' | EtapaLote
const soma = (ls: Registro[]) => ls.reduce((a, l) => a + (Number(l.albuns) || 0), 0)
const curta = (iso: unknown) => (iso ? dataBR(String(iso)).slice(0, 5) : '—')

export default function ControleProducaoPage() {
  const s = useErp()
  const podeFazer = usePode()
  // trazer escolas antigas: quem opera a Produção e enxerga a agenda das Operações (ADM/Gerência)
  const pTrazer = podeFazer('edicao', 'editar') && podeFazer('operacional', 'visualizar')
  const [filtro, setFiltro] = useState<Filtro>('andamento')
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null) // escola aberta na janela das etapas

  const lotes = lotesProducao(s)
  const editores = new Map(colecao(s, 'editores').map((e) => [e.id, String(e.nome)]))
  const mes = mesAtual()
  const emProducao = lotes.filter((l) => ETAPAS_EM_PRODUCAO.includes(etapaDoLote(l)))
  const comEditores = lotes.filter((l) => etapaDoLote(l) === 'Em edição')
  const entreguesMes = lotes.filter((l) => String(l.confirmadoEm).startsWith(mes))

  const termo = busca.trim().toLowerCase()
  const lista = lotes
    .filter((l) => (filtro === 'andamento' ? etapaDoLote(l) !== 'Na caixa' : etapaDoLote(l) === filtro))
    .filter((l) => !termo || [l.escola, l.cidade, l.vendedor, editores.get(String(l.editorId))].some((x) => String(x ?? '').toLowerCase().includes(termo)))
    .sort((a, b) => String(a.dataFoto).localeCompare(String(b.dataFoto)) || String(a.escola).localeCompare(String(b.escola)))

  const pill = (ativo: boolean) =>
    `rounded-2xl border px-4 py-3 text-left transition-all ${ativo ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'}`
  const th = 'px-4 py-4 font-bold whitespace-nowrap'

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Módulo / Produção"
        titulo="Controle da produção"
        descricao="Cada escola fotografada chega sozinha das Operações. Clique numa escola para ver as etapas e passar para a próxima: fotos, editor, análise de qualidade, conferência final e Revelação."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard tom="pink" label="Restante para produzir" valor={num(soma(emProducao))} detalhe={`álbuns • ${emProducao.length} escola(s) na Produção`} />
        <StatCard tom="blue" label="Com os editores" valor={num(soma(comEditores))} detalhe={`álbuns • ${comEditores.length} escola(s) em edição`} />
        <StatCard tom="emerald" label="Entregues à Revelação no mês" valor={num(soma(entreguesMes))} detalhe={`álbuns • ${entreguesMes.length} escola(s) confirmada(s)`} />
      </div>

      {/* Etapas: clicar filtra a lista */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <button onClick={() => setFiltro('andamento')} className={pill(filtro === 'andamento')}>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-300">Em andamento</p>
          <p className="text-xl font-black text-white mt-1">{lotes.filter((l) => etapaDoLote(l) !== 'Na caixa').length}</p>
          <p className="text-[10px] text-zinc-500">escolas</p>
        </button>
        {ETAPAS_LOTE.map((e) => {
          const ls = lotes.filter((l) => etapaDoLote(l) === e)
          return (
            <button key={e} onClick={() => setFiltro(e)} className={pill(filtro === e)}>
              <p className={`text-[10px] font-black uppercase tracking-widest ${TONS[TOM_ETAPA[e]].texto}`}>{e}</p>
              <p className="text-xl font-black text-white mt-1">{ls.length}</p>
              <p className="text-[10px] text-zinc-500">{num(soma(ls))} álbuns</p>
            </button>
          )
        })}
      </div>

      <Panel
        semPadding
        titulo={filtro === 'andamento' ? 'Escolas em andamento' : filtro}
        subtitulo={`${lista.length} escola(s) • ${num(lista.reduce((a, l) => a + (Number(l.alunos) || 0), 0))} alunos • ${num(soma(lista))} álbuns`}
        acoes={<input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar escola, cidade, vendedor ou editor" className={`${inputCls} !py-2.5 w-72 max-w-full`} />}
      >
        {lista.length === 0 ? (
          <EmptyState titulo="Nenhuma escola aqui" descricao="Quando uma visita é encerrada nas Operações, a escola aparece aqui aguardando as fotos." />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className={th}>Vendedor</th>
                  <th className={th}>Data da foto</th>
                  <th className={th}>Escola</th>
                  <th className={`${th} text-right`}>Álbuns</th>
                  <th className={th}>Fotos</th>
                  <th className={th}>Editor</th>
                  <th className={`${th} text-right`}>Etapa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {lista.map((l) => {
                  const etapa = etapaDoLote(l)
                  const retorno = !!l.retorno
                  const alunos = Number(l.alunos) || 0
                  const albuns = Number(l.albuns) || 0
                  return (
                    <tr
                      key={l.id}
                      onClick={() => setAberto(l.id)}
                      title="Abrir as etapas desta escola"
                      className={`cursor-pointer ${retorno ? 'bg-orange-500/[0.07] hover:bg-orange-500/[0.12]' : 'hover:bg-white/[0.03]'}`}
                    >
                      <td className="px-4 py-3 text-xs font-bold text-zinc-300 min-w-[130px] max-w-[190px]">{String(l.vendedor || '—')}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-white font-bold">{dataBR(String(l.dataFoto))}</span>
                        {retorno && <span className="block text-[10px] font-black uppercase tracking-widest text-orange-400">↺ Retorno</span>}
                      </td>
                      <td className="px-4 py-3 min-w-[220px]">
                        <span className="block text-white font-bold">{String(l.escola)}</span>
                        <span className="block text-[11px] text-zinc-500">
                          {String(l.cidade)}
                          {l.uf ? `/${String(l.uf)}` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="font-black text-white">{num(albuns)}</span>
                        {alunos !== albuns && <span className="block text-[10px] text-zinc-500">{num(alunos)} alunos</span>}
                        {Number(l.posteres) > 0 && <span className="block text-[10px] text-zinc-500">+ {num(Number(l.posteres))} pôster</span>}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {l.fotosRecebidasEm ? (
                          <span className="font-bold text-emerald-400">✓ {curta(l.fotosRecebidasEm)}</span>
                        ) : indiceEtapa(l) > 0 ? (
                          <span className="font-bold text-emerald-400">✓</span>
                        ) : (
                          <span className="text-zinc-500">aguardando</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span className="block text-white font-bold">{editores.get(String(l.editorId)) ?? '—'}</span>
                        {!!l.enviadoEditorEm && (
                          <span className="block text-[10px] text-zinc-500">
                            enviado {curta(l.enviadoEditorEm)}
                            {l.devolvidoEditorEm ? ` • voltou ${curta(l.devolvidoEditorEm)}` : ''}
                          </span>
                        )}
                        {Number(l.voltas) > 0 && (
                          <span className="block text-[10px] font-bold text-red-400">
                            ↩ {num(Number(l.voltas))} volta(s) • {num(Number(l.reprovados))} álbum(ns) reprovado(s)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Badge texto={etapa} tom={TOM_ETAPA[etapa]} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {pTrazer && <TrazerEscolas />}
      <LoteDetalhe loteId={aberto} onFechar={() => setAberto(null)} />
    </div>
  )
}

// Escolas encerradas antes do controle existir: o ADM escolhe quais ainda estão em andamento e traz para a Produção
function TrazerEscolas() {
  const s = useErp()
  const fora = visitasForaDaProducao(s)
  const [aberto, setAberto] = useState(false)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  if (!fora.length) return null
  const vendedores = new Map(colecao(s, 'pj_vendedores').map((v) => [v.id, String(v.nome)]))
  const alternar = (id: string) => {
    const n = new Set(marcadas)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setMarcadas(n)
  }
  const trazer = async () => {
    setEnviando(true)
    await trazerParaProducao([...marcadas])
    setEnviando(false)
    setMarcadas(new Set())
  }

  return (
    <Panel
      titulo={`Escolas já fotografadas fora da Produção (${fora.length})`}
      subtitulo="Visitas encerradas antes do controle. Traga só as que ainda estão em andamento."
      acoes={
        <button onClick={() => setAberto(!aberto)} className={btnSecundario}>
          {aberto ? 'Fechar' : 'Ver e trazer'}
        </button>
      }
    >
      {aberto && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => setMarcadas(marcadas.size === fora.length ? new Set() : new Set(fora.map((v) => v.id)))} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">
              {marcadas.size === fora.length ? 'Desmarcar todas' : 'Marcar todas'}
            </button>
            <button onClick={trazer} disabled={!marcadas.size || enviando} className={btnPrimario}>
              {enviando ? 'Trazendo...' : `Trazer ${marcadas.size || ''} para a Produção`}
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto custom-scrollbar divide-y divide-white/[0.04] rounded-2xl border border-white/[0.06]">
            {fora.map((v) => (
              <label key={v.id} className={`flex items-center gap-4 px-4 py-3 cursor-pointer ${v.retornoDe ? 'bg-orange-500/[0.07]' : 'hover:bg-white/[0.02]'}`}>
                <input type="checkbox" checked={marcadas.has(v.id)} onChange={() => alternar(v.id)} className="w-4 h-4 accent-blue-500" />
                <span className="w-24 shrink-0 text-xs font-bold text-white">{dataBR(String(v.data))}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-white truncate">
                    {String(v.escola)}
                    {v.retornoDe ? <span className="text-orange-400 text-[10px] font-black uppercase tracking-widest"> • ↺ Retorno</span> : null}
                  </span>
                  <span className="block text-[11px] text-zinc-500">
                    {String(v.cidade)}/{String(v.uf)} • {vendedores.get(String(v.vendedorId)) ?? 'sem vendedor'}
                  </span>
                </span>
                <span className="text-sm font-black text-white whitespace-nowrap">{num(Number(v.fichasFotografadas))} alunos</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}
