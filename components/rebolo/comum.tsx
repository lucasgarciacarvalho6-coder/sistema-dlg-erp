'use client'

// Peças comuns das telas do setor Vendas Rebolo
import { useMemo } from 'react'
import type { Registro } from '@/lib/erp/types'
import { useErp, useUsuario } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import {
  combinacoesDaFaixa,
  faixaDaFicha,
  FORMAS_REBOLO,
  linkWhatsApp,
  opcoesDaFaixa,
  precoVenda,
  rotuloPacote,
  tabelaRebolo,
  TOM_SITUACAO,
  type Faixa,
  type TabelaRebolo,
} from '@/lib/erp/rebolo'
import { brl } from '@/lib/erp/format'
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
  return <Badge texto={`Faixa ${f}`} />
}

export const PacoteBadge = ({ pacote }: { pacote: Registro | undefined }) => <Badge texto={rotuloPacote(pacote)} />

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
          className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 whitespace-nowrap"
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

// Quadro de preços da faixa (igual à tabela da parede): PIX / Cartão / Boleto × Completo e as opções que a faixa tem,
// o Pôster com Moldura sozinho e a comissão da vendedora. Aparece no cadastro da ficha, no atendimento e na Tabela de Preços.
const reais = (v: number) => (v > 0 ? brl(v).replace(/,00$/, '') : '—')
export function QuadroFaixa({ tabela, faixa, meses, titulo }: { tabela: TabelaRebolo; faixa: Faixa; meses?: number; titulo?: string }) {
  const colunas = combinacoesDaFaixa(tabela, faixa)
  const opcoes = opcoesDaFaixa(tabela, faixa)
  const temPoster = FORMAS_REBOLO.some((x) => tabela.preco(faixa, 'poster_moldura', x.id) > 0)
  const th = 'px-2 py-1.5 text-[9px] font-black uppercase tracking-wider text-zinc-400 text-right whitespace-nowrap'
  const td = 'px-2 py-1.5 text-right font-bold text-white whitespace-nowrap'
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-3 space-y-2">
      <p className="text-xs text-zinc-300">
        {titulo ?? (
          <>
            <strong className="text-white">Faixa {faixa}</strong>
            {meses !== undefined && ` • ${meses} ${meses === 1 ? 'mês' : 'meses'} desde a visita`} • tabela de preços
          </>
        )}
      </p>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className={`${th} text-left`}></th>
              {colunas.map((c) => (
                <th key={c.rotulo} className={th}>
                  {c.rotulo}
                </th>
              ))}
              {temPoster && <th className={th}>Pôster c/ moldura</th>}
              <th className={th}>Comissão</th>
            </tr>
          </thead>
          <tbody>
            {FORMAS_REBOLO.map((x) => (
              <tr key={x.id} className="border-b border-white/[0.03] last:border-0">
                <td className="px-2 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400">{x.nome}</td>
                {colunas.map((c) => (
                  <td key={c.rotulo} className={td}>
                    {reais(precoVenda(tabela, faixa, 'completo', x.id, c.opcoes))}
                  </td>
                ))}
                {temPoster && <td className={td}>{reais(tabela.preco(faixa, 'poster_moldura', x.id))}</td>}
                <td className="px-2 py-1.5 text-right text-zinc-300 whitespace-nowrap">{tabela.comissao(x.id)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {opcoes.length > 0 && (
        <p className="text-[10px] text-zinc-500">
          {opcoes.map((o) => `${o.nome} ${o.sinal < 0 ? '−' : '+'}${reais(tabela.opcao(faixa, o.id))}`).join(' • ')} • podem ser somados
        </p>
      )}
    </div>
  )
}

export const dataHoraCurta = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
