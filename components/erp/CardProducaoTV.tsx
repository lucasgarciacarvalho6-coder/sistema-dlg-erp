'use client'

// Card da Produção na Visão TV: as etapas das escolas como na planilha da empresa —
// etapa • barra com os álbuns na frente • escolas (a coluna "Hoje" saiu em 05/10/2026: embolava o card).
// Etapas neutras (regra do ADM: cor só para alerta). A linha fica VERMELHA com entrega do editor atrasada
// e AMARELA com escola parada na etapa além do prazo (2, 3 ou 5 dias úteis). No fim, a linha "Atrasadas".
// O card é um "container" de tamanho: letras e barras acompanham o espaço que a tela dá para ele.

import { useMemo } from 'react'
import type { ErpState } from '@/lib/erp/types'
import { hoje, num } from '@/lib/erp/format'
import { painelEtapas, type LinhaPainel } from '@/lib/erp/producao'
import { STATUS } from './status'

// o card é um "container" de tamanho pela classe cq-tamanho (globals.css), que o complemento das TVs antigas enxerga
const VERDE = STATUS.bom.cor
const AMARELO = STATUS.atencao.cor
const VERMELHO = STATUS.critico.cor
// etapa • álbuns • escolas
const COLUNAS = 'minmax(0, 44fr) minmax(0, 46fr) minmax(0, 10fr)'

// cor da linha: só quando há alerta
const corDaLinha = (l: LinhaPainel) => (l.atrasadas > 0 ? VERMELHO : l.paradas > 0 ? AMARELO : null)

// nome da etapa; o que vem entre parênteses sai um pouco menor, para caber ao lado (ex.: "Etapa (detalhe)")
function NomeEtapa({ nome }: { nome: string }) {
  const m = nome.match(/^(.*?)\s*(\(.+\))$/)
  if (!m) return <>{nome}</>
  return (
    <>
      {m[1]} <span className="text-[0.68em] whitespace-nowrap">{m[2]}</span>
    </>
  )
}

// compacto = card baixo (muita gente na tela): some a explicação de cada etapa
export function CardProducaoTV({ s, mes, compacto = false }: { s: ErpState; mes: string; compacto?: boolean }) {
  const hj = hoje()
  const { linhas, total, atrasadas: fora } = useMemo(() => painelEtapas(s, mes, hj), [s, mes, hj])
  const corFora = fora.editor ? VERMELHO : fora.paradas ? AMARELO : null
  const max = Math.max(1, ...linhas.map((l) => l.albuns))
  const atrasadas = linhas.reduce((a, l) => a + l.atrasadas, 0)
  const paradas = linhas.reduce((a, l) => a + l.paradas, 0)
  return (
    <div className="cq-tamanho h-full w-full min-h-0">
      <div className="h-full w-full rounded-3xl border border-white/[0.2] bg-card-tv p-[2.4cqmin] flex flex-col gap-[1.2cqmin] overflow-hidden">
        {/* cabeçalho: situação (o que o gerente precisa ver) + total que ainda não chegou na caixa */}
        <div className="flex items-start justify-between gap-[2cqmin] min-w-0">
          <div className="min-w-0">
            <p className="font-black uppercase tracking-[0.2em] text-zinc-400 text-[clamp(8px,2.4cqmin,15px)]">Produção</p>
            <p className="font-black text-white leading-tight truncate text-[clamp(11px,4cqmin,28px)]">Etapas das escolas</p>
            <p className="font-bold leading-tight truncate text-[clamp(8px,2.3cqmin,16px)]" style={{ color: atrasadas ? VERMELHO : paradas ? AMARELO : VERDE }}>
              {atrasadas || paradas
                ? [atrasadas ? `⚠ ${num(atrasadas)} com o editor atrasada${atrasadas > 1 ? 's' : ''}` : '', paradas ? `${num(paradas)} parada${paradas > 1 ? 's' : ''} além do prazo` : '']
                    .filter(Boolean)
                    .join(' • ')
                : '✓ nenhum atraso'}
            </p>
          </div>
          <div className="text-right shrink-0 leading-tight">
            <p className="font-bold uppercase tracking-widest text-zinc-400 text-[clamp(7px,2cqmin,13px)]">Total (exceto na caixa)</p>
            <p className="font-black text-white whitespace-nowrap text-[clamp(12px,4.4cqmin,32px)]">
              {num(total.albuns)}
              <span className="text-zinc-400 text-[0.55em]"> álbuns • {num(total.escolas)} escolas</span>
            </p>
          </div>
        </div>

        {/* títulos das colunas */}
        <div className="grid gap-[1.6cqmin] px-[1.2cqmin] font-bold uppercase tracking-widest text-zinc-500 text-[clamp(7px,1.9cqmin,13px)]" style={{ gridTemplateColumns: COLUNAS }}>
          <span>Etapa</span>
          <span>Álbuns</span>
          <span className="text-center">Escolas</span>
        </div>

        {/* uma linha por etapa: a barra é do tamanho dos álbuns e o número vem na frente */}
        <div className="flex-1 min-h-0 grid gap-[0.9cqmin]" style={{ gridTemplateRows: `repeat(${linhas.length + 1}, minmax(0, 1fr))` }}>
          {linhas.map((l, i) => {
            const cor = corDaLinha(l)
            return (
              <div key={l.nome} className="grid items-center gap-[1.6cqmin] rounded-xl bg-white/[0.03] border border-white/[0.05] px-[1.2cqmin] min-h-0" style={{ gridTemplateColumns: COLUNAS }}>
                <div className="flex items-center gap-[1.4cqmin] min-w-0">
                  <span className="shrink-0 rounded-full flex items-center justify-center font-black bg-white/[0.08] text-zinc-300 w-[clamp(16px,4.6cqmin,34px)] h-[clamp(16px,4.6cqmin,34px)] text-[clamp(8px,2.4cqmin,17px)]">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-black text-white leading-tight line-clamp-3 text-[clamp(10px,2.8cqmin,22px)]">
                      <NomeEtapa nome={l.nome} />
                    </p>
                    {!compacto && <p className="text-zinc-400 leading-tight truncate text-[clamp(7px,1.9cqmin,14px)]">{l.descricao}</p>}
                  </div>
                </div>
                {/* barra com os álbuns na frente; o aviso (atrasada / parada) vai numa linha embaixo, para a barra manter o tamanho */}
                <div className="flex flex-col justify-center gap-[0.5cqmin] min-w-0 h-full overflow-hidden">
                  <div className="flex items-center gap-[1cqmin] min-w-0 h-[50%] max-h-[6.5cqmin]">
                    <div
                      className={`h-full rounded-md transition-all duration-700 ${cor ? '' : l.albuns > 0 ? 'bg-zinc-400/80' : 'bg-white/[0.08]'}`}
                      style={{ flex: `0 1 ${(l.albuns / max) * 76}%`, minWidth: l.albuns > 0 ? 4 : 2, ...(cor ? { backgroundColor: cor } : {}) }}
                    ></div>
                    <span className="shrink-0 font-black whitespace-nowrap text-[clamp(11px,3.8cqmin,30px)] text-white" style={cor ? { color: cor } : undefined}>
                      {num(l.albuns)}
                    </span>
                  </div>
                  {l.atrasadas > 0 ? (
                    <span className="font-black leading-none truncate text-[clamp(8px,2.2cqmin,15px)]" style={{ color: VERMELHO }} title="Escolas com o editor fora da data prevista">
                      ⚠ {num(l.atrasadas)} atrasada{l.atrasadas > 1 ? 's' : ''}
                    </span>
                  ) : (
                    l.paradas > 0 && (
                      <span className="font-black leading-none truncate text-[clamp(8px,2.2cqmin,15px)]" style={{ color: AMARELO }} title={`Escolas há mais de ${l.prazo} dias úteis nesta etapa`}>
                        ⏸ {num(l.paradas)} parada{l.paradas > 1 ? 's' : ''} +{l.prazo} dias
                      </span>
                    )
                  )}
                </div>
                <span className="text-center font-black text-zinc-200 text-[clamp(10px,3.2cqmin,24px)]">{num(l.escolas)}</span>
              </div>
            )
          })}

          {/* Atrasadas: as escolas fora do prazo de todas as etapas (não soma no total: são as mesmas escolas das linhas acima) */}
          <div className="grid items-center gap-[1.6cqmin] rounded-xl bg-white/[0.03] border border-dashed border-white/[0.15] px-[1.2cqmin] min-h-0" style={{ gridTemplateColumns: COLUNAS }}>
            <div className="flex items-center gap-[1.4cqmin] min-w-0">
              <span
                className="shrink-0 rounded-full flex items-center justify-center font-black bg-white/[0.08] w-[clamp(16px,4.6cqmin,34px)] h-[clamp(16px,4.6cqmin,34px)] text-[clamp(8px,2.4cqmin,17px)]"
                style={{ color: corFora ?? undefined }}
              >
                ⚠
              </span>
              <div className="min-w-0">
                <p className="font-black text-white leading-tight line-clamp-2 text-[clamp(10px,2.8cqmin,22px)]">Atrasadas</p>
                {!compacto && <p className="text-zinc-400 leading-tight truncate text-[clamp(7px,1.9cqmin,14px)]">editor fora do prazo ou parada além do prazo</p>}
              </div>
            </div>
            <div className="flex flex-col justify-center gap-[0.5cqmin] min-w-0 h-full overflow-hidden">
              <div className="flex items-center gap-[1cqmin] min-w-0 h-[50%] max-h-[6.5cqmin]">
                <div
                  className={`h-full rounded-md transition-all duration-700 ${corFora ? '' : 'bg-white/[0.08]'}`}
                  style={{ flex: `0 1 ${(fora.albuns / max) * 76}%`, minWidth: fora.albuns > 0 ? 4 : 2, ...(corFora ? { backgroundColor: corFora } : {}) }}
                ></div>
                <span className="shrink-0 font-black whitespace-nowrap text-[clamp(11px,3.8cqmin,30px)] text-white" style={corFora ? { color: corFora } : undefined}>
                  {num(fora.albuns)}
                </span>
              </div>
              <span className="font-black leading-none truncate text-[clamp(8px,2.2cqmin,15px)]">
                {fora.escolas === 0 ? (
                  <span style={{ color: VERDE }}>✓ nenhuma</span>
                ) : (
                  <>
                    {fora.editor > 0 && <span style={{ color: VERMELHO }}>⚠ {num(fora.editor)} editor</span>}
                    {fora.editor > 0 && fora.paradas > 0 && <span className="text-zinc-500"> • </span>}
                    {fora.paradas > 0 && <span style={{ color: AMARELO }}>⏸ {num(fora.paradas)} parada{fora.paradas > 1 ? 's' : ''}</span>}
                  </>
                )}
              </span>
            </div>
            <span className="text-center font-black text-[clamp(10px,3.2cqmin,24px)] text-zinc-200" style={corFora ? { color: corFora } : undefined}>
              {num(fora.escolas)}
            </span>
          </div>
        </div>

        {!compacto && (
          <p className="font-bold text-zinc-500 truncate text-[clamp(7px,1.8cqmin,12px)]">
            <span style={{ color: VERMELHO }}>Vermelho</span> = editor atrasado • <span style={{ color: AMARELO }}>Amarelo</span> = parada além do prazo (2, 3 ou 5 dias úteis) • Na caixa = o estoque de agora
          </p>
        )}
      </div>
    </div>
  )
}
