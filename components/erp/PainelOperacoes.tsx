'use client'

// Painel do dinheiro de Operações (abre ao clicar na coordenação/RMC na Visão TV e fica na aba Operações).
// Do jeito que o ADM pediu: poucas informações, simples e grandes.
//  1. Alunos fotografados   2. Custo médio por aluno   3. Gastos do mês
//  4. Projeção (fichas fechadas) e quanto vai ganhar     5. Resumo do setor   6. Gasto fixo dos carros (editável)

import { useMemo, useState, type ReactNode } from 'react'
import type { Colaborador, ErpState } from '@/lib/erp/types'
import { colecao, diasDeMeta, resumo } from '@/lib/erp/metrics'
import { brl, hoje, iniciais, mesAtual, nomeMes, num } from '@/lib/erp/format'
import { custoPorAluno, financeiroOperacoes, gastoFixoCarro, historicoOperacoes, nomeCarro } from '@/lib/erp/operacoes-financeiro'
import { salvarGastoFixoCarros, usePode } from '@/lib/erp/store'
import { Avatar, btnPrimario } from './ui'
import { STATUS } from './status'
import { corDoDia } from './PainelMeta'

const mesCurto = (m: string) => nomeMes(m).split(' /')[0]
const reais = (v: number) => brl(v).replace(/\s/g, ' ')

function Cartao({ titulo, children, acoes }: { titulo: string; children: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="bg-painel-2/80 border border-white/[0.06] rounded-3xl p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">{titulo}</p>
        {acoes}
      </div>
      {children}
    </div>
  )
}

// Barras por dia útil com o número em cima (como no modelo); hoje em destaque
function Barras({ dias, valores, fmt, cor, destaque }: { dias: string[]; valores: (number | null)[]; fmt: (v: number) => string; cor: (v: number, i: number) => string; destaque?: string }) {
  const max = Math.max(1, ...valores.map((v) => v ?? 0)) * 1.18
  return (
    <div className="h-44 flex flex-col">
      <div className="flex-1 flex items-end gap-[3px]">
        {valores.map((v, i) => (
          <div key={dias[i]} className="flex-1 h-full flex flex-col justify-end items-center min-w-0" title={`${dias[i].slice(8)}/${dias[i].slice(5, 7)}: ${v === null ? 'sem viagem' : fmt(v)}`}>
            {v !== null && v > 0 && <span className="text-[9px] font-bold text-zinc-300 mb-0.5 whitespace-nowrap">{fmt(v)}</span>}
            <div
              className={`w-full max-w-[26px] rounded-t-md ${dias[i] === destaque ? 'ring-2 ring-white/80' : ''}`}
              style={{ height: v === null ? '3px' : `${Math.max(v > 0 ? 3 : 0, (v / max) * 100)}%`, backgroundColor: v === null ? 'rgba(255,255,255,0.06)' : cor(v, i) }}
            ></div>
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] mt-1.5 border-t border-white/[0.06] pt-1">
        {dias.map((d) => (
          <span key={d} className={`flex-1 text-center text-[9px] font-bold min-w-0 ${d === destaque ? 'text-white' : 'text-zinc-500'}`}>{Number(d.slice(8))}</span>
        ))}
      </div>
    </div>
  )
}

function Historico({ itens }: { itens: { rotulo: string; valor: string; vazio: boolean }[] }) {
  return (
    <div className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
      {itens.map((h) => (
        <div key={h.rotulo} className="flex items-center justify-between py-2.5">
          <span className="flex items-center gap-3 text-base font-bold text-zinc-200">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${h.vazio ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`} aria-hidden="true">📅</span>
            {h.rotulo}
          </span>
          <span className={`text-xl font-black ${h.vazio ? 'text-zinc-500' : 'text-white'}`}>{h.valor}</span>
        </div>
      ))}
    </div>
  )
}

function Rosca({ fatias }: { fatias: { rotulo: string; valor: number; cor: string }[] }) {
  const total = fatias.reduce((a, f) => a + f.valor, 0)
  const r = 40
  const c = 2 * Math.PI * r
  let acumulado = 0
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-36 h-36 -rotate-90 shrink-0" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="14" stroke="rgba(255,255,255,0.06)" />
        {total > 0 &&
          fatias.map((f) => {
            const parte = (f.valor / total) * c
            const el = <circle key={f.rotulo} cx="50" cy="50" r={r} fill="none" strokeWidth="14" stroke={f.cor} strokeDasharray={`${parte} ${c}`} strokeDashoffset={-acumulado} />
            acumulado += parte
            return el
          })}
      </svg>
      <div className="space-y-2 flex-1 min-w-0">
        {fatias.map((f) => (
          <div key={f.rotulo} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm text-zinc-300 min-w-0">
              <span className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: f.cor }}></span>
              <span className="truncate">{f.rotulo}</span>
            </span>
            <span className="text-sm font-black text-white whitespace-nowrap">
              {reais(f.valor)} <span className="text-[11px] font-bold text-zinc-500">{total > 0 ? `${Math.round((f.valor / total) * 100)}%` : ''}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Numero({ rotulo, valor, detalhe, cor = 'text-white' }: { rotulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{rotulo}</p>
      <p className={`text-2xl font-black mt-1 ${cor}`}>{valor}</p>
      {detalhe && <p className="text-[11px] text-zinc-500 mt-0.5">{detalhe}</p>}
    </div>
  )
}

// Espaço da coordenação para o gasto fixo por dia de cada carro (vale a partir do mês escolhido)
function GastoFixoCarros({ s, mes }: { s: ErpState; mes: string }) {
  const podeFazer = usePode()
  const editavel = podeFazer('operacional', 'editar')
  const carros = colecao(s, 'veiculos').filter((v) => v.status !== 'Inativo')
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(carros.map((v) => [v.id, String(gastoFixoCarro(v, mes) || '')])))
  const [salvando, setSalvando] = useState(false)
  if (!carros.length) return <p className="text-sm text-zinc-500">Cadastre os carros em Operações › Controle operacional › Veículos.</p>
  return (
    <div className="space-y-3">
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
      <p className="text-[11px] text-zinc-500">Tudo incluso (motorista, fotógrafos, alimentação...). Conta só nos dias em que o carro sai. Vale a partir de {mesCurto(mes).toLowerCase()}.</p>
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

export default function PainelOperacoes({ s, colaborador, mes = mesAtual() }: { s: ErpState; colaborador: Colaborador | undefined; mes?: string }) {
  const f = useMemo(() => financeiroOperacoes(s, mes), [s, mes])
  const hist = useMemo(() => historicoOperacoes(s, mes, 3), [s, mes])
  const r = colaborador ? resumo(s, 'operacional', 'fichas', mes, colaborador.id) : null
  const d = colaborador ? diasDeMeta(s, 'operacional', 'fichas', colaborador.id, mes) : null
  const hojeISO = hoje()
  const atual = mes === mesAtual()

  // ---- 1. alunos fotografados ----
  const uteis = d?.uteis ?? []
  const decorridos = d?.decorridos ?? 0
  const serieAlunos = uteis.map((dia, i) => (i < decorridos ? (d?.serie[Number(dia.slice(8)) - 1] ?? 0) : null))
  const idxRef = atual ? uteis.indexOf(hojeISO) : decorridos - 1
  const alunosHoje = idxRef >= 0 ? (serieAlunos[idxRef] ?? 0) : 0
  const alunosAntes = idxRef > 0 ? (serieAlunos[idxRef - 1] ?? 0) : 0
  const corHoje = r ? corDoDia(alunosHoje, r.meta.diaria, r.pisoDiario) : '#fff'

  // ---- 2. custo por aluno ----
  const diaMap = new Map(f.dias.map((x) => [x.data, x]))
  const serieCusto = uteis.map((dia, i) => (i < decorridos && diaMap.get(dia)?.alunos ? custoPorAluno(diaMap.get(dia)!) : null))
  const ultimoDia = [...f.dias].reverse().find((x) => x.alunos > 0 && x.data <= hojeISO)
  const custoHoje = diaMap.get(hojeISO)?.alunos ? custoPorAluno(diaMap.get(hojeISO)!) : null
  const custoRef = custoHoje ?? (ultimoDia ? custoPorAluno(ultimoDia) : 0)
  const custoMes = custoPorAluno(f.realizado)
  const corCusto = custoRef > custoMes * 1.03 ? STATUS.critico.cor : custoRef < custoMes * 0.97 ? STATUS.bom.cor : '#ffffff'

  // ---- 5. resumo ----
  const faltaMeta = r ? Math.max(0, r.meta.mensal - r.mes) : 0
  const faltaPiso = r ? Math.max(0, r.piso - r.mes) : 0
  const restantes = atual ? Math.max(1, (d?.restantes ?? 0) + (uteis.includes(hojeISO) ? 1 : 0)) : 1
  const contratosConf = colecao(s, 'contratos_escola').filter((c) => c.status === 'Em conferência').length

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-4">
        <Avatar texto={iniciais(colaborador?.nome ?? 'Operações')} foto={colaborador?.foto} tamanho="w-16 h-16" arredondado="rounded-full" textoCls="text-lg" />
        <div className="flex-1 min-w-0">
          <p className="text-2xl font-black text-white">{colaborador?.nome ?? 'Operações'}</p>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Operações • {nomeMes(mes)}</p>
        </div>
        {r && r.meta.mensal > 0 && (
          <p className="text-sm font-bold text-zinc-400">
            Piso <span className="text-white">{num(r.piso)}</span> • Meta <span className="text-white">{num(r.meta.mensal)}</span> alunos
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 1. Alunos fotografados */}
        <Cartao titulo="Alunos fotografados">
          <div className="flex items-center gap-4">
            <span className="text-5xl font-black" style={{ color: alunosHoje >= alunosAntes ? STATUS.bom.cor : STATUS.critico.cor }} aria-hidden="true">
              {alunosHoje >= alunosAntes ? '↗' : '↘'}
            </span>
            <div>
              <p className="text-7xl font-black leading-none tracking-tighter" style={{ color: corHoje }}>{num(alunosHoje)}</p>
              <p className="text-lg font-bold text-zinc-300 mt-1">{atual ? 'Alunos fotografados hoje' : 'Último dia útil do mês'}</p>
            </div>
          </div>
          <Barras dias={uteis} valores={serieAlunos} fmt={(v) => num(v)} cor={(v) => (r ? corDoDia(v, r.meta.diaria, r.pisoDiario) : '#3b82f6')} destaque={atual ? hojeISO : undefined} />
          {r && (
            <div>
              <p className="text-base font-bold text-zinc-200 mb-2">Acumulado e meta mensal ({num(r.meta.mensal)})</p>
              <div className="relative h-10 rounded-2xl bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-2xl transition-all duration-700" style={{ width: `${Math.min(100, r.pctMes)}%`, backgroundColor: STATUS[r.mes >= r.meta.mensal ? 'bom' : r.mes >= r.piso ? 'atencao' : 'critico'].cor }}></div>
                {r.piso > 0 && r.meta.mensal > 0 && <div className="absolute inset-y-0 w-0.5 bg-white/70" style={{ left: `${Math.min(100, (r.piso / r.meta.mensal) * 100)}%` }} title={`Piso ${num(r.piso)}`}></div>}
                <span className="absolute inset-0 flex items-center justify-center text-2xl font-black text-white drop-shadow">{num(r.mes)}</span>
              </div>
            </div>
          )}
          <Historico itens={hist.map((h) => ({ rotulo: mesCurto(h.mes), valor: num(h.alunos), vazio: h.alunos === 0 }))} />
        </Cartao>

        {/* 2. Custo médio por aluno */}
        <Cartao titulo="Custo médio por aluno">
          <div>
            <p className="text-6xl font-black leading-none tracking-tighter" style={{ color: corCusto }}>{reais(custoRef)}</p>
            <p className="text-lg font-bold text-zinc-300 mt-2">
              {custoHoje !== null ? 'Custo por aluno hoje' : ultimoDia ? `Custo por aluno em ${ultimoDia.data.slice(8)}/${ultimoDia.data.slice(5, 7)} (último dia com viagem)` : 'Ainda sem viagem no mês'}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-1">Oscilação diária (dias úteis)</p>
            <Barras dias={uteis} valores={serieCusto} fmt={(v) => String(Math.round(v))} cor={(v) => (v > custoMes * 1.03 ? '#ef4444' : '#3b82f6')} destaque={atual ? hojeISO : undefined} />
          </div>
          <div className="flex items-center justify-between bg-white/[0.03] border border-white/[0.05] rounded-2xl px-5 py-4">
            <p className="text-base font-bold text-zinc-200">Custo médio do mês</p>
            <p className="text-3xl font-black text-white">{reais(custoMes)}</p>
          </div>
          <Historico itens={hist.map((h) => ({ rotulo: mesCurto(h.mes), valor: h.alunos ? `${reais(h.custoAluno)} / aluno` : reais(0), vazio: h.alunos === 0 }))} />
        </Cartao>

        {/* 3. Gastos do mês */}
        <Cartao titulo="Gastos do mês">
          <div>
            <p className="text-5xl font-black text-white tracking-tighter">{reais(f.realizado.total)}</p>
            <p className="text-sm text-zinc-400 mt-1">
              {num(f.realizado.alunos)} alunos em {f.realizado.diasViagem} dia(s) de viagem
            </p>
          </div>
          <Rosca
            fatias={[
              { rotulo: 'Gasto fixo dos carros', valor: f.realizado.fixo, cor: '#3b82f6' },
              { rotulo: 'Vendedores (por ficha)', valor: f.realizado.vendedor, cor: '#f59e0b' },
              { rotulo: 'Escolas', valor: f.realizado.escola, cor: '#10b981' },
            ]}
          />
          <div className="space-y-2 border-t border-white/[0.06] pt-4">
            {f.porCarro.length === 0 && <p className="text-xs text-zinc-500">Nenhum carro saiu neste mês.</p>}
            {f.porCarro.map((c) => (
              <div key={c.veiculo.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-zinc-300 truncate">{nomeCarro(c.veiculo)}</span>
                <span className="text-zinc-400 whitespace-nowrap">
                  {c.dias} dia(s) × {reais(c.valorDia)} = <strong className="text-white">{reais(c.fixo)}</strong>
                </span>
              </div>
            ))}
            {f.realizado.semCarro > 0 && <p className="text-[11px] text-yellow-400">⚠ {f.realizado.semCarro} visita(s) sem carro na agenda: sem gasto fixo.</p>}
            {f.realizado.escolaEstimada > 0 && <p className="text-[11px] text-zinc-500">{f.realizado.escolaEstimada} escola(s) ainda sem fechamento: custo estimado pela bonificação do contrato.</p>}
          </div>
        </Cartao>

        {/* 4. Projeção */}
        <Cartao titulo="Projeção do mês • fichas fechadas">
          <div className="grid grid-cols-2 gap-3">
            <Numero rotulo="Alunos no mês" valor={num(f.projecao.alunos)} detalhe={`${num(f.realizado.alunos)} feitos + ${num(f.previsto.alunos)} fechados`} />
            <Numero rotulo="Gasto previsto" valor={reais(f.projecao.total)} detalhe={`${reais(f.projecao.custoAluno)} por aluno`} />
          </div>
          <div className="bg-emerald-500/[0.07] border border-emerald-500/25 rounded-2xl p-5">
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-300">Quanto vai ganhar</p>
            {f.projecao.temVendas ? (
              <>
                <p className="text-5xl font-black text-white tracking-tighter mt-1">{reais(f.projecao.receita)}</p>
                <p className="text-xs text-zinc-400 mt-1">{reais(f.projecao.receitaAluno)} por aluno fotografado (vendas reais dos últimos meses)</p>
              </>
            ) : (
              <p className="text-lg font-bold text-zinc-300 mt-2">Ainda sem vendas registradas para calcular.</p>
            )}
          </div>
          {f.projecao.temVendas && (
            <div className={`flex items-center justify-between rounded-2xl px-5 py-4 border ${f.projecao.resultado >= 0 ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-red-500/10 border-red-500/25'}`}>
              <p className="text-base font-bold text-zinc-200">Resultado previsto</p>
              <p className={`text-3xl font-black ${f.projecao.resultado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{reais(f.projecao.resultado)}</p>
            </div>
          )}
          {r && r.meta.mensal > 0 && (
            <div>
              <div className="flex justify-between text-xs font-bold text-zinc-400 mb-1.5">
                <span>Projeção × meta</span>
                <span className="text-white">{num(f.projecao.alunos)} / {num(r.meta.mensal)}</span>
              </div>
              <div className="relative h-3 rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (f.projecao.alunos / r.meta.mensal) * 100)}%`, backgroundColor: STATUS[f.projecao.alunos >= r.meta.mensal ? 'bom' : f.projecao.alunos >= r.piso ? 'atencao' : 'critico'].cor }}></div>
                {r.piso > 0 && <div className="absolute -inset-y-1 w-0.5 bg-white/70" style={{ left: `${Math.min(100, (r.piso / r.meta.mensal) * 100)}%` }}></div>}
              </div>
            </div>
          )}
          <p className="text-[11px] text-zinc-500">
            Fichas fechadas: {f.previsto.visitas} visita(s) agendada(s){f.previsto.contratosConferencia ? ` + ${f.previsto.contratosConferencia} contrato(s) em conferência` : ''} até o fim do mês.
          </p>
        </Cartao>

        {/* 5. Resumo do setor */}
        <Cartao titulo="Resumo do setor">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Numero rotulo="Visitas feitas" valor={num(f.agenda.feitas)} />
            <Numero rotulo="Agendadas" valor={num(f.agenda.agendadas)} />
            <Numero rotulo="Canceladas" valor={num(f.agenda.canceladas)} cor={f.agenda.canceladas ? 'text-red-400' : 'text-white'} />
            <Numero rotulo="Escolas atendidas" valor={num(f.realizado.escolas)} />
            <Numero rotulo="Alunos por visita" valor={f.realizado.visitas ? num(f.realizado.alunos / f.realizado.visitas) : '—'} />
            <Numero rotulo="Contratos em conferência" valor={num(contratosConf)} />
          </div>
          {r && r.meta.mensal > 0 && atual && (
            <div className="grid grid-cols-2 gap-3">
              <Numero rotulo="Para bater o piso" valor={faltaPiso > 0 ? `${num(Math.ceil(faltaPiso / restantes))}/dia` : 'Batido ✓'} detalhe={faltaPiso > 0 ? `faltam ${num(faltaPiso)} alunos` : undefined} cor={faltaPiso > 0 ? 'text-yellow-400' : 'text-emerald-400'} />
              <Numero rotulo="Para bater a meta" valor={faltaMeta > 0 ? `${num(Math.ceil(faltaMeta / restantes))}/dia` : 'Batida 🎯'} detalhe={faltaMeta > 0 ? `faltam ${num(faltaMeta)} alunos` : undefined} cor={faltaMeta > 0 ? 'text-white' : 'text-emerald-400'} />
            </div>
          )}
        </Cartao>

        {/* 6. Gasto fixo dos carros */}
        <Cartao titulo="Gasto fixo dos carros (por dia de viagem)">
          <GastoFixoCarros key={mes} s={s} mes={mes} />
        </Cartao>
      </div>
    </div>
  )
}
