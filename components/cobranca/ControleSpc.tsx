'use client'

// Cobrança › Controle SPC (SQL 050), igual ao "Controle — clientes para envio ao SPC" do sistema antigo:
// elegíveis da carteira DLG (fora do Registro SPC). Para cada um: aviso antes do SPC por WhatsApp (um por vez),
// "Cliente sem interesse — enviar ao SPC" (o Financeiro envia), ficha não encontrada (fila de exceção) e
// "Ficha localizada — liberar para SPC". Depois de marcado, acompanha o estado (enviado, registrado...).

import { useMemo, useState } from 'react'
import { cobrancaSpc, usePode, useUsuario } from '@/lib/erp/store'
import { useFilaSpc } from '@/lib/erp/cobrancas'
import { brl, dataBR } from '@/lib/erp/format'
import { formatarDocumento } from '@/lib/erp/documento'
import { linkWhatsApp } from '@/lib/erp/rebolo'
import type { LinhaSpc } from '@/lib/erp/spc'
import type { AcaoCobrancaSpc } from '@/lib/erp/fluxos'
import { SeloConta } from '@/components/erp/ContasPessoa'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

type Aba = 'elegiveis' | 'ficha' | 'fluxo'

export default function ControleSpc() {
  const podeFazer = usePode()
  const pEditar = podeFazer('cobranca', 'criar') || podeFazer('cobranca', 'editar')
  const eu = useUsuario()
  const { dados } = useFilaSpc()
  const todos = useMemo(() => dados ?? [], [dados])
  const [aba, setAba] = useState<Aba>('elegiveis')
  const [busca, setBusca] = useState('')
  const [avisados, setAvisados] = useState<Set<string>>(new Set())
  const [acao, setAcao] = useState<{ l: LinhaSpc; tipo: AcaoCobrancaSpc } | null>(null)
  const [obs, setObs] = useState('')

  const elegiveis = todos.filter((l) => !l.spcEstado && l.podeIrSpc && l.situacao !== 'Ficha não encontrada SPC')
  const ficha = todos.filter((l) => l.situacao === 'Ficha não encontrada SPC' && !l.spcEstado)
  const fluxo = todos.filter((l) => l.spcEstado)
  const termo = busca.trim().toLowerCase()
  const lista = (aba === 'elegiveis' ? elegiveis : aba === 'ficha' ? ficha : fluxo).filter(
    (l) => !termo || l.cliente.toLowerCase().includes(termo) || l.codigoVenda.includes(termo) || (termo.replace(/\D/g, '') && l.documento.includes(termo.replace(/\D/g, ''))),
  )

  const aviso = (l: LinhaSpc) =>
    `Olá ${l.cliente}, tudo bem?\n\nAqui é ${eu?.nome ?? 'a Cobrança'}, da DLG.\n\nVerificamos que você possui ${l.parcelasVencidas} parcela(s) vencida(s)${l.codigoVenda ? ` (contrato #${l.codigoVenda})` : ''}.\n\n💰 Valor das parcelas vencidas: ${brl(l.vencido)}\n📋 Valor total do contrato em aberto: ${brl(l.totalDivida)}\n\nEstamos abertos para renegociação, caso tenha interesse em regularizar.\n\nCaso não haja interesse, seu nome será encaminhado ao SPC (Serviço de Proteção ao Crédito).\n\nFico no aguardo do seu retorno!`
  const avisar = (l: LinhaSpc) => {
    const link = linkWhatsApp(l.telefone)
    if (link) window.open(`${link}?text=${encodeURIComponent(aviso(l))}`, '_blank', 'noopener')
    else void navigator.clipboard?.writeText(aviso(l))
    setAvisados((s) => new Set(s).add(l.cobrancaId))
  }
  const proximo = elegiveis.filter((l) => linkWhatsApp(l.telefone) && !avisados.has(l.cobrancaId)).sort((a, b) => a.cliente.localeCompare(b.cliente, 'pt-BR'))[0]

  const executar = async () => {
    if (!acao) return
    const erro = await cobrancaSpc(acao.l.cobrancaId, acao.tipo, obs)
    if (!erro) setAcao(null)
  }
  const titulo: Record<AcaoCobrancaSpc, string> = { incluir: 'Cliente sem interesse — enviar ao SPC', ficha_localizada: 'Ficha localizada — liberar para SPC', desmarcar: 'Desmarcar a inclusão no SPC' }

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Cobrança / Controle SPC"
        titulo="Controle — clientes para envio ao SPC"
        descricao="Elegíveis da carteira DLG (2 boletos vencidos, 61 dias, CPF/CNPJ válido, fora do Registro SPC). A Cobrança marca; quem envia e retira é o Financeiro."
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard label="Elegíveis para o SPC" valor={elegiveis.length} detalhe={`${brl(elegiveis.reduce((s, l) => s + l.vencido, 0))} vencido`} tom={elegiveis.length ? 'yellow' : 'zinc'} />
        <StatCard label="Ficha não encontrada" valor={ficha.length} detalhe="fila de exceção da Cobrança" tom={ficha.length ? 'red' : 'zinc'} />
        <StatCard label="No fluxo do SPC" valor={fluxo.length} detalhe={`${fluxo.filter((l) => l.spcEstado === 'Inclusão marcada').length} aguardando o envio do Financeiro`} />
      </div>
      <Panel
        titulo="Clientes"
        semPadding
        acoes={<input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, venda ou CPF..." className={`campo-busca ${inputCls} w-64`} />}
      >
        <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05]">
          <div className="flex flex-wrap gap-2">
            {([['elegiveis', `Elegíveis (${elegiveis.length})`], ['ficha', `Ficha não encontrada (${ficha.length})`], ['fluxo', `No fluxo do SPC (${fluxo.length})`]] as [Aba, string][]).map(([id, r]) => (
              <button key={id} onClick={() => setAba(id)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border ${aba === id ? 'border-blue-500/50 text-blue-300 bg-blue-500/10' : 'border-white/10 text-zinc-400'}`}>
                {r}
              </button>
            ))}
          </div>
          {aba === 'elegiveis' && proximo && (
            <button onClick={() => avisar(proximo)} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
              WhatsApp: avisar o próximo ({proximo.cliente.split(' ')[0]})
            </button>
          )}
        </div>
        {!dados ? (
          <p className="p-6 text-xs text-zinc-500">Carregando...</p>
        ) : lista.length === 0 ? (
          <EmptyState titulo="Nenhum cliente neste grupo." />
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {lista.map((l) => (
              <div key={l.cobrancaId} className="px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white flex flex-wrap items-center gap-2">
                    {l.cliente} <SeloConta conta={l.conta} />
                    {l.spcEstado && <Badge texto={l.spcEstado} tom={l.spcEstado === 'Registrado' ? 'red' : l.spcEstado === 'Divergência' ? 'red' : 'yellow'} />}
                    {avisados.has(l.cobrancaId) && <Badge texto="Avisado" tom="emerald" />}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {[l.codigoVenda && `Venda #${l.codigoVenda}`, l.documento && formatarDocumento(l.documento), `${l.parcelasVencidas} vencida(s)`, `${l.diasAtraso} dias`, l.parcelaMaisAntiga && `mais antiga ${dataBR(l.parcelaMaisAntiga)}`, l.categoria, l.situacao].filter(Boolean).join(' • ')}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-black text-red-400">{brl(l.vencido)}</span>
                  {aba === 'elegiveis' && (
                    <button onClick={() => avisar(l)} className={btnSecundario}>{linkWhatsApp(l.telefone) ? 'WhatsApp' : 'Copiar aviso'}</button>
                  )}
                  {pEditar && aba === 'elegiveis' && <button onClick={() => { setObs(''); setAcao({ l, tipo: 'incluir' }) }} className={btnPrimario}>Sem interesse — enviar ao SPC</button>}
                  {pEditar && aba === 'ficha' && <button onClick={() => { setObs(''); setAcao({ l, tipo: 'ficha_localizada' }) }} className={btnPrimario}>Ficha localizada — liberar</button>}
                  {pEditar && l.spcEstado === 'Inclusão marcada' && <button onClick={() => { setObs(''); setAcao({ l, tipo: 'desmarcar' }) }} className={btnSecundario}>Desmarcar</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <p className="text-[11px] text-zinc-500">
        Ficha não encontrada: marque pelo &quot;Registrar cobrança&quot; na ficha do cliente (Inadimplência). Cliente que não respondeu: &quot;Aguardando retorno&quot;. Interessado: &quot;Efetuar renegociação&quot;.
      </p>

      <Modal
        aberto={!!acao}
        titulo={acao ? titulo[acao.tipo] : ''}
        subtitulo={acao ? `${acao.l.cliente} • ${brl(acao.l.vencido)} vencido` : ''}
        onFechar={() => setAcao(null)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setAcao(null)} className={btnSecundario}>Cancelar</button>
            <button onClick={executar} className={btnPrimario}>Confirmar</button>
          </>
        }
      >
        <label className="block">
          <span className={labelCls}>Observação (opcional)</span>
          <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} className={inputCls} />
        </label>
        {acao?.tipo === 'incluir' && <p className="text-[11px] text-zinc-500 mt-2">Fica registrado como contato &quot;sem acordo&quot;. O banco confere de novo se a cobrança ainda é elegível.</p>}
      </Modal>
    </div>
  )
}
