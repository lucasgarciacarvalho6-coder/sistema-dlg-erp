'use client'

// App da Revelação (celular): a pessoa solta as CAIXAS (escola, álbuns, pôster/brindes e observação).
// Cada caixa conta na meta da Revelação (álbuns revelados) e vai para a conferência da Produção (Estoque).

import { useState } from 'react'
import AppShell, { botaoApp, cardApp, inputApp, labelApp } from '@/components/app/AppShell'
import { excluirCaixa, registrarCaixa, useErp, useUsuario } from '@/lib/erp/store'
import { colecao, resumo, situacaoResumo } from '@/lib/erp/metrics'
import { ETAPAS_REVELACAO, caixasDoLote, etapaDoLote, lotesProducao } from '@/lib/erp/producao'
import { diasUteisDoMes } from '@/lib/erp/calendario'
import { dataBR, hoje, mesAtual, nomeMes, num } from '@/lib/erp/format'
import { PillSituacao, STATUS } from '@/components/erp/status'
import { Anel } from '@/components/erp/PainelMeta'

const dec = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export default function AppProducaoPage() {
  const s = useErp()
  const usuario = useUsuario()
  const [qtd, setQtd] = useState('')
  const [escolaId, setEscolaId] = useState('')
  const [buscaEscola, setBuscaEscola] = useState('')
  const [posteres, setPosteres] = useState('')
  const [obs, setObs] = useState('')
  const [dataCaixa, setDataCaixa] = useState(hoje())
  const [apagar, setApagar] = useState<string | null>(null) // 1º toque pede confirmação
  const [enviando, setEnviando] = useState(false)
  const mes = mesAtual()

  if (!usuario) return <AppShell setor="producao" titulo="Revelação">{null}</AppShell>

  const r = resumo(s, 'producao', 'books', mes, usuario.id)
  const situacao = situacaoResumo(r, mes)
  const meus = s.lancamentos.filter((l) => l.setor === 'producao' && l.indicador === 'books' && l.colaboradorId === usuario.id)
  // escolas liberadas para a Revelação (vêm da Produção)
  const liberadas = lotesProducao(s).filter((l) => ETAPAS_REVELACAO.includes(etapaDoLote(l)))
  const loteSel = liberadas.find((l) => l.id === escolaId)
  const termo = buscaEscola.trim().toLowerCase()
  const opcoes = liberadas
    .filter((l) => !termo || `${l.escola} ${l.cidade}`.toLowerCase().includes(termo))
    .sort((a, b) => String(a.escola).localeCompare(String(b.escola)))
  if (loteSel && !opcoes.includes(loteSel)) opcoes.unshift(loteSel)
  const caixasSel = loteSel ? caixasDoLote(s, loteSel.id) : []
  const lotesPorId = new Map(lotesProducao(s).map((l) => [l.id, l]))
  const caixasHoje = colecao(s, 'producao_caixas')
    .filter((c) => c.registradoPor === usuario.id && String(c.data) === hoje())
    .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))
  // últimos dias úteis do mês (até hoje)
  const uteis = diasUteisDoMes(mes).filter((d) => d <= hoje()).slice(-7)
  const porDia = (d: string) => meus.filter((l) => l.data === d).reduce((a, l) => a + l.quantidade, 0)
  const maxDia = Math.max(1, r.meta.diaria, ...uteis.map(porDia))

  const soltar = async () => {
    const n = Number(qtd)
    if (!escolaId || !Number.isFinite(n) || n <= 0) return
    setEnviando(true)
    const erro = await registrarCaixa(escolaId, { albuns: Math.round(n), posteres: Math.round(Number(posteres) || 0), observacao: obs, data: dataCaixa })
    setEnviando(false)
    if (!erro) {
      // a escola continua escolhida: a próxima caixa costuma ser da mesma escola
      setQtd('')
      setPosteres('')
      setObs('')
    }
  }
  const tocarApagar = async (id: string) => {
    if (apagar !== id) return setApagar(id)
    setApagar(null)
    await excluirCaixa(id)
  }

  return (
    <AppShell setor="producao" titulo={`Olá, ${usuario.nome.split(' ')[0]}`} subtitulo={`Revelação • ${dataBR(hoje())}`}>
      {/* Hoje */}
      <div className={`${cardApp} space-y-4`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={labelApp}>Álbuns revelados hoje</p>
            <p className="text-5xl font-black tracking-tight mt-1">{num(r.hoje)}</p>
            <p className="text-xs text-zinc-400 mt-1">
              Meta do dia <strong className="text-white">{dec(r.meta.diaria)}</strong>
              {r.piso > 0 && (
                <>
                  {' '}• piso <strong style={{ color: STATUS.atencao.cor }}>{dec(r.pisoDiario)}</strong>
                </>
              )}
            </p>
          </div>
          <Anel valor={r.pctDia} cor={r.pctDia >= 100 ? STATUS.bom.cor : r.piso > 0 && r.hoje >= r.pisoDiario ? STATUS.atencao.cor : STATUS.critico.cor} rotulo="do dia" tamanho="w-24 h-24" textoCls="text-xl" />
        </div>
      </div>

      {/* Soltar caixa: vai para a conferência da Produção e conta na meta (álbuns revelados) */}
      <div className={`${cardApp} space-y-4`}>
        <p className="text-sm font-black">Soltar caixa</p>
        <div className="space-y-2">
          <label className={labelApp}>Escola</label>
          <input value={buscaEscola} onChange={(e) => setBuscaEscola(e.target.value)} placeholder="🔍 Buscar escola..." className={inputApp} />
          <select value={escolaId} onChange={(e) => setEscolaId(e.target.value)} className={`${inputApp} appearance-none`}>
            <option value="">{opcoes.length ? 'Escolha a escola' : 'Nenhuma escola encontrada'}</option>
            {opcoes.map((l) => (
              <option key={l.id} value={l.id}>
                {String(l.escola)} — {String(l.cidade)}
                {l.uf ? `/${String(l.uf)}` : ''}
              </option>
            ))}
          </select>
          {loteSel && (
            <p className="text-xs text-zinc-400">
              Já em caixas: <strong className="text-white">{num(caixasSel.reduce((a, c) => a + (Number(c.albuns) || 0), 0))}</strong> de {num(Number(loteSel.albuns))} álbuns • {caixasSel.length} caixa(s). Esta será a caixa{' '}
              <strong className="text-white">{caixasSel.length + 1}</strong>.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <label className={labelApp}>Data</label>
          <input type="date" max={hoje()} value={dataCaixa} onChange={(e) => setDataCaixa(e.target.value)} className={inputApp} />
        </div>
        <div className="space-y-2">
          <label className={labelApp}>Álbuns na caixa</label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setQtd(String(Math.max(0, (Number(qtd) || 0) - 1)))} className="w-14 h-14 shrink-0 rounded-2xl bg-white/[0.05] border border-white/[0.08] text-2xl font-black" aria-label="Menos um">
              −
            </button>
            <input type="number" inputMode="numeric" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" className={`${inputApp} text-center text-3xl font-black py-3`} />
            <button type="button" onClick={() => setQtd(String((Number(qtd) || 0) + 1))} className="w-14 h-14 shrink-0 rounded-2xl bg-white/[0.05] border border-white/[0.08] text-2xl font-black" aria-label="Mais um">
              +
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <label className={labelApp}>Pôster/Brindes</label>
          <input type="number" inputMode="numeric" min={0} value={posteres} onChange={(e) => setPosteres(e.target.value)} placeholder="0" className={inputApp} />
        </div>
        <div className="space-y-2">
          <label className={labelApp}>Observação (opcional)</label>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Ex.: faltou 1 álbum, vai na próxima caixa" className={inputApp} />
        </div>
        <button onClick={soltar} disabled={enviando || !escolaId || !(Number(qtd) > 0)} className={botaoApp}>
          {enviando ? 'Enviando...' : 'Soltar caixa'}
        </button>
        {caixasHoje.length > 0 && (
          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            <p className={labelApp}>Caixas de hoje (✕ apaga enquanto a Produção não conferiu)</p>
            {caixasHoje.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 bg-black/40 rounded-xl px-4 py-2.5">
                <span className="text-sm min-w-0">
                  <strong className="text-white">
                    Caixa {String(c.numero)} • {num(Number(c.albuns))} álbuns
                  </strong>
                  <span className="block text-zinc-500 text-xs truncate">
                    {String(lotesPorId.get(String(c.loteId))?.escola ?? '')} • {c.status === 'Aguardando conferência' ? 'aguardando conferência' : c.status === 'Em estoque' ? '✓ conferida (estoque)' : '✓ conferida • saiu com o vendedor'}
                  </span>
                </span>
                {c.status === 'Aguardando conferência' && (
                  <button onClick={() => tocarApagar(c.id)} className={`shrink-0 px-2 ${apagar === c.id ? 'text-red-400 text-xs font-black' : 'text-zinc-500 hover:text-red-400 text-lg'}`} aria-label="Apagar caixa">
                    {apagar === c.id ? 'Apagar?' : '✕'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mês */}
      <div className={`${cardApp} space-y-4`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-black">{nomeMes(mes)}</p>
          <PillSituacao situacao={situacao} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-black/40 rounded-2xl py-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Feito</p>
            <p className="text-xl font-black">{num(r.mes)}</p>
          </div>
          <div className="bg-black/40 rounded-2xl py-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Meta</p>
            <p className="text-xl font-black">{num(r.meta.mensal)}</p>
          </div>
          <div className="bg-black/40 rounded-2xl py-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Piso</p>
            <p className="text-xl font-black" style={{ color: r.piso > 0 ? STATUS.atencao.cor : undefined }}>{r.piso > 0 ? num(r.piso) : '—'}</p>
          </div>
        </div>
        <div className="relative h-3 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, r.pctMes)}%` }}></div>
        </div>
        <p className={`text-sm font-bold ${r.faltaPiso > 0 ? 'text-red-400' : r.falta > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
          {r.faltaPiso > 0 ? `⚠ Faltam ${num(r.faltaPiso)} para o piso` : r.falta > 0 ? `✓ Piso batido • faltam ${num(r.falta)} para a meta` : '🎯 Meta do mês batida'}
        </p>
        <p className="text-xs text-zinc-400">
          Média {dec(r.mediaDiaria)}/dia • projeção {num(Math.round(r.projecao))} • dias úteis {r.diasDecorridos}/{r.diasUteis}
        </p>
        {/* últimos dias úteis */}
        <div className="flex items-end gap-2 h-24 pt-2">
          {uteis.map((d) => {
            const v = porDia(d)
            const cor = v >= r.meta.diaria ? STATUS.bom.cor : r.piso > 0 && v >= r.pisoDiario ? STATUS.atencao.cor : STATUS.critico.cor
            return (
              <div key={d} className="flex-1 h-full flex flex-col justify-end items-center gap-1">
                <span className="text-[10px] font-bold text-zinc-300">{v || ''}</span>
                <div className="w-full rounded-t-md" style={{ height: `${Math.max(v ? 4 : 0, (v / maxDia) * 100)}%`, backgroundColor: cor }}></div>
                <span className="text-[9px] font-bold text-zinc-500">{d.slice(8)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
