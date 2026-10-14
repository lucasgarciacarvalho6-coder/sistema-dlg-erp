'use client'

// Cobrança › contatos (SQL 046), igual ao "Registrar Cobrança" do sistema antigo:
// registrar contato (tipo, data, situação, observação, datas de retorno/promessa), histórico que não se apaga,
// mensagens prontas de WhatsApp e o "Para hoje" do cobrador.

import { useState } from 'react'
import { registrarContatoCobranca, useUsuario } from '@/lib/erp/store'
import { brl, dataBR } from '@/lib/erp/format'
import { hoje } from '@/lib/erp/format'
import { linkWhatsApp } from '@/lib/erp/rebolo'
import { useParaHoje, useSpcPendentes } from '@/lib/erp/cobrancas'
import {
  SITUACOES_COM_OBSERVACAO,
  SITUACOES_CONTATO,
  SITUACOES_DE_ACORDO,
  TIPOS_CONTATO,
  type ContatoV,
  type CobrancaV,
  type SituacaoCobranca,
} from '@/lib/erp/carteira'
import { Badge, Modal, Panel, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import type { Tom } from '@/lib/erp/types'

const TOM_SITUACAO_COBRANCA: Record<string, Tom> = {
  'Aguardando cobrança': 'zinc',
  'Contato realizado sem acordo': 'zinc',
  'Aguardando retorno': 'yellow',
  'Pagamento de boleto agendado': 'yellow',
  'Promessa não cumprida': 'red',
  'Não localizado': 'zinc',
  'Ficha não encontrada SPC': 'red',
}

// selo da situação de hoje, com a data do retorno / da promessa
export function SeloSituacaoCobranca({ s }: { s?: SituacaoCobranca }) {
  if (!s) return null
  const data = s.situacaoGravada === 'Aguardando retorno' ? s.retornoEm : s.situacaoGravada === 'Pagamento de boleto agendado' ? s.promessaEm : ''
  return <Badge texto={`${s.situacao}${data ? ` • ${dataBR(data)}` : ''}`} tom={TOM_SITUACAO_COBRANCA[s.situacao] ?? 'zinc'} />
}

// pode registrar contato: carteira DLG, com vencido e sem acordo em andamento
export const recebeContato = (c: CobrancaV) => c.carteira === 'Cobrança DLG' && c.vencido > 0 && !SITUACOES_DE_ACORDO.includes(c.situacao)

export function RegistrarContato({ aberto, cobrancas, onFechar }: { aberto: boolean; cobrancas: CobrancaV[]; onFechar: () => void }) {
  const [x, setX] = useState({ tipo: 'WhatsApp', data: hoje(), situacao: '', observacao: '', retornoEm: '', promessaEm: '', promessaValor: '' })
  const [escolhidas, setEscolhidas] = useState<string[] | null>(null)
  const [salvando, setSalvando] = useState(false)
  const ids = escolhidas ?? cobrancas.map((c) => c.id)
  const obsObrigatoria = SITUACOES_COM_OBSERVACAO.includes(x.situacao)
  const falta = !x.situacao || !ids.length || (obsObrigatoria && !x.observacao.trim())
  const fechar = () => {
    setX({ tipo: 'WhatsApp', data: hoje(), situacao: '', observacao: '', retornoEm: '', promessaEm: '', promessaValor: '' })
    setEscolhidas(null)
    onFechar()
  }
  const salvar = async () => {
    setSalvando(true)
    const erro = await registrarContatoCobranca({ cobrancas: ids, tipo: x.tipo, data: x.data, situacao: x.situacao, observacao: x.observacao, retornoEm: x.retornoEm, promessaEm: x.promessaEm, promessaValor: Number(x.promessaValor.replace(',', '.')) || 0 })
    setSalvando(false)
    if (!erro) fechar()
  }
  return (
    <Modal
      aberto={aberto}
      titulo="Registrar cobrança"
      subtitulo="O contato fica no histórico e não se apaga"
      onFechar={fechar}
      largura="max-w-lg"
      rodape={
        <>
          <button onClick={fechar} className={btnSecundario}>Cancelar</button>
          <button onClick={salvar} disabled={falta || salvando} className={btnPrimario}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      <div className="space-y-4">
        {cobrancas.length > 1 && (
          <div>
            <p className={labelCls}>Cobranças</p>
            <div className="mt-1 space-y-1">
              {cobrancas.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-xs text-zinc-300">
                  <input type="checkbox" checked={ids.includes(c.id)} onChange={(e) => setEscolhidas(e.target.checked ? [...ids, c.id] : ids.filter((i) => i !== c.id))} />
                  {[c.codigoVenda && `Venda #${c.codigoVenda}`, c.referencia, c.conta, `${c.parcelasVencidas} vencida(s)`, brl(c.vencido)].filter(Boolean).join(' • ')}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Tipo de contato</span>
            <select value={x.tipo} onChange={(e) => setX({ ...x, tipo: e.target.value })} className={inputCls}>
              {TIPOS_CONTATO.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Data do contato</span>
            <input type="date" value={x.data} max={hoje()} onChange={(e) => setX({ ...x, data: e.target.value })} className={inputCls} />
          </label>
        </div>
        <label className="block">
          <span className={labelCls}>Status da cobrança</span>
          <select value={x.situacao} onChange={(e) => setX({ ...x, situacao: e.target.value })} className={inputCls}>
            <option value="">Escolha...</option>
            {SITUACOES_CONTATO.map((t) => (
              <option key={t} value={t}>
                {t === 'Não localizado' ? 'Cliente não localizado' : t === 'Ficha não encontrada SPC' ? 'Ficha não encontrada para envio ao SPC' : t}
              </option>
            ))}
          </select>
        </label>
        {x.situacao === 'Aguardando retorno' && (
          <label className="block">
            <span className={labelCls}>Data do retorno *</span>
            <input type="date" value={x.retornoEm} min={hoje()} onChange={(e) => setX({ ...x, retornoEm: e.target.value })} className={inputCls} />
            <span className="text-[10px] text-zinc-500">Cliente pediu retorno nesta data.</span>
          </label>
        )}
        {x.situacao === 'Pagamento de boleto agendado' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>Data do pagamento agendado *</span>
              <input type="date" value={x.promessaEm} min={hoje()} onChange={(e) => setX({ ...x, promessaEm: e.target.value })} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Valor prometido (opcional)</span>
              <input inputMode="decimal" value={x.promessaValor} onChange={(e) => setX({ ...x, promessaValor: e.target.value })} className={inputCls} placeholder="0,00" />
            </label>
            <span className="col-span-2 text-[10px] text-zinc-500">Data em que o cliente se comprometeu a pagar os boletos em aberto.</span>
          </div>
        )}
        <label className="block">
          <span className={`${labelCls} ${obsObrigatoria && !x.observacao.trim() ? 'text-red-400' : ''}`}>Observação da cobrança {obsObrigatoria && '*'}</span>
          <textarea
            rows={3}
            value={x.observacao}
            onChange={(e) => setX({ ...x, observacao: e.target.value })}
            className={inputCls}
            placeholder={obsObrigatoria ? 'Obrigatório preencher a observação para este status' : 'Ex: pediu retorno, em negociação, cliente solicitou boleto...'}
          />
          {obsObrigatoria && !x.observacao.trim() && <span className="text-[11px] text-red-400">Observação obrigatória para &quot;Cliente não localizado&quot; e &quot;Contato realizado sem acordo&quot;.</span>}
        </label>
      </div>
    </Modal>
  )
}

export function HistoricoContatos({ contatos, cobrancas }: { contatos?: ContatoV[]; cobrancas: CobrancaV[] }) {
  if (!contatos) return null
  const rotulo = (id: string) => {
    const c = cobrancas.find((y) => y.id === id)
    return c ? [c.codigoVenda && `Venda #${c.codigoVenda}`, c.conta].filter(Boolean).join(' • ') : ''
  }
  return (
    <div className="rounded-2xl border border-white/[0.06]">
      <p className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500 border-b border-white/[0.05]">Histórico de cobrança ({contatos.length})</p>
      {contatos.length === 0 ? (
        <p className="px-4 py-3 text-xs text-zinc-500">Nenhum contato registrado.</p>
      ) : (
        <div className="divide-y divide-white/[0.03] max-h-72 overflow-y-auto custom-scrollbar">
          {contatos.map((k) => (
            <div key={k.id} className="px-4 py-2.5 text-xs">
              <p className="text-white font-bold">
                {dataBR(k.data)} • {k.tipo} • {k.situacao}
                {k.retornoEm && ` • retorno ${dataBR(k.retornoEm)}`}
                {k.promessaEm && ` • pagamento ${dataBR(k.promessaEm)}${k.promessaValor ? ` (${brl(k.promessaValor)})` : ''}`}
              </p>
              {k.observacao && <p className="text-zinc-300 whitespace-pre-wrap">{k.observacao}</p>}
              <p className="text-[10px] text-zinc-500">{[rotulo(k.cobrancaId), k.registradoPorNome].filter(Boolean).join(' • ')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// mensagens prontas (do sistema antigo): abre a conversa no WhatsApp; quem envia é o cobrador
export function MensagensWhatsApp({ cobrancas }: { cobrancas: CobrancaV[] }) {
  const eu = useUsuario()
  const c = cobrancas[0]
  if (!c) return null
  const tel = cobrancas.map((x) => x.telefone).find((t) => linkWhatsApp(t))
  const nome = eu?.nome ?? 'Colaborador DLG'
  const vencidas = cobrancas.reduce((a, x) => a + x.parcelasVencidas, 0)
  const msgs = [
    { rotulo: 'Confirmar número', texto: `Olá, tudo bem? Aqui é ${nome}, eu trabalho na DLG PHOTO STUDIO. Por favor, esse telefone/contato pertence ao(a) ${c.cliente}?` },
    {
      rotulo: 'Primeira cobrança',
      texto: `Olá ${c.cliente}, tudo bem? Verificamos que existem ${vencidas} parcela(s) vencida(s) referente(s) à sua compra. Valor original em atraso: ${brl(cobrancas.reduce((a, x) => a + x.vencido, 0))}. Multa: ${brl(cobrancas.reduce((a, x) => a + x.multa, 0))}. Juros: ${brl(cobrancas.reduce((a, x) => a + x.juros, 0))}. Valor atualizado até ${dataBR(hoje())}: ${brl(cobrancas.reduce((a, x) => a + x.atualizado, 0))}. Podemos te ajudar a regularizar?`,
    },
  ]
  const abrir = (texto: string) => {
    if (tel) window.open(`${linkWhatsApp(tel)}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
    else void navigator.clipboard?.writeText(texto)
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {msgs.map((m) => (
        <button key={m.rotulo} onClick={() => abrir(m.texto)} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
          WhatsApp: {m.rotulo}
        </button>
      ))}
      {!tel && <span className="text-[10px] text-zinc-500">Sem telefone: o botão copia o texto.</span>}
    </div>
  )
}

// "Para hoje" do cobrador
export function ParaHoje({ onAbrir }: { onAbrir?: (clienteId: string, nome: string) => void }) {
  const { dados } = useParaHoje()
  const spc = useSpcPendentes()
  const lista = [
    ...(dados ?? []),
    ...spc.map((x) => ({ cobrancaId: x.cobrancaId, clienteId: '', cliente: x.cliente, conta: x.conta, vencido: x.vencido, situacao: '', pendencia: 'SPC inclusão pendente (Financeiro)', dataPendencia: x.marcadoEm })),
  ]
  const tom = (p: string): Tom => (p === 'Boleto agendado vencido' || p === 'Retorno atrasado' ? 'red' : 'yellow')
  return (
    <Panel titulo={`Para hoje (${lista.length})`} semPadding>
      {lista.length === 0 ? (
        <p className="p-6 text-xs text-zinc-500">{dados ? 'Nada pendente para hoje.' : 'Carregando...'}</p>
      ) : (
        <div className="divide-y divide-white/[0.03] max-h-96 overflow-y-auto custom-scrollbar">
          {lista.map((p) => (
            <button key={p.cobrancaId} onClick={() => p.clienteId && onAbrir?.(p.clienteId, p.cliente)} className="w-full text-left px-6 py-3 flex justify-between items-center gap-3 hover:bg-white/[0.02]">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{p.cliente}</p>
                <p className="text-[11px] text-zinc-500">{[p.conta, `${brl(p.vencido)} vencido`].join(' • ')}</p>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <Badge texto={p.pendencia} tom={tom(p.pendencia)} />
                <p className="text-[10px] text-zinc-500">{dataBR(p.dataPendencia)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}
