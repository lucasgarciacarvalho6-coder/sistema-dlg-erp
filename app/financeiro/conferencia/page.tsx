'use client'

// Financeiro › Conferência de vendas:
//  • Externas (app do vendedor): contrato (lido pela IA), assinatura, documento, ficha, comprovante, promissória e foto do cliente.
//  • Rebolo (vendas internas por telefone): Contrato de Compra Online assinado eletronicamente (PDF).
// Conferir → gera as parcelas (títulos) e, no rebolo, conta na meta e libera o envio. Devolver → volta para corrigir, com o motivo.

import { useEffect, useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { conferirVendaBook, urlArquivoContrato, useErp, usePode } from '@/lib/erp/store'
import { colecao, nomeColaborador } from '@/lib/erp/metrics'
import { lerJSON } from '@/lib/erp/operacional'
import { brl, dataBR, hoje, mesAtual } from '@/lib/erp/format'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, Tabs, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

type Aba = 'aguardando' | 'devolvidas' | 'conferidas'

interface Anexos {
  contrato?: string[]
  docFrente?: string
  docVerso?: string
  recibo?: string
  ficha?: string
  comprovante?: string
  clienteContrato?: string
  contratoAssinado?: string // rebolo
}

const nomeVendedor = (s: ReturnType<typeof useErp>, v: Registro) =>
  v.canal === 'Rebolo' ? nomeColaborador(s, v.cobradorId) || 'Vendedora rebolo' : String(colecao(s, 'pj_vendedores').find((x) => x.id === v.vendedorExternoId)?.nome ?? 'Vendedor externo')
const dataHora = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

function Foto({ caminho, rotulo }: { caminho?: string; rotulo: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    if (caminho) urlArquivoContrato(caminho).then((u) => vivo && setUrl(u))
    return () => {
      vivo = false
    }
  }, [caminho])
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{rotulo}</p>
      {!caminho ? (
        <div className="h-40 rounded-xl border border-dashed border-red-500/40 flex items-center justify-center text-xs font-bold text-red-400">Não enviado</div>
      ) : url && /\.pdf$/i.test(caminho) ? (
        <a href={url} target="_blank" rel="noreferrer" className="h-40 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:border-blue-500/60 flex flex-col items-center justify-center gap-2 text-sm font-bold text-blue-300">
          <span className="text-3xl" aria-hidden="true">📄</span> Abrir PDF assinado
        </a>
      ) : url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-white/[0.08] bg-white hover:border-blue-500/60" title="Abrir em tamanho real">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={rotulo} className="w-full h-40 object-contain" />
        </a>
      ) : (
        <div className="h-40 rounded-xl bg-white/[0.03] animate-pulse" />
      )}
    </div>
  )
}

function Dado({ r, v, destaque = false }: { r: string; v: unknown; destaque?: boolean }) {
  const t = v === null || v === undefined || v === '' ? '—' : String(v)
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{r}</p>
      <p className={`text-sm ${destaque ? 'font-black text-white' : 'text-zinc-200'} ${t === '—' ? 'text-zinc-600' : ''}`}>{t}</p>
    </div>
  )
}

export default function ConferenciaVendasPage() {
  const s = useErp()
  const podeFazer = usePode()
  const pEditar = podeFazer('financeiro', 'editar')
  const [aba, setAba] = useState<Aba>('aguardando')
  const [aberta, setAberta] = useState<Registro | null>(null)
  const [devolvendo, setDevolvendo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)

  // vendas que passam pela conferência: externas (app) e do rebolo
  const externas = colecao(s, 'vendas_ebooks').filter((v) => v.canal === 'Externo' || v.canal === 'Rebolo')
  const aguardando = externas.filter((v) => v.conferencia === 'Aguardando conferência')
  const devolvidas = externas.filter((v) => v.conferencia === 'Devolvida')
  const conferidas = externas.filter((v) => v.conferencia === 'Conferida' && String(v.conferidoEm || v.data).slice(0, 7) === mesAtual())
  const lista = (aba === 'aguardando' ? aguardando : aba === 'devolvidas' ? devolvidas : conferidas).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))
  const venda = aberta ? (externas.find((v) => v.id === aberta.id) ?? aberta) : null

  const agir = async (acao: 'conferir' | 'devolver') => {
    if (!venda) return
    setSalvando(true)
    const erro = await conferirVendaBook(venda.id, acao, motivo)
    setSalvando(false)
    if (!erro) {
      setAberta(null)
      setDevolvendo(false)
      setMotivo('')
    }
  }

  const anexos = venda ? lerJSON<Anexos>(venda.anexos, {}) : {}
  const refs = venda ? lerJSON<{ nome: string; telefone: string }[]>(venda.referencias, []) : []
  const completo = (v: Registro) => {
    const a = lerJSON<Anexos>(v.anexos, {})
    if (v.canal === 'Rebolo') return !!a.contratoAssinado
    return !!(a.contrato?.length && a.docFrente && a.docVerso && a.ficha && a.comprovante && a.recibo && a.clienteContrato && v.assinatura)
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Financeiro / Conferência"
        titulo="Conferência de Vendas"
        descricao="Vendas externas (app do vendedor, com contrato, assinatura e documentos) e do Rebolo (contrato assinado eletronicamente). Conferida gera as parcelas; devolvida volta a quem vendeu, com o motivo."
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard tom={aguardando.length ? 'yellow' : 'zinc'} label="Aguardando conferência" valor={aguardando.length} detalhe={brl(aguardando.reduce((a, v) => a + Number(v.valor || 0), 0))} />
        <StatCard tom={devolvidas.length ? 'red' : 'zinc'} label="Devolvidas ao vendedor" valor={devolvidas.length} detalhe="aguardando correção" />
        <StatCard label="Conferidas no mês" valor={conferidas.length} detalhe={brl(conferidas.reduce((a, v) => a + Number(v.valor || 0), 0))} />
        <StatCard label="Conferidas hoje" valor={externas.filter((v) => v.conferencia === 'Conferida' && String(v.conferidoEm || '').slice(0, 10) === hoje()).length} />
      </div>

      <Tabs
        abas={[
          { id: 'aguardando', label: `Aguardando (${aguardando.length})` },
          { id: 'devolvidas', label: `Devolvidas (${devolvidas.length})` },
          { id: 'conferidas', label: 'Conferidas no mês' },
        ]}
        ativa={aba}
        onChange={setAba}
      />

      <Panel titulo={aba === 'aguardando' ? 'Para conferir' : aba === 'devolvidas' ? 'Devolvidas ao vendedor' : 'Conferidas no mês'} semPadding>
        {lista.length === 0 ? (
          <EmptyState titulo="Nada por aqui" descricao={aba === 'aguardando' ? 'As vendas enviadas pelos vendedores de books aparecem aqui.' : 'Nenhuma venda nesta situação.'} />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-4 py-4 font-bold">Enviada</th>
                  <th className="px-4 py-4 font-bold">Vendedor</th>
                  <th className="px-4 py-4 font-bold">Comprador • ficha</th>
                  <th className="px-4 py-4 font-bold">Escola</th>
                  <th className="px-4 py-4 font-bold">Pagamento</th>
                  <th className="px-4 py-4 font-bold text-right">Valor</th>
                  <th className="px-4 py-4 font-bold">Anexos</th>
                  <th className="px-4 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {lista.map((v) => (
                  <tr key={v.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-400">{dataHora(v.criadoEm)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-white font-bold">{nomeVendedor(s, v)}</p>
                      <Badge texto={v.canal === 'Rebolo' ? 'Rebolo' : 'Externa'} />
                    </td>
                    <td className="px-4 py-3 min-w-[180px]">
                      <p className="text-white text-xs font-bold">{String(v.responsavel)}</p>
                      <p className="text-[11px] text-zinc-500">Ficha {String(v.numeroFicha || '—')}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">{String(v.escola)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {String(v.formaPagamento)}
                      {Number(v.parcelas) > 1 ? ` • ${String(v.parcelas)}x` : ''}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-black text-white">{brl(Number(v.valor || 0))}</td>
                    <td className="px-4 py-3">{completo(v) ? <Badge texto="Completos" /> : <Badge texto="Faltando" tom="yellow" />}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => (setAberta(v), setDevolvendo(false), setMotivo(''))} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 whitespace-nowrap">
                        {aba === 'aguardando' ? 'Conferir' : 'Ver'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        aberto={!!venda}
        titulo={venda ? `Venda • ${venda.responsavel}` : ''}
        subtitulo={venda ? `${venda.canal === 'Rebolo' ? 'Rebolo' : 'Externa'} • ${nomeVendedor(s, venda)} • ${venda.escola} • enviada em ${dataHora(venda.criadoEm)}` : ''}
        onFechar={() => setAberta(null)}
        largura="max-w-6xl"
        rodape={
          venda?.conferencia === 'Aguardando conferência' && pEditar ? (
            devolvendo ? (
              <>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ex.: documento ilegível, falta o verso)" className={`${inputCls} flex-1`} autoFocus />
                <button onClick={() => setDevolvendo(false)} className={btnSecundario}>Voltar</button>
                <button onClick={() => agir('devolver')} disabled={salvando || !motivo.trim()} className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl disabled:opacity-50">
                  Devolver ao vendedor
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setDevolvendo(true)} className="mr-auto px-5 py-3 text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/10 rounded-xl">
                  Devolver ao vendedor
                </button>
                <button onClick={() => setAberta(null)} className={btnSecundario}>Fechar</button>
                <button onClick={() => agir('conferir')} disabled={salvando} className={btnPrimario}>
                  ✓ Conferida • gerar parcelas
                </button>
              </>
            )
          ) : (
            <button onClick={() => setAberta(null)} className={btnSecundario}>Fechar</button>
          )
        }
      >
        {venda && (
          <div className="space-y-6">
            {venda.conferencia === 'Devolvida' && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-sm">
                <span className="font-bold text-red-400">Devolvida:</span> <span className="text-zinc-200">{String(venda.conferenciaMotivo || '')}</span>
              </div>
            )}
            {venda.conferencia === 'Conferida' && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-sm text-emerald-300">
                ✓ Conferida por {nomeColaborador(s, venda.conferidoPor)} em {dataHora(venda.conferidoEm)}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Dados lidos/revisados */}
              <div className="space-y-5">
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Dado r="Comprador" v={venda.responsavel} destaque />
                  <Dado r="CPF" v={venda.cpf} />
                  <Dado r="RG" v={venda.rg} />
                  <Dado r="Nascimento" v={venda.dataNascimento ? dataBR(String(venda.dataNascimento)) : ''} />
                  <Dado r="WhatsApp" v={venda.whatsapp || venda.telefone} />
                  <Dado r="Nº da ficha" v={venda.numeroFicha} destaque />
                  <Dado r="Endereço" v={[venda.endereco, venda.bairro].filter(Boolean).join(' - ')} />
                  <Dado r="CEP" v={venda.cep} />
                  <Dado r="Cidade" v={venda.cidade} />
                  <Dado r="Pai" v={venda.nomePai} />
                  <Dado r="Mãe" v={venda.nomeMae} />
                  <Dado r="Modelo" v={venda.modelo} />
                </div>
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Referências</p>
                  {refs.length === 0 && <p className="text-xs text-zinc-600">—</p>}
                  {refs.map((r, i) => (
                    <p key={i} className="text-sm text-zinc-200">
                      {r.nome || '—'} <span className="text-zinc-500">• {r.telefone || '—'}</span>
                    </p>
                  ))}
                </div>
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Dado r="Valor total" v={brl(Number(venda.valor || 0))} destaque />
                  <Dado r="Entrada" v={Number(venda.entrada) ? brl(Number(venda.entrada)) : ''} />
                  <Dado r="Pagamento" v={`${venda.formaPagamento}${Number(venda.parcelas) > 1 ? ` • ${venda.parcelas}x` : ''}`} />
                  <Dado r="1º vencimento" v={venda.primeiroVencimento ? dataBR(String(venda.primeiroVencimento)) : ''} />
                  <Dado r={venda.canal === 'Rebolo' ? 'Parcelamento' : 'Parcelamento (papel)'} v={venda.formaParcelamento} />
                  <Dado
                    r={venda.canal === 'Rebolo' ? 'Produto' : 'Itens'}
                    v={venda.canal === 'Rebolo' ? `${venda.pacote} • ${venda.qtdFotos || 0} fotos` : `${venda.qtdMaletas || 0} maleta • ${venda.qtdFotos || 0} fotos • ${venda.qtdMolduras || 0} moldura`}
                  />
                </div>
                {venda.canal === 'Rebolo' ? (
                  venda.observacao ? (
                    <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5">
                      <Dado r="Observação da vendedora" v={venda.observacao} />
                    </div>
                  ) : null
                ) : (
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 grid grid-cols-2 gap-4">
                  <Dado r="Assinado no app em" v={dataHora(venda.assinaturaEm)} />
                  <Dado
                    r="Local da assinatura"
                    v={venda.assinaturaLat ? `${Number(venda.assinaturaLat).toFixed(5)}, ${Number(venda.assinaturaLng).toFixed(5)}` : ''}
                  />
                  {venda.observacao ? <Dado r="Observação do vendedor" v={venda.observacao} /> : null}
                </div>
                )}
              </div>

              {/* Fotos */}
              {venda.canal === 'Rebolo' ? (
                <div className="grid grid-cols-2 gap-4 content-start">
                  <Foto caminho={anexos.contratoAssinado} rotulo="Contrato de Compra Online • assinado" />
                </div>
              ) : (
              <div className="grid grid-cols-2 gap-4 content-start">
                {(anexos.contrato?.length ? anexos.contrato : [undefined]).map((c, i) => (
                  <Foto key={`c-${i}`} caminho={c} rotulo={`Contrato${(anexos.contrato?.length ?? 0) > 1 ? ` • pág. ${i + 1}` : ''}`} />
                ))}
                <Foto caminho={anexos.docFrente} rotulo="Documento • frente" />
                <Foto caminho={anexos.docVerso} rotulo="Documento • verso" />
                <Foto caminho={anexos.ficha} rotulo="Ficha de reconhecimento" />
                <Foto caminho={anexos.comprovante} rotulo="Comprovante de residência" />
                <Foto caminho={anexos.recibo} rotulo="Promissória" />
                <Foto caminho={anexos.clienteContrato} rotulo="Cliente com o contrato" />
                <Foto caminho={String(venda.assinatura || '') || undefined} rotulo="Assinatura no app" />
              </div>
              )}
            </div>
            {devolvendo && <p className={`${labelCls} text-red-400`}>Escreva o motivo embaixo: o vendedor vê no app e corrige.</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}
