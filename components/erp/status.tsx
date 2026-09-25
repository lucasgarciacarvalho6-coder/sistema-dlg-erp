// Cores de SITUAÇÃO da meta (verde / amarelo / vermelho), sempre acompanhadas de ícone + texto.
// Validadas com o validador de paleta (CVD ΔE ≥ 11 entre si sobre o fundo #0a0a0a).

import type { Situacao } from '@/lib/erp/metrics'
import { pct } from '@/lib/erp/format'

export const STATUS: Record<Situacao, { cor: string; rotulo: string; icone: string }> = {
  bom: { cor: '#0ca30c', rotulo: 'No ritmo', icone: '✓' },
  atencao: { cor: '#fab219', rotulo: 'Atenção', icone: '!' },
  critico: { cor: '#d03b3b', rotulo: 'Abaixo', icone: '✕' },
}

export function PillSituacao({ situacao, grande = false }: { situacao: Situacao; grande?: boolean }) {
  const st = STATUS[situacao]
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] whitespace-nowrap ${grande ? 'px-4 py-1.5' : 'px-3 py-1'}`}>
      <span
        className={`rounded-full flex items-center justify-center font-black text-[#111111] ${grande ? 'w-5 h-5 text-[11px]' : 'w-4 h-4 text-[9px]'}`}
        style={{ backgroundColor: st.cor }}
        aria-hidden="true"
      >
        {st.icone}
      </span>
      <span className={`font-bold uppercase tracking-widest text-white ${grande ? 'text-xs' : 'text-[10px]'}`}>{st.rotulo}</span>
    </span>
  )
}

export function LegendaSituacao({ esperado }: { esperado?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
      {(Object.keys(STATUS) as Situacao[]).map((k) => (
        <span key={k} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS[k].cor }}></span>
          {STATUS[k].rotulo}
        </span>
      ))}
      {esperado !== undefined && (
        <span className="flex items-center gap-2">
          <span className="w-0.5 h-3.5 bg-white rounded"></span> Onde deveria estar hoje ({pct(esperado)})
        </span>
      )}
    </div>
  )
}

