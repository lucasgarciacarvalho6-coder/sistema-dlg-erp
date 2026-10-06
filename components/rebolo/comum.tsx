'use client'

// Peças comuns das telas do setor Vendas Rebolo
import { useEffect, useMemo, useState } from 'react'
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
  TOM_FAIXA,
  TOM_SITUACAO,
  type Faixa,
  type TabelaRebolo,
} from '@/lib/erp/rebolo'
import { brl } from '@/lib/erp/format'
import { carregarCidades, cidadesComNome, sugerirCidades, type Cidade, type Cidades } from '@/lib/erp/cidades'
import { Badge, inputCls, labelCls } from '@/components/erp/ui'

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
  return <Badge texto={`Faixa ${f}`} tom={TOM_FAIXA[f]} />
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

// Lista de municípios do IBGE (baixa uma vez, quando o cadastro abre)
export function useCidades() {
  const [cidades, setCidades] = useState<Cidades | null>(null)
  useEffect(() => {
    let vivo = true
    void carregarCidades().then((c) => vivo && setCidades(c))
    return () => {
      vivo = false
    }
  }, [])
  return cidades
}

// Campo Cidade do cadastro das fichas (lista própria, sem acento: "perdoes" acha Perdões; aceita "lavras mg").
//  • ↑ ↓ escolhem, Enter (ou clique) confirma; cada sugestão mostra a UF e o DDD;
//  • nome de uma cidade só (ex.: Lavras) já define a UF e o DDD; ao sair do campo, corrige a grafia oficial;
//  • nome que existe em mais de um estado: avisa e a vendedora escolhe na lista (ou na UF).
// onMudar(cidade, uf, ddd): ddd vem quando a cidade é certa (para completar os telefones sem DDD).
export function CampoCidade({ cidade, uf, onMudar, classe = '' }: { cidade: string; uf: string; onMudar: (cidade: string, uf: string, ddd: string) => void; classe?: string }) {
  const cidades = useCidades()
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const opcoes = cidades && aberto ? sugerirCidades(cidades, cidade) : []
  const iguais = cidades ? cidadesComNome(cidades, cidade) : []
  const escolher = (o: Cidade) => {
    onMudar(o.nome, o.uf, o.ddd)
    setAberto(false)
  }
  const digitar = (v: string) => {
    setAtivo(0)
    setAberto(true)
    const mesmas = cidades ? cidadesComNome(cidades, v) : []
    if (mesmas.length === 1) onMudar(v, mesmas[0].uf, mesmas[0].ddd)
    else onMudar(v, uf, '')
  }
  const teclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!opcoes.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAtivo((a) => Math.min(opcoes.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAtivo((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      escolher(opcoes[Math.min(ativo, opcoes.length - 1)])
    } else if (e.key === 'Escape') setAberto(false)
  }
  const aoSair = () => {
    setAberto(false)
    const certa = iguais.length === 1 ? iguais[0] : iguais.find((x) => x.uf === uf)
    if (certa && (certa.nome !== cidade || certa.uf !== uf)) onMudar(certa.nome, certa.uf, certa.ddd)
  }
  const pedirUf = iguais.length > 1 && !iguais.some((x) => x.uf === uf)
  return (
    <div className={`space-y-1 relative ${classe}`}>
      <label className={labelCls}>Cidade</label>
      <input
        value={cidade}
        onChange={(e) => digitar(e.target.value)}
        onFocus={() => cidade.trim().length >= 2 && setAberto(true)}
        onKeyDown={teclas}
        onBlur={aoSair}
        autoComplete="off"
        placeholder="Digite (sem acento também)"
        className={inputCls}
      />
      {opcoes.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-30 w-full min-w-[260px] max-h-72 overflow-auto custom-scrollbar rounded-xl border border-white/[0.1] bg-painel shadow-2xl py-1">
          {opcoes.map((o, k) => (
            <button
              key={`${o.nome}-${o.uf}`}
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault() // não tira o foco antes de escolher
                escolher(o)
              }}
              onMouseEnter={() => setAtivo(k)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm ${k === ativo ? 'bg-blue-500/15 text-white' : 'text-zinc-300'}`}
            >
              <span className="truncate">
                <strong className="text-white">{o.nome}</strong> <span className="text-zinc-400">- {o.uf}</span>
              </span>
              {o.ddd && <span className="shrink-0 text-[10px] font-bold text-zinc-500">DDD {o.ddd}</span>}
            </button>
          ))}
        </div>
      )}
      {pedirUf && <p className="text-[10px] font-bold text-yellow-400">Tem em {iguais.map((x) => x.uf).join(', ')}: escolha na lista</p>}
    </div>
  )
}

export const dataHoraCurta = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
