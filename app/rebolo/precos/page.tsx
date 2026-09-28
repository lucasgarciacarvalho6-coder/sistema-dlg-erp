'use client'

// Tabela de Preços do rebolo: 3 faixas (meses desde a visita da escola) × 4 produtos × PIX/Cartão/Boleto,
// máximo de parcelas por faixa e as regras gerais (parcela mínima, teto de parcelas).
// ADM e Gerência editam; as vendedoras consultam.

import { useState } from 'react'
import { salvarParametros, useErp, usePode } from '@/lib/erp/store'
import { brl } from '@/lib/erp/format'
import { chaveParcelas, chavePreco, FAIXAS, FORMAS_REBOLO, PRODUTOS_REBOLO, REGRAS_REBOLO, tabelaRebolo, type Faixa } from '@/lib/erp/rebolo'
import { PageHeader, Panel, btnPrimario, labelCls } from '@/components/erp/ui'

const CORES: Record<Faixa, string> = { 1: 'border-blue-500/30', 2: 'border-emerald-500/30', 3: 'border-cyan-500/30' }
const campo = 'w-full bg-black/50 border border-white/[0.05] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 disabled:opacity-70'

export default function PrecosReboloPage() {
  const s = useErp()
  const podeFazer = usePode()
  const editavel = podeFazer('cadastros', 'editar')
  const [v, setV] = useState<Record<string, number>>(() => ({ ...tabelaRebolo(s).valores }))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)
  const set = (k: string, x: string) => setV((a) => ({ ...a, [k]: Number(x) || 0 }))
  const ate1 = v.rebolo_faixa1_ate
  const ate2 = v.rebolo_faixa2_ate
  const titulo: Record<Faixa, string> = { 1: `álbuns visitados 0 a ${ate1} meses`, 2: `${ate1 + 1} a ${ate2} meses`, 3: `acima de ${ate2 + 1} meses` }
  const semPreco = FAIXAS.flatMap((f) => PRODUTOS_REBOLO.filter((p) => FORMAS_REBOLO.every((x) => !v[chavePreco(f, p.id, x.id)])).map((p) => `${p.nome} (faixa ${f})`))

  const salvar = async () => {
    if (!(ate1 > 0 && ate2 > ate1)) return setErro('A faixa 2 precisa terminar depois da faixa 1.')
    setErro('')
    setSalvando(true)
    const e = await salvarParametros(v)
    setSalvando(false)
    if (e) return
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Vendas Rebolo / Tabela de Preços"
        titulo="Tabela de Preços"
        descricao="O preço cai conforme o tempo desde a visita da escola. Venda sem entrada, no máximo 15x, parcela mínima de R$ 100. Produto sem preço não aparece para venda na faixa."
        acoes={
          editavel && (
            <button onClick={() => void salvar()} disabled={salvando} className={btnPrimario}>
              {salvando ? 'Salvando...' : salvo ? 'Salvo ✓' : 'Salvar tabela'}
            </button>
          )
        }
      />
      {erro && <p className="text-sm font-bold text-red-400">{erro}</p>}
      {semPreco.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 text-sm text-yellow-200">
          ⚠ Sem preço definido (não aparece para venda): <strong>{semPreco.join(', ')}</strong>.
        </div>
      )}

      {FAIXAS.map((f) => (
        <div key={f} className={`bg-painel/80 border ${CORES[f]} rounded-3xl overflow-hidden`}>
          <div className="px-6 py-4 border-b border-white/[0.05] bg-white/[0.01]">
            <p className="text-lg font-black text-white">
              Faixa {f} <span className="text-sm font-bold text-zinc-400">({titulo[f]})</span>
            </p>
          </div>
          <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
            {PRODUTOS_REBOLO.map((p) => (
              <div key={p.id} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4">
                <p className="font-black text-white mb-3">{p.nome}</p>
                <div className="grid grid-cols-3 gap-2">
                  {FORMAS_REBOLO.map((x) => (
                    <label key={x.id} className="block">
                      <span className={labelCls}>{x.nome} (R$)</span>
                      <input type="number" min="0" step="10" disabled={!editavel} value={v[chavePreco(f, p.id, x.id)] || ''} placeholder="—" onChange={(e) => set(chavePreco(f, p.id, x.id), e.target.value)} className={campo} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4">
              <p className="font-black text-white mb-3">Regras de parcelamento • faixa {f}</p>
              <div className="grid grid-cols-2 gap-2">
                {(['cartao', 'boleto'] as const).map((x) => (
                  <label key={x} className="block">
                    <span className={labelCls}>Máx. parcelas {x === 'cartao' ? 'cartão' : 'boleto'}</span>
                    <input type="number" min="1" max="24" disabled={!editavel} value={v[chaveParcelas(f, x)] || ''} onChange={(e) => set(chaveParcelas(f, x), e.target.value)} className={campo} />
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500 mt-2">
                Ex.: {brl(v[chavePreco(f, 'kit_sem_moldura', 'boleto')] || 0)} no boleto →{' '}
                {Math.max(1, Math.min(v[chaveParcelas(f, 'boleto')] || 1, v.rebolo_parcelas_max || 15, Math.floor((v[chavePreco(f, 'kit_sem_moldura', 'boleto')] || 0) / (v.rebolo_parcela_minima || 1))))}x no máximo
              </p>
            </div>
          </div>
        </div>
      ))}

      <Panel titulo="Regras gerais">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {REGRAS_REBOLO.map((r) => (
            <label key={r.chave} className="block">
              <span className={labelCls}>{r.label}</span>
              <input type="number" min="0" disabled={!editavel} value={v[r.chave] ?? r.padrao} onChange={(e) => set(r.chave, e.target.value)} className={campo} />
            </label>
          ))}
        </div>
        {!editavel && <p className="text-xs text-zinc-500 mt-4">Somente leitura. ADM e Gerência alteram a tabela.</p>}
      </Panel>
    </div>
  )
}
