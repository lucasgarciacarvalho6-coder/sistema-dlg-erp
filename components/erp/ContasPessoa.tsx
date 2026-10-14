'use client'

// Peças das telas da carteira — um nome por linha (Financeiro › Contas a Receber e Cobrança › Inadimplência)

import { useEffect, useState, type ReactNode } from 'react'
import type { CobrancaV } from '@/lib/erp/carteira'
import { formatarDocumento } from '@/lib/erp/documento'
import { brl, dataBR } from '@/lib/erp/format'
import { linkWhatsApp } from '@/lib/erp/rebolo'
import Icon from './Icon'
import { Badge, btnSecundario } from './ui'

export const campoFiltro = 'bg-black/50 border border-white/[0.05] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 placeholder:text-zinc-600 transition-all'

// a pesquisa só vai ao servidor quando a pessoa para de digitar
export function useAtrasado<T>(valor: T, ms = 350) {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

export function BuscaPessoas({ valor, onChange, rotulo }: { valor: string; onChange: (v: string) => void; rotulo: string }) {
  return (
    <div className="relative">
      <Icon nome="search" className="icone-busca w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
      <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder="Nome, CPF, aluno, escola ou telefone" aria-label={rotulo} className={`campo-busca ${campoFiltro} pl-9 w-72`} />
    </div>
  )
}

export function SelecaoConta({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} aria-label="Conta" className={`${campoFiltro} w-40 appearance-none`}>
      <option value="">Todas as contas</option>
      <option value="CA Beatriz">CA Beatriz</option>
      <option value="CA Diogo">CA Diogo</option>
    </select>
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

// de qual CNPJ é a dívida (identificação, sem cor de alerta)
export function SeloConta({ conta }: { conta: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-white/[0.12] bg-white/[0.04] text-[10px] font-black uppercase tracking-widest text-zinc-300 whitespace-nowrap">
      {conta || 'CA Beatriz'}
    </span>
  )
}

// nome em destaque (clicável) com as referências (aluno • escola) embaixo
export function NomeCliente({ nome, referencias }: { nome: string; referencias: string }) {
  return (
    <>
      <button type="button" className="text-left font-black text-white hover:text-blue-400 transition-colors">
        {nome}
      </button>
      {referencias && <p className="text-[11px] text-zinc-500 max-w-md truncate">{referencias}</p>}
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

// documento, telefone (com WhatsApp), cidade e cobradores do cliente
export function DadosCliente({ cobrancas }: { cobrancas: CobrancaV[] }) {
  const c = cobrancas[0]
  if (!c) return null
  const telefones = [...new Set(cobrancas.map((x) => x.telefone).filter(Boolean))]
  const cobradores = [...new Set(cobrancas.map((x) => x.cobrador).filter(Boolean))]
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
      <div>
        <Info rotulo="CPF / CNPJ">{c.documento ? formatarDocumento(c.documento) : <span className="text-zinc-500">não informado</span>}</Info>
        <Info rotulo="Cidade">{[c.cidade, c.uf].filter(Boolean).join('/') || '—'}</Info>
      </div>
      <div>
        <Info rotulo="Telefone">
          {telefones.length === 0
            ? '—'
            : telefones.map((tel) => {
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
        <Info rotulo="Cobrador">{cobradores.join(', ') || '—'}</Info>
      </div>
    </div>
  )
}

export function Total({ rotulo, valor, tom }: { rotulo: string; valor: ReactNode; tom?: 'red' }) {
  const alerta = tom === 'red' && !!valor && valor !== brl(0) && valor !== '0 dias'
  return (
    <div className={`rounded-2xl border px-4 py-3 ${alerta ? 'border-red-500/30 bg-red-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{rotulo}</p>
      <p className={`text-lg font-black ${alerta ? 'text-red-400' : 'text-white'}`}>{valor}</p>
    </div>
  )
}

// cabeçalho de cada cobrança dentro da ficha: de onde veio, conta, categoria, carteira e cobrador
export function CabecalhoCobranca({ c, acoes, extra }: { c: CobrancaV; acoes?: ReactNode; extra?: ReactNode }) {
  const titulo = c.referencia || (c.origem === 'Venda' ? 'Venda' : c.origem)
  return (
    <div className="px-4 py-3 bg-white/[0.02] border-b border-white/[0.05] flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-1.5">
        <p className="text-xs font-black text-white uppercase tracking-widest">
          {titulo}
          {c.codigoVenda && <span className="ml-2 font-bold text-zinc-500 normal-case tracking-normal">venda nº {c.codigoVenda}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <SeloConta conta={c.conta} />
          <Badge texto={c.carteira} />
          <span className="text-[11px] text-zinc-500">{[c.categoria, c.origem !== 'Venda' ? c.origem : '', c.cobrador ? `cobrador: ${c.cobrador}` : ''].filter(Boolean).join(' • ')}</span>
          {extra}
        </div>
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  )
}

export const rotuloParcela = (numero: number, total: number) => (numero === 0 ? 'Entrada' : `${numero}/${total}`)

// "Atrasada" para a parcela vencida; senão, a situação dela
export const situacaoParcela = (p: { vencida: boolean; situacao: string }) => (p.vencida ? 'Atrasada' : p.situacao)

export function Paginacao({ pagina, porPagina, total, carregando, onMudar }: { pagina: number; porPagina: number; total: number; carregando: boolean; onMudar: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  if (total <= porPagina) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-white/[0.05] text-xs text-zinc-400">
      <span>
        {pagina * porPagina + 1}–{Math.min(total, (pagina + 1) * porPagina)} de {total}
      </span>
      <div className="flex items-center gap-2">
        <button onClick={() => onMudar(Math.max(0, pagina - 1))} disabled={pagina === 0 || carregando} className={`${btnSecundario} py-2`}>
          ← Anterior
        </button>
        <span className="px-2">
          Página {pagina + 1} de {paginas}
        </span>
        <button onClick={() => onMudar(Math.min(paginas - 1, pagina + 1))} disabled={pagina >= paginas - 1 || carregando} className={`${btnSecundario} py-2`}>
          Próxima →
        </button>
      </div>
    </div>
  )
}

export const dataOuTraco = (iso: string) => (iso ? dataBR(iso) : '—')
