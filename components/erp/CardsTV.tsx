'use client'

// Cards da Visão TV do ADM: bateu o olho, sabe o que está acontecendo.
//  • Card da pessoa: card NEUTRO (regra do ADM: cor só para alerta). A cor da situação
//    (verde no ritmo • amarelo acima do piso • vermelho abaixo do piso) fica só no selo, no número do mês,
//    na barra da meta e nas barrinhas de cada dia útil; Hoje / Faltam ficam neutros.
//  • Card de Operações: maior, com 3 mini-cards: custo por ficha do mês (por dia útil, com a barra da meta do mês)
//    e do ano (por mês) — a barra é a quantidade de crianças fotografadas e o valor colorido é o R$ de cada ficha —
//    e a agenda dos próximos 20 dias (a projeção fica só nela).
//    Cards NEUTROS (regra do ADM: cor só para alerta). A cor fica nas barras dos gráficos (verde bom, amarelo
//    alerta, vermelho ruim) e no R$ (vermelho = o custo subiu / acima da média, verde = caiu / abaixo).
//  • Card da Produção (CardProducaoTV): as etapas das escolas como na planilha, do tamanho de 2×2 cards.
//  • GradeTV: todos os cards na mesma tela. Com mais gente, os cards diminuem e se encaixam sozinhos
//    (os textos e gráficos acompanham o tamanho do card).

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Colaborador, ErpState } from '@/lib/erp/types'
import { SETORES } from '@/lib/erp/config'
import { diasDeMeta, resumo, situacaoResumo } from '@/lib/erp/metrics'
import { brl, formatar, hoje, iniciais, nomeMes, num } from '@/lib/erp/format'
import { custoPorAluno, financeiroOperacoes } from '@/lib/erp/operacoes-financeiro'
import { META_BONUS, bonusAlbuns, lotesProducao, proximoBonus } from '@/lib/erp/producao'
import { lucroReboloAno, lucroReboloMes, mesAnteriorDe, ROTULOS_CUSTOS, variacaoLucro, type CustosLucroRebolo, type LucroRebolo } from '@/lib/erp/rebolo-lucro'
import { Avatar } from './ui'
import { STATUS } from './status'
import { corDoDia } from './PainelMeta'
import { LegendaAgendamento, useDados } from './PainelOperacoes'
import { CardProducaoTV } from './CardProducaoTV'

const VERDE = STATUS.bom.cor
const AMARELO = STATUS.atencao.cor
const VERMELHO = STATUS.critico.cor
const AZUL = '#3b82f6'
const UMA_CASA = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }) // 12,5
const reais = (v: number) => brl(v).replace(/\s/g, ' ').replace(/,00$/, '') // TV: sem os centavos redondos

// o card inteiro vira um "container" de tamanho (classe cq-tamanho, no globals.css): fontes e gráficos em cqmin
// acompanham o espaço. A letra calculada aqui vai em variáveis + classe cq-fonte (o complemento das TVs com
// navegador antigo só enxerga o que está no CSS, não o style do elemento).
const fonteCq = (min: number, cqw: number, max: number) => ({ '--f-min': `${min}px`, '--f-cqw': cqw.toFixed(2), '--f-max': `${max}px` }) as CSSProperties

const ROTULO_SITUACAO = { bom: '✓ No ritmo', atencao: '! Atenção', critico: '✕ Abaixo' } as const

// Barrinhas por dia (cor de cada dia vem de quem chama); futuro = trilho vazio; hoje com contorno.
// rotulo: o número de cada dia em cima da barra (pedido de 05/10/2026, para acompanhar a meta do dia);
// a letra acompanha a largura do card e a quantidade de dias, para os números caberem sem encavalar.
// diasGrandes: todos os dias com o número maior (a letra acompanha a largura do card)
function BarrasTV({ dias, valores, cor, rotulo, destaque, diasGrandes = false }: { dias: string[]; valores: (number | null)[]; cor: (v: number, i: number) => string; rotulo?: (v: number) => string; destaque?: string; diasGrandes?: boolean }) {
  const max = Math.max(1, ...valores.map((v) => v ?? 0))
  const n = Math.max(1, dias.length)
  const fonteDias = diasGrandes ? fonteCq(8, 88 / n / 1.35, 16) : undefined
  // largura do maior número em "em" (vírgula e ponto são estreitos), para a letra ficar o maior possível sem encavalar
  const largura = (t: string) => [...t].reduce((a, ch) => a + (ch === ',' || ch === '.' ? 0.3 : 0.62), 0.1)
  const maior = Math.max(1.3, ...valores.map((v) => (rotulo && v !== null ? largura(rotulo(v)) : 0)))
  const fonteNumeros = fonteCq(7, 84 / n / maior, 14)
  const espaco = rotulo ? '1.3em' : '0px' // lugar do número em cima da barra mais alta
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className={`flex-1 min-h-0 flex items-end gap-[2px] ${rotulo ? 'cq-fonte' : ''}`} style={rotulo ? fonteNumeros : undefined}>
        {valores.map((v, i) => (
          <div key={dias[i]} className="flex-1 h-full flex flex-col justify-end items-center min-w-0" title={`${dias[i].slice(8)}/${dias[i].slice(5, 7)}${v === null ? '' : `: ${rotulo ? rotulo(v) : num(v)}`}`}>
            {rotulo && v !== null && (
              <span className={`font-black leading-none mb-[0.2em] whitespace-nowrap ${v > 0 ? 'text-zinc-100' : 'text-zinc-600'}`}>{rotulo(v)}</span>
            )}
            <div
              className={`w-full rounded-t-[3px] ${dias[i] === destaque ? 'ring-2 ring-white/80' : ''}`}
              style={{ height: v === null ? '2px' : `max(${v > 0 ? 4 : 2}px, calc((100% - ${espaco}) * ${(v / max).toFixed(3)}))`, backgroundColor: v === null ? 'rgba(127,127,127,0.15)' : cor(v, i) }}
            ></div>
          </div>
        ))}
      </div>
      <div className={`flex gap-[2px] ${diasGrandes ? 'cq-fonte mt-[2px] pt-[2px] border-t border-white/[0.08]' : 'mt-[1px]'}`} style={fonteDias}>
        {dias.map((d, i) => (
          <span key={d} className={`flex-1 text-center font-bold min-w-0 leading-tight ${diasGrandes ? '' : 'text-[clamp(6px,2.2cqmin,10px)]'} ${d === destaque ? 'text-white' : diasGrandes ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {diasGrandes || i % 2 === 0 || d === destaque ? Number(d.slice(8)) : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

// sem cor = neutro (informação); com cor = situação
function Chip({ cor, children }: { cor?: string; children: ReactNode }) {
  return (
    <span
      className={`px-[1.6cqmin] py-[0.8cqmin] rounded-lg font-black whitespace-nowrap text-[clamp(9px,3.4cqmin,15px)] border ${cor ? '' : 'text-zinc-200 border-white/[0.12] bg-white/[0.04]'}`}
      style={cor ? { color: cor, borderColor: `${cor}66`, backgroundColor: `${cor}1f` } : undefined}
    >
      {children}
    </span>
  )
}

// legenda das barras: texto neutro com o ponto na cor que a barra usa
function ChipLegenda({ cor, children }: { cor: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[1cqmin] px-[1.6cqmin] py-[0.8cqmin] rounded-lg font-black whitespace-nowrap text-zinc-200 border border-white/[0.12] bg-white/[0.04] text-[clamp(9px,3.4cqmin,15px)]">
      <span className="w-[clamp(6px,2cqmin,10px)] h-[clamp(6px,2cqmin,10px)] rounded-full" style={{ backgroundColor: cor }}></span>
      {children}
    </span>
  )
}

// Produção: bônus do mês (R$ 300 aos 1.000 álbuns + R$ 30 a cada 100 completos acima)
function ChipBonus({ albuns }: { albuns: number }) {
  const valor = bonusAlbuns(albuns)
  const prox = proximoBonus(albuns)
  return valor > 0 ? (
    <Chip cor={VERDE}>
      💰 Bônus {reais(valor)} • +{reais(prox.valor)} em {num(prox.faltam)}
    </Chip>
  ) : (
    <Chip>
      💰 Bônus {reais(prox.valor)} aos {num(META_BONUS)}
    </Chip>
  )
}

// ---------------- Lucro/Prejuízo da vendedora do Rebolo (pedido de 07/10/2026) ----------------
// Pizza do mês: com lucro, o vendido dividido nos custos (tons de cinza: card neutro) e o lucro (verde);
// com prejuízo, o quanto as vendas cobriram dos custos (cinza) e o que faltou (vermelho).
// Embaixo das barrinhas dos dias, o lucro/prejuízo de cada mês do ano (verde lucro, vermelho prejuízo).
const CORES_CUSTOS: Record<keyof CustosLucroRebolo, string> = {
  album: '#d4d4d8',
  reserva: '#71717a',
  frete: '#a1a1aa',
  taxas: '#52525b',
  comissao: '#e4e4e7',
  salario: '#3f3f46',
}
type Fatia = { valor: number; cor: string; rotulo: string }

function Pizza({ partes }: { partes: Fatia[] }) {
  const validas = partes.filter((p) => p.valor > 0)
  const total = validas.reduce((a, p) => a + p.valor, 0)
  if (total <= 0) return <svg viewBox="0 0 100 100" className="w-full h-full"><circle cx="50" cy="50" r="48" fill="rgba(127,127,127,0.25)" /></svg>
  // ângulos acumulados (começa no topo, sentido horário)
  const angulos = validas.reduce<number[]>((acc, p) => [...acc, acc[acc.length - 1] + (p.valor / total) * 2 * Math.PI], [-Math.PI / 2])
  const ponto = (a: number) => `${(50 + 48 * Math.cos(a)).toFixed(2)},${(50 + 48 * Math.sin(a)).toFixed(2)}`
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" role="img" aria-label={validas.map((p) => `${p.rotulo} ${brl(p.valor)}`).join(', ')}>
      {validas.map((p, i) => {
        const a0 = angulos[i]
        const a1 = angulos[i + 1]
        const titulo = <title>{`${p.rotulo}: ${brl(p.valor)} (${UMA_CASA.format((p.valor / total) * 100)}%)`}</title>
        if (validas.length === 1) return <circle key={i} cx="50" cy="50" r="48" fill={p.cor}>{titulo}</circle>
        return (
          <path key={i} d={`M50,50 L${ponto(a0)} A48,48 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${ponto(a1)} Z`} fill={p.cor} stroke="rgba(0,0,0,0.35)" strokeWidth="0.6">
            {titulo}
          </path>
        )
      })}
    </svg>
  )
}

// (08/10) organizado em blocos: o título em cima, a pizza ao lado do valor; embaixo, em linhas inteiras,
// a comparação com o mês anterior, o vendido × custos e o que ainda é estimado (nada fica cortado na coluna estreita)
function LucroPizzaTV({ l, anterior, compacto }: { l: LucroRebolo; anterior: LucroRebolo | null; compacto: boolean }) {
  const comLucro = l.lucro >= 0 && l.vendido > 0
  const chaves = Object.keys(l.custos) as (keyof CustosLucroRebolo)[]
  const partes: Fatia[] = comLucro
    ? [...chaves.map((k) => ({ valor: l.custos[k], cor: CORES_CUSTOS[k], rotulo: ROTULOS_CUSTOS[k] })), { valor: l.lucro, cor: VERDE, rotulo: 'Lucro' }]
    : [{ valor: l.vendido, cor: '#71717a', rotulo: 'Coberto pelas vendas' }, { valor: -l.lucro, cor: VERMELHO, rotulo: 'Prejuízo' }]
  const v = variacaoLucro(l.lucro, anterior?.lucro)
  const estimado = [l.estimado.salario && 'salário', l.estimado.fretes > 0 && `${l.estimado.fretes} frete(s)`, l.estimado.taxas > 0 && `${l.estimado.taxas} taxa(s) do cartão`].filter(Boolean)
  const variacao = v !== null && (
    <span style={{ color: v >= 0 ? VERDE : VERMELHO }}>
      {v >= 0 ? '↑' : '↓'} {UMA_CASA.format(Math.abs(v))}%
    </span>
  )
  // card pequeno (09/10): o lucro numa linha só, para sobrar lugar para as barras das vendas de cada dia
  if (compacto)
    return (
      <div className="min-w-0 flex items-center gap-[1.6cqmin] leading-tight">
        <div className="shrink-0 w-[clamp(16px,7cqmin,40px)] h-[clamp(16px,7cqmin,40px)]">
          <Pizza partes={partes} />
        </div>
        <p className="min-w-0 flex-1 truncate font-bold text-zinc-400 text-[clamp(7px,2.7cqmin,13px)]">
          <span className="uppercase tracking-widest">Lucro/Prej. </span>
          <b className="font-black text-[clamp(9px,4cqmin,22px)]" style={{ color: l.lucro >= 0 ? VERDE : VERMELHO }}>
            {brl(l.lucro)}
          </b>{' '}
          {variacao}
        </p>
      </div>
    )
  return (
    <div className="min-w-0 flex flex-col gap-[0.8cqmin] leading-tight">
      <p className="font-bold uppercase tracking-widest text-zinc-400 truncate text-[clamp(7px,2.6cqmin,12px)]">Lucro/Prejuízo do mês</p>
      <div className="flex items-center gap-[2cqmin] min-w-0">
        <div className={`shrink-0 ${compacto ? 'w-[clamp(24px,10cqmin,60px)] h-[clamp(24px,10cqmin,60px)]' : 'w-[clamp(30px,12cqmin,80px)] h-[clamp(30px,12cqmin,80px)]'}`}>
          <Pizza partes={partes} />
        </div>
        <p className="min-w-0 flex-1 font-black tracking-tight whitespace-nowrap text-[clamp(13px,5.8cqmin,36px)]" style={{ color: l.lucro >= 0 ? VERDE : VERMELHO }}>
          {brl(l.lucro)}
        </p>
      </div>
      <p className="font-bold text-zinc-400 truncate text-[clamp(7px,2.7cqmin,13px)]">
        {variacao}
        {variacao ? ' • ' : ''}mês anterior <span className="text-white">{anterior ? brl(anterior.lucro) : '—'}</span>
      </p>
      <p className="text-zinc-500 truncate text-[clamp(7px,2.5cqmin,12px)]">
        Vendido <span className="text-zinc-300">{reais(l.vendido)}</span> • custos <span className="text-zinc-300">{reais(l.totalCustos)}</span>
      </p>
      {estimado.length > 0 && (
        <p className="text-zinc-500 truncate text-[clamp(6px,2.3cqmin,11px)]" title="Ainda não lançados: o cálculo usa a estimativa da Tabela de Preços do Rebolo">
          ≈ estimado: {estimado.join(', ')}
        </p>
      )}
    </div>
  )
}

const curtoRS = (v: number) => {
  const a = Math.abs(v)
  const t = a >= 1000 ? `${UMA_CASA.format(a / 1000)}k` : num(Math.round(a))
  return v < 0 ? `−${t}` : t
}

// barras do ano: acima da linha do zero = lucro (verde), abaixo = prejuízo (vermelho); "—" antes de começar.
// (08/10) o valor de cada mês em cima da barra (do prejuízo, acima da linha do zero); ocupa a altura que sobrar no card.
// soCardAlto: card pequeno — o gráfico só aparece se o card tiver altura (senão, o lugar fica para as barras dos dias)
function LucroMesesTV({ meses, ano, destaque, soCardAlto = false }: { meses: (LucroRebolo | null)[]; ano: string; destaque: number; soCardAlto?: boolean }) {
  const vals = meses.map((m) => (m ? m.lucro : null))
  const maxPos = Math.max(0, ...vals.map((v) => v ?? 0))
  const maxNeg = Math.max(0, ...vals.map((v) => -(v ?? 0)))
  const cima = maxPos + maxNeg > 0 ? maxPos / (maxPos + maxNeg) : 0.5
  const nomes = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  const rotulos = vals.map((v) => (v === null ? '' : curtoRS(v)))
  // a letra acompanha a largura do card: o maior valor cabe na largura da barra sem encostar no vizinho
  const largura = (t: string) => [...t].reduce((a, ch) => a + (ch === ',' || ch === '.' ? 0.3 : 0.62), 0.1)
  const maior = Math.max(1.3, ...rotulos.map(largura))
  const fonte = fonteCq(7, 86 / 12 / maior, 13)
  // o número fica sempre EM CIMA: do lucro, na ponta da barra verde; do prejuízo, logo acima da linha do zero (em vermelho)
  const folga = { paddingTop: '1.2em' }
  return (
    <div className={`${soCardAlto ? 'hidden [@container(min-height:380px)]:flex' : 'flex'} flex-[1.5] min-h-0 flex-col overflow-hidden`}>
      <p className="font-bold uppercase tracking-widest text-zinc-500 truncate text-[clamp(6px,2.3cqmin,11px)]">Lucro/Prejuízo por mês</p>
      <div className="cq-fonte flex-1 min-h-[24px] flex gap-[2px] mt-[0.4cqmin]" style={{ ...fonte, ...folga }}>
        {vals.map((v, i) => (
          <div key={i} className="flex-1 min-w-0 h-full flex flex-col" title={`${nomeMes(`${ano}-${String(i + 1).padStart(2, '0')}`)}: ${v === null ? 'sem conta' : brl(v)}`}>
            <div className="flex flex-col justify-end" style={{ height: `${cima * 100}%` }}>
              {v !== null && v > 0 && (
                <div className={`relative w-full rounded-t-[2px] ${i === destaque ? 'ring-1 ring-white/80' : ''}`} style={{ height: `${Math.max(4, (v / maxPos) * 100)}%`, backgroundColor: VERDE }}>
                  <span data-lucro-mes className="absolute bottom-full left-1/2 -translate-x-1/2 mb-[0.15em] font-black leading-none whitespace-nowrap text-zinc-100">{rotulos[i]}</span>
                </div>
              )}
            </div>
            <div className={`relative ${v === null ? 'h-[2px] bg-white/[0.08]' : 'h-px bg-white/[0.25]'}`}>
              {v !== null && v <= 0 && (
                <span data-lucro-mes className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-[0.2em] font-black leading-none whitespace-nowrap ${v < 0 ? '' : 'text-zinc-500'}`} style={v < 0 ? { color: VERMELHO } : undefined}>
                  {rotulos[i]}
                </span>
              )}
            </div>
            <div className="flex flex-col justify-start" style={{ height: `${(1 - cima) * 100}%` }}>
              {v !== null && v < 0 && <div className={`w-full rounded-b-[2px] ${i === destaque ? 'ring-1 ring-white/80' : ''}`} style={{ height: `${Math.max(4, (-v / maxNeg) * 100)}%`, backgroundColor: VERMELHO }}></div>}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] mt-[1px]">
        {nomes.map((n, i) => (
          <span key={i} className={`flex-1 min-w-0 text-center font-bold leading-tight text-[clamp(6px,2.2cqmin,10px)] ${i === destaque ? 'text-white' : 'text-zinc-500'}`} title={vals[i] === null ? '' : curtoRS(vals[i]!)}>
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------- Card da pessoa ----------------
// compacto = card pequeno na TV: na vendedora do Rebolo, o lucro do mês vai numa linha só e as barras dos dias
// continuam com o valor de cada dia (09/10); o gráfico dos meses só aparece se o card tiver altura
export function CardPessoaTV({ s, c, mes, onAbrir, compacto = false }: { s: ErpState; c: Colaborador; mes: string; onAbrir?: () => void; compacto?: boolean }) {
  const cfg = SETORES[c.setor]
  // vendedora do Rebolo: Lucro/Prejuízo do mês (pizza) e do ano (barras)
  const lucro = c.setor === 'rebolo' ? lucroReboloMes(s, c.id, mes) : null
  const lucroAnterior = lucro ? lucroReboloMes(s, c.id, mesAnteriorDe(mes)) : null
  const lucroAno = lucro ? lucroReboloAno(s, c.id, mes.slice(0, 4)) : null
  const ind = cfg.indicadores[0]
  const r = resumo(s, c.setor, ind.id, mes, c.id)
  const d = diasDeMeta(s, c.setor, ind.id, c.id, mes)
  const sit = situacaoResumo(r, mes)
  const cor = STATUS[sit].cor
  const f = (v: number) => formatar(v, ind.unidade).replace(/,00$/, '')
  const hj = hoje()
  const valores = d.uteis.map((dia) => (dia <= hj ? (d.serie[Number(dia.slice(8)) - 1] ?? 0) : null))
  // número em cima da barra de cada dia: quantidade inteira; R$ curto (850 • 12,5k) para caber na barrinha
  const doDia = (v: number) => (ind.unidade === 'brl' && v >= 1000 ? `${UMA_CASA.format(v / 1000)}k` : num(v))
  // número do mês, meta/piso, barra da meta e Hoje/Faltam (no Rebolo em card largo, a coluna é mais estreita: número menor)
  const blocoMeta = (rebolo: boolean) => (
    <>
      {/* número do mês */}
      <div>
        <p className="font-bold uppercase tracking-widest text-zinc-400 text-[clamp(7px,2.6cqmin,12px)] truncate">{ind.label} no mês</p>
        <p className="font-black leading-none tracking-tighter text-white">
          <span className={`text-[clamp(20px,13cqmin,72px)] text-white ${rebolo ? '@md:text-[clamp(18px,10cqmin,60px)]' : ''}`}>{f(r.mes)}</span>
          <span className={`text-zinc-400 text-[clamp(10px,4.5cqmin,26px)] ${rebolo ? 'whitespace-nowrap @md:text-[clamp(9px,3.8cqmin,22px)]' : ''}`}> / {f(r.meta.mensal)}</span>
        </p>
      </div>

      {/* meta e piso: do mês e do dia */}
      {r.meta.mensal > 0 && (
        <div className="flex flex-wrap gap-x-[3cqmin] gap-y-[0.5cqmin] -mt-[0.8cqmin] font-bold leading-tight text-zinc-400 text-[clamp(7px,3cqmin,14px)]">
          <span className="whitespace-nowrap">
            Meta <b className="text-white">{f(r.meta.mensal)}</b> • <b className="text-white">{f(Math.round(r.meta.diaria))}</b>/dia
          </span>
          {r.piso > 0 && (
            <span className="whitespace-nowrap">
              Piso <b className="text-white">{f(r.piso)}</b> • <b className="text-white">{f(Math.round(r.pisoDiario))}</b>/dia
            </span>
          )}
        </div>
      )}

      {/* barra da meta com a marca do piso */}
      <div className="relative h-[clamp(6px,3cqmin,16px)] rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full transition-all duration-700 bg-zinc-400/80" style={{ width: `${Math.min(100, r.pctMes)}%` }}></div>
        {r.piso > 0 && r.meta.mensal > 0 && <div className="absolute -inset-y-1 w-[3px] rounded bg-white/80" style={{ left: `${Math.min(100, (r.piso / r.meta.mensal) * 100)}%` }} title={`Piso ${f(r.piso)}`}></div>}
      </div>

      {/* hoje / faltam (+ bônus da Produção): neutros; verde só na meta batida */}
      <div className="flex flex-wrap gap-[1.5cqmin]">
        <Chip>Hoje {f(r.hoje)}</Chip>
        {r.falta > 0 ? <Chip>Faltam {f(r.falta)}</Chip> : <Chip cor={VERDE}>🎯 Meta batida</Chip>}
        {c.setor === 'edicao' && <ChipBonus albuns={r.mes} />}
      </div>
    </>
  )
  return (
    <div className="cq-tamanho h-full w-full min-h-0">
      <div
        role={onAbrir ? 'button' : undefined}
        tabIndex={onAbrir ? 0 : undefined}
        onClick={onAbrir}
        onKeyDown={(e) => onAbrir && (e.key === 'Enter' || e.key === ' ') && onAbrir()}
        className={`h-full w-full rounded-3xl border border-white/[0.2] bg-card-tv p-[3.5cqmin] flex flex-col gap-[2.2cqmin] overflow-hidden ${onAbrir ? 'cursor-pointer hover:border-white/[0.35] transition-all' : ''}`}
      >
        {/* pessoa + situação */}
        <div className="flex items-center gap-[2.5cqmin] min-w-0">
          <Avatar texto={iniciais(c.nome)} foto={c.foto} tamanho="w-[clamp(28px,13cqmin,64px)] h-[clamp(28px,13cqmin,64px)]" arredondado="rounded-full" textoCls="text-[clamp(10px,4cqmin,18px)]" />
          <div className="min-w-0 flex-1">
            <p className="font-black text-white leading-tight truncate text-[clamp(11px,5.2cqmin,24px)]" title={c.nome}>{c.nome}</p>
            <p className="font-bold uppercase tracking-widest truncate text-zinc-400 text-[clamp(7px,2.6cqmin,12px)]">{cfg.nome}</p>
          </div>
          <span className="shrink-0 px-[1.8cqmin] py-[0.9cqmin] rounded-full font-black whitespace-nowrap text-[clamp(8px,3cqmin,14px)] text-white" style={{ backgroundColor: cor }}>
            {ROTULO_SITUACAO[sit]}
          </span>
        </div>

        {lucro ? (
          // vendedora do Rebolo (08/10, "organizar as informações no card"): em card largo, duas colunas em cima —
          // a meta à esquerda e o Lucro/Prejuízo do mês à direita —; embaixo, cada gráfico com o seu título e a sua altura
          <>
            <div className="shrink-0 grid grid-cols-1 @md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-x-[3.5cqmin] gap-y-[2.2cqmin] items-start">
              <div className="min-w-0 flex flex-col gap-[2.2cqmin]">{blocoMeta(true)}</div>
              <div className="min-w-0 @md:border-l @md:border-white/[0.08] @md:pl-[3.5cqmin]">
                <LucroPizzaTV l={lucro} anterior={lucroAnterior} compacto={compacto} />
              </div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col gap-[2cqmin] overflow-hidden">
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <p className="font-bold uppercase tracking-widest text-zinc-500 truncate text-[clamp(6px,2.3cqmin,11px)] mb-[0.4cqmin]">{ind.label} por dia</p>
                <BarrasTV dias={d.uteis} valores={valores} cor={(v) => corDoDia(v, r.meta.diaria, r.pisoDiario)} rotulo={doDia} destaque={mes === hj.slice(0, 7) ? hj : undefined} />
              </div>
              {lucroAno && <LucroMesesTV meses={lucroAno} ano={mes.slice(0, 4)} destaque={Number(mes.slice(5, 7)) - 1} soCardAlto={compacto} />}
            </div>
          </>
        ) : (
          <>
            {blocoMeta(false)}
            {/* dias úteis */}
            <BarrasTV dias={d.uteis} valores={valores} cor={(v) => corDoDia(v, r.meta.diaria, r.pisoDiario)} rotulo={doDia} destaque={mes === hj.slice(0, 7) ? hj : undefined} />
          </>
        )}
      </div>
    </div>
  )
}

// ---------------- Card de Operações (maior, com 3 mini-cards) ----------------
function MiniTV({ titulo, children, estilo }: { titulo: ReactNode; children: ReactNode; estilo?: CSSProperties }) {
  return (
    <div style={estilo} className="cq-tamanho h-full min-h-0 min-w-0">
      <div className="h-full rounded-2xl border border-white/[0.2] bg-card-tv p-[3.5cqmin] flex flex-col gap-[2cqmin] overflow-hidden">
        <p className="font-black uppercase tracking-[0.15em] text-zinc-300 text-[clamp(8px,3.4cqmin,14px)] truncate">{titulo}</p>
        {children}
      </div>
    </div>
  )
}

const nomeCurto = (mes: string) => nomeMes(mes).split(' / ')[0]

// verde = bateu a meta • amarelo = passou do piso • vermelho = abaixo do piso
const corMeta = (valor: number, meta: number, piso: number) => (meta <= 0 ? AZUL : valor >= meta ? VERDE : valor >= piso ? AMARELO : VERMELHO)

// Barras do custo: altura = crianças fotografadas; em cima, o valor de cada ficha (colorido) e a quantidade (branco).
// A letra acompanha a largura do card e o número de barras, para os números caberem sem encavalar.
// extra (só na agenda): a parte "a confirmar" vai em cima, numa barra clara tracejada; a cor e o número são do total do dia.
function BarrasCusto({ rotulos, qtd, extra, custos, corBarra, corCusto, abaixo, destaque, fonteMax = 16 }: {
  rotulos: string[]
  qtd: (number | null)[]
  extra?: number[]
  custos: (number | null)[]
  corBarra: (v: number, i: number) => string
  corCusto: (v: number) => string
  abaixo?: string[]
  destaque?: number
  fonteMax?: number
}) {
  const n = Math.max(1, rotulos.length)
  const mais = (i: number) => extra?.[i] ?? 0
  const max = Math.max(1, ...qtd.map((v, i) => (v ?? 0) + mais(i)))
  const maior = Math.max(2, ...qtd.map((v, i) => ((v ?? 0) + mais(i) ? num((v ?? 0) + mais(i)).length : 0)), ...custos.map((v) => (v ? String(Math.round(v)).length : 0)))
  const fonte = fonteCq(7, 88 / n / (maior * 0.62), fonteMax)
  return (
    <div className="cq-fonte flex-1 min-h-0 flex flex-col" style={fonte}>
      <div className="flex-1 min-h-0 flex items-end gap-[3px]">
        {qtd.map((v, i) => {
          const p = mais(i)
          const total = (v ?? 0) + p
          const c = corBarra(total, i)
          return (
            <div key={i} className="flex-1 h-full flex flex-col justify-end items-center min-w-0 leading-none">
              {custos[i] !== null && (
                <span className="font-black whitespace-nowrap text-center" style={{ color: corCusto(custos[i]!) }}>
                  <span className="block text-[0.65em] leading-none">R$</span>
                  {Math.round(custos[i]!)}
                </span>
              )}
              {v !== null && total > 0 && <span className="font-bold text-white whitespace-nowrap mt-[0.2em] mb-[0.25em]">{num(total)}</span>}
              {p > 0 && <div className={`w-full border border-dashed border-b-0 ${v ? '' : 'rounded-t-[3px]'}`} style={{ height: `calc((100% - 3.5em) * ${(p / max).toFixed(3)})`, backgroundColor: `${c}40`, borderColor: c }}></div>}
              <div
                className={`w-full ${p > 0 ? '' : 'rounded-t-[3px]'} ${destaque === i ? 'ring-2 ring-white/80' : ''}`}
                style={{
                  height: v === null ? 2 : p > 0 && !v ? 0 : `calc((100% - 3.5em) * ${Math.max(0.02, v / max).toFixed(3)})`,
                  backgroundColor: v === null ? 'rgba(127,127,127,0.15)' : c,
                }}
              ></div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-[3px] mt-[2px] pt-[2px] border-t border-white/[0.08]">
        {rotulos.map((rot, i) => (
          <div key={i} className="flex-1 min-w-0 text-center leading-tight">
            <span className={`block font-bold ${destaque === i ? 'text-white' : 'text-zinc-400'}`}>{rot}</span>
            {abaixo && <span className="block whitespace-pre-line text-zinc-500 text-[0.85em]">{abaixo[i]}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const mil = (v: number) => (v >= 1000 ? `R$ ${num(v / 1000)}\nmil` : `R$ ${num(v)}`) // embaixo do mês, em 2 linhas para caber

// Topo dos cards de custo: o custo médio por ficha grande + total, fichas e operações
function TopoCusto({ media, cor, legenda, total, fichas, operacoes }: { media: number; cor: string; legenda: string; total: number; fichas: number; operacoes: number }) {
  return (
    <div className="flex items-end justify-between gap-[2cqmin]">
      <div className="min-w-0">
        <span className="font-black leading-none tracking-tighter whitespace-nowrap text-[clamp(18px,min(15cqmin,10cqw),60px)]" style={{ color: cor }}>
          {fichas > 0 ? reais(media) : '—'}
        </span>
        <p className="font-bold text-zinc-300 truncate text-[clamp(8px,3.4cqmin,15px)]">{legenda}</p>
      </div>
      <div className="text-right font-bold text-zinc-400 leading-tight whitespace-nowrap text-[clamp(8px,3.4cqmin,15px)]">
        <p>
          Total <span className="text-white">{reais(total)}</span>
        </p>
        <p>
          <span className="text-white">{num(fichas)}</span> fichas • <span className="text-white">{num(operacoes)}</span> operações
        </p>
      </div>
    </div>
  )
}

function LegendaCusto() {
  return (
    <p className="font-bold text-zinc-500 truncate text-[clamp(7px,2.8cqmin,12px)]">
      Valor colorido = R$ de cada ficha (<span style={{ color: VERDE }}>abaixo</span> / <span style={{ color: VERMELHO }}>acima</span> da média) • barra e número branco = crianças fotografadas
    </p>
  )
}

// compacto = card pequeno na TV (muita gente na tela): some o que é detalhe, ficam os números e as barras
// faixa = modo TV: Operações na largura toda, com os 3 mini-cards lado a lado numa linha só;
// senão os 2 de custo em cima e a agenda embaixo, na largura toda
// parte (09/10, "todos os cards do mesmo tamanho"): um dos 3 quadros sozinho, como card do tamanho padrão da grade
export type ParteOperacoes = 'mes' | 'ano' | 'agenda'
export function CardOperacoesTV({ s, c, mes, compacto = false, faixa = false, parte }: { s: ErpState; c: Colaborador; mes: string; compacto?: boolean; faixa?: boolean; parte?: ParteOperacoes }) {
  const x = useDados(s, c, mes)
  const r = x.r
  const corCusto = x.custoRef > x.custoMes * 1.03 ? VERMELHO : x.custoRef > 0 && x.custoRef < x.custoMes * 0.97 ? VERDE : AZUL
  // custo por ficha: mês (cada dia útil) e ano (cada mês) — regra do dono: operações × fixo + fichas × variável
  const custo = useMemo(() => {
    const ind = SETORES.operacional.indicadores[0].id
    const f = x.f
    const doDia = new Map(f.dias.map((d) => [d.data, d]))
    const mesHoje = x.hojeISO.slice(0, 7)
    const mensal = {
      qtd: x.uteis.map((d) => {
        const a = doDia.get(d)?.alunos ?? 0
        return d <= x.hojeISO || a > 0 ? a : null
      }),
      custos: x.uteis.map((d) => {
        const o = doDia.get(d)
        return o && o.alunos > 0 ? custoPorAluno(o) : null
      }),
      media: custoPorAluno(f.realizado),
      total: f.realizado.total,
      fichas: f.realizado.alunos,
      operacoes: f.realizado.operacoes,
      destaque: x.atual ? x.uteis.indexOf(x.hojeISO) : undefined,
    }
    const meses = MESES_CURTOS.map((_, i) => `${mes.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`)
    const fin = meses.map((m) => (m > mesHoje ? null : m === mes ? f : financeiroOperacoes(s, m)))
    const soma = fin.reduce((a, fo) => ({ total: a.total + (fo?.realizado.total ?? 0), fichas: a.fichas + (fo?.realizado.alunos ?? 0), operacoes: a.operacoes + (fo?.realizado.operacoes ?? 0) }), { total: 0, fichas: 0, operacoes: 0 })
    const anual = {
      qtd: fin.map((fo) => (fo ? fo.realizado.alunos : null)),
      custos: fin.map((fo) => (fo && fo.realizado.alunos > 0 ? custoPorAluno(fo.realizado) : null)),
      // cor da barra: mês fechado pela meta/piso do mês; mês corrente pelo ritmo
      cores: meses.map((m, i) => {
        const rm = resumo(s, 'operacional', ind, m, c.id)
        if (m === mesHoje) return STATUS[situacaoResumo(rm, m)].cor
        return corMeta(fin[i]?.realizado.alunos ?? 0, rm.meta.mensal, rm.piso)
      }),
      abaixo: fin.map((fo) => (fo && fo.realizado.total > 0 ? mil(fo.realizado.total) : '')),
      media: soma.fichas > 0 ? soma.total / soma.fichas : 0,
      ...soma,
      destaque: meses.indexOf(mesHoje),
    }
    return { mensal, anual }
  }, [s, c.id, mes, x])
  const corAno = custo.mensal.fichas > 0 && custo.anual.fichas > 0 ? (custo.mensal.media > custo.anual.media * 1.03 ? VERMELHO : custo.mensal.media < custo.anual.media * 0.97 ? VERDE : AZUL) : AZUL
  const a = x.agenda
  // custo por ficha no mês: cada dia útil
  const quadroMes = (
    <>
      <TopoCusto media={custo.mensal.media} cor={corCusto} legenda="custo médio por ficha no mês" total={custo.mensal.total} fichas={custo.mensal.fichas} operacoes={custo.mensal.operacoes} />
      <BarrasCusto
        rotulos={x.uteis.map((d) => String(Number(d.slice(8))))}
        qtd={custo.mensal.qtd}
        custos={custo.mensal.custos}
        corBarra={(v) => (r ? corDoDia(v, r.meta.diaria, r.pisoDiario) : AZUL)}
        corCusto={(v) => (v > custo.mensal.media * 1.03 ? VERMELHO : VERDE)}
        destaque={custo.mensal.destaque}
      />
      {/* meta do mês: fichas fotografadas / meta (o traço branco é o piso) */}
      {r && r.meta.mensal > 0 && (
        <div className="relative shrink-0 h-[clamp(14px,7cqmin,30px)] rounded-xl bg-white/[0.08] overflow-hidden" title={`Meta do mês: ${num(r.mes)} de ${num(r.meta.mensal)} fichas${r.piso > 0 ? ` • piso ${num(r.piso)}` : ''}`}>
          <div className="h-full rounded-xl bg-zinc-400/60" style={{ width: `${Math.min(100, r.pctMes)}%` }}></div>
          {r.piso > 0 && <div className="absolute inset-y-0 w-[3px] bg-white/80" style={{ left: `${Math.min(100, (r.piso / r.meta.mensal) * 100)}%` }}></div>}
          <span className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow text-[clamp(9px,4cqmin,18px)]">
            {num(r.mes)} / {num(r.meta.mensal)}
          </span>
        </div>
      )}
      {!compacto && <LegendaCusto />}
    </>
  )
  // custo por ficha no ano: cada mês
  const quadroAno = (
    <>
      <TopoCusto media={custo.anual.media} cor={corAno} legenda="custo médio por ficha no ano" total={custo.anual.total} fichas={custo.anual.fichas} operacoes={custo.anual.operacoes} />
      <BarrasCusto
        rotulos={MESES_CURTOS}
        qtd={custo.anual.qtd}
        custos={custo.anual.custos}
        corBarra={(_, i) => custo.anual.cores[i]}
        corCusto={(v) => (v > custo.anual.media * 1.03 ? VERMELHO : VERDE)}
        abaixo={custo.anual.abaixo}
        destaque={custo.anual.destaque}
      />
      {!compacto && <LegendaCusto />}
    </>
  )
  // agenda futura: a PROJEÇÃO (visitas e retornos agendados) fica só aqui
  const quadroAgenda = (
    <>
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="font-black leading-none tracking-tighter text-white text-[clamp(18px,13cqmin,68px)]">{num(a.agendadas)}</span>
          <p className="font-bold text-zinc-300 text-[clamp(8px,3.4cqmin,15px)]">
            fichas agendadas • <span className="text-white">{num(a.total)}</span> confirmadas
          </p>
        </div>
        <div className="text-right leading-tight">
          {a.capacidade !== null && (
            <span className="block font-black leading-none text-white text-[clamp(14px,9cqmin,48px)]" title="Fichas agendadas ÷ o que a meta pede nesses dias">
              {Math.round(a.capacidade)}%
            </span>
          )}
          <p className="font-bold text-zinc-300 whitespace-nowrap text-[clamp(8px,3.4cqmin,15px)]" title="Custo previsto: carros × gasto fixo + fichas agendadas × custo por ficha">
            Previsto <span className="text-white">{reais(a.custo)}</span>
            {a.agendadas > 0 ? (
              <>
                {' '}• <span className="text-white">{reais(a.custoPorFicha)}</span>/ficha
              </>
            ) : null}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-[1.2cqmin]">
        <ChipLegenda cor={VERDE}>{a.ok} OK</ChipLegenda>
        <ChipLegenda cor={AMARELO}>{a.pendentes} Pend.</ChipLegenda>
        <ChipLegenda cor={VERMELHO}>{a.vazios} Vazio</ChipLegenda>
      </div>
      <BarrasCusto
        rotulos={a.dias.map((d) => String(Number(d.data.slice(8))))}
        qtd={a.dias.map((d) => d.alunos)}
        extra={a.dias.map((d) => Math.max(0, d.agendadas - d.alunos))}
        custos={a.dias.map((d) => (d.agendadas > 0 ? d.custo / d.agendadas : null))}
        corBarra={(v) => x.corAgendamento(v)}
        corCusto={(v) => (custo.mensal.media > 0 ? (v > custo.mensal.media * 1.03 ? VERMELHO : VERDE) : '#d4d4d8')}
        fonteMax={20}
      />
      {!compacto && <LegendaAgendamento x={x} tv comCusto />}
    </>
  )
  const titulos: Record<ParteOperacoes, string> = {
    mes: `Custo por ficha • ${nomeCurto(mes)} (dias úteis)`,
    ano: `Custo por ficha • ${mes.slice(0, 4)} (meses)`,
    agenda: 'Agenda • próximos 20 dias',
  }

  // um quadro só, como card padrão (o mesmo cabeçalho dos cards das pessoas: foto, título e "Operações • nome")
  if (parte)
    return (
      <div className="cq-tamanho h-full w-full min-h-0">
        <div className="h-full w-full rounded-3xl border border-white/[0.2] bg-card-tv p-[3.5cqmin] flex flex-col gap-[2cqmin] overflow-hidden">
          <div className="flex items-center gap-[2.5cqmin] min-w-0">
            <Avatar texto={iniciais(c.nome)} foto={c.foto} tamanho="w-[clamp(24px,10cqmin,56px)] h-[clamp(24px,10cqmin,56px)]" arredondado="rounded-full" textoCls="text-[clamp(9px,3.4cqmin,16px)]" />
            <div className="min-w-0 flex-1">
              <p className="font-black text-white leading-tight truncate text-[clamp(10px,4.4cqmin,22px)]">{titulos[parte]}</p>
              <p className="font-bold uppercase tracking-widest truncate text-zinc-400 text-[clamp(7px,2.6cqmin,12px)]">Operações • {c.nome}</p>
            </div>
            {parte === 'mes' && r && r.meta.mensal > 0 && (
              <div className="shrink-0 font-bold text-zinc-300 whitespace-nowrap text-right leading-tight text-[clamp(7px,2.6cqmin,13px)]">
                <p>
                  Meta <span className="text-white">{num(r.meta.mensal)}</span> • <span className="text-white">{num(r.meta.diaria)}</span>/dia
                </p>
                {r.piso > 0 && (
                  <p>
                    Piso <span className="text-white">{num(r.piso)}</span> • <span className="text-white">{num(r.pisoDiario)}</span>/dia
                  </p>
                )}
              </div>
            )}
          </div>
          {parte === 'mes' ? quadroMes : parte === 'ano' ? quadroAno : quadroAgenda}
        </div>
      </div>
    )

  return (
    <div className="cq-tamanho h-full w-full min-h-0">
      <div className="h-full w-full rounded-3xl border border-white/[0.2] bg-painel/80 p-[2cqmin] flex flex-col gap-[1.6cqmin] overflow-hidden">
        <div className="flex items-center gap-[1.6cqmin] min-w-0">
          <Avatar texto={iniciais(c.nome)} foto={c.foto} tamanho="w-[clamp(28px,8cqmin,60px)] h-[clamp(28px,8cqmin,60px)]" arredondado="rounded-full" textoCls="text-[clamp(10px,2.6cqmin,18px)]" />
          <div className="min-w-0 flex-1">
            <p className="font-black uppercase tracking-[0.2em] text-zinc-400 text-[clamp(8px,2.2cqmin,14px)]">Operações</p>
            <p className="font-black text-white truncate text-[clamp(11px,3.4cqmin,24px)]">{c.nome}</p>
          </div>
          {r && r.meta.mensal > 0 && (
            <div className="font-bold text-zinc-300 whitespace-nowrap text-right leading-tight text-[clamp(9px,2.2cqmin,16px)]">
              <p>
                Meta <span className="text-white">{num(r.meta.mensal)}</span> • <span className="text-white">{num(r.meta.diaria)}</span>/dia
              </p>
              {r.piso > 0 && (
                <p>
                  Piso <span className="text-white">{num(r.piso)}</span> • <span className="text-white">{num(r.pisoDiario)}</span>/dia
                </p>
              )}
            </div>
          )}
        </div>
        <div
          className="flex-1 min-h-0 grid gap-[1.4cqmin]"
          style={
            faixa
              ? { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'minmax(0, 1fr)' }
              : { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateRows: 'repeat(2, minmax(0, 1fr))' }
          }
        >
          <MiniTV titulo={titulos.mes}>{quadroMes}</MiniTV>
          <MiniTV titulo={titulos.ano}>{quadroAno}</MiniTV>
          <MiniTV titulo={titulos.agenda} estilo={faixa ? undefined : { gridColumn: 'span 2' }}>
            {quadroAgenda}
          </MiniTV>
        </div>
      </div>
    </div>
  )
}

// ---------------- Grade: todos os cards na mesma tela ----------------
// (09/10, "todos os cards do mesmo tamanho, seguindo o tamanho da tela" — TV de 75" ligada o dia todo):
// cada pessoa, a Produção e os 3 quadros de Operações (custo do mês, custo do ano e agenda) são UMA célula igual.
// ajustar = true (tela cheia e Modo TV): as colunas × linhas que deixam as células iguais e as maiores possíveis
//   (proporção boa de ler, ~1,35 de largura para 1 de altura) e ocupam a tela; entrou ou saiu card (filtro de setor)
//   ou mudou o tamanho da tela → recalcula sozinho. As letras e os gráficos acompanham o tamanho do card.
// ajustar = false (página): colunas pela largura e altura fixa por card (a página rola).
// producao: mostra o card das etapas da Produção (quando tem escola na Produção).
const PROPORCAO_TV = 1.35
const PARTES_OPERACOES: ParteOperacoes[] = ['mes', 'ano', 'agenda']
export function GradeTV({
  s,
  mes,
  pessoas,
  ajustar = false,
  producao = false,
  onAbrir,
}: {
  s: ErpState
  mes: string
  pessoas: Colaborador[]
  ajustar?: boolean
  producao?: boolean
  onAbrir?: (c: Colaborador) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState({ w: 1600, h: 900 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setArea({ w: e.contentRect.width, h: e.contentRect.height }))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const ops = pessoas.find((c) => c.setor === 'operacional')
  const outros = pessoas.filter((c) => c !== ops)
  const prod = producao && lotesProducao(s).length > 0
  const total = (ops ? PARTES_OPERACOES.length : 0) + (prod ? 1 : 0) + outros.length
  const GAP = 14
  // página: com vendedora do Rebolo (lucro do mês + barras dos dias e dos meses), os cards ficam um pouco mais altos
  const alturaPagina = outros.some((c) => c.setor === 'rebolo') ? 410 : 330

  const layout = useMemo(() => {
    if (!ajustar) {
      const cols = Math.max(2, Math.min(5, Math.floor((area.w + GAP) / (330 + GAP))))
      return { cols, rows: Math.ceil(total / cols), w: (area.w - GAP * (cols - 1)) / cols, h: alturaPagina }
    }
    let melhor = { cols: 1, rows: 1, w: area.w, h: area.h, nota: -1 }
    for (let cols = 1; cols <= Math.max(1, total); cols++) {
      const rows = Math.max(1, Math.ceil(total / cols))
      const w = (area.w - GAP * (cols - 1)) / cols
      const h = (area.h - GAP * (rows - 1)) / rows
      if (w <= 0 || h <= 0) continue
      // o card "bom de ler": a medida que limita (largura ÷ proporção ou altura) é a maior possível
      const nota = Math.min(w / PROPORCAO_TV, h)
      if (nota > melhor.nota + 0.5) melhor = { cols, rows, w, h, nota }
    }
    return melhor
  }, [ajustar, area, total, alturaPagina])

  const celula = (key: string, conteudo: ReactNode) => (
    <div key={key} className="min-h-0 min-w-0">
      {conteudo}
    </div>
  )
  const cards = [
    ...(ops ? PARTES_OPERACOES.map((parte) => celula(`ops-${parte}`, <CardOperacoesTV s={s} c={ops} mes={mes} parte={parte} compacto={layout.h < 360} />)) : []),
    ...(prod ? [celula('producao', <CardProducaoTV s={s} mes={mes} compacto={layout.h < 360} />)] : []),
    ...outros.map((c) => celula(c.id, <CardPessoaTV s={s} c={c} mes={mes} onAbrir={onAbrir ? () => onAbrir(c) : undefined} compacto={layout.h < 420} />)),
  ]

  // tela cheia / Modo TV: a grade ocupa a altura da tela, sem rolar
  if (ajustar)
    return (
      <div
        ref={ref}
        className="h-full min-h-0 grid"
        style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`, gap: GAP }}
      >
        {cards}
      </div>
    )

  // página: todos do mesmo tamanho, altura fixa
  return (
    <div ref={ref} className="grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gridAutoRows: alturaPagina, gap: GAP }}>
      {cards}
    </div>
  )
}
