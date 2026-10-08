'use client'

// ADM: o caminho completo do mês (escola → fotos → books → vendas → dinheiro) e quem está abaixo do piso.

import Link from 'next/link'
import type { ErpState, Tom } from '@/lib/erp/types'
import { SETORES, SETORES_PRODUTIVOS } from '@/lib/erp/config'
import { colecao, equipeComMeta, resumo, situacaoResumo } from '@/lib/erp/metrics'
import { useIndicadores } from '@/lib/erp/cobrancas'
import { brl, formatar, iniciais, nomeMes, num } from '@/lib/erp/format'
import { Avatar, TONS, ehSituacao } from './ui'

interface Etapa {
  rotulo: string
  valor: string
  detalhe?: string
  tom: Tom
  link?: string
}

export function FunilDoMes({ s, mes }: { s: ErpState; mes: string }) {
  const contratos = colecao(s, 'contratos_escola').filter((c) => String(c.criadoEm).startsWith(mes) && c.status !== 'Cancelado').length
  const visitas = colecao(s, 'agenda_visitas').filter((v) => String(v.data).startsWith(mes) && (v.status === 'Fotografada' || v.status === 'Fechamento enviado'))
  const fichas = visitas.reduce((a, v) => a + Number(v.fichasFotografadas || 0), 0)
  const books = resumo(s, 'producao', 'books', mes).mes
  const vendas = colecao(s, 'vendas_ebooks').filter((v) => String(v.data).startsWith(mes))
  const qtd = (lista: typeof vendas) => lista.reduce((a, v) => a + (Number(v.quantidade) || 1), 0)
  const externas = qtd(vendas.filter((v) => v.canal === 'Externo'))
  const internas = qtd(vendas.filter((v) => v.canal !== 'Externo'))
  const vendido = vendas.reduce((a, v) => a + Number(v.valor || 0), 0)
  const receber = useIndicadores(mes) // carteira de cobranças (calculada no banco)
  const devolvidos = colecao(s, 'devolucoes_books')
    .filter((d) => String(d.data).startsWith(mes))
    .reduce((a, d) => a + Number(d.quantidade || 0), 0)

  // etapas neutras; só "Em atraso" fica vermelho, e só quando tem parcela atrasada
  const etapas: Etapa[] = [
    { rotulo: 'Contratos de escola', valor: num(contratos), detalhe: 'recebidos no mês', tom: 'zinc', link: '/operacional/contratos' },
    { rotulo: 'Escolas fotografadas', valor: num(visitas.length), detalhe: `${num(fichas)} fichas`, tom: 'zinc', link: '/operacional/agenda' },
    { rotulo: 'Álbuns revelados', valor: num(books), detalhe: 'lançados pela Revelação', tom: 'zinc', link: '/producao' },
    { rotulo: 'Books vendidos', valor: num(externas + internas), detalhe: `${num(externas)} na rua • ${num(internas)} internas`, tom: 'zinc', link: '/financeiro/vendas-books' },
    { rotulo: 'Valor vendido', valor: brl(vendido), tom: 'zinc', link: '/financeiro/vendas-books' },
    { rotulo: 'Recebido', valor: brl(receber.recebidoMes), detalhe: 'Contas a Receber', tom: 'zinc', link: '/financeiro/contas-receber' },
    { rotulo: 'Em atraso', valor: brl(receber.emAtraso), detalhe: `${receber.parcelasVencidas} parcela(s) • Cobrança`, tom: receber.parcelasVencidas ? 'red' : 'zinc', link: '/cobranca/inadimplencia' },
  ]

  return (
    <div className="bg-painel/80 border border-white/[0.05] rounded-3xl shadow-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.05] flex flex-wrap items-center justify-between gap-3 bg-white/[0.01]">
        <div>
          <h2 className="text-lg font-black text-white tracking-wide">Caminho do mês • {nomeMes(mes)}</h2>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Da escola contratada até o dinheiro recebido — tudo que os setores e os apps registraram</p>
        </div>
        {devolvidos > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">↩ {num(devolvidos)} books devolvidos pelos vendedores (vão para as vendas internas)</span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        {etapas.map((e, i) => {
          const alerta = ehSituacao(e.tom)
          const corpo = (
            <div className={`relative h-full p-5 border-white/[0.04] ${i > 0 ? 'xl:border-l' : ''} border-b xl:border-b-0 hover:bg-white/[0.02] transition-colors`}>
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-400">
                {i + 1}. {e.rotulo}
              </p>
              <p className={`text-xl font-black tracking-tight mt-2 leading-tight whitespace-nowrap ${alerta ? TONS[e.tom].texto : 'text-white'}`}>{e.valor}</p>
              {e.detalhe && <p className="text-[10px] text-zinc-500 mt-1">{e.detalhe}</p>}
              {i < etapas.length - 1 && <span className="hidden xl:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-zinc-600 text-lg" aria-hidden="true">›</span>}
            </div>
          )
          return e.link ? (
            <Link key={e.rotulo} href={e.link} className="block">
              {corpo}
            </Link>
          ) : (
            <div key={e.rotulo}>{corpo}</div>
          )
        })}
      </div>
    </div>
  )
}

// Quem está abaixo do PISO (mínimo para continuar na empresa) no ritmo atual do mês
export function AbaixoDoPiso({ s, mes }: { s: ErpState; mes: string }) {
  const lista = SETORES_PRODUTIVOS.flatMap((setor) =>
    equipeComMeta(s, setor, mes).map((c) => {
      const ind = SETORES[setor].indicadores[0]
      const r = resumo(s, setor, ind.id, mes, c.id)
      return { c, setor, ind, r, sit: situacaoResumo(r, mes) }
    }),
  )
    .filter((x) => x.r.piso > 0 && x.sit === 'critico')
    .sort((a, b) => a.r.projecao / a.r.piso - b.r.projecao / b.r.piso)

  return (
    <div className={`bg-painel/80 border rounded-3xl shadow-2xl overflow-hidden ${lista.length ? 'border-red-500/20' : 'border-emerald-500/20'}`}>
      <div className="px-6 py-4 border-b border-white/[0.05] flex items-center justify-between gap-3 bg-white/[0.01]">
        <div>
          <h2 className="text-lg font-black text-white tracking-wide">{lista.length ? `⚠ ${lista.length} pessoa(s) abaixo do piso` : '✓ Ninguém abaixo do piso'}</h2>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">No ritmo atual, o mês termina abaixo do mínimo exigido (piso)</p>
        </div>
        <Link href="/adm/metas" className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">
          Metas e pisos →
        </Link>
      </div>
      {lista.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-white/[0.03]">
          {lista.map(({ c, setor, ind, r }) => (
            <div key={c.id} className="bg-painel p-4 flex items-center gap-3">
              <Avatar texto={iniciais(c.nome)} foto={c.foto} tamanho="w-10 h-10" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-white truncate">{c.nome}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 truncate">
                  {SETORES[setor].nome} • {ind.label}
                </p>
                <p className="text-[11px] text-red-400 font-bold mt-0.5">
                  Faltam {formatar(r.faltaPiso, ind.unidade)} p/ piso • projeção {formatar(Math.round(r.projecao), ind.unidade)} de {formatar(r.piso, ind.unidade)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
