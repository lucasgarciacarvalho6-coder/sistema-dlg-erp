'use client'

// Dinheiro de Operações, do jeito que o ADM pediu (informações simples):
//  • Visão TV › aba Operacional: o card da coordenação + 3 cards (Custo por aluno, Gastos, Projeção);
//  • clique no card da coordenação (ou num dos 3): TELA CHEIA com tudo em colunas lado a lado, sem rolar;
//  • Operações › Dashboard: o painel em grade, com o espaço para o gasto fixo dos carros.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Colaborador, ErpState } from '@/lib/erp/types'
import { colecao, diasDeMeta, resumo } from '@/lib/erp/metrics'
import { brl, hoje, iniciais, mesAtual, nomeMes, num } from '@/lib/erp/format'
import { agendaFutura, custoPorAluno, custoVariavelFicha, financeiroOperacoes, gastoFixoCarro, historicoOperacoes, mediaFichasPorDia, nivelFichas, nomeCarro, type NivelFichas } from '@/lib/erp/operacoes-financeiro'
import { salvarCustoVariavel, salvarGastoFixoCarros, useUsuario } from '@/lib/erp/store'
import Icon from './Icon'
import { Avatar, btnPrimario } from './ui'
import { STATUS } from './status'
import { corDoDia } from './PainelMeta'

const mesCurto = (m: string) => nomeMes(m).split(' /')[0]
const reais = (v: number) => brl(v).replace(/\s/g, ' ')
const reaisCurto = (v: number) => reais(v).replace(/,00$/, '') // sem os centavos redondos

// 'grade' = página de Operações • 'coluna' = tela cheia (cabe na altura da tela) • 'mini' = aba Operacional da Visão TV
type Modo = 'grade' | 'coluna' | 'mini'

// cor das barras da agenda (a projeção): agendamento alto (verde) • médio (amarelo) • baixo (vermelho),
// pela média de fichas por dia dos 3 meses anteriores
export const COR_NIVEL: Record<NivelFichas, string> = { alto: STATUS.bom.cor, medio: STATUS.atencao.cor, baixo: STATUS.critico.cor }

// ---------------- Dados (calculados uma vez e usados por todos os cards) ----------------

export function useDados(s: ErpState, colaborador: Colaborador | undefined, mes: string) {
  return useMemo(() => {
    const f = financeiroOperacoes(s, mes)
    const hist = historicoOperacoes(s, mes, 3)
    const r = colaborador ? resumo(s, 'operacional', 'fichas', mes, colaborador.id) : null
    const d = colaborador ? diasDeMeta(s, 'operacional', 'fichas', colaborador.id, mes) : null
    const hojeISO = hoje()
    const atual = mes === mesAtual()
    // gráficos: só dias úteis (segunda a sexta, sem feriados)
    const uteis = d?.uteis ?? []
    const passou = (dia: string) => dia <= hojeISO
    // alunos por dia útil (lançamentos da coordenação, os mesmos da meta): os dias que já passaram
    // e os que já têm fichas (visita encerrada antes da data marcada)
    const serieAlunos = uteis.map((dia) => {
      const v = d?.serie[Number(dia.slice(8)) - 1] ?? 0
      return passou(dia) || v > 0 ? v : null
    })
    const idxRef = atual ? uteis.indexOf(hojeISO) : uteis.filter(passou).length - 1
    const alunosHoje = idxRef >= 0 ? (serieAlunos[idxRef] ?? 0) : 0
    const alunosAntes = idxRef > 0 ? (serieAlunos[idxRef - 1] ?? 0) : 0
    // custo por aluno por dia (agenda: carro + vendedor + escola)
    const diaMap = new Map(f.dias.map((x) => [x.data, x]))
    const serieCusto = uteis.map((dia) => (diaMap.get(dia)?.alunos ? custoPorAluno(diaMap.get(dia)!) : null))
    const ultimoDia = [...f.dias].reverse().find((x) => x.alunos > 0 && x.data <= hojeISO)
    const custoHoje = diaMap.get(hojeISO)?.alunos ? custoPorAluno(diaMap.get(hojeISO)!) : null
    const custoRef = custoHoje ?? (ultimoDia ? custoPorAluno(ultimoDia) : 0)
    const custoMes = custoPorAluno(f.realizado)
    const restantes = atual ? Math.max(1, (d?.restantes ?? 0) + (uteis.includes(hojeISO) ? 1 : 0)) : 1
    // agenda (a projeção): cor de cada dia pela média de fichas por dia dos 3 meses anteriores; sem histórico, a meta do dia
    const mediaDia = mediaFichasPorDia(s)
    const corAgendamento = (v: number) => {
      const nivel = nivelFichas(v, mediaDia)
      return nivel ? COR_NIVEL[nivel] : r ? corDoDia(v, r.meta.diaria, r.pisoDiario) : '#a1a1aa'
    }
    return {
      f,
      hist,
      r,
      mes,
      atual,
      hojeISO,
      uteis,
      serieAlunos,
      alunosHoje,
      alunosAntes,
      corHoje: r ? corDoDia(alunosHoje, r.meta.diaria, r.pisoDiario) : '#3b82f6',
      serieCusto,
      custoHoje,
      ultimoDia,
      custoRef,
      custoMes,
      corCusto: custoRef > custoMes * 1.03 ? STATUS.critico.cor : custoRef < custoMes * 0.97 ? STATUS.bom.cor : 'currentColor',
      faltaMeta: r ? Math.max(0, r.meta.mensal - r.mes) : 0,
      faltaPiso: r ? Math.max(0, r.piso - r.mes) : 0,
      restantes,
      contratosConf: colecao(s, 'contratos_escola').filter((c) => c.status === 'Em conferência').length,
      agenda: agendaFutura(s, r?.meta.diaria ?? 0, 20),
      mediaDia,
      corAgendamento,
    }
  }, [s, colaborador, mes])
}
export type Dados = ReturnType<typeof useDados>

// ---------------- Peças visuais ----------------

function Cartao({ titulo, children, modo, onClick }: { titulo: string; children: ReactNode; modo: Modo; onClick?: () => void }) {
  const base = 'bg-painel-2/80 border border-white/[0.06] rounded-3xl flex flex-col'
  const estilo = modo === 'coluna' ? `${base} p-5 gap-4 h-full min-h-0 overflow-hidden` : modo === 'mini' ? `${base} p-5 gap-3 relative overflow-hidden` : `${base} p-6 gap-5`
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && onClick()}
      className={`${estilo} ${onClick ? 'cursor-pointer hover:-translate-y-1 hover:border-blue-500/40 transition-all' : ''}`}
    >
      <p className={`font-black uppercase tracking-[0.2em] text-zinc-400 ${modo === 'mini' ? 'text-[10px]' : 'text-[11px]'}`}>{titulo}</p>
      {children}
      {modo === 'mini' && onClick && <p className="mt-auto text-right text-[9px] font-bold uppercase tracking-widest text-blue-400">Ver tudo em tela cheia ↗</p>}
    </div>
  )
}

// Barras por dia útil com o número em cima (some quando a coluna é estreita); hoje em destaque
function Barras({ dias, valores, fmt, cor, destaque, altura = 'h-44' }: { dias: string[]; valores: (number | null)[]; fmt: (v: number) => string; cor: (v: number) => string; destaque?: string; altura?: string }) {
  const max = Math.max(1, ...valores.map((v) => v ?? 0)) * 1.18
  return (
    <div className={`${altura} flex flex-col @container`}>
      <div className="flex-1 min-h-0 flex items-end gap-[3px]">
        {valores.map((v, i) => (
          <div key={dias[i]} className="flex-1 h-full flex flex-col justify-end items-center min-w-0" title={`${dias[i].slice(8)}/${dias[i].slice(5, 7)}: ${v === null ? 'sem viagem' : fmt(v)}`}>
            {v !== null && v > 0 && <span className="hidden @2xs:block text-[8px] @xs:text-[9px] font-bold text-zinc-300 mb-0.5 whitespace-pre-line text-center leading-tight">{fmt(v)}</span>}
            <div
              className={`w-full max-w-[26px] rounded-t-md ${dias[i] === destaque ? 'ring-2 ring-white/80' : ''}`}
              style={{ height: v === null ? '3px' : `${Math.max(v > 0 ? 3 : 0, (v / max) * 100)}%`, backgroundColor: v === null ? 'rgba(127,127,127,0.12)' : cor(v) }}
            ></div>
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] mt-1.5 border-t border-white/[0.06] pt-1">
        {dias.map((d, i) => (
          <span key={d} className={`flex-1 text-center text-[9px] font-bold min-w-0 ${d === destaque ? 'text-white' : 'text-zinc-500'} ${i % 2 ? 'hidden @xs:block' : ''}`}>{Number(d.slice(8))}</span>
        ))}
      </div>
    </div>
  )
}

function Historico({ itens, modo }: { itens: { rotulo: string; valor: string; vazio: boolean }[]; modo: Modo }) {
  const compacto = modo !== 'grade'
  return (
    <div className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
      {itens.map((h) => (
        <div key={h.rotulo} className={`flex items-center justify-between gap-2 ${compacto ? 'py-1.5' : 'py-2.5'}`}>
          <span className={`flex items-center gap-2.5 font-bold text-zinc-200 ${compacto ? 'text-sm' : 'text-base'}`}>
            <span className={`rounded-lg flex items-center justify-center ${compacto ? 'w-6 h-6 text-[11px]' : 'w-8 h-8 text-sm'} ${h.vazio ? 'bg-red-500/15' : 'bg-emerald-500/15'}`} aria-hidden="true">📅</span>
            {h.rotulo}
          </span>
          <span className={`font-black whitespace-nowrap ${compacto ? 'text-base' : 'text-xl'} ${h.vazio ? 'text-zinc-500' : 'text-white'}`}>{h.valor}</span>
        </div>
      ))}
    </div>
  )
}

function Rosca({ fatias, modo }: { fatias: { rotulo: string; valor: number; cor: string }[]; modo: Modo }) {
  const total = fatias.reduce((a, f) => a + f.valor, 0)
  const r = 40
  const c = 2 * Math.PI * r
  let acumulado = 0
  const empilhado = modo !== 'grade'
  return (
    <div className={`flex ${empilhado ? 'flex-col items-stretch gap-3' : 'items-center gap-6'}`}>
      <svg viewBox="0 0 100 100" className={`-rotate-90 shrink-0 ${modo === 'mini' ? 'w-20 h-20 self-center' : empilhado ? 'w-32 h-32 self-center' : 'w-36 h-36'}`} aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="14" stroke="rgba(127,127,127,0.15)" />
        {total > 0 &&
          fatias.map((f) => {
            const parte = (f.valor / total) * c
            const el = <circle key={f.rotulo} cx="50" cy="50" r={r} fill="none" strokeWidth="14" stroke={f.cor} strokeDasharray={`${parte} ${c}`} strokeDashoffset={-acumulado} />
            acumulado += parte
            return el
          })}
      </svg>
      <div className="space-y-1.5 flex-1 min-w-0">
        {fatias.map((f) => (
          <div key={f.rotulo} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs text-zinc-300 min-w-0">
              <span className="w-2.5 h-2.5 rounded shrink-0" style={{ backgroundColor: f.cor }}></span>
              <span className="truncate">{f.rotulo}</span>
            </span>
            <span className="text-xs font-black text-white whitespace-nowrap">
              {reais(f.valor)} <span className="text-[10px] font-bold text-zinc-500">{total > 0 ? `${Math.round((f.valor / total) * 100)}%` : ''}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Numero({ rotulo, valor, detalhe, cor = 'text-white', modo = 'grade' }: { rotulo: string; valor: string; detalhe?: string; cor?: string; modo?: Modo }) {
  return (
    <div className={`bg-white/[0.03] border border-white/[0.05] rounded-2xl ${modo === 'grade' ? 'p-4' : 'p-3'}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{rotulo}</p>
      <p className={`font-black mt-0.5 ${modo === 'grade' ? 'text-2xl' : 'text-xl'} ${cor}`}>{valor}</p>
      {detalhe && <p className="text-[11px] text-zinc-500 mt-0.5">{detalhe}</p>}
    </div>
  )
}

const tituloGrande = (modo: Modo) => (modo === 'mini' ? 'text-4xl' : modo === 'coluna' ? 'text-5xl 2xl:text-6xl' : 'text-6xl')

// ---------------- Os cards ----------------

function CardAlunos({ x, modo, onClick }: { x: Dados; modo: Modo; onClick?: () => void }) {
  const r = x.r
  const subiu = x.alunosHoje >= x.alunosAntes
  return (
    <Cartao titulo="Alunos fotografados" modo={modo} onClick={onClick}>
      <div className="flex items-center gap-3">
        <span className={`font-black text-zinc-400 ${modo === 'mini' ? 'text-2xl' : 'text-4xl'}`} aria-hidden="true">
          {subiu ? '↗' : '↘'}
        </span>
        <div>
          <p className={`font-black leading-none tracking-tighter text-white ${modo === 'grade' ? 'text-7xl' : tituloGrande(modo)}`}>{num(x.alunosHoje)}</p>
          <p className={`font-bold text-zinc-300 mt-1 ${modo === 'mini' ? 'text-xs' : 'text-base'}`}>{x.atual ? 'Alunos fotografados hoje' : 'Último dia útil do mês'}</p>
        </div>
      </div>
      <Barras dias={x.uteis} valores={x.serieAlunos} fmt={(v) => num(v)} cor={(v) => (r ? corDoDia(v, r.meta.diaria, r.pisoDiario) : '#3b82f6')} destaque={x.atual ? x.hojeISO : undefined} altura={modo === 'coluna' ? 'flex-1 min-h-[120px]' : modo === 'mini' ? 'h-24' : 'h-44'} />
      {r && (
        <div>
          <p className={`font-bold text-zinc-200 mb-2 ${modo === 'mini' ? 'text-xs' : 'text-sm'}`}>Acumulado e meta mensal ({num(r.meta.mensal)})</p>
          <div className={`relative rounded-2xl bg-white/[0.06] overflow-hidden ${modo === 'mini' ? 'h-7' : 'h-10'}`}>
            <div className="h-full rounded-2xl transition-all duration-700" style={{ width: `${Math.min(100, r.pctMes)}%`, backgroundColor: STATUS[r.mes >= r.meta.mensal ? 'bom' : r.mes >= r.piso ? 'atencao' : 'critico'].cor }}></div>
            {r.piso > 0 && r.meta.mensal > 0 && <div className="absolute inset-y-0 w-0.5 bg-white/70" style={{ left: `${Math.min(100, (r.piso / r.meta.mensal) * 100)}%` }} title={`Piso ${num(r.piso)}`}></div>}
            <span className={`absolute inset-0 flex items-center justify-center font-black text-white drop-shadow ${modo === 'mini' ? 'text-base' : 'text-2xl'}`}>{num(r.mes)}</span>
          </div>
        </div>
      )}
      {modo !== 'mini' && <Historico modo={modo} itens={x.hist.map((h) => ({ rotulo: mesCurto(h.mes), valor: num(h.alunos), vazio: h.alunos === 0 }))} />}
    </Cartao>
  )
}

function CardCusto({ x, modo, onClick }: { x: Dados; modo: Modo; onClick?: () => void }) {
  const legenda = x.custoHoje !== null ? 'Custo por aluno hoje' : x.ultimoDia ? `Custo por aluno em ${x.ultimoDia.data.slice(8)}/${x.ultimoDia.data.slice(5, 7)}` : 'Ainda sem viagem no mês'
  return (
    <Cartao titulo="Custo médio por aluno" modo={modo} onClick={onClick}>
      <div>
        <p className={`font-black leading-none tracking-tighter ${tituloGrande(modo)}`} style={{ color: x.corCusto }}>{reais(x.custoRef)}</p>
        <p className="text-base font-bold text-zinc-300 mt-1.5">{legenda}</p>
      </div>
      <div className={modo === 'coluna' ? 'flex-1 min-h-0 flex flex-col' : ''}>
        <p className="text-xs font-bold text-zinc-400 mb-1">Oscilação diária (dias úteis)</p>
        <Barras dias={x.uteis} valores={x.serieCusto} fmt={(v) => `R$\n${Math.round(v)}`} cor={(v) => (v > x.custoMes * 1.03 ? '#ef4444' : '#3b82f6')} destaque={x.atual ? x.hojeISO : undefined} altura={modo === 'coluna' ? 'flex-1 min-h-[120px]' : modo === 'mini' ? 'h-24' : 'h-44'} />
      </div>
      <div className={`flex gap-3 bg-white/[0.03] border border-white/[0.05] rounded-2xl px-4 py-3 ${modo === 'coluna' ? 'flex-col gap-0.5' : 'items-center justify-between'}`}>
        <p className="text-sm font-bold text-zinc-200">Custo médio do mês</p>
        <p className={`font-black text-white whitespace-nowrap ${modo === 'mini' ? 'text-xl' : modo === 'coluna' ? 'text-2xl 2xl:text-3xl' : 'text-3xl'}`}>{reais(x.custoMes)}</p>
      </div>
      {modo !== 'mini' && <Historico modo={modo} itens={x.hist.map((h) => ({ rotulo: mesCurto(h.mes), valor: h.alunos ? `${reais(h.custoAluno)}/aluno` : reais(0), vazio: h.alunos === 0 }))} />}
    </Cartao>
  )
}

function CardGastos({ x, modo, onClick }: { x: Dados; modo: Modo; onClick?: () => void }) {
  const f = x.f
  return (
    <Cartao titulo="Gastos do mês" modo={modo} onClick={onClick}>
      <div>
        <p className={`font-black text-white tracking-tighter ${modo === 'mini' ? 'text-3xl' : modo === 'coluna' ? 'text-3xl 2xl:text-4xl' : 'text-5xl'}`}>{reais(f.realizado.total)}</p>
        <p className="text-sm text-zinc-400 mt-1">
          {num(f.realizado.alunos)} fichas • {f.realizado.operacoes} operação(ões) em {f.realizado.diasViagem} dia(s)
        </p>
      </div>
      <Rosca
        modo={modo}
        fatias={[
          { rotulo: 'Fixo (operações)', valor: f.realizado.fixo, cor: 'var(--color-zinc-300)' },
          { rotulo: 'Variável (escola + vendedor)', valor: f.realizado.variavel, cor: 'var(--color-zinc-600)' },
        ]}
      />
      {modo !== 'mini' && (
        <div className="space-y-2 border-t border-white/[0.06] pt-3">
          {f.porCarro.length === 0 && <p className="text-xs text-zinc-500">Nenhum carro saiu neste mês.</p>}
          {f.porCarro.map((c) => (
            <div key={c.veiculo.id} className={modo === 'coluna' ? 'text-sm' : 'flex items-center justify-between gap-3 text-sm'}>
              <p className="text-zinc-300 truncate">{nomeCarro(c.veiculo)}</p>
              {modo === 'coluna' ? (
                <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-zinc-400">
                  <span className="whitespace-nowrap">
                    {c.dias} dia(s) × {reaisCurto(c.valorDia)}
                  </span>
                  <strong className="text-white whitespace-nowrap">{reaisCurto(c.fixo)}</strong>
                </p>
              ) : (
                <p className="text-zinc-400 whitespace-nowrap">
                  {c.dias} dia(s) × {reais(c.valorDia)} = <strong className="text-white">{reais(c.fixo)}</strong>
                </p>
              )}
            </div>
          ))}
          {f.realizado.semCarro > 0 && <p className="text-[11px] text-yellow-400">⚠ {f.realizado.semCarro} visita(s) sem carro na agenda: sem gasto fixo.</p>}
        </div>
      )}
    </Cartao>
  )
}

function CardProjecao({ x, modo, onClick }: { x: Dados; modo: Modo; onClick?: () => void }) {
  const f = x.f
  const r = x.r
  return (
    <Cartao titulo="Projeção • fichas fechadas" modo={modo} onClick={onClick}>
      <div className={`grid gap-3 ${modo === 'grade' ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {modo !== 'mini' && <Numero modo={modo} rotulo="Alunos no mês" valor={num(f.projecao.alunos)} detalhe={`${num(f.realizado.alunos)} feitos + ${num(f.previsto.alunos)} fechados`} />}
        <Numero modo={modo} rotulo="Gasto previsto" valor={reais(f.projecao.total)} detalhe={`${reais(f.projecao.custoAluno)} por aluno`} />
      </div>
      <div className={`bg-white/[0.03] border border-white/[0.08] rounded-2xl ${modo === 'grade' ? 'p-5' : 'p-4'}`}>
        <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400">Quanto vai ganhar</p>
        {f.projecao.temVendas ? (
          <>
            <p className={`font-black text-white tracking-tighter mt-1 ${modo === 'mini' ? 'text-3xl' : modo === 'coluna' ? 'text-4xl' : 'text-5xl'}`}>{reais(f.projecao.receita)}</p>
            <p className="text-xs text-zinc-400 mt-1">{reais(f.projecao.receitaAluno)} por aluno (vendas reais)</p>
          </>
        ) : (
          <p className="text-base font-bold text-zinc-300 mt-2">Ainda sem vendas registradas para calcular.</p>
        )}
      </div>
      {f.projecao.temVendas && (
        <div className={`flex gap-2 rounded-2xl px-4 py-3 border ${modo === 'coluna' ? 'flex-col gap-0.5' : 'items-center justify-between'} ${f.projecao.resultado >= 0 ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-red-500/10 border-red-500/25'}`}>
          <p className="text-sm font-bold text-zinc-200">Resultado previsto</p>
          <p className={`font-black whitespace-nowrap ${modo === 'grade' ? 'text-3xl' : modo === 'coluna' ? 'text-2xl' : 'text-xl'} ${f.projecao.resultado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{reais(f.projecao.resultado)}</p>
        </div>
      )}
      {r && r.meta.mensal > 0 && (
        <div>
          <div className="flex justify-between text-xs font-bold text-zinc-400 mb-1.5">
            <span>Alunos × meta</span>
            <span className="text-white">{num(f.projecao.alunos)} / {num(r.meta.mensal)}</span>
          </div>
          <div className="relative h-3 rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (f.projecao.alunos / r.meta.mensal) * 100)}%`, backgroundColor: STATUS[f.projecao.alunos >= r.meta.mensal ? 'bom' : f.projecao.alunos >= r.piso ? 'atencao' : 'critico'].cor }}></div>
            {r.piso > 0 && <div className="absolute -inset-y-1 w-0.5 bg-white/70" style={{ left: `${Math.min(100, (r.piso / r.meta.mensal) * 100)}%` }}></div>}
          </div>
        </div>
      )}
      {modo !== 'mini' && (
        <p className="text-[11px] text-zinc-500">
          Fichas fechadas: {f.previsto.visitas} visita(s) agendada(s){f.previsto.contratosConferencia ? ` + ${f.previsto.contratosConferencia} contrato(s) em conferência` : ''} até o fim do mês.
        </p>
      )}
    </Cartao>
  )
}

function CardResumo({ x, modo }: { x: Dados; modo: Modo }) {
  const f = x.f
  const r = x.r
  return (
    <Cartao titulo="Resumo do setor" modo={modo}>
      <div className={`grid gap-3 ${modo === 'grade' ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2'}`}>
        <Numero modo={modo} rotulo="Visitas feitas" valor={num(f.agenda.feitas)} />
        <Numero modo={modo} rotulo="Agendadas" valor={num(f.agenda.agendadas)} />
        <Numero modo={modo} rotulo="Canceladas" valor={num(f.agenda.canceladas)} cor={f.agenda.canceladas ? 'text-red-400' : 'text-white'} />
        <Numero modo={modo} rotulo="Escolas atendidas" valor={num(f.realizado.escolas)} />
        <Numero modo={modo} rotulo="Alunos por visita" valor={f.realizado.visitas ? num(f.realizado.alunos / f.realizado.visitas) : '—'} />
        <Numero modo={modo} rotulo="Contratos em conferência" valor={num(x.contratosConf)} />
      </div>
      {r && r.meta.mensal > 0 && x.atual && (
        <div className={`grid gap-3 ${modo === 'grade' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <Numero modo={modo} rotulo="Para bater o piso" valor={x.faltaPiso > 0 ? `${num(Math.ceil(x.faltaPiso / x.restantes))}/dia` : 'Batido ✓'} detalhe={x.faltaPiso > 0 ? `faltam ${num(x.faltaPiso)} alunos` : undefined} cor={x.faltaPiso > 0 ? 'text-yellow-400' : 'text-emerald-400'} />
          <Numero modo={modo} rotulo="Para bater a meta" valor={x.faltaMeta > 0 ? `${num(Math.ceil(x.faltaMeta / x.restantes))}/dia` : 'Batida 🎯'} detalhe={x.faltaMeta > 0 ? `faltam ${num(x.faltaMeta)} alunos` : undefined} cor={x.faltaMeta > 0 ? 'text-white' : 'text-emerald-400'} />
        </div>
      )}
    </Cartao>
  )
}

// Espaço da coordenação para o gasto fixo por dia de cada carro (vale a partir do mês escolhido)
// ---------------- Agenda futura (próximos 20 dias úteis) ----------------
// Legenda das barras da agenda: cheia = confirmadas pela escola, clara = ainda a confirmar (previstas no contrato);
// a cor compara o agendamento do dia com a média de fichas por dia dos 3 meses anteriores
export function LegendaAgendamento({ x, tv = false, comCusto = false }: { x: Dados; tv?: boolean; comCusto?: boolean }) {
  const media = Math.round(x.mediaDia)
  const ponto = (cor: string, texto: string) => (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="inline-block w-[0.8em] h-[0.8em] rounded-sm" style={{ backgroundColor: cor }}></span>
      {texto}
    </span>
  )
  return (
    <p className={`flex flex-wrap items-center gap-x-[0.8em] gap-y-0.5 font-bold text-zinc-500 leading-tight ${tv ? 'text-[clamp(7px,2.6cqmin,12px)]' : 'text-[10px]'}`}>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span className="inline-block w-[0.8em] h-[0.8em] rounded-sm bg-zinc-300"></span>confirmadas
      </span>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span className="inline-block w-[0.8em] h-[0.8em] rounded-sm border border-dashed border-zinc-300 bg-zinc-300/25"></span>a confirmar
      </span>
      {media > 0 ? (
        <>
          <span className="whitespace-nowrap" title="Média de fichas por dia nos 3 meses anteriores • médio = de 60% até a média">• média 3 meses: {num(media)}/dia</span>
          {ponto(COR_NIVEL.alto, 'alto')}
          {ponto(COR_NIVEL.medio, 'médio')}
          {ponto(COR_NIVEL.baixo, 'baixo')}
        </>
      ) : (
        <span className="whitespace-nowrap">• cor pela meta do dia (ainda sem histórico)</span>
      )}
      {comCusto && <span className="whitespace-nowrap">• R$ = custo previsto por ficha</span>}
    </p>
  )
}

// A PROJEÇÃO: as fichas agendadas nos próximos 20 dias úteis (só neste card)
function CardAgendaFutura({ x, modo }: { x: Dados; modo: Modo }) {
  const a = x.agenda
  const max = Math.max(1, ...a.dias.map((d) => d.agendadas)) * 1.18
  const chip = modo === 'mini' ? 'px-2 py-1 rounded-lg text-[11px] font-black border' : 'px-3 py-1.5 rounded-xl text-sm font-black border'
  return (
    <Cartao titulo="Agenda futura • 20 dias" modo={modo}>
      <div className="flex flex-wrap gap-2">
        <span className={`${chip} border-white/[0.08] bg-white/[0.04] text-white`}>Fichas agendadas: {num(a.agendadas)}</span>
        <span className={`${chip} border-white/[0.08] bg-white/[0.04] text-white`}>Confirmadas: {num(a.total)}</span>
        <span className={`${chip} border-white/[0.08] bg-white/[0.04] text-white`} title="Carros × gasto fixo + fichas agendadas × custo por ficha">
          Custo previsto: {reais(a.custo)}
        </span>
        <span className={`${chip} border-white/[0.08] bg-white/[0.04] text-white`}>Dias: {a.comAgenda}/{a.dias.length}</span>
        {a.capacidade !== null && (
          <span className={`${chip} border-white/[0.08] bg-white/[0.04] text-white`} title="Fichas agendadas ÷ o que a meta pede nesses dias">
            Capacidade: {Math.round(a.capacidade)}%
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={`${chip} inline-flex items-center gap-1.5 border-white/[0.08] bg-white/[0.04] text-zinc-200`}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS.bom.cor }}></span>
          {a.ok} OK
        </span>
        <span className={`${chip} inline-flex items-center gap-1.5 border-white/[0.08] bg-white/[0.04] text-zinc-200`}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS.atencao.cor }}></span>
          {a.pendentes} Pend.
        </span>
        <span className={`${chip} inline-flex items-center gap-1.5 border-white/[0.08] bg-white/[0.04] text-zinc-200`}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS.critico.cor }}></span>
          {a.vazios} Vazio
        </span>
      </div>
      <div className={`flex flex-col @container ${modo === 'coluna' ? 'flex-1 min-h-[120px]' : modo === 'mini' ? 'h-24' : 'h-64'}`}>
        <div className="flex-1 min-h-0 flex items-end gap-[3px]">
          {a.dias.map((d) => {
            const cor = x.corAgendamento(d.agendadas)
            const aConfirmar = Math.max(0, d.agendadas - d.alunos)
            return (
              <div
                key={d.data}
                className="flex-1 h-full flex flex-col justify-end items-center min-w-0"
                title={`${d.data.slice(8)}/${d.data.slice(5, 7)}: ${d.situacao}${d.visitas ? ` • ${d.visitas} visita(s) • ${d.agendadas} fichas agendadas (${d.alunos} confirmadas)` : ' • sem visita'}`}
              >
                {d.agendadas > 0 && <span className={`hidden @2xs:block text-[8px] @xs:text-[9px] font-bold mb-0.5 whitespace-nowrap ${d.alunos > 0 ? 'text-zinc-300' : 'text-zinc-500'}`}>{num(d.agendadas)}</span>}
                {aConfirmar > 0 && <div className={`w-full max-w-[26px] border border-dashed border-b-0 ${d.alunos > 0 ? '' : 'rounded-t-md'}`} style={{ height: `${(aConfirmar / max) * 100}%`, backgroundColor: `${cor}40`, borderColor: cor }}></div>}
                <div
                  className={`w-full max-w-[26px] ${aConfirmar > 0 ? '' : 'rounded-t-md'}`}
                  style={{ height: d.alunos > 0 ? `${Math.max(3, (d.alunos / max) * 100)}%` : aConfirmar > 0 ? '0px' : '6px', backgroundColor: cor }}
                ></div>
              </div>
            )
          })}
        </div>
        <div className="flex gap-[3px] mt-1.5 border-t border-white/[0.06] pt-1">
          {a.dias.map((d, i) => (
            <span key={d.data} className={`flex-1 text-center text-[9px] font-bold min-w-0 text-zinc-500 ${i % 2 ? 'hidden @xs:block' : ''}`}>
              {Number(d.data.slice(8))}
            </span>
          ))}
        </div>
      </div>
      <LegendaAgendamento x={x} />
      {modo !== 'mini' && (
        <p className="text-[11px] text-zinc-500">
          OK: fichas confirmadas e equipe montada • Pend.: falta confirmar fichas ou montar a equipe • Vazio: dia útil sem visita
        </p>
      )}
    </Cartao>
  )
}

// Custos da operação (R$ 2.500 por carro/dia e R$ 60 por ficha): regra do dono, SOMENTE o ADM altera
function GastoFixoCarros({ s, mes }: { s: ErpState; mes: string }) {
  const souAdm = useUsuario()?.perfil === 'ADM'
  const editavel = souAdm
  const variavelEditavel = souAdm
  const carros = colecao(s, 'veiculos').filter((v) => v.status !== 'Inativo')
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(carros.map((v) => [v.id, String(gastoFixoCarro(v, mes) || '')])))
  const [variavel, setVariavel] = useState(() => String(custoVariavelFicha(s, mes)))
  const [salvando, setSalvando] = useState(false)
  const salvarVariavel = async () => {
    setSalvando(true)
    await salvarCustoVariavel(Number(variavel) || 0, mes)
    setSalvando(false)
  }
  const campoVariavel = (
    <div className="space-y-2 border-b border-white/[0.06] pb-4">
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-white">Custo variável por ficha</span>
          <span className="block text-[10px] text-zinc-500">Repasse da escola + comissão do vendedor</span>
        </span>
        <span className="text-xs text-zinc-500">R$</span>
        <input
          type="number"
          min="0"
          step="1"
          disabled={!variavelEditavel}
          value={variavel}
          onChange={(e) => setVariavel(e.target.value)}
          className="w-32 bg-black/50 border border-white/[0.06] rounded-xl px-3 py-2.5 text-sm font-bold text-white text-right outline-none focus:border-blue-500/50 disabled:opacity-60"
        />
        <span className="text-xs text-zinc-500 w-10">/ ficha</span>
      </div>
      {variavelEditavel && (
        <button disabled={salvando} onClick={salvarVariavel} className={`${btnPrimario} w-full`}>
          {salvando ? 'Salvando...' : 'Salvar custo variável'}
        </button>
      )}
    </div>
  )
  if (!carros.length)
    return (
      <div className="space-y-3">
        {campoVariavel}
        <p className="text-sm text-zinc-500">Cadastre os carros em Operações › Controle operacional › Veículos.</p>
      </div>
    )
  return (
    <div className="space-y-3">
      {campoVariavel}
      {carros.map((v) => (
        <div key={v.id} className="flex items-center gap-3">
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-white truncate">{nomeCarro(v)}</span>
            <span className="block text-[10px] text-zinc-500">{String(v.status)}</span>
          </span>
          <span className="text-xs text-zinc-500">R$</span>
          <input
            type="number"
            min="0"
            step="50"
            disabled={!editavel}
            value={valores[v.id] ?? ''}
            onChange={(e) => setValores({ ...valores, [v.id]: e.target.value })}
            placeholder="0"
            className="w-32 bg-black/50 border border-white/[0.06] rounded-xl px-3 py-2.5 text-sm font-bold text-white text-right outline-none focus:border-blue-500/50 disabled:opacity-60"
          />
          <span className="text-xs text-zinc-500 w-10">/ dia</span>
        </div>
      ))}
      <p className="text-[11px] text-zinc-500">
        Fixo por operação (carro por dia): tudo incluso (combustível, fotógrafos, motorista, veículo...). Conta só nos dias em que o carro sai. Os valores valem a partir de {mesCurto(mes).toLowerCase()}.
      </p>
      {!souAdm && <p className="text-[11px] font-bold text-zinc-400">🔒 Valores definidos pelo ADM: somente o ADM altera.</p>}
      {editavel && (
        <button
          disabled={salvando}
          onClick={async () => {
            setSalvando(true)
            await salvarGastoFixoCarros(Object.fromEntries(Object.entries(valores).map(([id, v]) => [id, Number(v) || 0])), mes)
            setSalvando(false)
          }}
          className={`${btnPrimario} w-full`}
        >
          {salvando ? 'Salvando...' : 'Salvar gasto fixo'}
        </button>
      )}
    </div>
  )
}

function Cabecalho({ x, colaborador, grande = false }: { x: Dados; colaborador: Colaborador | undefined; grande?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar texto={iniciais(colaborador?.nome ?? 'Operações')} foto={colaborador?.foto} tamanho={grande ? 'w-14 h-14' : 'w-16 h-16'} arredondado="rounded-full" textoCls="text-lg" />
      <div className="flex-1 min-w-0">
        <p className={`font-black text-white ${grande ? 'text-3xl' : 'text-2xl'}`}>{colaborador?.nome ?? 'Operações'}</p>
        <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Operações • {nomeMes(x.mes)}</p>
      </div>
      {x.r && x.r.meta.mensal > 0 && (
        <p className="text-sm font-bold text-zinc-400">
          Piso <span className="text-white">{num(x.r.piso)}</span> • Meta <span className="text-white">{num(x.r.meta.mensal)}</span> alunos
        </p>
      )}
    </div>
  )
}

// ---------------- Montagens ----------------

// Operações › Dashboard: grade de 2 colunas com o gasto fixo dos carros
export default function PainelOperacoes({ s, colaborador, mes = mesAtual() }: { s: ErpState; colaborador: Colaborador | undefined; mes?: string }) {
  const x = useDados(s, colaborador, mes)
  return (
    <div className="space-y-6">
      <Cabecalho x={x} colaborador={colaborador} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <CardAlunos x={x} modo="grade" />
        <CardCusto x={x} modo="grade" />
        <CardGastos x={x} modo="grade" />
        <CardProjecao x={x} modo="grade" />
        <CardResumo x={x} modo="grade" />
        <Cartao titulo="Custos da operação (fixo por carro/dia + variável por ficha)" modo="grade">
          <GastoFixoCarros key={mes} s={s} mes={mes} />
        </Cartao>
      </div>
    </div>
  )
}

// Visão TV do ADM: CARD de Operações (maior que os outros), sempre aberto, com 3 mini-cards dentro:
// Alunos fotografados • Custo médio por aluno • Agenda futura (20 dias)
export function CardOperacoesTV({ s, colaborador, mes = mesAtual() }: { s: ErpState; colaborador: Colaborador | undefined; mes?: string }) {
  const x = useDados(s, colaborador, mes)
  return (
    <div className="bg-painel/80 border border-white/[0.1] rounded-3xl p-4 relative overflow-hidden h-full">
      <div className="flex items-center gap-3 mb-3">
        <Avatar texto={iniciais(colaborador?.nome ?? 'Operações')} foto={colaborador?.foto} tamanho="w-10 h-10" arredondado="rounded-full" textoCls="text-xs" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">Operações</p>
          <p className="text-sm font-bold text-white truncate">{colaborador?.nome ?? '—'}</p>
        </div>
        {x.r && x.r.meta.mensal > 0 && (
          <p className="text-[11px] font-bold text-zinc-400 whitespace-nowrap">
            Piso <span className="text-white">{num(x.r.piso)}</span> • Meta <span className="text-white">{num(x.r.meta.mensal)}</span>
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <CardAlunos x={x} modo="mini" />
        <CardCusto x={x} modo="mini" />
        <CardAgendaFutura x={x} modo="mini" />
      </div>
    </div>
  )
}

// Visão TV › aba Operacional: 3 cards ao lado do card da coordenação (clicar abre a tela cheia)
export function CardsOperacoes({ s, colaborador, mes, onAbrir }: { s: ErpState; colaborador: Colaborador | undefined; mes: string; onAbrir: () => void }) {
  const x = useDados(s, colaborador, mes)
  return (
    <>
      <CardCusto x={x} modo="mini" onClick={onAbrir} />
      <CardGastos x={x} modo="mini" onClick={onAbrir} />
      <CardProjecao x={x} modo="mini" onClick={onAbrir} />
    </>
  )
}

// Tela cheia: tudo em colunas lado a lado, cabendo na altura da tela (sem rolar). Esc fecha.
export function TelaOperacoes({ s, colaborador, mes, onSair }: { s: ErpState; colaborador: Colaborador | undefined; mes: string; onSair: () => void }) {
  const x = useDados(s, colaborador, mes)
  const raiz = useRef<HTMLDivElement>(null)
  const sairRef = useRef(onSair)
  useEffect(() => {
    sairRef.current = onSair
  }, [onSair])
  useEffect(() => {
    raiz.current?.requestFullscreen?.().catch(() => undefined)
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && sairRef.current()
    const aoMudar = () => {
      if (!document.fullscreenElement) sairRef.current()
    }
    window.addEventListener('keydown', tecla)
    document.addEventListener('fullscreenchange', aoMudar)
    return () => {
      window.removeEventListener('keydown', tecla)
      document.removeEventListener('fullscreenchange', aoMudar)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])
  return (
    <div ref={raiz} className="fixed inset-0 z-[120] bg-black text-white flex flex-col overflow-y-auto xl:overflow-hidden">
      <div className="px-6 pt-5 pb-4 flex items-center gap-4">
        <div className="flex-1">
          <Cabecalho x={x} colaborador={colaborador} grande />
        </div>
        <button onClick={onSair} className="w-12 h-12 rounded-2xl border border-white/[0.1] text-zinc-300 hover:text-white hover:bg-white/[0.05] flex items-center justify-center" aria-label="Fechar (Esc)" title="Fechar (Esc)">
          <Icon nome="x" className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 px-6 pb-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <CardAlunos x={x} modo="coluna" />
        <CardCusto x={x} modo="coluna" />
        <CardGastos x={x} modo="coluna" />
        <CardProjecao x={x} modo="coluna" />
        <CardResumo x={x} modo="coluna" />
      </div>
    </div>
  )
}
