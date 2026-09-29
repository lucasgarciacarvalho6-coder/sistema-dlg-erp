'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Colaborador, ErpState, Setor } from '@/lib/erp/types'
import { SETORES, SETORES_PRODUTIVOS } from '@/lib/erp/config'
import { diasDeMeta, equipeComMeta, resumo, situacaoResumo } from '@/lib/erp/metrics'
import { formatar, iniciais, mesAtual } from '@/lib/erp/format'
import { Avatar, EmptyState, Modal, ProgressBar, TONS, btnSecundario } from './ui'
import { PillSituacao, STATUS } from './status'
import PainelMeta, { Anel, GraficoDiasUteis, LegendaDias } from './PainelMeta'
import { GradeTV } from './CardsTV'

// Quanto precisa fazer por dia útil restante. Quantidades arredondam para CIMA (0,2 contrato/dia = 1).
function porDia(falta: number, diasRestantes: number, unidade: 'qtd' | 'brl') {
  const valor = diasRestantes > 0 ? falta / diasRestantes : falta
  return unidade === 'qtd' ? Math.ceil(valor) : valor
}

// Card individual (mesmo visual de antes, com as informações do Painel Executivo antigo):
// meta diária calculada, dias úteis, média, projeção, quanto falta, barras por dia útil e anel.
// Clicar no card abre o painel completo da pessoa.
export function CardColaborador({ s, c, mes, posicao, onAbrir }: { s: ErpState; c: Colaborador; mes: string; posicao: number; onAbrir?: () => void }) {
  const cfg = SETORES[c.setor]
  const t = TONS[cfg.tom]
  const [principal, ...outros] = cfg.indicadores
  const r = resumo(s, c.setor, principal.id, mes, c.id)
  const dias = diasDeMeta(s, c.setor, principal.id, c.id, mes)
  const atual = mes === mesAtual()
  const f = (v: number) => formatar(v, principal.unidade)
  const dec = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // Mesma régua do placar: ritmo da meta (bom), acima do piso (atenção) ou abaixo do piso (crítico)
  const situacao = situacaoResumo(r, mes)
  const temPiso = r.piso > 0
  const mini = 'bg-black/40 border border-white/[0.05] rounded-xl px-2 py-2 text-center'

  return (
    <div
      role={onAbrir ? 'button' : undefined}
      tabIndex={onAbrir ? 0 : undefined}
      onClick={onAbrir}
      onKeyDown={(e) => onAbrir && (e.key === 'Enter' || e.key === ' ') && onAbrir()}
      className={`bg-painel-2/80 border ${t.borda} rounded-3xl p-5 relative overflow-hidden hover:-translate-y-1 transition-all ${onAbrir ? 'cursor-pointer hover:border-blue-500/40' : ''}`}
    >
      <div className={`absolute top-0 left-0 w-full h-1 ${t.solido} opacity-70 ${t.brilho}`}></div>
      <div className={`absolute -bottom-14 -right-14 w-40 h-40 ${t.suave} brilho scale-150 rounded-full pointer-events-none`}></div>

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
          <p className="text-base font-black text-white leading-tight line-clamp-2" title={c.nome}>{c.nome}</p>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${t.texto}`}>{cfg.nome}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest truncate" title={c.funcao}>{c.funcao}</p>
          <div className="mt-1.5"><PillSituacao situacao={situacao} /></div>
        </div>
      </div>

      {/* Meta diária • piso diário • dias úteis • média • projeção */}
      <div className={`grid gap-1.5 mt-5 relative z-10 ${temPiso ? 'grid-cols-5' : 'grid-cols-4'}`}>
        <div className={mini}>
          <p className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Meta/dia</p>
          <p className="text-xs font-black text-white mt-0.5">{dec(r.meta.diaria)}</p>
        </div>
        {temPiso && (
          <div className={mini} title={`Piso do mês: ${f(r.piso)} (mínimo para não dar prejuízo)`}>
            <p className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Piso/dia</p>
            <p className="text-xs font-black mt-0.5" style={{ color: STATUS.atencao.cor }}>{dec(r.pisoDiario)}</p>
          </div>
        )}
        <div className={mini}>
          <p className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Dias</p>
          <p className="text-xs font-black text-white mt-0.5">{r.diasDecorridos}/{r.diasUteis}</p>
        </div>
        <div className={mini}>
          <p className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Média</p>
          <p className="text-xs font-black text-white mt-0.5">{dec(r.mediaDiaria)}</p>
        </div>
        <div className={mini}>
          <p className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Projeção</p>
          <p className="text-xs font-black text-white mt-0.5">{f(r.projecao)}</p>
        </div>
      </div>

      {/* Realizado do mês + quanto falta */}
      <div className="mt-4 relative z-10">
        <div className="flex justify-between items-end">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{principal.label}</p>
          <p className="text-[10px] font-bold text-zinc-400">
            Hoje <span className="text-white">{f(r.hoje)}</span> {atual && r.pctDia >= 100 && '✓'}
          </p>
        </div>
        <p className="text-xl font-black text-white mt-0.5">
          {f(r.mes)} <span className="text-xs text-zinc-500">/ {f(r.meta.mensal)}</span>
        </p>
        <div className="mt-2 relative">
          <ProgressBar valor={r.pctMes} tom={cfg.tom} />
          {temPiso && r.meta.mensal > 0 && (
            <div className="absolute -inset-y-1 w-0.5 rounded" style={{ left: `calc(${Math.min(100, (r.piso / r.meta.mensal) * 100)}% - 1px)`, backgroundColor: STATUS.atencao.cor }} title={`Piso ${f(r.piso)}`}></div>
          )}
        </div>
        <p className={`mt-2 text-[11px] font-bold ${r.faltaPiso > 0 ? 'text-red-400' : r.falta > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
          {r.faltaPiso > 0
            ? `⚠ Faltam ${f(r.faltaPiso)} p/ piso • ${f(r.falta)} p/ meta`
            : r.falta > 0
              ? `${temPiso ? '✓ Piso batido • f' : '⚠ F'}altam ${f(r.falta)} p/ meta`
              : '🎯 Meta do mês batida'}
          {atual && r.falta > 0 && dias.restantes > 0 && (
            <span className="text-zinc-500 font-medium" title="Ritmo necessário até o fim do mês para bater a meta mensal">
              {' '}• precisa {f(porDia(r.falta, dias.restantes + 1, principal.unidade))}/dia
            </span>
          )}
        </p>
      </div>

      {/* Barras por dia útil + anel da meta do mês */}
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-3 items-center relative z-10">
        <GraficoDiasUteis uteis={dias.uteis} serie={dias.serie} decorridos={dias.decorridos} metaDiaria={dias.metaDiaria} pisoDiario={dias.pisoDiario} formatar={f} altura="h-24" compacto />
        <Anel valor={r.pctMes} cor={STATUS[situacao].cor} rotulo="do mês" tamanho="w-16 h-16" textoCls="text-sm" />
      </div>
      <div className="flex items-center gap-3 mt-2 text-[9px] font-bold uppercase tracking-widest text-zinc-500 relative z-10">
        <LegendaDias comPiso={temPiso} curto className="gap-2" />
        <span className="ml-auto normal-case tracking-normal text-zinc-400 whitespace-nowrap">
          metas batidas <strong className="text-white">{dias.batidas}/{dias.decorridos}</strong>
        </span>
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

      {onAbrir && <p className="mt-3 text-right text-[9px] font-bold uppercase tracking-widest text-blue-400 relative z-10">Ver painel completo ↗</p>}
    </div>
  )
}

// Grade com todos os colaboradores das áreas produtivas, filtrável por setor
export default function EquipeCards({ s, mes }: { s: ErpState; mes: string }) {
  const [filtro, setFiltro] = useState<Setor | ''>('')
  const [aberto, setAberto] = useState<Colaborador | null>(null) // painel completo ao clicar no card

  const todos = useMemo(
    () =>
      SETORES_PRODUTIVOS.flatMap((setor) => equipeComMeta(s, setor, mes))
        .map((c) => ({ c, pct: resumo(s, c.setor, SETORES[c.setor].indicadores[0].id, mes, c.id).pctMes }))
        .sort((a, b) => b.pct - a.pct),
    [s, mes],
  )
  const lista = filtro ? todos.filter((x) => x.c.setor === filtro) : todos

  if (todos.length === 0) {
    return (
      <div className="bg-painel/80 border border-white/[0.05] rounded-3xl">
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
      {/* Cards da TV: Operações é o card maior (com os mini-cards); cada pessoa com a cor da situação */}
      <GradeTV s={s} mes={mes} pessoas={lista.map(({ c }) => c)} onAbrir={(c) => setAberto(c)} />

      <Modal
        aberto={!!aberto && aberto.setor !== 'operacional'}
        titulo={aberto ? `Painel • ${aberto.nome}` : ''}
        subtitulo={aberto ? `${SETORES[aberto.setor].nome} • ${aberto.funcao}` : ''}
        onFechar={() => setAberto(null)}
        largura="max-w-6xl"
        rodape={<button onClick={() => setAberto(null)} className={btnSecundario}>Fechar</button>}
      >
        {aberto && aberto.setor !== 'operacional' && <PainelMeta s={s} colaborador={aberto} indicadorId={SETORES[aberto.setor].indicadores[0].id} mes={mes} />}
      </Modal>
    </div>
  )
}
