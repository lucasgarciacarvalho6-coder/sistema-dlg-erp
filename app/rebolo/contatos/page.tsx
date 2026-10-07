'use client'

// Fila de contatos do rebolo, uma aba por situação (a tela abre em "Aguardando contato").
// Sem resposta volta para "Tentar de novo"; não vendeu → Descarte (o álbum fica congelado).
// A aba "Contatos de hoje" saiu a pedido do usuário (07/10/2026).

import { useMemo, useState } from 'react'
import { EM_ABERTO, escolaFicha, SITUACOES_FICHA, TOM_SITUACAO } from '@/lib/erp/rebolo'
import { EmptyState, Modal, PageHeader, Panel, TONS } from '@/components/erp/ui'
import Atendimento from '@/components/rebolo/Atendimento'
import { dataHoraCurta, FaixaBadge, PacoteBadge, Telefones, useRebolo } from '@/components/rebolo/comum'

type Aba = (typeof SITUACOES_FICHA)[number]
// cores das abas (pedido de 06/10/2026), as mesmas dos selos: aguardando/andamento = amarelo • vendida = verde •
// descarte e cancelada = vermelho. A aba escolhida fica preenchida com a cor.
const estiloAba = (a: Aba) => TONS[TOM_SITUACAO[a] ?? 'zinc']

export default function ContatosReboloPage() {
  const { eu, supervisao, fichas, vendedoras, nome, pacoteDe, tabela } = useRebolo()
  const [aba, setAba] = useState<Aba>('Aguardando contato')
  const [busca, setBusca] = useState('')
  const [vendedora, setVendedora] = useState(supervisao ? '' : (eu?.id ?? ''))
  const [atendendo, setAtendendo] = useState<string | null>(null)

  const visiveis = useMemo(
    () => fichas.filter((f) => (supervisao ? !vendedora || f.vendedoraId === vendedora : f.vendedoraId === eu?.id)),
    [fichas, supervisao, vendedora, eu],
  )
  const contar = (a: Aba) => visiveis.filter((f) => f.situacao === a).length

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return visiveis
      .filter((f) => f.situacao === aba)
      .filter((f) => !t || `${f.aluno} ${f.nomeMae} ${f.nomePai} ${f.numeroFicha} ${f.cidade} ${f.whatsapp1}`.toLowerCase().includes(t))
      .sort((a, b) => String(b.ultimoContato || b.criadoEm).localeCompare(String(a.ultimoContato || a.criadoEm)))
  }, [visiveis, aba, busca])

  const ficha = fichas.find((f) => f.id === atendendo) ?? null

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Vendas Rebolo / Contatos"
        titulo="Oferta de Pacotes"
        descricao="Entre em contato com cada família do seu pacote. Sem resposta: tente de novo. Não vendeu: descarte com o motivo. Fechou: registre a venda."
      />

      {/* letra maior para identificar melhor (pedido de 07/10/2026) */}
      <div className="flex flex-wrap gap-2">
        {SITUACOES_FICHA.map((a) => {
          const ativo = aba === a
          const t = estiloAba(a)
          return (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[13px] font-bold border transition-all ${t.texto} ${
                ativo ? `${t.suave} ${t.borda} ring-1 ring-inset ring-current/20` : 'border-white/[0.06] hover:bg-white/[0.03]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${t.solido}`}></span>
              {a} <span className="opacity-70">({contar(a)})</span>
            </button>
          )
        })}
      </div>

      <Panel
        semPadding
        titulo={aba}
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
          <EmptyState titulo="Nada por aqui" descricao="Nenhuma ficha nesta situação." />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-5 py-4 font-bold">Ação</th>
                  <th className="px-5 py-4 font-bold">Aluno / responsável</th>
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
                      {/* o nome do aluno em destaque (identifica o cliente); a mãe/o pai embaixo, quando houver */}
                      <p className="text-sm font-black text-white leading-tight">{String(f.aluno)}</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {[`Ficha ${String(f.numeroFicha)}`, f.nomeMae ? `Mãe: ${String(f.nomeMae)}` : f.nomePai ? `Pai: ${String(f.nomePai)}` : ''].filter(Boolean).join(' • ')}
                      </p>                    </td>
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

      <Modal aberto={!!ficha} titulo={ficha ? `Atendimento • ${ficha.aluno}` : ''} subtitulo={ficha ? [`Ficha ${ficha.numeroFicha}`, escolaFicha(ficha)].filter(Boolean).join(' • ') : ''} onFechar={() => setAtendendo(null)} largura="max-w-6xl">
        {ficha && <Atendimento key={ficha.id} ficha={ficha} onFechar={() => setAtendendo(null)} />}
      </Modal>
    </div>
  )
}
