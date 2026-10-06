'use client'

// Dashboard do Rebolo: SEMPRE de UMA vendedora (pedido de 06/10/2026).
//  • a vendedora vê só ela; a supervisão (ADM, Gerência e supervisora do rebolo) escolhe a vendedora no seletor;
//  • nada da equipe: sem lista das outras vendedoras, sem ranking, sem feed de lançamentos;
//  • cards da meta (mês, dia, books, projeção), painéis da meta em R$ e em books com uma barra por dia útil,
//    o ano mês a mês, a fila dela e os descartes dela. A Visão TV não usa esta tela (fica como está).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Registro } from '@/lib/erp/types'
import { SETORES } from '@/lib/erp/config'
import { diasDeMeta, mesesDisponiveis, resumo, situacaoResumo } from '@/lib/erp/metrics'
import { brl, mesAtual, nomeMes, num, pct } from '@/lib/erp/format'
import { EM_ABERTO, MOTIVOS_DESCARTE } from '@/lib/erp/rebolo'
import PainelMeta, { GraficoDiasUteis } from '@/components/erp/PainelMeta'
import { STATUS } from '@/components/erp/status'
import { EmptyState, PageHeader, Panel, StatCard } from '@/components/erp/ui'
import { useRebolo } from '@/components/rebolo/comum'

const UMA_CASA = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
// R$ curto em cima das barras (cabe numa barrinha): 850 • 1,3k • 12,5k
const curto = (v: number) => (v >= 1000 ? `${UMA_CASA.format(v / 1000)}k` : num(v))
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const seletor = 'bg-black/50 border border-white/[0.05] text-white text-xs font-bold uppercase tracking-widest rounded-xl px-4 py-3.5 outline-none focus:border-blue-500/50 appearance-none shadow-lg'

export default function ReboloDashboardPage() {
  const { s, eu, supervisao, fichas, vendas, vendedoras } = useRebolo()
  const [mes, setMes] = useState(mesAtual())
  const [escolhida, setEscolhida] = useState('')
  const meses = useMemo(() => mesesDisponiveis(s), [s])
  // vendedora vê só ela; a supervisão escolhe (começa nela mesma, se vende, ou na primeira vendedora)
  const alvoId = supervisao ? escolhida || (vendedoras.some((v) => v.id === eu?.id) ? eu!.id : vendedoras[0]?.id ?? '') : eu?.id ?? ''
  const alvo = s.colaboradores.find((c) => c.id === alvoId)

  const [indValor, indBooks] = SETORES.rebolo.indicadores
  const atual = mes === mesAtual()
  const r = resumo(s, 'rebolo', indValor.id, mes, alvoId)
  const rb = resumo(s, 'rebolo', indBooks.id, mes, alvoId)
  const semMeta = !!alvo?.semMeta || !(r.meta.mensal > 0)

  // fila e vendas SÓ dela (a venda é da dona da ficha; sem ficha, de quem fechou)
  const dona = useMemo(() => new Map(fichas.map((f) => [f.id, String(f.vendedoraId)])), [fichas])
  const minhas = fichas.filter((f) => f.vendedoraId === alvoId)
  const minhasVendas = vendas.filter((v) => (dona.get(String(v.fichaReboloId)) ?? String(v.cobradorId)) === alvoId)
  const abertas = minhas.filter((f) => EM_ABERTO.includes(String(f.situacao)))
  const efetivar = minhasVendas.filter((v) => v.conferencia === 'Aguardando contrato')
  const financeiro = minhasVendas.filter((v) => v.conferencia === 'Aguardando conferência')
  const aEnviar = minhas.filter((f) => f.situacao === 'Vendida' && !f.enviadoEm)
  const descartes = minhas.filter((f) => f.situacao === 'Descarte')
  const soma = (l: Registro[]) => l.reduce((a, v) => a + (Number(v.valor) || 0), 0)
  const link = 'text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300'

  const acoes = (
    <>
      {supervisao && (
        <select value={alvoId} onChange={(e) => setEscolhida(e.target.value)} className={seletor} aria-label="Vendedora">
          {vendedoras.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nome}
            </option>
          ))}
        </select>
      )}
      <select value={mes} onChange={(e) => setMes(e.target.value)} className={seletor} aria-label="Mês">
        {meses.map((m) => (
          <option key={m} value={m}>
            {nomeMes(m)}
          </option>
        ))}
      </select>
    </>
  )

  if (!alvo)
    return (
      <div className="space-y-8 animate-fade-in-up">
        <PageHeader modulo="Módulo / Vendas Rebolo" titulo="Dashboard Rebolo" descricao="Os resultados de cada vendedora." acoes={acoes} />
        <EmptyState titulo="Nenhuma vendedora" descricao="Cadastre as vendedoras do Rebolo em ADM › Colaboradores." />
      </div>
    )

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Módulo / Vendas Rebolo"
        titulo={supervisao ? `Dashboard • ${alvo.nome}` : 'Meu dashboard'}
        descricao="Suas metas do mês e do dia, as vendas do ano e a sua fila. A venda conta na meta quando o Financeiro aprova."
        acoes={acoes}
      />
      {semMeta && (
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 text-sm text-zinc-300">
          {alvo.semMeta ? 'Marcada como "sem meta"' : 'Sem meta definida para este mês'}: aparecem só os números realizados. A meta é cadastrada em ADM › Metas.
        </div>
      )}

      {/* metas: mês, dia (ou média, em mês fechado), books e projeção */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Vendido no mês" valor={brl(r.mes)} detalhe={semMeta ? `${nomeMes(mes)}` : `Meta ${brl(r.meta.mensal)}${r.piso > 0 ? ` • piso ${brl(r.piso)}` : ''} • ${pct(r.pctMes)}`} progresso={semMeta ? undefined : r.pctMes} />
        {atual ? (
          <StatCard label="Hoje × meta do dia" valor={brl(r.hoje)} detalhe={semMeta ? 'vendido hoje' : `Meta do dia ${brl(r.meta.diaria)} • ${pct(r.pctDia)}`} progresso={semMeta ? undefined : r.pctDia} />
        ) : (
          <StatCard label="Média por dia útil" valor={brl(r.mediaDiaria)} detalhe={semMeta ? `${r.diasUteis} dias úteis` : `Meta do dia ${brl(r.meta.diaria)}`} />
        )}
        <StatCard label="Books vendidos no mês" valor={num(rb.mes)} detalhe={rb.meta.mensal > 0 ? `Meta ${num(rb.meta.mensal)} • ${pct(rb.pctMes)}` : 'sem meta de books'} progresso={rb.meta.mensal > 0 ? rb.pctMes : undefined} />
        <StatCard label="Projeção do mês" valor={brl(atual ? r.projecao : r.mes)} detalhe={semMeta ? 'no ritmo atual' : `${pct(((atual ? r.projecao : r.mes) / (r.meta.mensal || 1)) * 100)} da meta • ${atual ? 'no ritmo atual' : 'mês fechado'}`} />
      </div>

      {/* meta em R$ e em books, com uma barra por dia útil */}
      {semMeta ? (
        <SemMetaDias alvoId={alvoId} mes={mes} />
      ) : (
        <PainelMeta s={s} colaborador={alvo} indicadorId={indValor.id} mes={mes} formatarBarra={curto} />
      )}
      {rb.meta.mensal > 0 && <PainelMeta s={s} colaborador={alvo} indicadorId={indBooks.id} mes={mes} />}

      {/* o ano, mês a mês */}
      <VendasDoAno alvoId={alvoId} ano={mes.slice(0, 4)} />

      {/* a fila dela */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <Link href="/rebolo/contatos">
          <StatCard label="Fichas na fila" valor={abertas.length} detalhe={`${abertas.filter((f) => f.situacao === 'Agendado').length} agendada(s) • ${abertas.filter((f) => f.situacao === 'Tentar de novo').length} tentar de novo`} />
        </Link>
        <Link href="/rebolo/vendas">
          <StatCard label="Vendas a efetivar" valor={efetivar.length} detalhe={`${brl(soma(efetivar))} • aguardando contrato`} />
        </Link>
        <Link href="/rebolo/vendas">
          <StatCard label="No Financeiro" valor={financeiro.length} detalhe={brl(soma(financeiro))} />
        </Link>
        <Link href="/rebolo/envios">
          <StatCard tom={aEnviar.length ? 'yellow' : 'zinc'} label="A enviar" valor={aEnviar.length} detalhe="aprovadas, falta o rastreio" />
        </Link>
      </div>
      <Panel titulo="Meus descartes por motivo" subtitulo={`${descartes.length} álbum(ns) congelado(s) na empresa`} acoes={<Link href="/rebolo/contatos" className={link}>Ver fichas →</Link>}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {MOTIVOS_DESCARTE.map((m) => (
            <div key={m} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{m}</p>
              <p className="text-2xl font-black text-white mt-1">{descartes.filter((f) => f.motivoDescarte === m).length}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

// Sem meta: só o vendido por dia útil (sem linha de meta/piso)
function SemMetaDias({ alvoId, mes }: { alvoId: string; mes: string }) {
  const { s } = useRebolo()
  const d = diasDeMeta(s, 'rebolo', 'valor_vendido', alvoId, mes)
  return (
    <Panel titulo="Vendido por dia útil">
      <GraficoDiasUteis uteis={d.uteis} serie={d.serie} decorridos={d.decorridos} metaDiaria={0} formatar={curto} />
    </Panel>
  )
}

// O ano da vendedora: uma barra por mês (R$ em cima, books embaixo). Cor pela meta do mês:
// verde = bateu a meta • amarelo = passou do piso • vermelho = abaixo do piso; mês corrente pelo ritmo; sem meta = neutro.
// Meses antes da primeira venda dela (ainda não vendia) ficam em cinza com "—".
function VendasDoAno({ alvoId, ano }: { alvoId: string; ano: string }) {
  const { s } = useRebolo()
  const hojeMes = mesAtual()
  const linhas = MESES_CURTOS.map((rotulo, i) => {
    const m = `${ano}-${String(i + 1).padStart(2, '0')}`
    if (m > hojeMes) return { rotulo, m, futuro: true, antes: false, valor: 0, books: 0, cor: '' }
    const r = resumo(s, 'rebolo', 'valor_vendido', m, alvoId)
    const b = resumo(s, 'rebolo', 'books_vendidos', m, alvoId)
    const cor =
      !(r.meta.mensal > 0) ? 'rgb(161 161 170 / 0.8)' : m === hojeMes ? STATUS[situacaoResumo(r, m)].cor : r.mes >= r.meta.mensal ? STATUS.bom.cor : r.mes >= r.piso && r.piso > 0 ? STATUS.atencao.cor : STATUS.critico.cor
    return { rotulo, m, futuro: false, antes: false, valor: r.mes, books: b.mes, cor }
  })
  const primeira = linhas.findIndex((l) => !l.futuro && (l.valor > 0 || l.books > 0))
  linhas.forEach((l, i) => {
    if (!l.futuro && (primeira < 0 || i < primeira)) Object.assign(l, { cor: 'rgba(127,127,127,0.25)', antes: true })
  })
  const passados = linhas.filter((l) => !l.futuro)
  const total = passados.reduce((a, l) => a + l.valor, 0)
  const books = passados.reduce((a, l) => a + l.books, 0)
  const comVenda = passados.filter((l) => l.valor > 0)
  const melhor = comVenda.reduce<(typeof linhas)[number] | null>((a, l) => (!a || l.valor > a.valor ? l : a), null)
  const max = Math.max(1, ...linhas.map((l) => l.valor))
  return (
    <Panel
      titulo={`Minhas vendas em ${ano}`}
      subtitulo={`${brl(total)} • ${num(books)} book(s)${comVenda.length ? ` • média ${brl(total / comVenda.length)} por mês com venda` : ''}${melhor ? ` • melhor mês: ${nomeMes(melhor.m).split(' / ')[0]}` : ''}`}
    >
      <div className="h-56 flex flex-col">
        <div className="flex-1 flex items-end gap-2">
          {linhas.map((l) => (
            <div key={l.m} className="flex-1 h-full flex flex-col justify-end items-center min-w-0" title={l.futuro ? nomeMes(l.m) : `${nomeMes(l.m)}: ${brl(l.valor)} • ${l.books} book(s)`}>
              {!l.futuro && <span className={`text-[11px] font-black mb-1 whitespace-nowrap ${l.antes ? 'text-zinc-600' : 'text-white'}`}>{l.antes ? '—' : l.valor > 0 ? curto(l.valor) : '0'}</span>}
              <div
                className={`w-full max-w-[56px] rounded-t-md ${l.m === hojeMes ? 'ring-2 ring-white/70' : ''}`}
                style={{ height: l.futuro ? 4 : `calc((100% - 1.6em) * ${Math.max(l.valor > 0 ? 0.02 : 0.01, l.valor / max).toFixed(3)})`, backgroundColor: l.futuro ? 'rgba(127,127,127,0.12)' : l.cor }}
              ></div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-1 pt-1 border-t border-white/[0.06]">
          {linhas.map((l) => (
            <div key={l.m} className="flex-1 min-w-0 text-center leading-tight">
              <span className={`block text-[10px] font-bold ${l.m === hojeMes ? 'text-white' : 'text-zinc-400'}`}>{l.rotulo}</span>
              {!l.futuro && !l.antes && <span className="block text-[9px] text-zinc-500">{l.books} book{l.books === 1 ? '' : 's'}</span>}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-zinc-500 mt-3">
        <span style={{ color: STATUS.bom.cor }}>Verde</span> = bateu a meta do mês • <span style={{ color: STATUS.atencao.cor }}>Amarelo</span> = passou do piso •{' '}
        <span style={{ color: STATUS.critico.cor }}>Vermelho</span> = abaixo do piso • mês atual pelo ritmo • cinza = sem meta ou antes da primeira venda
      </p>
    </Panel>
  )
}
