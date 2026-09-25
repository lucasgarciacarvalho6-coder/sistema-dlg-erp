'use client'

import { definirTema, useTema, type Tema } from '@/lib/tema'

const OPCOES: { id: Tema; rotulo: string; icone: string }[] = [
  { id: 'dark', rotulo: 'Escuro', icone: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z' },
  { id: 'light', rotulo: 'Claro', icone: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
]

// Alternador Escuro / Claro (segmentado). Fica no Header, ao lado do nome do usuário.
// O destaque do botão ativo vem do CSS (html[data-theme]), então já aparece certo antes do React carregar.
export default function SeletorTema({ compacto = false }: { compacto?: boolean }) {
  const tema = useTema()
  return (
    <div role="radiogroup" aria-label="Tema" className="inline-flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
      {OPCOES.map((o) => {
        const ativo = tema === o.id
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={ativo}
            title={`Tema ${o.rotulo.toLowerCase()}`}
            onClick={() => definirTema(o.id)}
            data-opcao-tema={o.id}
            className={`seletor-tema flex items-center gap-1.5 rounded-lg transition-all ${compacto ? 'p-2' : 'px-3 py-2'} text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={o.icone} />
            </svg>
            {!compacto && <span>{o.rotulo}</span>}
          </button>
        )
      })}
    </div>
  )
}
