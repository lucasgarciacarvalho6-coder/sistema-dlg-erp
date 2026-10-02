// Peças visuais reaproveitáveis. As classes seguem exatamente o padrão das telas
// do módulo Operacional (glassmorphism escuro + acento azul).
//
// CORES (regra do ADM): tudo que é informação fica NEUTRO. Cor só para a SITUAÇÃO (leitura de alerta):
//   emerald = verde, está bem / ok • yellow = amarelo, atenção • red = vermelho, atrasado, parado ou ruim.
// Os tons que só enfeitavam (blue, violet, cyan, pink, orange) saem neutros, iguais ao zinc.
// O azul continua só na interface: botões, abas, links e foco.

import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Tom } from '@/lib/erp/types'
import Icon from './Icon'

type EstiloTom = { texto: string; solido: string; suave: string; borda: string; barra: string; brilho: string }
const NEUTRO: EstiloTom = { texto: 'text-zinc-300', solido: 'bg-zinc-400', suave: 'bg-white/[0.05]', borda: 'border-white/[0.1]', barra: 'bg-zinc-500/70', brilho: '' }
export const TONS: Record<Tom, EstiloTom> = {
  blue: NEUTRO,
  violet: NEUTRO,
  cyan: NEUTRO,
  pink: NEUTRO,
  orange: NEUTRO,
  zinc: NEUTRO,
  emerald: { texto: 'text-emerald-400', solido: 'bg-emerald-500', suave: 'bg-emerald-500/10', borda: 'border-emerald-500/25', barra: 'bg-emerald-500/80', brilho: '' },
  yellow: { texto: 'text-yellow-400', solido: 'bg-yellow-500', suave: 'bg-yellow-500/10', borda: 'border-yellow-500/25', barra: 'bg-yellow-500/80', brilho: '' },
  red: { texto: 'text-red-400', solido: 'bg-red-500', suave: 'bg-red-500/10', borda: 'border-red-500/25', barra: 'bg-red-500/80', brilho: '' },
}
// tom de situação (tem cor) × tom neutro
export const ehSituacao = (tom: Tom) => tom === 'emerald' || tom === 'yellow' || tom === 'red'

// ---- Classes de formulário (mesmas do Controle de Rota) ----
export const inputCls =
  'w-full bg-black/50 border border-white/[0.05] rounded-xl px-4 py-3.5 text-sm text-white outline-none focus:border-blue-500/50 placeholder:text-zinc-600 transition-all'
export const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-zinc-500'
export const btnPrimario =
  'bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all active:scale-95 disabled:opacity-40 inline-flex items-center justify-center gap-2'
export const btnSecundario =
  'px-5 py-3 bg-white/[0.05] hover:bg-white/[0.1] text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all inline-flex items-center justify-center gap-2 disabled:opacity-40'
export const btnBranco =
  'bg-white hover:bg-zinc-200 text-black px-8 py-3.5 rounded-2xl text-xs font-bold uppercase tracking-widest flex items-center gap-3 transition-all active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.15)]'

export function PageHeader({ modulo, titulo, descricao, acoes }: { modulo: string; titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="w-2 h-2 bg-zinc-500 rounded-full"></span>
          <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">{modulo}</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">{titulo}</h1>
        {descricao && <p className="text-sm text-zinc-400 mt-2 max-w-2xl">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-3">{acoes}</div>}
    </div>
  )
}

export function Panel({
  titulo,
  subtitulo,
  acoes,
  children,
  className = '',
  semPadding = false,
}: {
  titulo?: ReactNode
  subtitulo?: ReactNode
  acoes?: ReactNode
  children: ReactNode
  className?: string
  semPadding?: boolean
}) {
  return (
    <div className={`bg-painel/80 border border-white/[0.05] rounded-3xl shadow-2xl overflow-hidden ${className}`}>
      {(titulo || acoes) && (
        <div className="p-6 border-b border-white/[0.05] flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-white/[0.01]">
          <div>
            {titulo && <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{titulo}</h2>}
            {subtitulo && <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">{subtitulo}</p>}
          </div>
          {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
        </div>
      )}
      <div className={semPadding ? '' : 'p-6'}>{children}</div>
    </div>
  )
}

export function StatCard({
  label,
  valor,
  detalhe,
  tom = 'zinc',
  progresso,
  destaque = false,
}: {
  label: string
  valor: ReactNode
  detalhe?: ReactNode
  tom?: Tom
  progresso?: number
  destaque?: boolean
}) {
  const t = TONS[tom]
  const situacao = ehSituacao(tom) // só a situação tem cor: o número sai na cor e a borda fica levemente colorida
  // valores longos (ex.: R$ 12.345,67) usam fonte menor para não quebrar no meio do número
  const longo = typeof valor === 'string' && (valor.length > 10 || (valor.includes('R$') && valor.length > 7))
  return (
    <div className={`bg-painel-2/80 border ${situacao ? t.borda : 'border-white/[0.06]'} p-6 rounded-3xl relative overflow-hidden`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400 mb-2">{label}</p>
      <p
        className={`${destaque ? 'text-5xl tracking-tighter' : longo ? 'text-2xl xl:text-[1.7rem] tracking-tight whitespace-nowrap' : 'text-3xl xl:text-4xl tracking-tight'} font-black ${situacao ? t.texto : 'text-white'} break-words`}
      >
        {valor}
      </p>
      {progresso !== undefined && (
        <div className="w-full bg-white/[0.06] h-1.5 rounded-full mt-4 overflow-hidden">
          <div className={`${progresso >= 100 ? 'bg-emerald-500' : t.solido} h-full rounded-full`} style={{ width: `${Math.min(100, progresso)}%` }}></div>
        </div>
      )}
      {detalhe && <p className="text-[10px] text-zinc-500 mt-3 uppercase tracking-widest font-bold">{detalhe}</p>}
    </div>
  )
}

// barra neutra; verde quando chega a 100% (meta batida). Para mostrar a situação, passe tom="emerald" | "yellow" | "red".
export function ProgressBar({ valor, tom = 'zinc', altura = 'h-1.5' }: { valor: number; tom?: Tom; altura?: string }) {
  const t = TONS[valor >= 100 ? 'emerald' : tom]
  return (
    <div className={`w-full bg-white/[0.06] ${altura} rounded-full overflow-hidden`}>
      <div className={`${t.solido} h-full rounded-full transition-all duration-700`} style={{ width: `${Math.min(100, Math.max(0, valor))}%` }}></div>
    </div>
  )
}

export function Badge({ texto, tom = 'zinc' }: { texto: ReactNode; tom?: Tom }) {
  const t = TONS[tom]
  return (
    <span className={`inline-flex items-center gap-2 border ${t.borda} ${t.suave} px-3 py-1 rounded-full whitespace-nowrap`}>
      <span className={`w-1.5 h-1.5 rounded-full ${t.solido}`}></span>
      <span className={`text-[10px] font-bold ${t.texto} uppercase tracking-widest`}>{texto}</span>
    </span>
  )
}

// Gráfico de barras em divs (padrão do "Desempenho Diário das Equipas").
// Barras neutras; com meta, o dia que não bateu a meta fica amarelo (atenção).
export function BarChart({
  valores,
  meta,
  tom = 'zinc',
  altura = 'h-64',
  formatar = (v: number) => String(Math.round(v)),
  rotulos,
  limite,
  compacto = false,
}: {
  valores: number[]
  meta?: number
  tom?: Tom
  altura?: string
  formatar?: (v: number) => string
  rotulos?: string[]
  limite?: number // índice a partir do qual os dias ainda não aconteceram
  compacto?: boolean
}) {
  const max = Math.max(1, meta ?? 0, ...valores) * 1.15
  const t = TONS[tom]
  const gap = compacto ? 'gap-[3px]' : 'gap-1 sm:gap-2'
  return (
    <div className={`${altura} w-full flex flex-col ${compacto ? '' : 'pt-8'}`}>
      <div className={`flex-1 relative flex items-end ${gap}`}>
        {meta !== undefined && meta > 0 && (
          <div className="absolute left-0 w-full border-t border-dashed border-white/[0.15] z-0" style={{ bottom: `${(meta / max) * 100}%` }}>
            {!compacto && (
              <span className="absolute -top-3 left-0 text-[9px] text-zinc-400 font-bold tracking-widest bg-painel px-2 rounded uppercase">
                Meta diária: {formatar(meta)}
              </span>
            )}
          </div>
        )}
        {valores.map((v, i) => {
          const futuro = limite !== undefined && i >= limite
          const acima = meta === undefined || meta <= 0 || v >= meta
          return (
            <div key={i} className="flex-1 h-full flex items-end relative group z-10 min-w-0">
              {!futuro && !compacto && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-black text-[11px] font-bold px-2.5 py-1 rounded absolute -top-7 left-1/2 -translate-x-1/2 pointer-events-none shadow-xl z-20 whitespace-nowrap">
                  {rotulos?.[i] ? `${rotulos[i]}: ` : `Dia ${i + 1}: `}
                  {formatar(v)}
                </div>
              )}
              {futuro ? (
                <div className="w-full h-1.5 bg-white/[0.05] rounded-t-md border-b border-white/[0.1] opacity-40"></div>
              ) : (
                <div
                  title={compacto ? `Dia ${i + 1}: ${formatar(v)}` : undefined}
                  className={`w-full rounded-t-md relative transition-all duration-500 hover:brightness-125 ${acima ? t.barra : TONS.yellow.barra}`}
                  style={{ height: `${Math.max(v > 0 ? 2 : 0, (v / max) * 100)}%` }}
                ></div>
              )}
            </div>
          )
        })}
      </div>
      {!compacto && (
        <div className={`flex ${gap} mt-2`}>
          {valores.map((_, i) => (
            <span key={i} className={`flex-1 text-center text-[9px] font-bold min-w-0 ${limite !== undefined && i >= limite ? 'text-zinc-700' : 'text-zinc-500'}`}>
              {rotulos?.[i] ?? i + 1}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function Legenda({ itens }: { itens: { label: string; tom: Tom }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-5 text-[10px] uppercase font-bold tracking-widest">
      {itens.map((i) => (
        <div key={i.label} className="flex items-center gap-2 text-zinc-400">
          <span className={`w-2.5 h-2.5 rounded-full ${TONS[i.tom].solido}`}></span> {i.label}
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-16 h-16 bg-white/[0.02] rounded-full flex items-center justify-center mb-4 border border-white/[0.05]">
        <Icon nome="box" className="w-7 h-7 text-zinc-600" />
      </div>
      <h3 className="text-sm font-bold text-white tracking-widest uppercase mb-1">{titulo}</h3>
      {descricao && <p className="text-xs text-zinc-500 max-w-sm">{descricao}</p>}
    </div>
  )
}

export function Modal({
  aberto,
  titulo,
  subtitulo,
  onFechar,
  children,
  rodape,
  largura = 'max-w-2xl',
}: {
  aberto: boolean
  titulo: string
  subtitulo?: string
  onFechar: () => void
  children: ReactNode
  rodape?: ReactNode
  largura?: string
}) {
  if (!aberto) return null
  const janela = (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 animate-fade-in" onMouseDown={onFechar}>
      <div
        className={`bg-modal border border-white/[0.1] rounded-[2rem] w-full ${largura} shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-white/[0.05] flex justify-between items-start bg-black/40">
          <div>
            <h3 className="text-xl font-black text-white tracking-tight">{titulo}</h3>
            {subtitulo && <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2 font-bold">{subtitulo}</p>}
          </div>
          <button onClick={onFechar} className="p-2.5 bg-white/[0.05] hover:bg-red-500/20 text-zinc-400 hover:text-white rounded-full transition-all">
            <Icon nome="x" />
          </button>
        </div>
        <div className="p-8 space-y-5 overflow-y-auto custom-scrollbar">{children}</div>
        {rodape && <div className="px-8 py-5 border-t border-white/[0.05] bg-black/40 flex justify-end gap-3">{rodape}</div>}
      </div>
    </div>
  )
  // Direto no <body>: fica por cima do cabeçalho e do menu (dentro da página ele ficava atrás e o topo sumia)
  return typeof document === 'undefined' ? janela : createPortal(janela, document.body)
}

export function Tabs<T extends string>({ abas, ativa, onChange }: { abas: { id: T; label: string }[]; ativa: T; onChange: (id: T) => void }) {
  return (
    <div className="flex overflow-x-auto custom-scrollbar pb-2 border-b border-white/[0.05] space-x-2">
      {abas.map((a) => (
        <button
          key={a.id}
          onClick={() => onChange(a.id)}
          className={`whitespace-nowrap px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
            ativa === a.id
              ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.5)]'
              : 'text-zinc-500 hover:text-white hover:bg-white/[0.02] border border-transparent'
          }`}
        >
          {a.label}
        </button>
      ))}
    </div>
  )
}

// Foto de perfil (quando existir) ou iniciais
export function Avatar({ texto, foto, tamanho = 'w-9 h-9', arredondado = 'rounded-xl', textoCls = 'text-xs' }: { texto: string; foto?: string; tamanho?: string; arredondado?: string; textoCls?: string }) {
  if (foto) {
    return <img src={foto} alt={texto} className={`${tamanho} ${arredondado} shrink-0 object-cover border border-white/[0.1] bg-black`} />
  }
  return (
    <div className={`${tamanho} ${arredondado} shrink-0 bg-white/[0.06] text-zinc-200 border border-white/[0.12] flex items-center justify-center font-black ${textoCls}`}>
      {texto}
    </div>
  )
}

export function Carregando() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-black">
      <svg className="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
    </div>
  )
}
