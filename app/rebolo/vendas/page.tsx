'use client'

// Vendas do rebolo: "Vendas a efetivar" → gerar o Contrato de Compra Online (PDF) → cliente assina no site
// de assinatura eletrônica → anexar o PDF assinado → Financeiro confere → aprovada (parcelas + meta).

import { useMemo, useRef, useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { anexarContratoRebolo, avisar, cancelarVendaRebolo, enviarVendaRebolo, urlArquivoContrato, usePode } from '@/lib/erp/store'
import { imprimirContratoRebolo } from '@/lib/erp/impressao-rebolo'
import { lerJSON } from '@/lib/erp/operacional'
import { brl, dataBR } from '@/lib/erp/format'
import Icon from '@/components/erp/Icon'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import { useRebolo } from '@/components/rebolo/comum'

const ABAS = [
  { id: 'Aguardando contrato', label: 'A efetivar (contrato)', tom: 'cyan' },
  { id: 'Aguardando conferência', label: 'No Financeiro', tom: 'yellow' },
  { id: 'Devolvida', label: 'Devolvidas', tom: 'red' },
  { id: 'Conferida', label: 'Aprovadas', tom: 'emerald' },
  { id: 'Cancelada', label: 'Canceladas', tom: 'zinc' },
] as const
type Aba = (typeof ABAS)[number]['id']

export default function VendasReboloPage() {
  const { eu, supervisao, vendas, fichas, vendedoras, nome } = useRebolo()
  const podeFazer = usePode()
  const [aba, setAba] = useState<Aba>('Aguardando contrato')
  const [vendedora, setVendedora] = useState('')
  const [anexos, setAnexos] = useState<Record<string, string>>({}) // venda → caminho do contrato assinado recém-enviado
  const [enviando, setEnviando] = useState<string | null>(null)
  const [cancelar, setCancelar] = useState<Registro | null>(null)
  const [motivo, setMotivo] = useState('')
  const inputArquivo = useRef<HTMLInputElement>(null)
  const alvo = useRef<string | null>(null)

  const minhas = useMemo(
    () => vendas.filter((v) => (supervisao ? !vendedora || v.cobradorId === vendedora : v.cobradorId === eu?.id)),
    [vendas, supervisao, vendedora, eu],
  )
  const lista = minhas.filter((v) => v.conferencia === aba).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))
  const aprovadasMes = minhas.filter((v) => v.conferencia === 'Conferida' && String(v.data).slice(0, 7) === new Date().toISOString().slice(0, 7))
  const podeEditar = (v: Registro) => (v.cobradorId === eu?.id || supervisao) && podeFazer('rebolo', 'editar') && (v.conferencia === 'Aguardando contrato' || v.conferencia === 'Devolvida')

  const gerarContrato = (v: Registro) => {
    const erro = imprimirContratoRebolo(v, fichas.find((f) => f.id === v.fichaReboloId), nome(v.cobradorId))
    if (erro) avisar(erro)
  }

  const escolherArquivo = (id: string) => {
    alvo.current = id
    inputArquivo.current?.click()
  }
  const aoEscolher = async (arquivo: File | undefined) => {
    const id = alvo.current
    if (inputArquivo.current) inputArquivo.current.value = ''
    if (!arquivo || !id) return
    setEnviando(id)
    const r = await anexarContratoRebolo(arquivo)
    setEnviando(null)
    if ('erro' in r) return avisar(r.erro)
    setAnexos((a) => ({ ...a, [id]: r.caminho }))
    avisar('Contrato anexado. Confira e envie ao Financeiro.', 'ok')
  }
  const enviar = async (v: Registro) => {
    const caminho = anexos[v.id]
    if (!caminho) return avisar('Anexe o contrato assinado (PDF ou foto) antes de enviar.')
    setEnviando(v.id)
    await enviarVendaRebolo(v.id, caminho)
    setEnviando(null)
  }
  const verContrato = async (v: Registro) => {
    const caminho = anexos[v.id] || lerJSON<{ contratoAssinado?: string }>(v.anexos, {}).contratoAssinado
    if (!caminho) return avisar('Nenhum contrato anexado.')
    const url = await urlArquivoContrato(caminho)
    if (!url) return avisar('Não foi possível abrir o arquivo.')
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      <input ref={inputArquivo} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => void aoEscolher(e.target.files?.[0])} />
      <PageHeader
        modulo="Vendas Rebolo / Vendas"
        titulo="Vendas"
        descricao="Gere o contrato já preenchido, mande para o cliente assinar no site de assinatura eletrônica e anexe o PDF assinado. O Financeiro confere e aprova."
        acoes={
          supervisao && (
            <select value={vendedora} onChange={(e) => setVendedora(e.target.value)} className="bg-black/50 border border-white/[0.05] text-white text-xs font-bold uppercase tracking-widest rounded-xl px-4 py-3.5 outline-none">
              <option value="">Todas as vendedoras</option>
              {vendedoras.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          )
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard tom={minhas.some((v) => v.conferencia === 'Aguardando contrato') ? 'yellow' : 'zinc'} label="A efetivar" valor={minhas.filter((v) => v.conferencia === 'Aguardando contrato').length} detalhe="faltando o contrato assinado" />
        <StatCard label="No Financeiro" valor={minhas.filter((v) => v.conferencia === 'Aguardando conferência').length} />
        <StatCard tom={minhas.some((v) => v.conferencia === 'Devolvida') ? 'red' : 'zinc'} label="Devolvidas" valor={minhas.filter((v) => v.conferencia === 'Devolvida').length} detalhe="corrigir e reenviar" />
        <StatCard label="Aprovadas no mês" valor={brl(aprovadasMes.reduce((a, v) => a + (Number(v.valor) || 0), 0))} detalhe={`${aprovadasMes.length} venda(s)`} />
      </div>

      <div className="flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold border ${aba === a.id ? 'bg-blue-600/10 text-blue-300 border-blue-500/30' : 'border-white/[0.06] text-zinc-400 hover:text-white'}`}
          >
            {a.label} <span className="opacity-70">({minhas.filter((v) => v.conferencia === a.id).length})</span>
          </button>
        ))}
      </div>

      <Panel semPadding titulo={ABAS.find((a) => a.id === aba)!.label}>
        {lista.length === 0 ? (
          <EmptyState titulo="Nenhuma venda aqui" descricao={aba === 'Aguardando contrato' ? 'Feche uma venda em Contatos.' : undefined} />
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {lista.map((v) => {
              const anexado = anexos[v.id] || lerJSON<{ contratoAssinado?: string }>(v.anexos, {}).contratoAssinado
              return (
                <div key={v.id} className="px-6 py-5 flex flex-col xl:flex-row xl:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-white">{String(v.responsavel)}</p>
                      <Badge texto={String(v.pacote)} />
                      <Badge texto={`Ficha ${v.numeroFicha}`} tom="zinc" />
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      {String(v.modelo)} • {String(v.escola)} • {nome(v.cobradorId)} • {dataBR(String(v.data))}
                    </p>
                    <p className="text-sm text-white mt-1">
                      <strong>{brl(Number(v.valor) || 0)}</strong> • {String(v.formaPagamento)} • {String(v.formaParcelamento || '')}
                      {v.primeiroVencimento ? ` • 1º venc. ${dataBR(String(v.primeiroVencimento))}` : ''}
                    </p>
                    {v.conferencia === 'Devolvida' && <p className="text-xs font-bold text-red-400 mt-1">Devolvida: {String(v.conferenciaMotivo || '')}</p>}
                    {v.conferencia === 'Cancelada' && v.conferenciaMotivo ? <p className="text-xs text-zinc-500 mt-1">Cancelada: {String(v.conferenciaMotivo)}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    {podeEditar(v) ? (
                      <>
                        <button onClick={() => gerarContrato(v)} className={btnSecundario}>
                          <Icon nome="doc" className="w-4 h-4" /> Gerar contrato (PDF)
                        </button>
                        <button onClick={() => escolherArquivo(v.id)} disabled={enviando === v.id} className={btnSecundario}>
                          <Icon nome="upload" className="w-4 h-4" /> {anexado ? 'Trocar contrato assinado' : 'Anexar contrato assinado'}
                        </button>
                        {anexado && (
                          <button onClick={() => void verContrato(v)} className={btnSecundario}>
                            Ver anexo
                          </button>
                        )}
                        <button onClick={() => void enviar(v)} disabled={!anexos[v.id] || enviando === v.id} className={btnPrimario} title={anexos[v.id] ? '' : 'Anexe o contrato assinado primeiro'}>
                          {enviando === v.id ? 'Enviando...' : v.conferencia === 'Devolvida' ? 'Reenviar ao Financeiro' : 'Enviar ao Financeiro'}
                        </button>
                        <button onClick={() => (setCancelar(v), setMotivo(''))} className="px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/10">
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => gerarContrato(v)} className={btnSecundario}>
                          <Icon nome="doc" className="w-4 h-4" /> Contrato
                        </button>
                        {anexado && (
                          <button onClick={() => void verContrato(v)} className={btnSecundario}>
                            Contrato assinado
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      <Modal
        aberto={!!cancelar}
        titulo="Cancelar venda"
        subtitulo={cancelar ? `${cancelar.responsavel} • ${brl(Number(cancelar.valor) || 0)}` : ''}
        onFechar={() => setCancelar(null)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setCancelar(null)} className={btnSecundario}>Voltar</button>
            <button
              onClick={async () => {
                if (cancelar && !(await cancelarVendaRebolo(cancelar.id, motivo))) setCancelar(null)
              }}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl"
            >
              Cancelar venda
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <label className={labelCls}>Motivo</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} placeholder="Ex.: cliente desistiu antes de assinar" />
          <p className="text-xs text-zinc-500">A ficha fica como &quot;Cancelada&quot; (conta como finalizada no pacote).</p>
        </div>
      </Modal>
    </div>
  )
}
