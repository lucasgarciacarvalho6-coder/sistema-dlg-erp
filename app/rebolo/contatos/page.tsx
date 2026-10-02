'use client'

// Fila de contatos do rebolo. "Contatos de hoje" ordena quem ligar primeiro:
// agendados vencidos/de hoje → tentar de novo → aguardando contato → em negociação.
// Sem resposta volta para "Tentar de novo"; não vendeu → Descarte (o álbum fica congelado).

import { useMemo, useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { hoje } from '@/lib/erp/format'
import { EM_ABERTO, SITUACOES_FICHA } from '@/lib/erp/rebolo'
import { EmptyState, Modal, PageHeader, Panel } from '@/components/erp/ui'
import Atendimento from '@/components/rebolo/Atendimento'
import { dataHoraCurta, FaixaBadge, PacoteBadge, SituacaoBadge, Telefones, useRebolo } from '@/components/rebolo/comum'

const HOJE = 'Contatos de hoje'
type Aba = typeof HOJE | (typeof SITUACOES_FICHA)[number]

// prioridade na fila do dia (menor = primeiro)
function prioridade(f: Registro) {
  const agenda = String(f.agendadoPara || '')
  if (f.situacao === 'Agendado') return agenda.slice(0, 10) <= hoje() ? 0 : 9
  if (f.situacao === 'Tentar de novo') return 1
  if (f.situacao === 'Aguardando contato') return 2
  if (f.situacao === 'Em negociação') return 3
  return 9
}

export default function ContatosReboloPage() {
  const { eu, supervisao, fichas, vendedoras, nome, pacoteDe, tabela } = useRebolo()
  const [aba, setAba] = useState<Aba>(HOJE)
  const [busca, setBusca] = useState('')
  const [vendedora, setVendedora] = useState(supervisao ? '' : (eu?.id ?? ''))
  const [atendendo, setAtendendo] = useState<string | null>(null)

  const visiveis = useMemo(
    () => fichas.filter((f) => (supervisao ? !vendedora || f.vendedoraId === vendedora : f.vendedoraId === eu?.id)),
    [fichas, supervisao, vendedora, eu],
  )
  const contar = (a: Aba) => (a === HOJE ? visiveis.filter((f) => prioridade(f) < 9).length : visiveis.filter((f) => f.situacao === a).length)

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const base = aba === HOJE ? visiveis.filter((f) => prioridade(f) < 9) : visiveis.filter((f) => f.situacao === aba)
    return base
      .filter((f) => !t || `${f.aluno} ${f.nomeMae} ${f.nomePai} ${f.numeroFicha} ${f.cidade} ${f.whatsapp1}`.toLowerCase().includes(t))
      .sort((a, b) =>
        aba === HOJE
          ? prioridade(a) - prioridade(b) || String(a.agendadoPara || a.ultimoContato || '').localeCompare(String(b.agendadoPara || b.ultimoContato || ''))
          : String(b.ultimoContato || b.criadoEm).localeCompare(String(a.ultimoContato || a.criadoEm)),
      )
  }, [visiveis, aba, busca])

  const ficha = fichas.find((f) => f.id === atendendo) ?? null
  const abas: Aba[] = [HOJE, ...SITUACOES_FICHA]

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Vendas Rebolo / Contatos"
        titulo="Oferta de Pacotes"
        descricao="Entre em contato com cada família do seu pacote. Sem resposta: tente de novo. Não vendeu: descarte com o motivo. Fechou: registre a venda."
      />

      <div className="flex flex-wrap gap-2">
        {abas.map((a) => {
          const ativo = aba === a
          return (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${ativo ? 'bg-blue-600/10 text-blue-400 border-blue-500/30' : 'border-white/[0.06] text-zinc-400 hover:text-white'}`}
            >
              {a} <span className="opacity-70">({contar(a)})</span>
            </button>
          )
        })}
      </div>

      <Panel
        semPadding
        titulo={aba === HOJE ? 'Quem contatar agora' : aba}
        subtitulo={aba === HOJE ? 'Agendados de hoje, tentativas, novos e negociações em andamento' : undefined}
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            {supervisao && (
              <select value={vendedora} onChange={(e) => setVendedora(e.target.value)} className="bg-black/50 border border-white/[0.05] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl px-3 py-2 outline-none">
                <option value="">Todas as vendedoras</option>
                {vendedoras.map((v) => (
                  <option key={v.id} value={v.id}>{v.nome}</option>
                ))}
              </select>
            )}
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aluno, pais, ficha, cidade..." className="bg-black/50 border border-white/[0.05] rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-blue-500/50 w-64" />
          </div>
        }
      >
        {lista.length === 0 ? (
          <EmptyState titulo="Nada por aqui" descricao={aba === HOJE ? 'Sem contatos pendentes. Cadastre as fichas do próximo pacote.' : 'Nenhuma ficha nesta situação.'} />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-5 py-4 font-bold">Ação</th>
                  <th className="px-5 py-4 font-bold">Comprador / aluno</th>
                  <th className="px-5 py-4 font-bold">Faixa</th>
                  <th className="px-5 py-4 font-bold">Pacote / vendedora</th>
                  <th className="px-5 py-4 font-bold">Cidade</th>
                  <th className="px-5 py-4 font-bold">Contato</th>
                  <th className="px-5 py-4 font-bold">Último contato</th>
                  <th className="px-5 py-4 font-bold">Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {lista.map((f) => (
                  <tr key={f.id} className="hover:bg-white/[0.02] align-top">
                    <td className="px-5 py-3.5">
                      <button onClick={() => setAtendendo(f.id)} className="px-3 py-2 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-300 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap hover:bg-blue-600/25">
                        {EM_ABERTO.includes(String(f.situacao)) ? (f.situacao === 'Aguardando contato' ? 'Iniciar contato' : 'Continuar') : 'Ver'}
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-white">{String(f.nomeMae || f.nomePai || '—')}</p>
                      <p className="text-[11px] text-zinc-500">{String(f.aluno)} • ficha {String(f.numeroFicha)}</p>
                      {aba === HOJE && <div className="mt-1"><SituacaoBadge situacao={f.situacao} /></div>}
                    </td>
                    <td className="px-5 py-3.5"><FaixaBadge ficha={f} tabela={tabela} /></td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <PacoteBadge pacote={pacoteDe(f)} />
                      <p className="text-[11px] text-zinc-500 mt-1">{nome(f.vendedoraId)}</p>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">{[f.cidade, f.uf].filter(Boolean).join('/') || '—'}</td>
                    <td className="px-5 py-3.5"><Telefones ficha={f} /></td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-xs">
                      {f.situacao === 'Agendado' && f.agendadoPara ? <p className="text-zinc-200 font-bold">📅 {dataHoraCurta(f.agendadoPara)}</p> : <p>{dataHoraCurta(f.ultimoContato)}</p>}
                      {Number(f.tentativas) > 0 && <p className="text-zinc-400">{String(f.tentativas)} tentativa(s)</p>}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-zinc-400 max-w-[220px]">
                      {f.motivoDescarte ? <span className="text-red-400">{String(f.motivoDescarte)} • </span> : null}
                      {String(f.observacao || '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal aberto={!!ficha} titulo={ficha ? `Atendimento • ${ficha.aluno}` : ''} subtitulo={ficha ? `Ficha ${ficha.numeroFicha} • ${ficha.escola}` : ''} onFechar={() => setAtendendo(null)} largura="max-w-6xl">
        {ficha && <Atendimento key={ficha.id} ficha={ficha} onFechar={() => setAtendendo(null)} />}
      </Modal>
    </div>
  )
}
