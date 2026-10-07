'use client'

// Peças da lista "um nome por linha" (Financeiro › Contas a Receber e Cobrança › Inadimplência)

import type { ReactNode } from 'react'
import type { Registro } from '@/lib/erp/types'
import type { Pessoa } from '@/lib/erp/contas-receber'
import { unicos } from '@/lib/erp/contas-receber'
import { brl, dataBR } from '@/lib/erp/format'
import { linkWhatsApp } from '@/lib/erp/rebolo'
import Icon from './Icon'

const campoFiltro = 'bg-black/50 border border-white/[0.05] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 placeholder:text-zinc-600 transition-all'

export function BuscaPessoas({ valor, onChange, rotulo }: { valor: string; onChange: (v: string) => void; rotulo: string }) {
  return (
    <div className="relative">
      <Icon nome="search" className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
      <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder="Nome, aluno, escola ou telefone" aria-label={rotulo} className={`${campoFiltro} pl-9 w-72`} />
    </div>
  )
}

export function Filtro({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-widest border transition-all ${
        ativo ? 'bg-blue-600/10 border-blue-500/40 text-blue-400' : 'border-white/[0.08] text-zinc-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

// nome em destaque (clicável) com aluno e escola embaixo
export function NomePessoa({ p }: { p: Pessoa }) {
  return (
    <>
      <button type="button" className="text-left font-black text-white hover:text-blue-400 transition-colors">
        {p.nome}
      </button>
      <p className="text-[11px] text-zinc-500">{[p.alunos.join(', '), p.escolas.join(', ')].filter(Boolean).join(' • ')}</p>
    </>
  )
}

function Info({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5">
      <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-500 pt-0.5">{rotulo}</span>
      <span className="text-sm text-zinc-200 min-w-0">{children}</span>
    </div>
  )
}

// aluno, escola, telefone (com WhatsApp) e cobrador
export function DadosPessoa({ p }: { p: Pessoa }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
      <div>
        <Info rotulo="Aluno">{p.alunos.join(', ') || '—'}</Info>
        <Info rotulo="Escola">{p.escolas.join(', ') || '—'}</Info>
      </div>
      <div>
        <Info rotulo="Telefone">
          {p.telefones.length === 0
            ? '—'
            : p.telefones.map((tel) => {
                const wa = linkWhatsApp(tel)
                return (
                  <span key={tel} className="mr-3 whitespace-nowrap">
                    {tel}
                    {wa && (
                      <a href={wa} target="_blank" rel="noopener noreferrer" className="ml-2 text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">
                        WhatsApp
                      </a>
                    )}
                  </span>
                )
              })}
        </Info>
        <Info rotulo="Cobrador">{p.cobradores.join(', ') || '—'}</Info>
      </div>
    </div>
  )
}

export function Total({ rotulo, valor, tom }: { rotulo: string; valor: ReactNode; tom?: 'red' }) {
  const alerta = tom === 'red' && !!valor && valor !== brl(0)
  return (
    <div className={`rounded-2xl border px-4 py-3 ${alerta ? 'border-red-500/30 bg-red-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{rotulo}</p>
      <p className={`text-lg font-black ${alerta ? 'text-red-400' : 'text-white'}`}>{valor}</p>
    </div>
  )
}

// cabeçalho de cada venda dentro da ficha
export function CabecalhoVenda({ vendaId, venda, ts }: { vendaId: string; venda?: Registro; ts: Registro[] }) {
  return (
    <div className="px-4 py-3 bg-white/[0.02] border-b border-white/[0.05] flex flex-wrap items-baseline justify-between gap-2">
      <p className="text-xs font-black text-white uppercase tracking-widest">
        {venda ? `Venda de ${dataBR(String(venda.data ?? ''))}` : vendaId ? 'Venda' : 'Outros títulos'}
        {venda?.pacote ? <span className="ml-2 font-bold text-zinc-400 normal-case tracking-normal">{String(venda.pacote)}</span> : null}
      </p>
      <p className="text-[11px] text-zinc-500">{[unicos(ts.map((t) => t.aluno)).join(', '), unicos(ts.map((t) => t.formaPagamento)).join(', ')].filter(Boolean).join(' • ')}</p>
    </div>
  )
}
