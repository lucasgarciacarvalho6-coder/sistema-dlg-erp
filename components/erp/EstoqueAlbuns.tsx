'use client'

// Estoque de álbuns por escola (SQL 029): a mesma tabela e a mesma ficha no FINANCEIRO (que mexe) e na PRODUÇÃO (só vê,
// para conferir se bate com as caixas). Cor só para alerta: amarelo = aguardando o Rebolo / diferença registrada.

import { useState } from 'react'
import type { ErpState } from '@/lib/erp/types'
import { dataBR, num } from '@/lib/erp/format'
import { extratoDaEscola, situacaoDaCaixa, albunsDaCaixa, posteresDaCaixa, rotuloLote, type EstoqueEscola, type Quantidade } from '@/lib/erp/estoque'
import { colecao } from '@/lib/erp/metrics'
import { desfazerEnvioRebolo, enviarRebolo } from '@/lib/erp/store'
import { EmptyState, Modal, Panel, btnPrimario, btnSecundario, inputCls, labelCls } from './ui'
import Icon from './Icon'

const pos = (q: Quantidade) => (q.posteres ? ` • ${num(q.posteres)} pôst.` : '')

// número grande (álbuns) + detalhe pequeno (pôsteres/brindes e o que mais vier)
function Qtd({ q, detalhe, alerta = false }: { q: Quantidade; detalhe?: string; alerta?: boolean }) {
  if (!q.albuns && !q.posteres) return <span className="text-zinc-600">—</span>
  return (
    <span className="block leading-tight">
      <span className={`font-black ${alerta ? 'text-yellow-400' : 'text-white'}`}>{num(q.albuns)}</span>
      <span className="text-zinc-500 text-[11px]"> álbuns{pos(q)}</span>
      {detalhe && <span className="block text-[10px] text-zinc-500 truncate">{detalhe}</span>}
    </span>
  )
}

type Filtro = '' | 'estoque' | 'venda' | 'rebolo' | 'diferenca'

export function TabelaEstoqueEscolas({ escolas, onAbrir }: { escolas: EstoqueEscola[]; onAbrir: (loteId: string) => void }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('')
  const termo = busca.trim().toLowerCase()
  const lista = escolas
    .filter((e) => !termo || `${e.escola} ${e.cidade} ${e.uf}`.toLowerCase().includes(termo))
    .filter(
      (e) =>
        !filtro ||
        (filtro === 'estoque' && e.emEstoque.caixas.length > 0) ||
        (filtro === 'venda' && e.emVenda.caixas.length > 0) ||
        (filtro === 'rebolo' && e.aguardandoRebolo.albuns + e.aguardandoRebolo.posteres > 0) ||
        (filtro === 'diferenca' && e.diferenca.albuns + e.diferenca.posteres > 0),
    )
  return (
    <Panel
      semPadding
      titulo={`Estoque por escola • ${lista.length}`}
      acoes={
        <div className="flex flex-wrap gap-2">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} className="bg-black/50 border border-white/[0.05] rounded-xl px-3 py-2.5 text-xs text-white outline-none">
            <option value="">Todas as escolas</option>
            <option value="estoque">Com caixas no estoque</option>
            <option value="venda">Em venda (com vendedor)</option>
            <option value="rebolo">Aguardando o Rebolo</option>
            <option value="diferenca">Com diferença no acerto</option>
          </select>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar escola ou cidade..." className="campo-busca bg-black/50 border border-white/[0.05] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 w-60" />
        </div>
      }
    >
      {lista.length === 0 ? (
        <EmptyState titulo="Nenhuma escola aqui" descricao="As caixas entram no estoque quando a Produção confere (Produção › Estoque)." />
      ) : (
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
              <tr>
                <th className="px-4 py-4 font-bold">Escola</th>
                <th className="px-4 py-4 font-bold">Em estoque</th>
                <th className="px-4 py-4 font-bold">Em venda</th>
                <th className="px-4 py-4 font-bold">Vendidos</th>
                <th className="px-4 py-4 font-bold">Aguardando Rebolo</th>
                <th className="px-4 py-4 font-bold">Foram ao Rebolo</th>
                <th className="px-4 py-4 font-bold">Diferença</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.02]">
              {lista.map((e) => (
                <tr key={e.lote.id} onClick={() => onAbrir(e.lote.id)} className="hover:bg-white/[0.03] cursor-pointer transition-colors">
                  <td className="px-4 py-3.5 min-w-[220px]">
                    <p className="text-white font-bold">{e.escola}</p>
                    <p className="text-[11px] text-zinc-500">
                      {e.cidade}
                      {e.uf ? `-${e.uf}` : ''}
                      {rotuloLote(e) ? ` • ${rotuloLote(e)}` : ''} • {num(e.caixas.length)} caixa(s) conferida(s)
                      {e.aguardandoConferencia ? ` • ${e.aguardandoConferencia} a conferir na Produção` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 min-w-[130px]">
                    <Qtd q={e.emEstoque} detalhe={e.emEstoque.caixas.length ? `${e.emEstoque.caixas.length} caixa(s)` : undefined} />
                  </td>
                  <td className="px-4 py-3.5 min-w-[150px]">
                    <Qtd q={e.emVenda} detalhe={e.emVenda.cargas.map((c) => `Carga ${c.numero} • ${c.vendedor}`).join(' • ')} />
                  </td>
                  <td className="px-4 py-3.5">
                    <Qtd q={e.vendidos} />
                  </td>
                  <td className="px-4 py-3.5">
                    <Qtd q={e.aguardandoRebolo} alerta />
                  </td>
                  <td className="px-4 py-3.5">
                    <Qtd q={e.rebolo} />
                  </td>
                  <td className="px-4 py-3.5">
                    <Qtd q={e.diferenca} alerta />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

// Ficha da escola: números, caixas (com a situação de cada uma), envios ao Rebolo e o extrato.
// podeMexer = Financeiro (encaminhar ao Rebolo / desfazer o envio); a Produção só vê.
export function FichaEstoqueEscola({ s, e, podeMexer, onFechar }: { s: ErpState; e: EstoqueEscola; podeMexer: boolean; onFechar: () => void }) {
  const [alb, setAlb] = useState(String(Math.max(0, e.aguardandoRebolo.albuns)))
  const [pst, setPst] = useState(String(Math.max(0, e.aguardandoRebolo.posteres)))
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [desfazer, setDesfazer] = useState<string | null>(null)
  const extrato = extratoDaEscola(s, e.lote.id)
  const envios = colecao(s, 'estoque_envios_rebolo')
    .filter((r) => r.loteId === e.lote.id)
    .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))
  const aguardando = e.aguardandoRebolo.albuns + e.aguardandoRebolo.posteres > 0
  const encaminhar = async () => {
    setErro('')
    const a = Number(alb) || 0
    const p = Number(pst) || 0
    if (a + p <= 0) return setErro('Informe quantos álbuns (e pôsteres/brindes) vão para o Rebolo.')
    setSalvando(true)
    const falha = await enviarRebolo(e.lote.id, a, p, obs)
    setSalvando(false)
    if (falha) return setErro(falha)
    setObs('')
  }
  const numero = (rotulo: string, q: Quantidade, alerta = false) => (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl px-4 py-3">
      <p className={labelCls}>{rotulo}</p>
      <p className={`text-xl font-black mt-1 ${alerta && q.albuns + q.posteres > 0 ? 'text-yellow-400' : 'text-white'}`}>{num(q.albuns)}</p>
      <p className="text-[10px] text-zinc-500">álbuns{q.posteres ? ` • ${num(q.posteres)} pôst./brindes` : ''}</p>
    </div>
  )
  return (
    <Modal aberto titulo={e.escola} subtitulo={`${e.cidade}${e.uf ? `-${e.uf}` : ''}${rotuloLote(e) ? ` • ${rotuloLote(e)}` : ''} • estoque de álbuns`} onFechar={onFechar} largura="max-w-4xl" rodape={<button onClick={onFechar} className={btnSecundario}>Fechar</button>}>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {numero('Em estoque', e.emEstoque)}
        {numero('Em venda', e.emVenda)}
        {numero('Vendidos', e.vendidos)}
        {numero('Voltaram', e.voltaram)}
        {numero('Aguardando Rebolo', e.aguardandoRebolo, true)}
        {numero('Foram ao Rebolo', e.rebolo)}
        {numero('Diferença', e.diferenca, true)}
      </div>

      {podeMexer && aguardando && (
        <div className="bg-white/[0.02] border border-yellow-500/25 rounded-2xl p-5 space-y-4">
          <p className="text-xs font-bold text-white uppercase tracking-wider">Encaminhar ao Rebolo (o que voltou das cargas)</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <label className={labelCls}>Álbuns (até {num(e.aguardandoRebolo.albuns)})</label>
              <input type="number" min={0} max={e.aguardandoRebolo.albuns} value={alb} onChange={(x) => setAlb(x.target.value)} className={inputCls} />
            </div>
            <div className="space-y-2">
              <label className={labelCls}>Pôsteres/brindes (até {num(e.aguardandoRebolo.posteres)})</label>
              <input type="number" min={0} max={e.aguardandoRebolo.posteres} value={pst} onChange={(x) => setPst(x.target.value)} className={inputCls} />
            </div>
            <div className="space-y-2">
              <label className={labelCls}>Observação</label>
              <input value={obs} onChange={(x) => setObs(x.target.value)} placeholder="Opcional" className={inputCls} />
            </div>
            <button onClick={encaminhar} disabled={salvando} className={btnPrimario}>
              {salvando ? 'Salvando...' : 'Encaminhar ao Rebolo'}
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">O Rebolo pega as caixas que voltaram e tenta vender: não precisa confirmar no sistema.</p>
          {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
        </div>
      )}

      <div className="space-y-2">
        <p className={labelCls}>Caixas conferidas ({num(e.caixas.length)})</p>
        {e.caixas.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhuma caixa conferida ainda.</p>
        ) : (
          <div className="rounded-2xl border border-white/[0.06] divide-y divide-white/[0.04]">
            {e.caixas.map((c) => (
              <div key={c.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-white font-bold">
                  Caixa {String(c.numero)} • {num(albunsDaCaixa(c))} álbuns{posteresDaCaixa(c) ? ` • ${num(posteresDaCaixa(c))} pôst./brindes` : ''}
                </span>
                <span className="text-zinc-400">{situacaoDaCaixa(s, c)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {envios.length > 0 && (
        <div className="space-y-2">
          <p className={labelCls}>Encaminhados ao Rebolo</p>
          <div className="rounded-2xl border border-white/[0.06] divide-y divide-white/[0.04]">
            {envios.map((r) => (
              <div key={r.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-zinc-300">
                  <strong className="text-white">{dataBR(String(r.data))}</strong> • {num(Number(r.albuns))} álbuns{Number(r.posteres) ? ` • ${num(Number(r.posteres))} pôst./brindes` : ''}
                  {r.autor ? ` • ${String(r.autor)}` : ''}
                  {r.observacao ? ` • ${String(r.observacao)}` : ''}
                </span>
                {r.cargaId ? (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">no acerto da carga</span>
                ) : podeMexer &&
                  (desfazer === r.id ? (
                    <button onClick={() => desfazerEnvioRebolo(r.id).then(() => setDesfazer(null))} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-red-600 hover:bg-red-500 text-white">
                      Confirmar: desfazer
                    </button>
                  ) : (
                    <button onClick={() => setDesfazer(r.id)} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/10">
                      Desfazer envio
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className={labelCls}>Extrato ({num(extrato.length)})</p>
        {extrato.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhum movimento ainda.</p>
        ) : (
          <div className="rounded-2xl border border-white/[0.06] divide-y divide-white/[0.04] max-h-80 overflow-y-auto custom-scrollbar">
            {extrato.map((m) => (
              <div key={m.id} className="px-4 py-2.5 grid grid-cols-[6.5rem_9rem_1fr] gap-3 text-xs items-start">
                <span className="text-zinc-500 font-mono">{dataBR(m.data.slice(0, 10))}</span>
                <span className={`font-bold ${m.tipo === 'Diferença' ? 'text-yellow-400' : 'text-white'}`}>
                  {m.tipo}
                  {m.albuns || m.posteres ? (
                    <span className="block font-normal text-zinc-400">
                      {num(m.albuns)} álb.{m.posteres ? ` • ${num(m.posteres)} pôst.` : ''}
                    </span>
                  ) : null}
                </span>
                <span className="text-zinc-400 min-w-0 break-words">
                  {m.descricao}
                  {m.autor ? <span className="text-zinc-600"> • {m.autor}</span> : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {!podeMexer && (
        <p className="text-[11px] text-zinc-500 flex items-center gap-2">
          <Icon nome="lock" className="w-3.5 h-3.5" /> Só para conferir: quem monta a carga, acerta e encaminha ao Rebolo é o Financeiro.
        </p>
      )}
    </Modal>
  )
}
