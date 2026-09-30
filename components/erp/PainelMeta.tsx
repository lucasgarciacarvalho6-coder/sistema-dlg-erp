'use client'

// Painel de meta individual no formato do "Painel Executivo" do sistema antigo:
// meta diária (mensal ÷ dias úteis), dias úteis decorridos/total, feito/meta, média diária,
// projeção, quanto falta, e o gráfico com uma barra por DIA ÚTIL (verde ≥ meta diária, vermelha abaixo).

import type { Colaborador, ErpState } from '@/lib/erp/types'
import { SETORES } from '@/lib/erp/config'
import { diasDeMeta, resumo, situacaoResumo } from '@/lib/erp/metrics'
import { formatar, iniciais, pct } from '@/lib/erp/format'
import { Avatar, EmptyState } from './ui'
import { PillSituacao, STATUS } from './status'
import { LinhaBonus } from '@/components/edicao/Bonus'

const dec = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function Anel({ valor, cor, rotulo, detalhe, tamanho = 'w-36 h-36', textoCls = 'text-3xl' }: { valor: number; cor: string; rotulo: string; detalhe?: string; tamanho?: string; textoCls?: string }) {
  const r = 42
  const c = 2 * Math.PI * r
  const tam = tamanho
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div className={`relative ${tam}`}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" style={{ stroke: 'var(--color-zinc-800)' }} />
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" strokeLinecap="round" stroke={cor} strokeDasharray={`${(Math.min(100, valor) / 100) * c} ${c}`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-black text-white tracking-tighter ${textoCls}`}>{Math.round(valor)}%</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{rotulo}</span>
        </div>
      </div>
      {detalhe && <p className="text-[10px] font-bold text-zinc-500">{detalhe}</p>}
    </div>
  )
}

// Cor do dia: verde = bateu a meta diária • amarelo = acima do piso diário • vermelho = abaixo do piso
export function corDoDia(v: number, metaDiaria: number, pisoDiario: number) {
  if (metaDiaria > 0 && v >= metaDiaria) return STATUS.bom.cor
  if (pisoDiario > 0 && v >= pisoDiario) return STATUS.atencao.cor
  return STATUS.critico.cor
}

// Legenda das cores das barras (com ou sem piso)
export function LegendaDias({ comPiso, curto = false, className = '' }: { comPiso: boolean; curto?: boolean; className?: string }) {
  const item = (cor: string, texto: string) => (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: cor }}></span> {texto}
    </span>
  )
  return (
    <div className={`flex items-center gap-3 font-bold uppercase tracking-widest ${className}`}>
      {item(STATUS.bom.cor, 'Bateu')}
      {comPiso && item(STATUS.atencao.cor, curto ? 'Piso' : 'Acima do piso')}
      {item(STATUS.critico.cor, comPiso && !curto ? 'Abaixo do piso' : 'Abaixo')}
    </div>
  )
}

// Uma barra por DIA ÚTIL (cores de corDoDia); linha cheia = meta diária, tracejada = piso diário; futuro = trilho vazio
export function GraficoDiasUteis({
  uteis,
  serie,
  decorridos,
  metaDiaria,
  pisoDiario = 0,
  formatar: fmt,
  altura = 'h-56',
  compacto = false,
}: {
  uteis: string[]
  serie: number[]
  decorridos: number
  metaDiaria: number
  pisoDiario?: number
  formatar: (v: number) => string
  altura?: string
  compacto?: boolean
}) {
  const valores = uteis.map((dia) => serie[Number(dia.slice(8)) - 1])
  const max = Math.max(1, metaDiaria, ...valores) * 1.15
  return (
    <div className={`${altura} flex flex-col`}>
      <div className={`flex-1 relative flex items-end gap-[3px] ${compacto ? 'pt-3' : 'pt-6'}`}>
        {metaDiaria > 0 && (
          <div className="absolute left-0 right-0 border-t border-white/[0.25] z-0" style={{ bottom: `${(metaDiaria / max) * 100}%` }}>
            {!compacto && <span className="absolute -top-4 right-0 text-[9px] font-bold text-zinc-400 uppercase tracking-widest bg-painel px-1">meta {dec(metaDiaria)}</span>}
          </div>
        )}
        {pisoDiario > 0 && (
          <div className="absolute left-0 right-0 border-t border-dashed z-0" style={{ bottom: `${(pisoDiario / max) * 100}%`, borderColor: STATUS.atencao.cor, opacity: 0.7 }}>
            {!compacto && <span className="absolute top-0.5 right-0 text-[9px] font-bold uppercase tracking-widest bg-painel px-1" style={{ color: STATUS.atencao.cor }}>piso {dec(pisoDiario)}</span>}
          </div>
        )}
        {valores.map((v, i) => {
          const futuro = i >= decorridos
          return (
            <div key={uteis[i]} className="flex-1 h-full flex flex-col justify-end items-center min-w-0 relative z-10" title={`${uteis[i].slice(8)}/${uteis[i].slice(5, 7)}: ${fmt(v)} (meta ${dec(metaDiaria)}${pisoDiario > 0 ? ` • piso ${dec(pisoDiario)}` : ''})`}>
              {!futuro && (
                <>
                  {!compacto && <span className="font-bold text-white mb-0.5 text-[9px]">{fmt(v)}</span>}
                  <div className="w-full max-w-[28px] rounded-t-[3px]" style={{ height: `${Math.max(v > 0 ? 2 : 0, (v / max) * 100)}%`, backgroundColor: corDoDia(v, metaDiaria, pisoDiario) }}></div>
                </>
              )}
              {futuro && <div className="w-full max-w-[28px] h-1 rounded-t-[3px] bg-white/[0.06]"></div>}
            </div>
          )
        })}
      </div>
      <div className="flex gap-[3px] mt-1 border-t border-white/[0.05] pt-1">
        {uteis.map((dia, i) => (
          <span key={dia} className={`flex-1 text-center font-bold text-zinc-500 min-w-0 ${compacto ? 'text-[7px]' : 'text-[9px]'}`}>
            {compacto && i % 2 === 1 ? '' : dia.slice(8)}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function PainelMeta({
  s,
  colaborador,
  indicadorId,
  mes,
  grande = false,
}: {
  s: ErpState
  colaborador: Colaborador | undefined
  indicadorId: string
  mes: string
  grande?: boolean
}) {
  if (!colaborador) return <EmptyState titulo="Sem responsável pela meta" descricao="Cadastre a coordenação (RMC) do setor em Colaboradores." />
  const cfg = SETORES[colaborador.setor]
  const ind = cfg.indicadores.find((i) => i.id === indicadorId) ?? cfg.indicadores[0]
  const r = resumo(s, colaborador.setor, ind.id, mes, colaborador.id)
  const d = diasDeMeta(s, colaborador.setor, ind.id, colaborador.id, mes)
  const sit = situacaoResumo(r, mes)
  const f = (v: number) => formatar(v, ind.unidade)

  const caixa = 'bg-white/[0.03] border border-white/[0.05] rounded-xl px-4 py-2.5 text-center'

  return (
    <div className="bg-painel/80 border border-white/[0.05] rounded-3xl shadow-2xl overflow-hidden">
      <div className={`${grande ? 'p-8' : 'p-6'} space-y-5`}>
        {/* Cabeçalho: pessoa + meta diária + dias úteis */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
          <div className="flex items-center gap-4">
            <Avatar texto={iniciais(colaborador.nome)} foto={colaborador.foto} tamanho={grande ? 'w-16 h-16' : 'w-12 h-12'} arredondado="rounded-full" textoCls="text-sm" />
            <div>
              <p className={`font-black text-white ${grande ? 'text-2xl' : 'text-lg'}`}>{colaborador.nome}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{cfg.nome} • {ind.label}</p>
            </div>
          </div>
          <div className={`grid gap-3 ${r.piso > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div className={caixa}>
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Meta diária</p>
              <p className={`font-black text-white ${grande ? 'text-2xl' : 'text-lg'}`}>{dec(d.metaDiaria)}</p>
            </div>
            {r.piso > 0 && (
              <div className={caixa} title="Mínimo por dia para não dar prejuízo">
                <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Piso diário</p>
                <p className={`font-black ${grande ? 'text-2xl' : 'text-lg'}`} style={{ color: STATUS.atencao.cor }}>{dec(r.pisoDiario)}</p>
              </div>
            )}
            <div className={caixa}>
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Dias úteis</p>
              <p className={`font-black text-white ${grande ? 'text-2xl' : 'text-lg'}`}>
                {r.diasDecorridos}/{r.diasUteis}
              </p>
            </div>
          </div>
        </div>

        {/* Faltam / feito x meta / média / projeção */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
          <div className="flex flex-wrap items-center gap-3">
            <div className={`flex items-center gap-2 rounded-xl px-4 py-3 border ${r.faltaPiso > 0 ? 'border-red-500/20 bg-red-500/10' : r.falta > 0 ? 'border-yellow-500/20 bg-yellow-500/10' : 'border-emerald-500/20 bg-emerald-500/10'}`}>
              <span className="text-lg" aria-hidden="true">{r.faltaPiso > 0 ? '⚠' : r.falta > 0 ? '✓' : '🎯'}</span>
              <span className={`font-black text-white ${grande ? 'text-xl' : 'text-base'}`}>
                {r.faltaPiso > 0 ? `Faltam ${f(r.faltaPiso)} p/ piso • ${f(r.falta)} p/ meta` : r.falta > 0 ? `Piso batido • faltam ${f(r.falta)} p/ meta` : 'Meta do mês batida'}
              </span>
            </div>
            <PillSituacao situacao={sit} grande={grande} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-end">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Realizado <span className={`text-white font-black ${grande ? 'text-2xl' : 'text-lg'} normal-case tracking-normal`}>{f(r.mes)}</span> / {f(r.meta.mensal)}
              </p>
              <p className="text-sm font-black text-white">{pct(r.pctMes)}</p>
            </div>
            <div className="relative">
              <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full bg-blue-600 transition-all duration-700" style={{ width: `${Math.min(100, r.pctMes)}%` }}></div>
              </div>
              {r.piso > 0 && r.meta.mensal > 0 && (
                <div className="absolute -inset-y-1 w-0.5 rounded" style={{ left: `calc(${Math.min(100, (r.piso / r.meta.mensal) * 100)}% - 1px)`, backgroundColor: STATUS.atencao.cor }} title={`Piso ${f(r.piso)}`}></div>
              )}
            </div>
            <div className={`grid gap-3 pt-1 ${r.piso > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {r.piso > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Piso do mês</p>
                  <p className="text-base font-black" style={{ color: STATUS.atencao.cor }}>{f(r.piso)}</p>
                </div>
              )}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Média diária</p>
                <p className="text-base font-black text-white">{dec(r.mediaDiaria)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Projeção do mês</p>
                <p className="text-base font-black text-white">{f(r.projecao)}</p>
              </div>
            </div>
            {/* Produção: bônus do mês pelos álbuns entregues */}
            {colaborador.setor === 'edicao' && <LinhaBonus albuns={r.mes} />}
          </div>
        </div>

        {/* Gráfico por dia útil + anel da meta do mês */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-6 items-center pt-2 border-t border-white/[0.05]">
          <div>
            <div className="flex flex-wrap justify-between items-center gap-3 mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{ind.label} por dia útil</p>
              <LegendaDias comPiso={r.piso > 0} className="text-[10px] text-zinc-400" />
            </div>
            <GraficoDiasUteis uteis={d.uteis} serie={d.serie} decorridos={d.decorridos} metaDiaria={d.metaDiaria} pisoDiario={d.pisoDiario} formatar={f} altura={grande ? 'h-72' : 'h-56'} />
          </div>
          <Anel valor={r.pctMes} cor={STATUS[sit].cor} rotulo="da meta do mês" detalhe={`${f(r.mes)} / ${f(r.meta.mensal)} ${ind.unidade === 'qtd' ? ind.label.split(' ')[0].toLowerCase() : ''}`} tamanho={grande ? 'w-44 h-44' : 'w-36 h-36'} textoCls={grande ? 'text-4xl' : 'text-3xl'} />
        </div>
      </div>
    </div>
  )
}
