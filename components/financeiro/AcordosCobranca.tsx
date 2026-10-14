'use client'

// Financeiro › Acordos da Cobrança (SQL 048) — igual à "Confirmação de Entradas de Renegociação" do sistema antigo:
// o Financeiro confere a entrada (valor e forma EXATOS), devolve ao cobrador quando não bate, reverte, efetiva
// (depois de gerar os boletos no Conta Azul, por fora) e marca o acordo quebrado e os boletos enviados.

import { useMemo, useState } from 'react'
import { financeiroAcordo, usePode } from '@/lib/erp/store'
import { useAcordosFinanceiro } from '@/lib/erp/cobrancas'
import { brl, dataBR, hoje } from '@/lib/erp/format'
import { formatarDocumento } from '@/lib/erp/documento'
import { FORMAS_ENTRADA, type AcordoFin } from '@/lib/erp/acordo'
import type { AcaoFinanceiroAcordo } from '@/lib/erp/fluxos'
import { SeloConta } from '@/components/erp/ContasPessoa'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

type Filtro = 'aguardando' | 'vencidas' | 'confirmados' | 'efetivadas' | 'boletos' | 'quebradas'
const FILTROS: { id: Filtro; rotulo: string; passa: (a: AcordoFin) => boolean }[] = [
  { id: 'aguardando', rotulo: 'Aguardando', passa: (a) => a.situacao === 'Aguardando entrada' },
  { id: 'vencidas', rotulo: 'Vencidas', passa: (a) => a.entradaVencida },
  { id: 'confirmados', rotulo: 'Confirmados', passa: (a) => a.situacao === 'Entrada confirmada' },
  { id: 'efetivadas', rotulo: 'Efetivadas', passa: (a) => a.situacao === 'Efetivada' },
  { id: 'boletos', rotulo: 'Boletos para enviar', passa: (a) => a.situacao === 'Efetivada' && !a.boletosEnviadosEm && !a.quitacaoAVista },
  { id: 'quebradas', rotulo: 'Quebradas', passa: (a) => a.situacao === 'Quebrada' },
]
const TOM: Record<string, 'yellow' | 'emerald' | 'red' | 'zinc'> = { 'Aguardando entrada': 'yellow', 'Entrada confirmada': 'emerald', Efetivada: 'emerald', Quebrada: 'red' }

export default function AcordosCobranca({ modo = 'financeiro' }: { modo?: 'financeiro' | 'cobranca' }) {
  const podeFazer = usePode()
  const pEditar = podeFazer('financeiro', 'editar')
  const { dados } = useAcordosFinanceiro()
  const todos = useMemo(() => dados ?? [], [dados])
  const [filtro, setFiltro] = useState<Filtro>('aguardando')
  const [busca, setBusca] = useState('')
  const [acao, setAcao] = useState<{ a: AcordoFin; tipo: AcaoFinanceiroAcordo } | null>(null)
  const [form, setForm] = useState({ valor: '', forma: 'PIX', data: hoje(), motivo: '' })
  const [salvando, setSalvando] = useState(false)

  const termo = busca.trim().toLowerCase()
  const lista = todos.filter(
    (a) =>
      FILTROS.find((f) => f.id === filtro)!.passa(a) &&
      (!termo || a.cliente.toLowerCase().includes(termo) || a.codigoVenda.includes(termo) || a.documento.includes(termo.replace(/\D/g, '') || '§')),
  )
  const aguardando = todos.filter((a) => a.situacao === 'Aguardando entrada')
  const vencidas = todos.filter((a) => a.entradaVencida)
  const boletos = todos.filter(FILTROS[4].passa)

  const abrir = (a: AcordoFin, tipo: AcaoFinanceiroAcordo) => {
    setForm({ valor: a.entrada.toFixed(2).replace('.', ','), forma: a.entradaForma || 'PIX', data: hoje(), motivo: '' })
    setAcao({ a, tipo })
  }
  const executar = async (a: AcordoFin, tipo: AcaoFinanceiroAcordo) => {
    setSalvando(true)
    const erro = await financeiroAcordo(a.id, tipo, { valor: Number(form.valor.replace(/\./g, '').replace(',', '.')) || 0, forma: form.forma, data: form.data, motivo: form.motivo })
    setSalvando(false)
    if (!erro) setAcao(null)
  }

  const precisaMotivo = acao && ['devolver', 'reverter', 'quebrar'].includes(acao.tipo)
  const titulos: Record<AcaoFinanceiroAcordo, string> = {
    confirmar: 'Confirmar a entrada', devolver: 'Devolver ao cobrador', reverter: 'Reverter a confirmação', efetivar: 'Efetivar a renegociação',
    quebrar: 'Entrada não recebida / acordo quebrado', boletos_enviados: 'Boletos enviados',
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo={modo === 'cobranca' ? 'Cobrança / Acordos' : 'Financeiro / Acordos da Cobrança'}
        titulo={modo === 'cobranca' ? 'Acordos' : 'Confirmação de entradas de renegociação'}
        descricao={
          modo === 'cobranca'
            ? 'Os acordos fechados e em que pé estão no Financeiro (aguardando a entrada, confirmados, efetivados, quebrados). O Financeiro confere; aqui é só consulta.'
            : 'O cobrador fecha o acordo e entrega a ficha impressa. Aqui o Financeiro confere a entrada (valor e forma exatos), efetiva depois de gerar os boletos no Conta Azul e marca os boletos enviados.'
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard label="Entradas pendentes de confirmação" valor={aguardando.length} detalhe={brl(aguardando.reduce((s, a) => s + a.entrada, 0))} tom={aguardando.length ? 'yellow' : 'zinc'} />
        <StatCard label="Entradas vencidas sem conferência" valor={vencidas.length} detalhe="o prazo da entrada passou" tom={vencidas.length ? 'red' : 'zinc'} />
        <StatCard label="Boletos para enviar" valor={boletos.length} detalhe="acordos efetivados" tom={boletos.length ? 'yellow' : 'zinc'} />
      </div>

      <Panel
        titulo="Acordos"
        semPadding
        acoes={<input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por cliente, venda ou CPF/CNPJ..." className={`campo-busca ${inputCls} w-72`} />}
      >
        <div className="px-6 py-3 flex flex-wrap gap-2 border-b border-white/[0.05]">
          {FILTROS.map((f) => {
            const n = todos.filter(f.passa)
            return (
              <button key={f.id} onClick={() => setFiltro(f.id)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border ${filtro === f.id ? 'border-blue-500/50 text-blue-300 bg-blue-500/10' : 'border-white/10 text-zinc-400'}`}>
                {f.rotulo} ({n.length}){f.id === 'aguardando' && n.length ? ` • ${brl(n.reduce((s, a) => s + a.entrada, 0))}` : ''}
              </button>
            )
          })}
        </div>
        {!dados ? (
          <p className="p-6 text-xs text-zinc-500">Carregando...</p>
        ) : lista.length === 0 ? (
          <EmptyState titulo="Nenhum acordo neste estado." />
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {lista.map((a) => (
              <div key={a.id} className="px-6 py-4 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-bold text-white flex flex-wrap items-center gap-2">
                    {a.cliente} <SeloConta conta={a.conta} /> <Badge texto={a.situacao} tom={TOM[a.situacao] ?? 'zinc'} />
                    {a.entradaVencida && <Badge texto="Entrada vencida" tom="red" />}
                    {a.estavaSpc && <Badge texto="SPC" tom="zinc" />}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {[a.codigoVenda && `Venda #${a.codigoVenda}`, a.documento && formatarDocumento(a.documento), `versão ${a.versao}`, `cobrador: ${a.criadoPorNome}`, a.fichaImpressoes ? `ficha impressa ${a.fichaImpressoes}x` : 'ficha não impressa'].filter(Boolean).join(' • ')}
                  </p>
                  <p className="text-xs text-zinc-300">
                    Entrada <strong className="text-white">{brl(a.entrada)}</strong> • {a.entradaForma || '—'} • prazo {dataBR(a.entradaPrazo)} • pagador {a.pagador || '—'}
                    {a.entradaRecebidaEm && ` • recebida em ${dataBR(a.entradaRecebidaEm)}`}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {a.quitacaoAVista ? 'Quitação à vista' : `${a.parcelasQtd}x de ${brl(a.parcelaValor)} • ${a.formaPagamento} • 1º vencimento ${dataBR(a.primeiroVencimento)}`} • total {brl(a.totalAPagar)}
                    {a.desconto > 0 && ` • desconto ${brl(a.desconto)}`}
                  </p>
                  {a.observacao && <p className="text-[11px] text-zinc-500">Obs. cobrança: {a.observacao}</p>}
                  {a.motivo && <p className="text-[11px] text-red-300">Motivo: {a.motivo}</p>}
                  {a.boletosEnviadosEm && <p className="text-[11px] text-emerald-400">Boletos enviados em {dataBR(a.boletosEnviadosEm)}</p>}
                </div>
                {pEditar && (
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {a.situacao === 'Aguardando entrada' && (
                      <>
                        <button onClick={() => abrir(a, 'devolver')} className={btnSecundario}>Devolver ao cobrador</button>
                        <button onClick={() => abrir(a, 'quebrar')} className={btnSecundario}>Entrada não recebida</button>
                        {a.entrada > 0 && <button onClick={() => abrir(a, 'confirmar')} className={btnPrimario}>Confirmar entrada</button>}
                      </>
                    )}
                    {a.situacao === 'Entrada confirmada' && (
                      <>
                        <button onClick={() => abrir(a, 'reverter')} className={btnSecundario}>Reverter confirmação</button>
                        <button onClick={() => abrir(a, 'efetivar')} className={btnPrimario}>Efetivar</button>
                      </>
                    )}
                    {a.situacao === 'Efetivada' && !a.quitacaoAVista && (
                      <button onClick={() => executar(a, 'boletos_enviados')} className={a.boletosEnviadosEm ? btnSecundario : btnPrimario}>
                        {a.boletosEnviadosEm ? 'Desmarcar envio' : 'Marcar boletos enviados'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal
        aberto={!!acao}
        titulo={acao ? titulos[acao.tipo] : ''}
        subtitulo={acao ? `${acao.a.cliente} • acordo versão ${acao.a.versao}` : ''}
        onFechar={() => setAcao(null)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setAcao(null)} className={btnSecundario}>Cancelar</button>
            <button onClick={() => acao && executar(acao.a, acao.tipo)} disabled={salvando || (!!precisaMotivo && form.motivo.trim().length < 8)} className={btnPrimario}>
              {salvando ? 'Salvando...' : 'Confirmar'}
            </button>
          </>
        }
      >
        {acao?.tipo === 'confirmar' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">
              Combinado: <strong className="text-white">{brl(acao.a.entrada)}</strong> em <strong className="text-white">{acao.a.entradaForma}</strong>. O valor e a forma têm que ser exatamente esses; se não bater, use &quot;Devolver ao cobrador&quot;.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className={labelCls}>Valor recebido</span>
                <input inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>Forma</span>
                <select value={form.forma} onChange={(e) => setForm({ ...form, forma: e.target.value })} className={inputCls}>
                  {FORMAS_ENTRADA.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Data real do recebimento</span>
                <input type="date" max={hoje()} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className={inputCls} />
              </label>
            </div>
            {acao.a.quitacaoAVista && <p className="text-[11px] text-emerald-400">Quitação à vista: confirmar já efetiva o acordo.</p>}
          </div>
        )}
        {acao?.tipo === 'efetivar' && (
          <p className="text-sm text-zinc-300">
            Os boletos do acordo já foram gerados no Conta Azul? Ao efetivar, as parcelas em aberto da dívida ficam <strong className="text-white">em acordo</strong> e entram{' '}
            <strong className="text-white">{acao.a.parcelasQtd} parcela(s) de {brl(acao.a.parcelaValor)}</strong> a partir de {dataBR(acao.a.primeiroVencimento)}, mais a entrada já paga.
          </p>
        )}
        {precisaMotivo && (
          <label className="block">
            <span className={labelCls}>Motivo (obrigatório)</span>
            <textarea rows={3} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} className={inputCls} placeholder="Pelo menos 8 letras" />
          </label>
        )}
      </Modal>
    </div>
  )
}
