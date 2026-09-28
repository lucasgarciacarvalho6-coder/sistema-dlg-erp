'use client'

// Peças comuns das telas do setor Vendas Rebolo
import { useMemo } from 'react'
import type { Registro } from '@/lib/erp/types'
import { useErp, useUsuario } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { faixaDaFicha, linkWhatsApp, rotuloPacote, tabelaRebolo, TOM_SITUACAO } from '@/lib/erp/rebolo'
import { Badge } from '@/components/erp/ui'

// Supervisão (ADM, Gerência ou supervisora do rebolo) vê e atende todas as fichas; a vendedora, as dela
export function useRebolo() {
  const s = useErp()
  const eu = useUsuario()
  return useMemo(() => {
    const supervisao = !!eu && (eu.perfil === 'ADM' || eu.perfil === 'GERENTE' || (eu.setor === 'rebolo' && /^supervisor/i.test(eu.funcao)))
    const pacotes = colecao(s, 'rebolo_pacotes')
    const fichas = colecao(s, 'rebolo_fichas')
    const contatos = colecao(s, 'rebolo_contatos')
    const vendas = colecao(s, 'vendas_ebooks').filter((v) => v.canal === 'Rebolo')
    const vendedoras = s.colaboradores.filter((c) => c.setor === 'rebolo' && c.status === 'ATIVO')
    const nome = (id: unknown) => s.colaboradores.find((c) => c.id === id)?.nome ?? '—'
    const pacoteDe = (f: Registro) => pacotes.find((p) => p.id === f.pacoteId)
    return { s, eu, supervisao, pacotes, fichas, contatos, vendas, vendedoras, nome, pacoteDe, tabela: tabelaRebolo(s) }
  }, [s, eu])
}

export function SituacaoBadge({ situacao }: { situacao: unknown }) {
  const t = String(situacao || '—')
  return <Badge texto={t} tom={TOM_SITUACAO[t] ?? 'zinc'} />
}

export function FaixaBadge({ ficha, tabela }: { ficha: Registro; tabela: ReturnType<typeof tabelaRebolo> }) {
  const f = faixaDaFicha(String(ficha.dataVisita), tabela)
  return <Badge texto={`Faixa ${f}`} tom={f === 1 ? 'blue' : f === 2 ? 'violet' : 'orange'} />
}

export const PacoteBadge = ({ pacote }: { pacote: Registro | undefined }) => <Badge texto={rotuloPacote(pacote)} tom="cyan" />

// Telefones da ficha com atalho para o WhatsApp
export function Telefones({ ficha }: { ficha: Registro }) {
  const lista = [ficha.whatsapp1, ficha.whatsapp2, ficha.whatsapp3].map((t) => String(t || '')).filter(Boolean)
  return (
    <div className="space-y-1">
      {lista.map((t) => (
        <a
          key={t}
          href={linkWhatsApp(t)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 whitespace-nowrap"
          title="Abrir conversa no WhatsApp"
        >
          <span aria-hidden="true">💬</span> {t}
        </a>
      ))}
      {ficha.telefone ? (
        <a href={`tel:${String(ficha.telefone).replace(/\D/g, '')}`} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white whitespace-nowrap">
          <span aria-hidden="true">📞</span> {String(ficha.telefone)}
        </a>
      ) : null}
    </div>
  )
}

export const dataHoraCurta = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
