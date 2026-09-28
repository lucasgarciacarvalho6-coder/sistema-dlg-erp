'use client'

// Envio pelo Correio: venda aprovada pelo Financeiro entra em "A enviar" com o endereço;
// a vendedora lança o código de rastreio e avisa o cliente pelo WhatsApp.

import { useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { registrarEnvioRebolo, usePode } from '@/lib/erp/store'
import { linkWhatsApp } from '@/lib/erp/rebolo'
import { Badge, EmptyState, PageHeader, Panel, StatCard, Tabs, btnPrimario } from '@/components/erp/ui'
import { dataHoraCurta, useRebolo } from '@/components/rebolo/comum'

type Aba = 'enviar' | 'enviados'

export default function EnviosReboloPage() {
  const { eu, supervisao, fichas, vendas, nome, pacoteDe } = useRebolo()
  const podeFazer = usePode()
  const [aba, setAba] = useState<Aba>('enviar')
  const [rastreios, setRastreios] = useState<Record<string, string>>({})
  const minhas = fichas.filter((f) => f.situacao === 'Vendida' && (supervisao || f.vendedoraId === eu?.id))
  const aEnviar = minhas.filter((f) => !f.enviadoEm)
  const enviados = minhas.filter((f) => !!f.enviadoEm).sort((a, b) => String(b.enviadoEm).localeCompare(String(a.enviadoEm)))
  const lista = aba === 'enviar' ? aEnviar : enviados
  const vendaDe = (f: Registro) => vendas.find((v) => v.fichaReboloId === f.id && v.conferencia === 'Conferida')

  const mensagem = (f: Registro) => {
    const v = vendaDe(f)
    const tel = String(v?.whatsapp || f.whatsapp1 || '')
    const link = linkWhatsApp(tel)
    if (!link) return ''
    return `${link}?text=${encodeURIComponent(`Olá! Aqui é da DLG Photos. O álbum de ${f.aluno} foi enviado pelos Correios. Código de rastreio: ${f.rastreio}. Acompanhe em https://rastreamento.correios.com.br`)}`
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader modulo="Vendas Rebolo / Envios" titulo="Envios pelo Correio" descricao="Vendas aprovadas pelo Financeiro, prontas para despachar. Lance o código de rastreio e avise o cliente." />
      <div className="grid grid-cols-2 gap-6">
        <StatCard tom="orange" label="A enviar" valor={aEnviar.length} detalhe="aprovadas pelo Financeiro" />
        <StatCard tom="emerald" label="Enviados" valor={enviados.length} />
      </div>
      <Tabs abas={[{ id: 'enviar' as Aba, label: `A enviar (${aEnviar.length})` }, { id: 'enviados' as Aba, label: `Enviados (${enviados.length})` }]} ativa={aba} onChange={setAba} />
      <Panel semPadding titulo={aba === 'enviar' ? 'A enviar' : 'Enviados'}>
        {lista.length === 0 ? (
          <EmptyState titulo={aba === 'enviar' ? 'Nada para enviar' : 'Nenhum envio ainda'} />
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {lista.map((f) => {
              const v = vendaDe(f)
              const podeEnviar = (f.vendedoraId === eu?.id || supervisao) && podeFazer('rebolo', 'editar')
              return (
                <div key={f.id} className="px-6 py-5 grid grid-cols-1 lg:grid-cols-3 gap-4 items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-white">{String(v?.responsavel ?? f.nomeMae ?? '—')}</p>
                      <Badge texto={`P${pacoteDe(f)?.numero ?? '?'} • ficha ${f.numeroFicha}`} tom="cyan" />
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      {String(f.aluno)} • {String(v?.pacote ?? 'Book')} • {nome(f.vendedoraId)}
                    </p>
                  </div>
                  <div className="text-sm text-zinc-300">
                    <p>{[f.rua, f.numero, f.apto && `apto ${f.apto}`].filter(Boolean).join(', ') || 'Endereço não informado'}</p>
                    <p className="text-xs text-zinc-500">
                      {[f.bairro, [f.cidade, f.uf].filter(Boolean).join('/'), f.cep && `CEP ${f.cep}`].filter(Boolean).join(' • ')}
                      {f.pontoReferencia ? ` • ${f.pontoReferencia}` : ''}
                    </p>
                  </div>
                  {aba === 'enviar' ? (
                    podeEnviar ? (
                      <div className="flex gap-2">
                        <input
                          value={rastreios[f.id] ?? ''}
                          onChange={(e) => setRastreios({ ...rastreios, [f.id]: e.target.value.toUpperCase() })}
                          placeholder="Código de rastreio (ex.: AA123456789BR)"
                          className="flex-1 bg-black/50 border border-white/[0.05] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500/50"
                        />
                        <button onClick={() => void registrarEnvioRebolo(f.id, rastreios[f.id] ?? '')} disabled={!(rastreios[f.id] ?? '').trim()} className={btnPrimario}>
                          Enviado
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500">Aguardando a vendedora despachar.</p>
                    )
                  ) : (
                    <div className="text-sm">
                      <p className="text-white font-bold">{String(f.rastreio)}</p>
                      <p className="text-xs text-zinc-500">Enviado em {dataHoraCurta(f.enviadoEm)}</p>
                      {mensagem(f) && (
                        <a href={mensagem(f)} target="_blank" rel="noreferrer" className="text-xs font-bold text-emerald-400 hover:text-emerald-300">
                          💬 Avisar o cliente no WhatsApp
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}
