'use client'

// Cards da Visão TV do ADM: bateu o olho, sabe o que está acontecendo.
//  • Card da pessoa: o número do mês grande, a cor da situação no card inteiro
//    (verde no ritmo • amarelo acima do piso • vermelho abaixo do piso), barra da meta,
//    Hoje / Faltam e as barrinhas por dia útil.
//  • Card de Operações: maior. Em cima o custo por ficha (mês por dia útil e ano por mês: a barra é a quantidade
//    de crianças fotografadas e o número colorido é o valor de cada ficha); no meio alunos e agenda 20 dias;
//    embaixo o mês a mês (mês anterior • mês atual • próximo mês com as fichas já marcadas).
//  • GradeTV: todos os cards na mesma tela. Com mais gente, os cards diminuem e se encaixam sozinhos
//    (os textos e gráficos acompanham o tamanho do card).

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Colaborador, ErpState } from '@/lib/erp/types'
import { SETORES } from '@/lib/erp/config'
import { diasDeMeta, resumo, situacaoResumo } from '@/lib/erp/metrics'
import { brl, formatar, hoje, iniciais, nomeMes, num } from '@/lib/erp/format'
import { custoPorAluno, financeiroOperacoes, somarMes } from '@/lib/erp/operacoes-financeiro'
import { Avatar } from './ui'
import { STATUS } from './status'
import { corDoDia } from './PainelMeta'
import { useDados } from './PainelOperacoes'

const VERDE = STATUS.bom.cor
const AMARELO = STATUS.atencao.cor
const VERMELHO = STATUS.critico.cor
const AZUL = '#3b82f6'
const reais = (v: number) => brl(v).replace(/\s/g, ' ').replace(/,00$/, '') // TV: sem os centavos redondos

// o card inteiro vira um "container" de tamanho: fontes e gráficos em cqmin acompanham o espaço
const tamanho: CSSProperties = { containerType: 'size' }
const tinta = (cor: string): CSSProperties => ({ borderColor: `${cor}99`, background: `linear-gradient(160deg, ${cor}33 0%, ${cor}0d 55%, transparent 100%)` })

const ROTULO_SITUACAO = { bom: '✓ No ritmo', atencao: '! Atenção', critico: '✕ Abaixo' } as const

// Barrinhas por dia (cor de cada dia vem de quem chama); futuro = trilho vazio; hoje com contorno
function BarrasTV({ dias, valores, cor, rotulo, destaque }: { dias: string[]; valores: (number | null)[]; cor: (v: number, i: number) => string; rotulo?: (v: number) => string; destaque?: string }) {
  const max = Math.max(1, ...valores.map((v) => v ?? 0)) * 1.2
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 flex items-end gap-[2px]">
        {valores.map((v, i) => (
          <div key={dias[i]} className="flex-1 h-full flex flex-col justify-end items-center min-w-0" title={`${dias[i].slice(8)}/${dias[i].slice(5, 7)}${v === null ? '' : `: ${rotulo ? rotulo(v) : num(v)}`}`}>
            {rotulo && v !== null && v > 0 && <span className="hidden @sm:block font-bold text-zinc-300 leading-none mb-[1px] whitespace-nowrap text-[clamp(7px,2.4cqmin,11px)]">{rotulo(v)}</span>}
            <div
              className={`w-full rounded-t-[3px] ${dias[i] === destaque ? 'ring-2 ring-white/80' : ''}`}
              style={{ height: v === null ? '2px' : `${Math.max(v > 0 ? 4 : 2, (v / max) * 100)}%`, backgroundColor: v === null ? 'rgba(127,127,127,0.15)' : cor(v, i) }}
            ></div>
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] mt-[1px]">
        {dias.map((d, i) => (
          <span key={d} className={`flex-1 text-center font-bold min-w-0 leading-tight text-[clamp(6px,2.2cqmin,10px)] ${d === destaque ? 'text-white' : 'text-zinc-500'}`}>
            {i % 2 === 0 || d === destaque ? Number(d.slice(8)) : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function Chip({ cor, children }: { cor: string; children: ReactNode }) {
  return (
    <span className="px-[1.6cqmin] py-[0.8cqmin] rounded-lg font-black whitespace-nowrap text-[clamp(9px,3.4cqmin,15px)] border" style={{ color: cor, borderColor: `${cor}66`, backgroundColor: `${cor}1f` }}>
      {children}
    </span>
  )
}

// ---------------- Card da pessoa ----------------
export function CardPessoaTV({ s, c, mes, onAbrir }: { s: ErpState; c: Colaborador; mes: string; onAbrir?: () => void }) {
  const cfg = SETORES[c.setor]
  const ind = cfg.indicadores[0]
  const r = resumo(s, c.setor, ind.id, mes, c.id)
  const d = diasDeMeta(s, c.setor, ind.id, c.id, mes)
  const sit = situacaoResumo(r, mes)
  const cor = STATUS[sit].cor
  const f = (v: number) => formatar(v, ind.unidade).replace(/,00$/, '')
  const hj = hoje()
  const valores = d.uteis.map((dia) => (dia <= hj ? (d.serie[Number(dia.slice(8)) - 1] ?? 0) : null))
  const corHoje = corDoDia(r.hoje, r.meta.diaria, r.pisoDiario)
  return (
    <div style={tamanho} className="h-full w-full min-h-0">
      <div
        role={onAbrir ? 'button' : undefined}
        tabIndex={onAbrir ? 0 : undefined}
        onClick={onAbrir}
        onKeyDown={(e) => onAbrir && (e.key === 'Enter' || e.key === ' ') && onAbrir()}
        className={`h-full w-full rounded-3xl border-2 bg-painel-2/80 p-[3.5cqmin] flex flex-col gap-[2.2cqmin] overflow-hidden ${onAbrir ? 'cursor-pointer hover:brightness-110 transition-all' : ''}`}
        style={tinta(cor)}
      >
        {/* pessoa + situação */}
        <div className="flex items-center gap-[2.5cqmin] min-w-0">
          <Avatar texto={iniciais(c.nome)} foto={c.foto} tamanho="w-[clamp(28px,13cqmin,64px)] h-[clamp(28px,13cqmin,64px)]" arredondado="rounded-full" textoCls="text-[clamp(10px,4cqmin,18px)]" />
          <div className="min-w-0 flex-1">
            <p className="font-black text-white leading-tight truncate text-[clamp(11px,5.2cqmin,24px)]" title={c.nome}>{c.nome}</p>
            <p className="font-bold uppercase tracking-widest truncate text-[clamp(7px,2.6cqmin,12px)]" style={{ color: cor }}>{cfg.nome}</p>
          </div>
          <span className="shrink-0 px-[1.8cqmin] py-[0.9cqmin] rounded-full font-black whitespace-nowrap text-[clamp(8px,3cqmin,14px)] text-white" style={{ backgroundColor: cor }}>
            {ROTULO_SITUACAO[sit]}
          </span>
        </div>

        {/* número do mês */}
        <div>
          <p className="font-bold uppercase tracking-widest text-zinc-400 text-[clamp(7px,2.6cqmin,12px)] truncate">{ind.label} no mês</p>
          <p className="font-black leading-none tracking-tighter text-white">
            <span className="text-[clamp(20px,13cqmin,72px)]" style={{ color: cor }}>{f(r.mes)}</span>
            <span className="text-zinc-400 text-[clamp(10px,4.5cqmin,26px)]"> / {f(r.meta.mensal)}</span>
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
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, r.pctMes)}%`, backgroundColor: cor }}></div>
          {r.piso > 0 && r.meta.mensal > 0 && <div className="absolute -inset-y-1 w-[3px] rounded bg-white/80" style={{ left: `${Math.min(100, (r.piso / r.meta.mensal) * 100)}%` }} title={`Piso ${f(r.piso)}`}></div>}
        </div>

        {/* hoje / faltam */}
        <div className="flex flex-wrap gap-[1.5cqmin]">
          <Chip cor={corHoje}>Hoje {f(r.hoje)}</Chip>
          {r.falta > 0 ? <Chip cor={r.faltaPiso > 0 ? VERMELHO : AMARELO}>Faltam {f(r.falta)}</Chip> : <Chip cor={VERDE}>🎯 Meta batida</Chip>}
        </div>

        {/* dias úteis */}
        <BarrasTV dias={d.uteis} valores={valores} cor={(v) => corDoDia(v, r.meta.diaria, r.pisoDiario)} destaque={mes === hj.slice(0, 7) ? hj : undefined} />
      </div>
    </div>
  )
}

// ---------------- Card de Operações (maior, com 3 mini-cards) ----------------
function MiniTV({ titulo, cor, span, children }: { titulo: ReactNode; cor: string; span?: number; children: ReactNode }) {
  return (
    <div style={{ ...tamanho, gridColumn: span ? `span ${span}` : undefined }} className="h-full min-h-0 min-w-0">
      <div className="h-full rounded-2xl border-2 bg-painel-2/80 p-[3.5cqmin] flex flex-col gap-[2cqmin] overflow-hidden" style={tinta(cor)}>
        <p className="font-black uppercase tracking-[0.15em] text-zinc-300 text-[clamp(8px,3.4cqmin,14px)] truncate">{titulo}</p>
        {children}
      </div>
    </div>
  )
}

const nomeCurto = (mes: string) => nomeMes(mes).split(' / ')[0]

// verde = bateu a meta • amarelo = passou do piso • vermelho = abaixo do piso
const corMeta = (valor: number, meta: number, piso: number) => (meta <= 0 ? AZUL : valor >= meta ? VERDE : valor >= piso ? AMARELO : VERMELHO)

function Linha({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.06] px-[2.5cqmin] py-[1cqmin]">
      <span className="font-bold text-zinc-300 truncate text-[clamp(8px,4cqmin,15px)]">{rotulo}</span>
      <span className="font-black whitespace-nowrap text-[clamp(9px,4.8cqmin,20px)]" style={{ color: cor ?? '#fff' }}>{valor}</span>
    </div>
  )
}

interface BarrasMes {
  dias: string[]
  valores: (number | null)[]
  cor: (v: number, i: number) => string
  destaque?: string
}

function MesTV({ titulo, valor, meta, piso, legenda, barras, span, compacto, children }: { titulo: string; valor: number; meta: number; piso: number; legenda: string; barras: BarrasMes; span?: number; compacto?: boolean; children: ReactNode }) {
  const cor = corMeta(valor, meta, piso)
  return (
    <MiniTV
      cor={cor}
      span={span}
      titulo={
        <>
          <span className="text-[1.6em] leading-none align-middle">📅</span> {titulo}
        </>
      }
    >
      <div className="flex items-baseline gap-[1.5cqmin] min-w-0">
        <span className="font-black leading-none tracking-tighter text-[clamp(16px,14cqmin,64px)]" style={{ color: cor }}>{num(valor)}</span>
        {meta > 0 && <span className="font-black text-zinc-400 text-[clamp(9px,6cqmin,26px)]">/ {num(meta)}</span>}
      </div>
      <p className="font-bold text-zinc-300 -mt-[1cqmin] truncate text-[clamp(8px,4cqmin,15px)]">{legenda}</p>
      {meta > 0 && (
        <div className="relative h-[clamp(5px,3.5cqmin,14px)] shrink-0 rounded-full bg-white/[0.08]">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (valor / meta) * 100)}%`, backgroundColor: cor }}></div>
          {piso > 0 && <div className="absolute -inset-y-1 w-[3px] rounded bg-white/80" style={{ left: `${Math.min(100, (piso / meta) * 100)}%` }} title={`Piso ${num(piso)}`}></div>}
        </div>
      )}
      <BarrasTV dias={barras.dias} valores={barras.valores} rotulo={(v) => num(v)} cor={barras.cor} destaque={barras.destaque} />
      {!compacto && <div className="flex flex-col gap-[1cqmin]">{children}</div>}
    </MiniTV>
  )
}

// Barras do custo: altura = crianças fotografadas; em cima, o valor de cada ficha (colorido) e a quantidade (branco).
// A letra acompanha a largura do card e o número de barras, para os números caberem sem encavalar.
function BarrasCusto({ rotulos, qtd, custos, corBarra, corCusto, abaixo, destaque }: {
  rotulos: string[]
  qtd: (number | null)[]
  custos: (number | null)[]
  corBarra: (v: number, i: number) => string
  corCusto: (v: number) => string
  abaixo?: string[]
  destaque?: number
}) {
  const n = Math.max(1, rotulos.length)
  const max = Math.max(1, ...qtd.map((v) => v ?? 0))
  const maior = Math.max(2, ...qtd.map((v) => (v ? num(v).length : 0)), ...custos.map((v) => (v ? String(Math.round(v)).length : 0)))
  const fonte = `clamp(7px, ${(88 / n / (maior * 0.62)).toFixed(2)}cqw, 16px)`
  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ fontSize: fonte }}>
      <div className="flex-1 min-h-0 flex items-end gap-[3px]">
        {qtd.map((v, i) => (
          <div key={i} className="flex-1 h-full flex flex-col justify-end items-center min-w-0 leading-none">
            {custos[i] !== null && (
              <span className="font-black whitespace-nowrap text-center" style={{ color: corCusto(custos[i]!) }}>
                <span className="block text-[0.65em] leading-none">R$</span>
                {Math.round(custos[i]!)}
              </span>
            )}
            {v !== null && v > 0 && <span className="font-bold text-white whitespace-nowrap mt-[0.2em] mb-[0.25em]">{num(v)}</span>}
            <div
              className={`w-full rounded-t-[3px] ${destaque === i ? 'ring-2 ring-white/80' : ''}`}
              style={{ height: v === null ? 2 : `calc((100% - 3.5em) * ${Math.max(0.02, v / max).toFixed(3)})`, backgroundColor: v === null ? 'rgba(127,127,127,0.15)' : corBarra(v, i) }}
            ></div>
          </div>
        ))}
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
        <span className="font-black leading-none tracking-tighter text-[clamp(18px,15cqmin,60px)]" style={{ color: cor }}>
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
export function CardOperacoesTV({ s, c, mes, compacto = false }: { s: ErpState; c: Colaborador; mes: string; compacto?: boolean }) {
  const x = useDados(s, c, mes)
  const r = x.r
  const sitAlunos = r ? situacaoResumo(r, mes) : 'bom'
  const corAlunos = STATUS[sitAlunos].cor
  const corCusto = x.custoRef > x.custoMes * 1.03 ? VERMELHO : x.custoRef > 0 && x.custoRef < x.custoMes * 0.97 ? VERDE : AZUL
  // custo por ficha: mês (cada dia útil) e ano (cada mês) — regra do dono: operações × fixo + fichas × variável
  const custo = useMemo(() => {
    const ind = SETORES.operacional.indicadores[0].id
    const f = x.f
    const doDia = new Map(f.dias.map((d) => [d.data, d]))
    const mesHoje = x.hojeISO.slice(0, 7)
    const mensal = {
      qtd: x.uteis.map((d) => (d <= x.hojeISO ? (doDia.get(d)?.alunos ?? 0) : null)),
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
  const corAgenda = a.capacidade === null ? AZUL : a.capacidade >= 100 ? VERDE : a.capacidade >= 80 ? AMARELO : VERMELHO
  const COR_DIA = { OK: VERDE, Pendente: AMARELO, Vazio: VERMELHO }
  const subiu = x.alunosHoje >= x.alunosAntes
  // mês a mês: alunos pela meta da coordenação (os mesmos lançamentos do card de alunos) + fichas marcadas da agenda
  const m = useMemo(() => {
    const ind = SETORES.operacional.indicadores[0].id
    const ant = somarMes(mes, -1)
    const prox = somarMes(mes, 1)
    const rA = resumo(s, 'operacional', ind, ant, c.id)
    const rP = resumo(s, 'operacional', ind, prox, c.id)
    const fA = financeiroOperacoes(s, ant)
    const fP = financeiroOperacoes(s, prox)
    const feitos = x.r?.mes ?? 0
    // barrinhas por dia útil: até hoje = feitos (lançamentos) • de hoje em diante = fichas marcadas (mais claras)
    const hj = hoje()
    const barras = (mesX: string, porDia: Record<string, number>): BarrasMes => {
      const d = diasDeMeta(s, 'operacional', ind, c.id, mesX)
      const valores = d.uteis.map((dia) => {
        const valor = (dia <= hj ? (d.serie[Number(dia.slice(8)) - 1] ?? 0) : 0) + (porDia[dia] ?? 0)
        return dia > hj && !valor ? null : valor
      })
      return {
        dias: d.uteis,
        valores,
        cor: (v, i) => corDoDia(v, d.metaDiaria, d.pisoDiario) + (d.uteis[i] > hj ? '99' : ''),
        destaque: mesX === hj.slice(0, 7) ? hj : undefined,
      }
    }
    return {
      anterior: { mes: ant, alunos: rA.mes, meta: rA.meta.mensal, piso: rA.piso, custo: custoPorAluno(fA.realizado), barras: barras(ant, fA.previsto.porDia) },
      atual: { feitos, marcados: x.f.previsto.alunos, alunos: feitos + x.f.previsto.alunos, meta: x.r?.meta.mensal ?? 0, piso: x.r?.piso ?? 0, custo: x.f.projecao.custoAluno, barras: barras(mes, x.f.previsto.porDia) },
      proximo: { mes: prox, alunos: fP.previsto.alunos, visitas: fP.previsto.visitas + fP.previsto.contratosConferencia, meta: rP.meta.mensal, piso: rP.piso, custo: custoPorAluno(fP.previsto), barras: barras(prox, fP.previsto.porDia) },
    }
  }, [s, c.id, mes, x])
  return (
    <div style={tamanho} className="h-full w-full min-h-0">
      <div className="h-full w-full rounded-3xl border-2 border-cyan-500/50 bg-painel/80 p-[2cqmin] flex flex-col gap-[1.6cqmin] overflow-hidden" style={{ background: 'linear-gradient(160deg, rgba(6,182,212,0.18) 0%, transparent 60%)' }}>
        <div className="flex items-center gap-[1.6cqmin] min-w-0">
          <Avatar texto={iniciais(c.nome)} foto={c.foto} tamanho="w-[clamp(28px,8cqmin,60px)] h-[clamp(28px,8cqmin,60px)]" arredondado="rounded-full" textoCls="text-[clamp(10px,2.6cqmin,18px)]" />
          <div className="min-w-0 flex-1">
            <p className="font-black uppercase tracking-[0.2em] text-cyan-300 text-[clamp(8px,2.2cqmin,14px)]">Operações</p>
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
        <div className="flex-1 min-h-0 grid gap-[1.4cqmin]" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gridTemplateRows: 'minmax(0, 1.45fr) minmax(0, 1fr) minmax(0, 1fr)' }}>
          {/* custo por ficha no mês: cada dia útil */}
          <MiniTV titulo={`Custo por ficha • ${nomeCurto(mes)} (dias úteis)`} cor={corCusto} span={7}>
            <TopoCusto media={custo.mensal.media} cor={corCusto} legenda="custo médio por ficha no mês" total={custo.mensal.total} fichas={custo.mensal.fichas} operacoes={custo.mensal.operacoes} />
            <BarrasCusto
              rotulos={x.uteis.map((d) => String(Number(d.slice(8))))}
              qtd={custo.mensal.qtd}
              custos={custo.mensal.custos}
              corBarra={(v) => (r ? corDoDia(v, r.meta.diaria, r.pisoDiario) : AZUL)}
              corCusto={(v) => (v > custo.mensal.media * 1.03 ? VERMELHO : VERDE)}
              destaque={custo.mensal.destaque}
            />
            {!compacto && <LegendaCusto />}
          </MiniTV>

          {/* custo por ficha no ano: cada mês */}
          <MiniTV titulo={`Custo por ficha • ${mes.slice(0, 4)} (meses)`} cor={corAno} span={5}>
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
          </MiniTV>

          {/* alunos fotografados */}
          <MiniTV titulo="Alunos fotografados" cor={corAlunos} span={6}>
            <div className="flex items-end gap-[2cqmin]">
              <span className="font-black leading-none tracking-tighter text-[clamp(20px,16cqmin,80px)]" style={{ color: x.corHoje }}>{num(x.alunosHoje)}</span>
              <span className="font-black pb-[1cqmin] text-[clamp(12px,7cqmin,34px)]" style={{ color: subiu ? VERDE : VERMELHO }}>{subiu ? '↗' : '↘'}</span>
            </div>
            <p className="font-bold text-zinc-300 -mt-[1cqmin] text-[clamp(8px,3.4cqmin,15px)]">{x.atual ? 'hoje' : 'último dia útil'}</p>
            <BarrasTV dias={x.uteis} valores={x.serieAlunos} rotulo={(v) => num(v)} cor={(v) => (r ? corDoDia(v, r.meta.diaria, r.pisoDiario) : AZUL)} destaque={x.atual ? x.hojeISO : undefined} />
            {r && (
              <div className="relative h-[clamp(14px,8cqmin,34px)] rounded-xl bg-white/[0.08] overflow-hidden">
                <div className="h-full rounded-xl" style={{ width: `${Math.min(100, r.pctMes)}%`, backgroundColor: corAlunos }}></div>
                {r.piso > 0 && r.meta.mensal > 0 && <div className="absolute inset-y-0 w-[3px] bg-white/80" style={{ left: `${Math.min(100, (r.piso / r.meta.mensal) * 100)}%` }}></div>}
                <span className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow text-[clamp(9px,4.4cqmin,20px)]">
                  {num(r.mes)} / {num(r.meta.mensal)}
                </span>
              </div>
            )}
          </MiniTV>

          {/* agenda futura */}
          <MiniTV titulo="Agenda • próximos 20 dias" cor={corAgenda} span={6}>
            <div className="flex items-end justify-between gap-2">
              <div>
                <span className="font-black leading-none tracking-tighter text-white text-[clamp(18px,13cqmin,68px)]">{num(a.total)}</span>
                <p className="font-bold text-zinc-300 text-[clamp(8px,3.4cqmin,15px)]">alunos agendados</p>
              </div>
              {a.capacidade !== null && (
                <span className="font-black leading-none text-[clamp(14px,9cqmin,48px)]" style={{ color: corAgenda }} title="Alunos agendados ÷ o que a meta pede nesses dias">
                  {Math.round(a.capacidade)}%
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-[1.2cqmin]">
              <Chip cor={VERDE}>{a.ok} OK</Chip>
              <Chip cor={AMARELO}>{a.pendentes} Pend.</Chip>
              <Chip cor={VERMELHO}>{a.vazios} Vazio</Chip>
            </div>
            <BarrasTV dias={a.dias.map((d) => d.data)} valores={a.dias.map((d) => d.alunos)} rotulo={(v) => num(v)} cor={(_, i) => COR_DIA[a.dias[i].situacao]} />
          </MiniTV>

          {/* mês a mês */}
          <MesTV titulo={`Mês anterior • ${nomeCurto(m.anterior.mes)}`} barras={m.anterior.barras} valor={m.anterior.alunos} meta={m.anterior.meta} piso={m.anterior.piso} legenda="alunos fotografados" span={4} compacto={compacto}>
            <Linha rotulo="Custo por aluno" valor={m.anterior.custo > 0 ? reais(m.anterior.custo) : '—'} />
          </MesTV>
          <MesTV titulo={`${x.atual ? 'Mês atual' : 'Mês'} • ${nomeCurto(mes)}`} barras={m.atual.barras} valor={m.atual.alunos} meta={m.atual.meta} piso={m.atual.piso} legenda="feitos + fichas marcadas" span={4} compacto={compacto}>
            <Linha rotulo="Feitos" valor={num(m.atual.feitos)} />
            <Linha rotulo="Marcados" valor={num(m.atual.marcados)} />
            <Linha rotulo="Custo previsto" valor={m.atual.custo > 0 ? reais(m.atual.custo) : '—'} />
          </MesTV>
          <MesTV titulo={`Próximo mês • ${nomeCurto(m.proximo.mes)}`} barras={m.proximo.barras} valor={m.proximo.alunos} meta={m.proximo.meta} piso={m.proximo.piso} legenda="fichas já marcadas" span={4} compacto={compacto}>
            <Linha rotulo="Visitas marcadas" valor={num(m.proximo.visitas)} />
            {m.proximo.piso > 0 && (
              <Linha
                rotulo="Falta p/ o piso"
                valor={m.proximo.alunos >= m.proximo.piso ? '✓ garantido' : num(m.proximo.piso - m.proximo.alunos)}
                cor={m.proximo.alunos >= m.proximo.piso ? VERDE : VERMELHO}
              />
            )}
            <Linha rotulo="Custo previsto" valor={m.proximo.custo > 0 ? reais(m.proximo.custo) : '—'} />
          </MesTV>
        </div>
      </div>
    </div>
  )
}

// ---------------- Grade: todos os cards na mesma tela ----------------
// ajustar = true (modo TV): calcula colunas e linhas para caber tudo na altura disponível, sem rolar.
// ajustar = false (página): colunas pela largura e altura fixa por card.
export function GradeTV({ s, mes, pessoas, ajustar = false, onAbrir }: { s: ErpState; mes: string; pessoas: Colaborador[]; ajustar?: boolean; onAbrir?: (c: Colaborador) => void }) {
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
  const GAP = 14

  const layout = useMemo(() => {
    if (!ajustar) {
      const cols = Math.max(2, Math.min(5, Math.floor((area.w + GAP) / (330 + GAP))))
      return { cols, rows: 0, opsRows: 3, opsCols: Math.min(cols, 3), opsH: 0 }
    }
    // procura colunas e o tamanho de Operações que deixam tudo maior: nota = o menor entre o card da pessoa
    // (proporção ~ 1 : 0,95) e o card de Operações (quer ~3,4 cards de largura por ~2,3 de altura)
    let melhor = { cols: 4, rows: 3, opsRows: 2, opsCols: 2, opsH: 0, nota: -1 }
    for (let cols = 2; cols <= 12; cols++) {
      for (const opsCols of ops ? [2, 3, 4] : [0]) {
        if (ops && opsCols >= cols) continue
        for (const opsRows of ops ? [2, 3] : [0]) {
          const celulas = outros.length + opsCols * opsRows
          const rows = Math.max(opsRows || 1, Math.ceil(celulas / cols))
          const w = (area.w - GAP * (cols - 1)) / cols
          const h = (area.h - GAP * (rows - 1)) / rows
          if (w <= 0 || h <= 0) continue
          const pessoa = Math.min(w, h / 0.95)
          const opsW = opsCols * w + GAP * (opsCols - 1)
          const opsH = opsRows * h + GAP * (opsRows - 1)
          const nota = ops ? Math.min(pessoa, opsW / 3.4, opsH / 2.3) : pessoa
          if (nota > melhor.nota) melhor = { cols, rows, opsRows, opsCols, opsH, nota }
        }
      }
    }
    return melhor
  }, [ajustar, area, ops, outros.length])

  const estilo: CSSProperties = ajustar
    ? { gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`, gridAutoFlow: 'dense', gap: GAP }
    : { gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gridAutoRows: 330, gridAutoFlow: 'dense', gap: GAP }

  return (
    <div ref={ref} className={`grid ${ajustar ? 'h-full' : ''}`} style={estilo}>
      {ops && (
        <div className="min-h-0 min-w-0" style={{ gridColumn: `span ${layout.opsCols}`, gridRow: `span ${layout.opsRows}` }}>
          <CardOperacoesTV s={s} c={ops} mes={mes} compacto={ajustar && layout.opsH < 520} />
        </div>
      )}
      {outros.map((c) => (
        <div key={c.id} className="min-h-0 min-w-0">
          <CardPessoaTV s={s} c={c} mes={mes} onAbrir={onAbrir ? () => onAbrir(c) : undefined} />
        </div>
      ))}
    </div>
  )
}
