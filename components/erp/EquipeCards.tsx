'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Colaborador, ErpState, Setor } from '@/lib/erp/types'
import { SETORES, SETORES_PRODUTIVOS } from '@/lib/erp/config'
import { diaReferencia, diasDeMeta, equipe, esperadoAteHoje, resumo, situacaoMeta } from '@/lib/erp/metrics'
import { formatar, iniciais, mesAtual, pct } from '@/lib/erp/format'
import { Avatar, EmptyState, ProgressBar, TONS } from './ui'
import { PillSituacao, STATUS } from './status'

// Quanto precisa fazer por dia útil restante. Quantidades arredondam para CIMA (0,2 contrato/dia = 1).
function porDia(falta: number, diasRestantes: number, unidade: 'qtd' | 'brl') {
  const valor = diasRestantes > 0 ? falta / diasRestantes : falta
  return unidade === 'qtd' ? Math.ceil(valor) : valor
}

// Card individual: foto, metas do dia e do mês, gráfico diário, metas batidas e quanto falta
export function CardColaborador({ s, c, mes, posicao }: { s: ErpState; c: Colaborador; mes: string; posicao: number }) {
  const cfg = SETORES[c.setor]
  const t = TONS[cfg.tom]
  const [principal, ...outros] = cfg.indicadores
  const r = resumo(s, c.setor, principal.id, mes, c.id)
  const dias = diasDeMeta(s, c.setor, principal.id, c.id, mes)
  const faltaMes = Math.max(0, r.meta.mensal - r.mes)
  const atual = mes === mesAtual()
  // Mesma régua do placar: comparado com o quanto já deveria estar feito até hoje
  const situacao = situacaoMeta(r.pctMes, esperadoAteHoje(mes))
  const [a, m] = mes.split('-').map(Number)
  const ref = atual ? diaReferencia(mes) : dias.serie.length

  return (
    <div className={`bg-painel-2/80 backdrop-blur-xl border ${t.borda} rounded-3xl p-5 relative overflow-hidden hover:-translate-y-1 transition-all`}>
      <div className={`absolute top-0 left-0 w-full h-1 ${t.solido} opacity-70 ${t.brilho}`}></div>
      <div className={`absolute -bottom-14 -right-14 w-40 h-40 ${t.suave} blur-3xl rounded-full pointer-events-none`}></div>

      {/* Identificação */}
      <div className="flex items-start gap-4 relative z-10">
        <div className="relative">
          <Avatar texto={iniciais(c.nome)} foto={c.foto} tamanho="w-16 h-16" arredondado="rounded-2xl" textoCls="text-lg" />
          <span
            className={`absolute -bottom-2 -right-2 min-w-[26px] h-[26px] px-1 rounded-full border-2 border-painel-2 text-[10px] font-black flex items-center justify-center ${
              posicao <= 3 ? 'bg-yellow-500 text-[#111111]' : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            {posicao}º
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-black text-white truncate">{c.nome}</p>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${t.texto}`}>{cfg.nome}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest truncate">{c.funcao}</p>
        </div>
        <PillSituacao situacao={situacao} />
      </div>

      {/* Indicador principal */}
      <div className="mt-5 relative z-10">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3">{principal.label}</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Hoje / meta {atual && r.pctDia >= 100 && <span className="text-white">✓</span>}</p>
            <p className="text-xl font-black text-white mt-0.5">
              {formatar(r.hoje, principal.unidade)} <span className="text-xs text-zinc-500">/ {formatar(r.meta.diaria, principal.unidade)}</span>
            </p>
            <div className="mt-2"><ProgressBar valor={r.pctDia} tom={cfg.tom} /></div>
          </div>
          <div>
            <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Mês / meta</p>
            <p className="text-xl font-black text-white mt-0.5">
              {formatar(r.mes, principal.unidade)} <span className="text-xs text-zinc-500">/ {formatar(r.meta.mensal, principal.unidade)}</span>
            </p>
            <div className="mt-2"><ProgressBar valor={r.pctMes} tom={cfg.tom} /></div>
          </div>
        </div>
        {/* Um quadradinho por dia: verde = bateu a meta do dia, cinza = não bateu */}
        <div className="mt-4">
          <div className="flex gap-[2px] h-5">
            {dias.serie.map((v, i) => {
              const domingo = new Date(a, m - 1, i + 1).getDay() === 0
              const futuro = i + 1 > ref
              const bateu = dias.metaDiaria > 0 && v >= dias.metaDiaria
              return (
                <div
                  key={i}
                  title={domingo ? `Dia ${i + 1}: domingo` : futuro ? `Dia ${i + 1}: ainda não chegou` : `Dia ${i + 1}: ${formatar(v, principal.unidade)} de ${formatar(dias.metaDiaria, principal.unidade)} ${bateu ? '✓' : ''}`}
                  className={`flex-1 rounded-[3px] ${domingo ? 'bg-transparent' : futuro ? 'bg-white/[0.04]' : bateu ? '' : 'bg-zinc-700'}`}
                  style={!domingo && !futuro && bateu ? { backgroundColor: STATUS.bom.cor } : undefined}
                ></div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: STATUS.bom.cor }}></span> Bateu a meta do dia
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[3px] bg-zinc-700"></span> Não bateu
            </span>
          </div>
        </div>
      </div>

      {/* Indicadores secundários (ex.: visitas em Vendas, valor recebido em Cobrança) */}
      {outros.map((ind) => {
        const r2 = resumo(s, c.setor, ind.id, mes, c.id)
        return (
          <div key={ind.id} className="mt-3 flex items-center gap-3 relative z-10">
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 w-24 shrink-0 truncate">{ind.label}</span>
            <ProgressBar valor={r2.pctMes} tom="violet" altura="h-1" />
            <span className="text-[10px] font-bold text-zinc-300 whitespace-nowrap">
              {formatar(r2.mes, ind.unidade)} / {formatar(r2.meta.mensal, ind.unidade)}
            </span>
          </div>
        )
      })}

      {/* Metas batidas e a bater */}
      <div className="grid grid-cols-3 gap-2 mt-5 relative z-10">
        <div className="bg-black/40 border border-white/[0.05] rounded-xl p-2.5 text-center">
          <p className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Metas batidas</p>
          <p className="text-sm font-black text-emerald-400 mt-0.5">
            {dias.batidas}
            <span className="text-zinc-500 text-[10px]">/{dias.decorridos} dias</span>
          </p>
        </div>
        <div className="bg-black/40 border border-white/[0.05] rounded-xl p-2.5 text-center">
          <p className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">A bater no mês</p>
          <p className={`text-sm font-black mt-0.5 ${faltaMes === 0 ? 'text-emerald-400' : 'text-orange-400'}`}>{faltaMes === 0 ? 'Batida ✓' : formatar(faltaMes, principal.unidade)}</p>
        </div>
        <div className="bg-black/40 border border-white/[0.05] rounded-xl p-2.5 text-center">
          <p className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">{atual ? 'Por dia' : 'Resultado'}</p>
          <p className="text-sm font-black text-white mt-0.5">
            {atual ? (faltaMes === 0 ? '—' : formatar(porDia(faltaMes, dias.restantes, principal.unidade), principal.unidade)) : pct(r.pctMes)}
          </p>
        </div>
      </div>
    </div>
  )
}

// Grade com todos os colaboradores das áreas produtivas, filtrável por setor
export default function EquipeCards({ s, mes }: { s: ErpState; mes: string }) {
  const [filtro, setFiltro] = useState<Setor | ''>('')

  const todos = useMemo(
    () =>
      SETORES_PRODUTIVOS.flatMap((setor) => equipe(s, setor))
        .map((c) => ({ c, pct: resumo(s, c.setor, SETORES[c.setor].indicadores[0].id, mes, c.id).pctMes }))
        .sort((a, b) => b.pct - a.pct),
    [s, mes],
  )
  const lista = filtro ? todos.filter((x) => x.c.setor === filtro) : todos

  if (todos.length === 0) {
    return (
      <div className="bg-painel/80 backdrop-blur-xl border border-white/[0.05] rounded-3xl">
        <EmptyState titulo="Nenhum colaborador nas áreas" descricao="Cadastre a equipe em Colaboradores. Cada pessoa aparece aqui com foto, metas e gráfico." />
        <div className="pb-8 text-center">
          <Link href="/adm/colaboradores" className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">
            Cadastrar colaboradores →
          </Link>
        </div>
      </div>
    )
  }

  const chip = (ativo: boolean) =>
    `whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border ${
      ativo ? 'bg-blue-600/10 text-blue-400 border-blue-500/30' : 'text-zinc-500 hover:text-white hover:bg-white/[0.02] border-transparent'
    }`

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></span>
          <h2 className="text-sm font-black text-white uppercase tracking-widest">Equipe • metas individuais</h2>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">ranking por % da meta mensal</span>
        </div>
        <div className="flex overflow-x-auto custom-scrollbar gap-1">
          <button onClick={() => setFiltro('')} className={chip(filtro === '')}>
            Todos ({todos.length})
          </button>
          {SETORES_PRODUTIVOS.map((x) => {
            const qtd = todos.filter((t) => t.c.setor === x).length
            if (!qtd) return null
            return (
              <button key={x} onClick={() => setFiltro(x)} className={chip(filtro === x)}>
                {SETORES[x].nome} ({qtd})
              </button>
            )
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
        {lista.map(({ c }) => (
          <CardColaborador key={c.id} s={s} c={c} mes={mes} posicao={todos.findIndex((t) => t.c.id === c.id) + 1} />
        ))}
      </div>
    </div>
  )
}
