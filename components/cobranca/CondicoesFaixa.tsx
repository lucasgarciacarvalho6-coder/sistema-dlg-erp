'use client'

// Cobrança › Configurações › Condições por faixa (SQL 047): a tabela do sistema antigo que aparece como SUGESTÃO
// na simulação (nunca trava). Por faixa de atraso, 3 condições oferecidas em ordem: entrada mínima (%), desconto de
// juros/multa (%) e desconto do principal (%). Só o ADM altera.

import { useState } from 'react'
import { useCondicoesFaixa } from '@/lib/erp/cobrancas'
import { salvarCondicoesFaixa } from '@/lib/erp/store'
import { ROTULO_FAIXA_CONDICAO, type CondicaoFaixa } from '@/lib/erp/acordo'
import { Panel, btnPrimario, inputCls } from '@/components/erp/ui'

const CAMPOS: { chave: keyof CondicaoFaixa; rotulo: string }[] = [
  { chave: 'entradaPct', rotulo: 'Entrada mínima (%)' },
  { chave: 'descJurosPct', rotulo: 'Desc. juros/multa (%)' },
  { chave: 'descPrincipalPct', rotulo: 'Desc. principal (%)' },
]

export default function CondicoesFaixa({ editavel }: { editavel: boolean }) {
  const salvas = useCondicoesFaixa()
  const [x, setX] = useState<CondicaoFaixa[] | null>(null)
  const lista = x ?? salvas
  const [salvando, setSalvando] = useState(false)
  const mudar = (i: number, chave: keyof CondicaoFaixa, v: string) =>
    setX(lista.map((c, k) => (k === i ? { ...c, [chave]: Math.min(100, Math.max(0, Number(v.replace(',', '.')) || 0)) } : c)))
  const salvar = async () => {
    setSalvando(true)
    const erro = await salvarCondicoesFaixa(lista)
    setSalvando(false)
    if (!erro) setX(null)
  }
  return (
    <Panel
      titulo="Tabela de condições de renegociação"
      subtitulo="Sugestão na simulação (o cobrador decide; nada trava). Ofereça a condição 1; se o cliente não aceitar, a próxima depois do intervalo de dias úteis das regras."
      acoes={editavel && x ? <button onClick={salvar} disabled={salvando} className={btnPrimario}>{salvando ? 'Salvando...' : 'Salvar'}</button> : undefined}
    >
      <div className="space-y-5">
        {[2, 3, 4].map((faixa) => (
          <div key={faixa}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Faixa {faixa} — {ROTULO_FAIXA_CONDICAO[faixa]}</p>
            <table className="w-full text-xs text-zinc-300">
              <thead className="text-[10px] uppercase tracking-widest text-zinc-500">
                <tr>
                  <th className="text-left py-1">Condição</th>
                  {CAMPOS.map((c) => (
                    <th key={c.chave} className="py-1">{c.rotulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((c, i) =>
                  c.faixa !== faixa ? null : (
                    <tr key={`${c.faixa}-${c.condicao}`}>
                      <td className="py-1 font-bold text-white">{c.condicao}</td>
                      {CAMPOS.map((k) => (
                        <td key={k.chave} className="py-1 px-2">
                          <input inputMode="decimal" disabled={!editavel} value={String(c[k.chave])} onChange={(e) => mudar(i, k.chave, e.target.value)} className={`${inputCls} text-center`} />
                        </td>
                      ))}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Panel>
  )
}
