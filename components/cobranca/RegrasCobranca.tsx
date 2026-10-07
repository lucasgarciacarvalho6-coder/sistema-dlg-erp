'use client'

// Cobrança › Configurações › Regras de negociação (SQL 039). ADM e Gerência alteram; cada mudança fica no histórico.

import { useState } from 'react'
import { salvarRegrasCobranca, useErp } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { brl, dataHoraBR, num } from '@/lib/erp/format'
import {
  chaveComissao,
  FAIXAS_COMISSAO,
  GRUPOS_REGRAS,
  REGRAS_COBRANCA,
  regrasCobranca,
  rotuloRegra,
  unidadeRegra,
  validarRegrasCobranca,
  type RegraCobranca,
  type UnidadeRegra,
} from '@/lib/erp/cobranca-config'
import { EmptyState, Panel, btnPrimario, btnSecundario, labelCls } from '@/components/erp/ui'

const campo = 'w-full bg-black/50 border border-white/[0.05] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 disabled:opacity-70'
const SUFIXO: Record<UnidadeRegra, string> = { brl: 'R$', pct: '%', dias: 'dias', dia: 'dia', qtd: '' }
const numero = (t: string) => (t.trim() === '' ? NaN : Number(t.replace(',', '.')))

export function formatarRegra(valor: unknown, unidade: UnidadeRegra) {
  if (valor === '' || valor === null || valor === undefined) return '—'
  const v = Number(valor)
  if (unidade === 'brl') return brl(v)
  if (unidade === 'pct') return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
  if (unidade === 'dias') return `${num(v)} dias`
  if (unidade === 'dia') return `dia ${num(v)}`
  return num(v)
}

function CampoRegra({ r, valor, salvo, editavel, onMudar }: { r: RegraCobranca; valor: string; salvo: number; editavel: boolean; onMudar: (v: string) => void }) {
  const mudou = numero(valor) !== salvo
  return (
    <label className="block space-y-1">
      <span className={labelCls}>{r.label}</span>
      <div className="flex items-center gap-2">
        {SUFIXO[r.unidade] === 'R$' && <span className="text-xs font-bold text-zinc-500">R$</span>}
        <input
          type="number"
          min="0"
          step={r.unidade === 'brl' || r.unidade === 'pct' ? '0.01' : '1'}
          inputMode="decimal"
          aria-label={r.label}
          disabled={!editavel}
          value={valor}
          onChange={(e) => onMudar(e.target.value)}
          className={`${campo} ${mudou ? 'border-blue-500/60' : ''}`}
        />
        {SUFIXO[r.unidade] && SUFIXO[r.unidade] !== 'R$' && <span className="text-xs font-bold text-zinc-500 whitespace-nowrap">{SUFIXO[r.unidade]}</span>}
      </div>
      {r.ajuda && <span className="block text-[11px] text-zinc-500 leading-snug">{r.ajuda}</span>}
    </label>
  )
}

export default function RegrasCobranca({ editavel }: { editavel: boolean }) {
  const s = useErp()
  const salvas = regrasCobranca(s)
  const inicial = () => Object.fromEntries(Object.entries(salvas).map(([k, x]) => [k, String(x)]))
  const [v, setV] = useState<Record<string, string>>(inicial)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const mudar = (k: string, x: string) => setV((a) => ({ ...a, [k]: x }))
  const alteradas = REGRAS_COBRANCA.filter((r) => numero(v[r.chave] ?? '') !== salvas[r.chave])
  const historico = [...colecao(s, 'cobranca_regras_historico')].sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))).slice(0, 40)

  const salvar = async () => {
    setErro('')
    const novos = Object.fromEntries(alteradas.map((r) => [r.chave, numero(v[r.chave] ?? '')]))
    const falha = validarRegrasCobranca({ ...salvas, ...novos })
    if (falha) return setErro(falha)
    setSalvando(true)
    const e = await salvarRegrasCobranca(novos)
    setSalvando(false)
    if (e) setErro(e)
  }

  const painel = (grupo: string) => (
    <Panel key={grupo} titulo={grupo}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {REGRAS_COBRANCA.filter((r) => r.grupo === grupo).map((r) => (
          <CampoRegra key={r.chave} r={r} valor={v[r.chave] ?? ''} salvo={salvas[r.chave]} editavel={editavel} onMudar={(x) => mudar(r.chave, x)} />
        ))}
      </div>
    </Panel>
  )

  return (
    <div className="space-y-6">
      {editavel && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {alteradas.length > 0 && <span className="text-xs font-bold text-blue-300">{alteradas.length} regra(s) alterada(s), falta salvar</span>}
          <button onClick={() => setV(inicial())} disabled={!alteradas.length || salvando} className={btnSecundario}>Desfazer</button>
          <button onClick={() => void salvar()} disabled={!alteradas.length || salvando} className={btnPrimario}>
            {salvando ? 'Salvando...' : alteradas.length ? `Salvar regras (${alteradas.length})` : 'Salvo'}
          </button>
        </div>
      )}
      {erro && <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400">{erro}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">{GRUPOS_REGRAS.map(painel)}</div>

      <Panel titulo="Comissão da cobradora" subtitulo="O nível sai do total recebido no mês (vale para o mês todo); o percentual, da quantidade de parcelas vencidas na renegociação, sobre a entrada.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          {REGRAS_COBRANCA.filter((r) => r.chave === 'comissao_nivel1_ate' || r.chave === 'comissao_nivel2_ate').map((r) => (
            <CampoRegra key={r.chave} r={r} valor={v[r.chave] ?? ''} salvo={salvas[r.chave]} editavel={editavel} onMudar={(x) => mudar(r.chave, x)} />
          ))}
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-bold">Nível (recebido no mês)</th>
                {FAIXAS_COMISSAO.map((f) => (
                  <th key={f} className="px-3 py-2 font-bold">{f}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([1, 2, 3] as const).map((n) => (
                <tr key={n}>
                  <td className="px-3 py-2 font-bold text-white whitespace-nowrap">
                    Nível {n}{' '}
                    <span className="text-xs text-zinc-500 font-normal">
                      {n === 1 ? `até ${brl(salvas.comissao_nivel1_ate)}` : n === 2 ? `até ${brl(salvas.comissao_nivel2_ate)}` : `acima de ${brl(salvas.comissao_nivel2_ate)}`}
                    </span>
                  </td>
                  {([1, 2, 3, 4] as const).map((f) => {
                    const k = chaveComissao(n, f)
                    return (
                      <td key={k} className="px-3 py-2 min-w-[110px]">
                        <div className="flex items-center gap-1">
                          <input type="number" min="0" max="100" step="0.01" inputMode="decimal" aria-label={rotuloRegra(k)} disabled={!editavel} value={v[k] ?? ''} onChange={(e) => mudar(k, e.target.value)} className={`${campo} ${numero(v[k] ?? '') !== salvas[k] ? 'border-blue-500/60' : ''}`} />
                          <span className="text-xs font-bold text-zinc-500">%</span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel semPadding titulo="Histórico das mudanças" subtitulo="Quem mudou cada regra, quando, e o valor antes e depois">
        {historico.length === 0 ? (
          <EmptyState titulo="Nenhuma regra mudou ainda" descricao="Os valores de hoje são os do Manual de Cobrança." />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-5 py-3 font-bold">Quando</th>
                  <th className="px-5 py-3 font-bold">Regra</th>
                  <th className="px-5 py-3 font-bold">Antes → depois</th>
                  <th className="px-5 py-3 font-bold">Quem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {historico.map((h) => {
                  const u = unidadeRegra(String(h.chave))
                  return (
                    <tr key={h.id}>
                      <td className="px-5 py-3 whitespace-nowrap text-xs">{dataHoraBR(String(h.criadoEm))}</td>
                      <td className="px-5 py-3 text-white">{rotuloRegra(String(h.chave))}</td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {formatarRegra(h.valorAntigo, u)} → <span className="font-bold text-white">{formatarRegra(h.valorNovo, u)}</span>
                      </td>
                      <td className="px-5 py-3 text-xs">{String(h.alteradoPorNome || '—')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
