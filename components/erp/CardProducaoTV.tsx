'use client'

// Card da Produção na Visão TV: as etapas das escolas como na planilha da empresa —
// etapa • barra com os álbuns na frente • escolas • variação de hoje (verde subiu, vermelho desceu).
// O card é um "container" de tamanho: letras e barras acompanham o espaço que a tela dá para ele.

import { useMemo, type CSSProperties } from 'react'
import type { ErpState } from '@/lib/erp/types'
import { hoje, nomeMes, num } from '@/lib/erp/format'
import { painelEtapas } from '@/lib/erp/producao'
import { STATUS } from './status'

const tamanho: CSSProperties = { containerType: 'size' }
const VERDE = STATUS.bom.cor
const VERMELHO = STATUS.critico.cor
// etapa • álbuns • escolas • hoje
const COLUNAS = 'minmax(0, 44fr) minmax(0, 36fr) minmax(0, 9fr) minmax(0, 11fr)'

// nome da etapa; o que vem entre parênteses sai um pouco menor, para caber ao lado (ex.: "Aguardando aprovação (pagamento)")
function NomeEtapa({ nome }: { nome: string }) {
  const m = nome.match(/^(.*?)\s*(\(.+\))$/)
  if (!m) return <>{nome}</>
  return (
    <>
      {m[1]} <span className="text-[0.68em] whitespace-nowrap">{m[2]}</span>
    </>
  )
}

function Variacao({ v }: { v: number | null }) {
  if (v === null) return <span className="text-zinc-600">—</span>
  if (v === 0) return <span className="font-black text-zinc-500">0</span>
  return (
    <span className="font-black whitespace-nowrap" style={{ color: v > 0 ? VERDE : VERMELHO }}>
      {v > 0 ? '+' : '−'}
      {num(Math.abs(v))}
    </span>
  )
}

// compacto = card baixo (muita gente na tela): some a explicação de cada etapa
export function CardProducaoTV({ s, mes, compacto = false }: { s: ErpState; mes: string; compacto?: boolean }) {
  const hj = hoje()
  const { linhas, total } = useMemo(() => painelEtapas(s, mes, hj), [s, mes, hj])
  const max = Math.max(1, ...linhas.map((l) => l.albuns))
  return (
    <div style={tamanho} className="h-full w-full min-h-0">
      <div
        className="h-full w-full rounded-3xl border-2 border-pink-500/50 bg-painel/80 p-[2.4cqmin] flex flex-col gap-[1.2cqmin] overflow-hidden"
        style={{ background: 'linear-gradient(160deg, rgba(236,72,153,0.16) 0%, transparent 60%)' }}
      >
        {/* cabeçalho: total que ainda não chegou na caixa */}
        <div className="flex items-start justify-between gap-[2cqmin] min-w-0">
          <div className="min-w-0">
            <p className="font-black uppercase tracking-[0.2em] text-pink-400 text-[clamp(8px,2.4cqmin,15px)]">Produção</p>
            <p className="font-black text-white leading-tight truncate text-[clamp(11px,4cqmin,28px)]">Etapas das escolas</p>
          </div>
          <div className="text-right shrink-0 leading-tight">
            <p className="font-bold uppercase tracking-widest text-zinc-400 text-[clamp(7px,2cqmin,13px)]">Total (exceto na caixa)</p>
            <p className="font-black text-white whitespace-nowrap text-[clamp(12px,4.4cqmin,32px)]">
              {num(total.albuns)}
              <span className="text-zinc-400 text-[0.55em]"> álbuns • {num(total.escolas)} escolas</span>
              {total.variacao !== null && (
                <span className="text-[0.6em] ml-[1cqmin]">
                  <Variacao v={total.variacao} />
                </span>
              )}
            </p>
          </div>
        </div>

        {/* títulos das colunas */}
        <div className="grid gap-[1.6cqmin] px-[1.2cqmin] font-bold uppercase tracking-widest text-zinc-500 text-[clamp(7px,1.9cqmin,13px)]" style={{ gridTemplateColumns: COLUNAS }}>
          <span>Etapa</span>
          <span>Álbuns</span>
          <span className="text-center">Escolas</span>
          <span className="text-right">Hoje</span>
        </div>

        {/* uma linha por etapa: a barra é do tamanho dos álbuns e o número vem na frente */}
        <div className="flex-1 min-h-0 grid gap-[0.9cqmin]" style={{ gridTemplateRows: `repeat(${linhas.length}, minmax(0, 1fr))` }}>
          {linhas.map((l, i) => (
            <div key={l.nome} className="grid items-center gap-[1.6cqmin] rounded-xl bg-white/[0.03] border border-white/[0.05] px-[1.2cqmin] min-h-0" style={{ gridTemplateColumns: COLUNAS }}>
              <div className="flex items-center gap-[1.4cqmin] min-w-0">
                <span
                  className="shrink-0 rounded-full flex items-center justify-center font-black w-[clamp(16px,4.6cqmin,34px)] h-[clamp(16px,4.6cqmin,34px)] text-[clamp(8px,2.4cqmin,17px)]"
                  style={{ backgroundColor: l.cor, color: '#111111' }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-black text-white leading-tight line-clamp-3 text-[clamp(10px,3.2cqmin,24px)]">
                    <NomeEtapa nome={l.nome} />
                  </p>
                  {!compacto && <p className="text-zinc-400 leading-tight truncate text-[clamp(7px,1.9cqmin,14px)]">{l.descricao}</p>}
                </div>
              </div>
              <div className="flex items-center gap-[1cqmin] min-w-0 h-[55%] max-h-[7cqmin]">
                <div
                  className="h-full rounded-md shrink-0 transition-all duration-700"
                  style={{ width: `${(l.albuns / max) * 76}%`, minWidth: l.albuns > 0 ? 4 : 2, backgroundColor: l.albuns > 0 ? l.cor : 'rgba(127,127,127,0.25)' }}
                ></div>
                <span className="font-black text-white whitespace-nowrap text-[clamp(11px,3.8cqmin,30px)]">{num(l.albuns)}</span>
                {l.atrasadas > 0 && (
                  <span className="font-black whitespace-nowrap text-[clamp(8px,2.3cqmin,16px)]" style={{ color: VERMELHO }} title="Escolas com o editor fora do prazo">
                    ⚠ {l.atrasadas} atrasada{l.atrasadas > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <span className="text-center font-black text-zinc-200 text-[clamp(10px,3.2cqmin,24px)]">{num(l.escolas)}</span>
              <span className="text-right text-[clamp(10px,3.2cqmin,24px)]">
                <Variacao v={l.variacao} />
              </span>
            </div>
          ))}
        </div>

        {!compacto && (
          <p className="font-bold text-zinc-500 truncate text-[clamp(7px,1.8cqmin,12px)]">
            Na caixa = escolas que chegaram na caixa em {nomeMes(mes).split(' / ')[0]} • Hoje = quanto mudou desde o fim de ontem
          </p>
        )}
      </div>
    </div>
  )
}
