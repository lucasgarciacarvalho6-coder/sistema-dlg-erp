'use client'

// App da Produção (celular): a pessoa só informa quantos books fez no dia.
// Os números vão direto para as metas da Produção e para o dashboard do ADM.

import { useState } from 'react'
import AppShell, { botaoApp, cardApp, inputApp, labelApp } from '@/components/app/AppShell'
import { excluirLancamento, registrarLancamento, useErp, useUsuario } from '@/lib/erp/store'
import { colecao, resumo, situacaoResumo } from '@/lib/erp/metrics'
import { diasUteisDoMes } from '@/lib/erp/calendario'
import { dataBR, hoje, mesAtual, nomeMes, num } from '@/lib/erp/format'
import { PillSituacao, STATUS } from '@/components/erp/status'
import { Anel } from '@/components/erp/PainelMeta'

const dec = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export default function AppProducaoPage() {
  const s = useErp()
  const usuario = useUsuario()
  const [qtd, setQtd] = useState('')
  const [escola, setEscola] = useState('')
  const [enviando, setEnviando] = useState(false)
  const mes = mesAtual()

  if (!usuario) return <AppShell setor="producao" titulo="Produção">{null}</AppShell>

  const r = resumo(s, 'producao', 'books', mes, usuario.id)
  const situacao = situacaoResumo(r, mes)
  const meus = s.lancamentos.filter((l) => l.setor === 'producao' && l.indicador === 'books' && l.colaboradorId === usuario.id)
  const deHoje = meus.filter((l) => l.data === hoje()).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  const escolas = [...new Set(colecao(s, 'agenda_visitas').filter((v) => v.status !== 'Agendada' && v.status !== 'Cancelada').map((v) => String(v.escola)))].sort()
  // últimos dias úteis do mês (até hoje)
  const uteis = diasUteisDoMes(mes).filter((d) => d <= hoje()).slice(-7)
  const porDia = (d: string) => meus.filter((l) => l.data === d).reduce((a, l) => a + l.quantidade, 0)
  const maxDia = Math.max(1, r.meta.diaria, ...uteis.map(porDia))

  const lancar = async () => {
    const n = Number(qtd)
    if (!Number.isFinite(n) || n <= 0) return
    setEnviando(true)
    const erro = await registrarLancamento({ setor: 'producao', indicador: 'books', colaboradorId: usuario.id, quantidade: Math.round(n), descricao: escola ? `Escola: ${escola}` : 'Books do dia', data: hoje() })
    setEnviando(false)
    if (!erro) {
      setQtd('')
      setEscola('')
    }
  }

  return (
    <AppShell setor="producao" titulo={`Olá, ${usuario.nome.split(' ')[0]}`} subtitulo={`Produção • ${dataBR(hoje())}`}>
      {/* Hoje */}
      <div className={`${cardApp} space-y-4`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={labelApp}>Books feitos hoje</p>
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

      {/* Lançar */}
      <div className={`${cardApp} space-y-4`}>
        <p className="text-sm font-black">Informar books feitos</p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setQtd(String(Math.max(0, (Number(qtd) || 0) - 1)))} className="w-14 h-14 shrink-0 rounded-2xl bg-white/[0.05] border border-white/[0.08] text-2xl font-black" aria-label="Menos um">
            −
          </button>
          <input type="number" inputMode="numeric" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" className={`${inputApp} text-center text-3xl font-black py-3`} />
          <button type="button" onClick={() => setQtd(String((Number(qtd) || 0) + 1))} className="w-14 h-14 shrink-0 rounded-2xl bg-white/[0.05] border border-white/[0.08] text-2xl font-black" aria-label="Mais um">
            +
          </button>
        </div>
        <div className="space-y-2">
          <label className={labelApp}>Escola (opcional)</label>
          <select value={escola} onChange={(e) => setEscola(e.target.value)} className={`${inputApp} appearance-none`}>
            <option value="">Não informar</option>
            {escolas.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <button onClick={lancar} disabled={enviando || !(Number(qtd) > 0)} className={botaoApp}>
          {enviando ? 'Enviando...' : 'Lançar books'}
        </button>
        {deHoje.length > 0 && (
          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            <p className={labelApp}>Lançamentos de hoje (toque em ✕ para corrigir)</p>
            {deHoje.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 bg-black/40 rounded-xl px-4 py-2.5">
                <span className="text-sm">
                  <strong className="text-white">{num(l.quantidade)} books</strong> <span className="text-zinc-500 text-xs">• {l.descricao}</span>
                </span>
                {l.origem === 'manual' && (
                  <button onClick={() => excluirLancamento(l.id)} className="text-zinc-500 hover:text-red-400 text-lg px-2" aria-label="Remover lançamento">
                    ✕
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
