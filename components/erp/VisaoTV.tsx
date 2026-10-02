'use client'

// Gráficos da Visão TV, desenhados para leitura rápida (inclusive à distância, numa TV):
//  • COR = SITUAÇÃO, não setor: verde = no ritmo, amarelo = atenção, vermelho = abaixo.
//    O nome do setor vai sempre escrito. (As cores de setor antigas — azul × violeta —
//    eram indistinguíveis para daltônicos; o validador de paleta reprovou.)
//  • Cada gráfico responde UMA pergunta: "estou no ritmo da meta?".

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Colaborador, ErpState, Setor } from '@/lib/erp/types'
import { SETORES, SETORES_PRODUTIVOS } from '@/lib/erp/config'
import { diaReferencia, equipeComMeta, esperadoAteHoje, resumo, serieMes, setoresComMeta, situacaoResumo, somar } from '@/lib/erp/metrics'
import { brl, formatar, mesAtual, nomeMes, num, pct } from '@/lib/erp/format'
import { GradeTV } from './CardsTV'
import { FaixaGerente } from './GerenteVirtual'
import Icon from './Icon'
import { LegendaSituacao, PillSituacao, STATUS } from './status'
import { ehDiaUtil } from '@/lib/erp/calendario'


// Cores do gráfico via variáveis de tema (mudam sozinhas no tema claro)
const COR_META = 'var(--color-zinc-500)' // linha da meta (cinza neutro)
const SUPERFICIE = 'var(--t-painel)' // anel em volta dos pontos
const COR_GRADE = 'var(--color-zinc-800)'

// ---------------------------------------------------------------------------
// PLACAR DAS ÁREAS — uma linha por setor: barra da meta do mês + marca "hoje deveria estar aqui"
// ---------------------------------------------------------------------------
export function PlacarAreas({ s, mes, grande = false }: { s: ErpState; mes: string; grande?: boolean }) {
  const esperado = esperadoAteHoje(mes)
  const atual = mes === mesAtual()

  return (
    <div className="bg-painel/80 border border-white/[0.05] rounded-3xl shadow-2xl overflow-hidden">
      <div className={`border-b border-white/[0.05] flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white/[0.01] ${grande ? 'px-8 py-4' : 'p-6'}`}>
        <div>
          <h2 className={`font-black text-white tracking-wide ${grande ? 'text-2xl' : 'text-lg'}`}>Placar das áreas • meta do mês</h2>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">
            A barra é o quanto cada área já fez da meta de {nomeMes(mes)}. O traço vertical é onde ela deveria estar {atual ? 'hoje' : 'no fim do mês'}.
          </p>
        </div>
        <LegendaSituacao esperado={esperado} />
      </div>

      <div className="divide-y divide-white/[0.03]">
        {setoresComMeta(s, mes).map((setor) => {
          const cfg = SETORES[setor]
          const ind = cfg.indicadores[0]
          const r = resumo(s, setor, ind.id, mes)
          const sit = situacaoResumo(r, mes)
          const semMeta = r.meta.mensal <= 0
          return (
            <div key={setor} className={`grid grid-cols-12 items-center gap-4 ${grande ? 'px-8 py-3.5' : 'px-6 py-5'}`}>
              <div className="col-span-12 md:col-span-3 min-w-0">
                <p className={`font-black text-white ${grande ? 'text-2xl' : 'text-base'}`}>{cfg.nome}</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest truncate">{ind.label}</p>
              </div>

              <div className="col-span-12 md:col-span-6">
                {semMeta ? (
                  <p className="text-xs text-zinc-500">Sem colaboradores com meta neste setor.</p>
                ) : (
                  <>
                    <div className={`relative w-full rounded-full bg-white/[0.06] ${grande ? 'h-5' : 'h-3.5'}`} title={`${pct(r.pctMes)} da meta • esperado ${pct(esperado)}`}>
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, r.pctMes)}%`, backgroundColor: STATUS[sit].cor }}
                      ></div>
                      <div className="absolute -inset-y-1.5 w-0.5 bg-white rounded" style={{ left: `calc(${Math.min(100, esperado)}% - 1px)` }}></div>
                      {r.piso > 0 && (
                        <div
                          className="absolute -top-1.5 w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px]"
                          style={{ left: `calc(${Math.min(100, (r.piso / r.meta.mensal) * 100)}% - 5px)`, borderTopColor: STATUS.atencao.cor }}
                          title={`Piso do mês: ${formatar(r.piso, ind.unidade)}`}
                        ></div>
                      )}
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                      <span>
                        Feito: <span className="text-white">{formatar(r.mes, ind.unidade)}</span> de {formatar(r.meta.mensal, ind.unidade)}
                        {r.piso > 0 && <span style={{ color: STATUS.atencao.cor }}> • piso {formatar(r.piso, ind.unidade)}</span>}
                      </span>
                      <span>
                        {atual ? (
                          <>
                            Hoje: <span className="text-white">{formatar(r.hoje, ind.unidade)}</span> / {formatar(r.meta.diaria, ind.unidade)} {r.pctDia >= 100 ? '✓' : ''}
                          </>
                        ) : (
                          <>Projeção: {formatar(r.projecao, ind.unidade)}</>
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className={`col-span-12 md:col-span-3 flex items-center md:items-end justify-between gap-2 ${grande ? 'md:flex-row md:items-center md:justify-end md:gap-4' : 'md:flex-col'}`}>
                <p className={`font-black text-white tracking-tighter leading-none ${grande ? 'text-4xl' : 'text-3xl'}`}>{semMeta ? '—' : pct(r.pctMes)}</p>
                {!semMeta && <PillSituacao situacao={sit} grande={grande} />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EVOLUÇÃO DO MÊS — acumulado realizado × linha da meta (uma área por gráfico)
// ---------------------------------------------------------------------------
function acumulados(s: ErpState, setor: Setor, indicadorId: string, mes: string, metaMensal: number) {
  const diaria = serieMes(s.lancamentos, { setor, indicador: indicadorId }, mes)
  const uteis = diaria.map((_, i) => ehDiaUtil(`${mes}-${String(i + 1).padStart(2, '0')}`))
  const totalUteis = uteis.filter(Boolean).length || 1
  let soma = 0
  let uteisAte = 0
  return diaria.map((v, i) => {
    soma += v
    if (uteis[i]) uteisAte++
    return { dia: i + 1, realizado: soma, meta: (metaMensal * uteisAte) / totalUteis }
  })
}

export function EvolucaoSetor({ s, setor, mes, grande = false }: { s: ErpState; setor: Setor; mes: string; grande?: boolean }) {
  const cfg = SETORES[setor]
  const ind = cfg.indicadores[0]
  const r = resumo(s, setor, ind.id, mes)
  const sit = situacaoResumo(r, mes)
  const cor = STATUS[sit].cor
  const pontos = acumulados(s, setor, ind.id, mes, r.meta.mensal)
  const ultimoDia = mes === mesAtual() ? diaReferencia(mes) : pontos.length
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Geometria (viewBox fixo; o SVG escala proporcionalmente)
  const W = 320
  const H = 150
  const P = { esq: 6, dir: 44, topo: 14, base: 22 }
  const maxY = Math.max(1, r.meta.mensal, pontos[pontos.length - 1]?.realizado ?? 0) * 1.08
  const x = (dia: number) => P.esq + ((dia - 1) / Math.max(1, pontos.length - 1)) * (W - P.esq - P.dir)
  const y = (v: number) => H - P.base - (v / maxY) * (H - P.topo - P.base)

  const linha = (arr: { dia: number; v: number }[]) => arr.map((p, i) => `${i ? 'L' : 'M'}${x(p.dia).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const reais = pontos.slice(0, ultimoDia).map((p) => ({ dia: p.dia, v: p.realizado }))
  const metas = pontos.map((p) => ({ dia: p.dia, v: p.meta }))
  const area = reais.length ? `${linha(reais)} L${x(reais[reais.length - 1].dia).toFixed(1)},${y(0)} L${x(1).toFixed(1)},${y(0)} Z` : ''
  const fim = reais[reais.length - 1]

  const aoMover = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box) return
    const px = ((e.clientX - box.left) / box.width) * W
    const dia = Math.round(((px - P.esq) / (W - P.esq - P.dir)) * (pontos.length - 1)) + 1
    setHover(Math.min(pontos.length, Math.max(1, dia)))
  }
  const ph = hover ? pontos[hover - 1] : null

  return (
    <div className={`bg-painel/80 border border-white/[0.05] rounded-3xl ${grande ? 'p-7' : 'p-5'} relative`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className={`font-black text-white ${grande ? 'text-2xl' : 'text-base'}`}>{cfg.nome}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest truncate">{ind.label} • acumulado no mês</p>
        </div>
        <PillSituacao situacao={sit} grande={grande} />
      </div>

      <div className="flex items-end gap-3 mb-2">
        <p className={`font-black text-white tracking-tighter leading-none ${grande ? 'text-5xl' : 'text-3xl'}`}>{formatar(r.mes, ind.unidade)}</p>
        <p className="text-[11px] text-zinc-500 font-bold pb-0.5">
          de {formatar(r.meta.mensal, ind.unidade)} • {pct(r.pctMes)}
        </p>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto overflow-visible"
          onMouseMove={aoMover}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`${cfg.nome}: ${formatar(r.mes, ind.unidade)} de ${formatar(r.meta.mensal, ind.unidade)} no mês`}
        >
          {/* grade: base e linha da meta mensal (hairlines sólidas) */}
          <line x1={P.esq} x2={W - P.dir} y1={y(0)} y2={y(0)} style={{ stroke: COR_GRADE }} strokeWidth="1" />
          <line x1={P.esq} x2={W - P.dir} y1={y(r.meta.mensal)} y2={y(r.meta.mensal)} style={{ stroke: COR_GRADE }} strokeWidth="1" />
          <text x={P.esq} y={y(r.meta.mensal) - 4} style={{ fill: 'var(--color-zinc-400)' }} fontSize="9" fontWeight="700">
            META {formatar(r.meta.mensal, ind.unidade)}
          </text>

          {/* linha da meta acumulada */}
          <path d={linha(metas)} fill="none" style={{ stroke: COR_META }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {/* realizado */}
          {area && <path d={area} fill={cor} opacity="0.1" />}
          {reais.length > 0 && <path d={linha(reais)} fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
          {fim && (
            <>
              <circle cx={x(fim.dia)} cy={y(fim.v)} r="4.5" fill={cor} style={{ stroke: SUPERFICIE }} strokeWidth="2" />
              <text x={x(fim.dia) + 8} y={y(fim.v) + 3} style={{ fill: 'var(--color-white)' }} fontSize="10" fontWeight="800">
                {ind.unidade === 'brl' ? brl(fim.v).replace(',00', '') : num(fim.v)}
              </text>
            </>
          )}

          {/* eixo x: início, meio e fim do mês */}
          {[1, Math.ceil(pontos.length / 2), pontos.length].map((d) => (
            <text key={d} x={x(d)} y={H - 6} style={{ fill: 'var(--color-zinc-500)' }} fontSize="9" fontWeight="700" textAnchor={d === 1 ? 'start' : d === pontos.length ? 'end' : 'middle'}>
              dia {d}
            </text>
          ))}

          {/* hover: linha vertical + pontos */}
          {ph && (
            <>
              <line x1={x(ph.dia)} x2={x(ph.dia)} y1={P.topo} y2={y(0)} style={{ stroke: 'var(--color-zinc-600)' }} strokeWidth="1" />
              <circle cx={x(ph.dia)} cy={y(ph.meta)} r="4" style={{ fill: COR_META, stroke: SUPERFICIE }} strokeWidth="2" />
              {ph.dia <= ultimoDia && <circle cx={x(ph.dia)} cy={y(ph.realizado)} r="4" fill={cor} style={{ stroke: SUPERFICIE }} strokeWidth="2" />}
            </>
          )}
          {/* área de captura do mouse maior que as marcas */}
          <rect x="0" y="0" width={W} height={H} fill="transparent" />
        </svg>

        {ph && (
          <div
            className="absolute top-0 -translate-x-1/2 bg-white text-black rounded-lg px-3 py-2 text-[11px] font-bold shadow-xl pointer-events-none whitespace-nowrap z-10"
            style={{ left: `${(x(ph.dia) / W) * 100}%` }}
          >
            <p className="font-black">Dia {ph.dia}</p>
            {ph.dia <= ultimoDia ? <p>Feito: {formatar(ph.realizado, ind.unidade)}</p> : <p className="text-zinc-500">Ainda não chegou</p>}
            <p className="text-zinc-600">Meta até aqui: {formatar(ph.meta, ind.unidade)}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-5 mt-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
        <span className="flex items-center gap-2">
          <span className="w-4 h-0.5 rounded" style={{ backgroundColor: cor }}></span> Realizado
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 h-0.5 rounded" style={{ backgroundColor: COR_META }}></span> Meta
        </span>
      </div>
    </div>
  )
}

export function GradeEvolucao({ s, mes, grande = false }: { s: ErpState; mes: string; grande?: boolean }) {
  return (
    <div className="space-y-4">
      {!grande && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 bg-zinc-500 rounded-full"></span>
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Evolução do mês • realizado × meta</h2>
          </div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Linha colorida acima da cinza = à frente da meta • passe o mouse para ver cada dia</p>
        </div>
      )}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${grande ? 'xl:grid-cols-3 gap-6' : 'xl:grid-cols-3 gap-5'}`}>
        {setoresComMeta(s, mes).map((setor) => (
          <EvolucaoSetor key={setor} s={s} setor={setor} mes={mes} grande={grande} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MODO TV — tela cheia só com a Visão TV, com rotação automática de telas
// ---------------------------------------------------------------------------
const SEGUNDOS_POR_TELA = 20

function RelogioTV() {
  const [agora, setAgora] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setAgora(new Date())
    tick()
    const t = setInterval(tick, 1000 * 15)
    return () => clearInterval(t)
  }, [])
  if (!agora) return null
  return (
    <div className="text-right">
      <p className="text-3xl font-black text-white tracking-tight leading-none">{agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-1">{agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
    </div>
  )
}

function NumeroTV({ rotulo, valor, detalhe }: { rotulo: string; valor: ReactNode; detalhe: ReactNode }) {
  return (
    <div className="bg-painel-2/80 border border-white/[0.08] rounded-3xl px-7 py-5 relative overflow-hidden">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">{rotulo}</p>
      <p className="text-5xl 2xl:text-6xl font-black text-white tracking-tighter mt-2 leading-none break-words">{valor}</p>
      <p className="text-xs text-zinc-500 mt-2 uppercase tracking-widest font-bold">{detalhe}</p>
    </div>
  )
}

export function ModoTV({ s, mes, onSair, telaInicial = 0 }: { s: ErpState; mes: string; onSair: () => void; telaInicial?: number }) {
  const raiz = useRef<HTMLDivElement>(null)
  const sairRef = useRef(onSair)
  const [indice, setIndice] = useState(telaInicial)
  const [rodando, setRodando] = useState(true)

  useEffect(() => {
    sairRef.current = onSair
  }, [onSair])

  const pessoas: Colaborador[] = useMemo(
    () =>
      SETORES_PRODUTIVOS.flatMap((setor) => equipeComMeta(s, setor, mes))
        .map((c) => ({ c, p: resumo(s, c.setor, SETORES[c.setor].indicadores[0].id, mes, c.id).pctMes }))
        .sort((a, b) => b.p - a.p)
        .map((x) => x.c),
    [s, mes],
  )
  const telas = [
    { id: 'resumo', titulo: 'Resumo das áreas' },
    // toda a equipe numa tela só: os cards se encaixam e diminuem conforme entra gente
    ...(pessoas.length ? [{ id: 'equipe', titulo: 'Equipe' }] : []),
    { id: 'evolucao', titulo: 'Evolução do mês' },
  ]
  const atual = telas[indice % telas.length]

  // Entra em tela cheia de verdade (o navegador pode recusar; o overlay funciona mesmo assim)
  useEffect(() => {
    const el = raiz.current
    el?.requestFullscreen?.().catch(() => undefined)
    const aoMudar = () => {
      if (!document.fullscreenElement) sairRef.current()
    }
    document.addEventListener('fullscreenchange', aoMudar)
    return () => {
      document.removeEventListener('fullscreenchange', aoMudar)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  // Rotação automática + teclado (← → trocam, espaço pausa, Esc sai)
  useEffect(() => {
    if (!rodando) return
    const t = setInterval(() => setIndice((i) => (i + 1) % telas.length), SEGUNDOS_POR_TELA * 1000)
    return () => clearInterval(t)
  }, [rodando, telas.length])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndice((i) => (i + 1) % telas.length)
      else if (e.key === 'ArrowLeft') setIndice((i) => (i - 1 + telas.length) % telas.length)
      else if (e.key === ' ') {
        e.preventDefault()
        setRodando((r) => !r)
      } else if (e.key === 'Escape') sairRef.current()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [telas.length])

  const faturado = somar(s.lancamentos, { setor: 'cobranca', indicador: 'valor_recebido', mes })
  const fotografado = resumo(s, 'operacional', 'fichas', mes)
  const contratos = resumo(s, 'vendas', 'contratos', mes)
  const books = resumo(s, 'producao', 'books', mes)

  let conteudo: ReactNode
  if (atual.id === 'resumo') {
    conteudo = (
      <div className="space-y-6">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
          <NumeroTV rotulo="Faturado no mês" valor={brl(faturado).replace(',00', '')} detalhe="Recebimentos da Cobrança" />
          <NumeroTV rotulo="Fichas fotografadas" valor={num(fotografado.mes)} detalhe={`${pct(fotografado.pctMes)} da meta mensal`} />
          <NumeroTV rotulo="Contratos fechados" valor={num(contratos.mes)} detalhe={`Meta ${num(contratos.meta.mensal)} • hoje ${num(contratos.hoje)}`} />
          <NumeroTV rotulo="Álbuns revelados" valor={num(books.mes)} detalhe={`Hoje ${num(books.hoje)}`} />
        </div>
        <PlacarAreas s={s} mes={mes} grande />
      </div>
    )
  } else if (atual.id === 'equipe') {
    conteudo = (
      <div className="h-[calc(100vh-15.5rem)] 2xl:h-[calc(100vh-17rem)]">
        <GradeTV s={s} mes={mes} pessoas={pessoas} producao ajustar />
      </div>
    )
  } else {
    conteudo = <GradeEvolucao s={s} mes={mes} grande />
  }

  return (
    <div ref={raiz} className="fixed inset-0 z-[100] bg-black text-white overflow-y-auto custom-scrollbar">

      <div className="relative z-10 px-8 py-6 2xl:p-10 space-y-5 max-w-[2200px] mx-auto">
        {/* barra superior */}
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <img src="/logo.png" alt="DLG Photos" className="w-14 h-14 object-contain" />
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-zinc-300"></span>
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400">Ao vivo</span>
              </div>
              <h1 className="text-3xl font-black tracking-tight mt-1">
                {atual.titulo} <span className="text-zinc-600 font-bold text-xl">• {nomeMes(mes)}</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              {telas.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => setIndice(i)}
                  title={t.titulo}
                  className={`h-2 rounded-full transition-all ${i === indice % telas.length ? 'w-8 bg-blue-500' : 'w-2 bg-white/20 hover:bg-white/40'}`}
                ></button>
              ))}
            </div>
            <button onClick={() => setRodando((r) => !r)} className="px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300">
              {rodando ? `⏸ Pausar (${SEGUNDOS_POR_TELA}s)` : '▶ Rodar telas'}
            </button>
            <RelogioTV />
            <button onClick={onSair} title="Sair (Esc)" className="p-3 rounded-full bg-white/[0.05] hover:bg-red-500/20 text-zinc-400 hover:text-white transition-all">
              <Icon nome="x" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* gerente virtual: o que está atrasado ou parado, em todas as telas */}
        <FaixaGerente s={s} />

        {/* barra de progresso da rotação */}
        {rodando && (
          <div className="h-0.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
            <div key={`${atual.id}-${indice}`} className="h-full bg-zinc-500/70 animate-[tvprogresso_20s_linear_forwards]"></div>
          </div>
        )}

        <div key={atual.id} className="animate-fade-in">
          {conteudo}
        </div>

        <p className="text-center text-[10px] text-zinc-600 uppercase tracking-widest">← → trocar tela • espaço pausa • Esc sai</p>
      </div>

      <style>{`@keyframes tvprogresso { from { width: 0% } to { width: 100% } }`}</style>
    </div>
  )
}

