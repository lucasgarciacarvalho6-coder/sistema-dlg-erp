'use client'

// Fotografar as páginas do documento com a câmera do celular (sem passar pelo WhatsApp,
// que comprime a imagem e atrapalha a leitura). Até 4 páginas.

import { useEffect, useMemo } from 'react'

export const MAX_PAGINAS = 4

export default function CapturaPaginas({ paginas, onChange }: { paginas: File[]; onChange: (p: File[]) => void }) {
  const urls = useMemo(() => paginas.map((f) => URL.createObjectURL(f)), [paginas])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])

  return (
    <div className="space-y-3">
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-xs text-zinc-300 leading-relaxed">
        <p className="font-bold text-blue-400 uppercase tracking-widest text-[10px] mb-1">Dica para a leitura sair certa</p>
        Folha em superfície plana, <strong className="text-white">boa luz</strong>, sem sombra do celular, e a <strong className="text-white">folha inteira</strong> aparecendo na foto.
      </div>

      {paginas.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {paginas.map((f, i) => (
            <div key={urls[i]} className="relative bg-black/50 border border-white/[0.08] rounded-2xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[i]} alt={`Página ${i + 1}`} className="w-full h-40 object-cover" />
              <span className="absolute top-2 left-2 text-[10px] font-black bg-black/80 px-2 py-1 rounded-lg">Página {i + 1}</span>
              <button type="button" onClick={() => onChange(paginas.filter((_, k) => k !== i))} className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/80 text-red-400 font-black" aria-label={`Remover página ${i + 1}`}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {paginas.length < MAX_PAGINAS && (
        <label className="block w-full py-5 rounded-2xl border-2 border-dashed border-blue-500/40 bg-blue-500/[0.06] text-center cursor-pointer active:scale-[0.99] transition-all">
          {/* capture="environment" abre direto a câmera traseira no celular */}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onChange([...paginas, f])
              e.target.value = ''
            }}
          />
          <span className="text-2xl block" aria-hidden="true">📷</span>
          <span className="text-sm font-black uppercase tracking-widest text-blue-300">{paginas.length ? `Fotografar página ${paginas.length + 1}` : 'Fotografar o documento'}</span>
        </label>
      )}
    </div>
  )
}
