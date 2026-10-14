'use client'

// Financeiro › Registro SPC (SQL 050), igual ao sistema antigo: SPC inclusão (marcados pela Cobrança) → "Enviar ao SPC"
// (só registra o envio) → confirmação (manual ou pela planilha oficial) → retirada solicitada → retirada confirmada.
// Conferência com a planilha oficial do SPC (Excel, aba BASE_CONSOLIDADA): cruza por CPF/CNPJ e contrato.

import { useMemo, useState } from 'react'
import { financeiroSpc, usePode, avisar } from '@/lib/erp/store'
import { conferirPlanilhaSpc, useFilaSpc } from '@/lib/erp/cobrancas'
import { brl, dataBR } from '@/lib/erp/format'
import { formatarDocumento } from '@/lib/erp/documento'
import { lerPlanilhaSpc, type LinhaSpc, type ResultadoPlanilha } from '@/lib/erp/spc'
import type { AcaoFinanceiroSpc } from '@/lib/erp/fluxos'
import { SeloConta } from '@/components/erp/ContasPessoa'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

const GRUPOS: { estado: string; rotulo: string; detalhe: string }[] = [
  { estado: 'Inclusão marcada', rotulo: 'SPC inclusão', detalhe: 'aguardando registro no SPC' },
  { estado: 'Enviado', rotulo: 'Aguardando confirmação', detalhe: 'enviado pelo Financeiro' },
  { estado: 'Divergência', rotulo: 'Divergência', detalhe: 'exige revisão' },
  { estado: 'Registrado', rotulo: 'Registrados no SPC', detalhe: 'confirmados' },
  { estado: 'Retirada solicitada', rotulo: 'Retirada solicitada', detalhe: 'esperando a planilha nova' },
]

export default function RegistroSpc() {
  const podeFazer = usePode()
  const pEditar = podeFazer('financeiro', 'editar')
  const { dados } = useFilaSpc()
  const todos = useMemo(() => (dados ?? []).filter((l) => l.spcEstado), [dados])
  const [estado, setEstado] = useState('Inclusão marcada')
  const [acao, setAcao] = useState<{ l: { cobrancaId: string; cliente: string }; tipo: AcaoFinanceiroSpc } | null>(null)
  const [obs, setObs] = useState('')
  const [conf, setConf] = useState<{ aba: string; linhas: number; na: ResultadoPlanilha[]; fora: ResultadoPlanilha[] } | null>(null)
  const [lendo, setLendo] = useState(false)

  const lista = todos.filter((l) => l.spcEstado === estado)
  const executar = async () => {
    if (!acao) return
    const erro = await financeiroSpc(acao.l.cobrancaId, acao.tipo, obs)
    if (!erro) setAcao(null)
  }
  const abrir = (l: { cobrancaId: string; cliente: string }, tipo: AcaoFinanceiroSpc) => {
    setObs('')
    setAcao({ l, tipo })
  }
  const importar = async (f: File | undefined) => {
    if (!f) return
    setLendo(true)
    try {
      const { linhas, aba } = await lerPlanilhaSpc(f)
      const r = await conferirPlanilhaSpc(linhas)
      if (r.erro) avisar(r.erro)
      else setConf({ aba, linhas: linhas.length, na: r.naPlanilha, fora: r.foraDaPlanilha })
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não consegui ler a planilha.')
    }
    setLendo(false)
  }
  const titulo: Record<AcaoFinanceiroSpc, string> = {
    enviar: 'Enviar ao SPC', confirmar: 'Confirmar o registro no SPC', divergencia: 'Registrar divergência', solicitar_retirada: 'Solicitar a retirada do SPC', confirmar_retirada: 'Confirmar a retirada do SPC',
  }
  const botoes = (l: LinhaSpc) => (
    <>
      {l.spcEstado === 'Inclusão marcada' && <button onClick={() => abrir(l, 'enviar')} className={btnPrimario}>Enviar ao SPC</button>}
      {(l.spcEstado === 'Enviado' || l.spcEstado === 'Divergência') && <button onClick={() => abrir(l, 'confirmar')} className={btnPrimario}>Confirmar registro</button>}
      {l.spcEstado === 'Enviado' && <button onClick={() => abrir(l, 'divergencia')} className={btnSecundario}>Divergência</button>}
      {(l.spcEstado === 'Registrado' || l.spcEstado === 'Divergência') && <button onClick={() => abrir(l, 'solicitar_retirada')} className={btnSecundario}>Solicitar retirada</button>}
      {l.spcEstado === 'Retirada solicitada' && <button onClick={() => abrir(l, 'confirmar_retirada')} className={btnPrimario}>Confirmar retirada</button>}
    </>
  )
  const tomResultado = (r: string) => (r.startsWith('SPC OK') ? 'emerald' : r.startsWith('Divergência') || r.startsWith('Não encontrado') ? 'red' : 'yellow')

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Financeiro / Registro SPC"
        titulo="Registro SPC"
        descricao="A Cobrança marca quem vai ao SPC. Aqui o Financeiro envia (só registra o envio), confirma o registro (na mão ou pela planilha oficial) e cuida da retirada."
      />
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        {GRUPOS.map((g) => {
          const ls = todos.filter((l) => l.spcEstado === g.estado)
          return (
            <button key={g.estado} onClick={() => setEstado(g.estado)} className={`text-left rounded-2xl ${estado === g.estado ? 'ring-1 ring-blue-500/50' : ''}`}>
              <StatCard label={g.rotulo} valor={ls.length} detalhe={`${brl(ls.reduce((s, l) => s + l.vencido, 0))} em atraso • ${g.detalhe}`} />
            </button>
          )
        })}
      </div>

      <Panel titulo={GRUPOS.find((g) => g.estado === estado)?.rotulo ?? estado} semPadding>
        {!dados ? (
          <p className="p-6 text-xs text-zinc-500">Carregando...</p>
        ) : lista.length === 0 ? (
          <EmptyState titulo="Nenhum contrato nesta situação." />
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {lista.map((l) => (
              <div key={l.cobrancaId} className="px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white flex items-center gap-2">{l.cliente} <SeloConta conta={l.conta} /></p>
                  <p className="text-[11px] text-zinc-500">
                    {[l.codigoVenda && `Contrato #${l.codigoVenda}`, l.documento && formatarDocumento(l.documento), `${l.parcelasVencidas} vencida(s)`, l.parcelaMaisAntiga && `mais antiga ${dataBR(l.parcelaMaisAntiga)}`, l.spcMarcadoEm && `marcado ${dataBR(l.spcMarcadoEm)}`, l.spcEnviadoEm && `enviado ${dataBR(l.spcEnviadoEm)}`, l.regularizada && 'regularizada'].filter(Boolean).join(' • ')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-black text-red-400">{brl(l.vencido)}</span>
                  {pEditar && botoes(l)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        titulo="Conferência com a planilha oficial do SPC"
        acoes={
          <label className={`${btnPrimario} cursor-pointer`}>
            {lendo ? 'Lendo...' : 'Importar planilha SPC (.xlsx)'}
            <input type="file" accept=".xlsx" className="hidden" disabled={lendo} onChange={(e) => { void importar(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        }
      >
        {!conf ? (
          <p className="text-xs text-zinc-500">O sistema lê a aba BASE_CONSOLIDADA e cruza cada CPF/CNPJ (e o contrato) com a carteira. Só CPF/CNPJ e contrato são enviados ao banco.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-zinc-400">Aba {conf.aba}: {conf.linhas} linha(s) lida(s).</p>
            {[['Na planilha', conf.na], ['Registrados no sistema, mas fora da planilha', conf.fora]].map(([t, rs]) => (
              <div key={t as string}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">{t as string} ({(rs as ResultadoPlanilha[]).length})</p>
                <div className="divide-y divide-white/[0.03] max-h-80 overflow-y-auto custom-scrollbar">
                  {(rs as ResultadoPlanilha[]).map((r, i) => (
                    <div key={`${r.documento}-${r.contrato}-${i}`} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="text-white font-bold">{r.cliente || formatarDocumento(r.documento)}</span>
                        <span className="text-zinc-500"> • {[r.contrato && `planilha #${r.contrato}`, r.codigoVenda && `sistema #${r.codigoVenda}`, r.contrato && r.cobrancaId && !r.contratoOk && 'contrato diferente', r.conta].filter(Boolean).join(' • ')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge texto={r.resultado} tom={tomResultado(r.resultado)} />
                        {pEditar && r.resultado === 'Confirmar registro' && <button onClick={() => abrir({ cobrancaId: r.cobrancaId, cliente: r.cliente }, 'confirmar')} className={btnSecundario}>Confirmar</button>}
                        {pEditar && r.resultado === 'Saiu do SPC: confirmar retirada' && <button onClick={() => abrir({ cobrancaId: r.cobrancaId, cliente: r.cliente }, 'confirmar_retirada')} className={btnSecundario}>Confirmar retirada</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal
        aberto={!!acao}
        titulo={acao ? titulo[acao.tipo] : ''}
        subtitulo={acao?.l.cliente ?? ''}
        onFechar={() => setAcao(null)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setAcao(null)} className={btnSecundario}>Cancelar</button>
            <button onClick={executar} disabled={acao?.tipo === 'divergencia' && !obs.trim()} className={btnPrimario}>Confirmar</button>
          </>
        }
      >
        <label className="block">
          <span className={labelCls}>Observação {acao?.tipo === 'divergencia' ? '(obrigatória)' : '(opcional)'}</span>
          <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} className={inputCls} />
        </label>
        {acao?.tipo === 'enviar' && <p className="text-[11px] text-zinc-500 mt-2">&quot;Enviar ao SPC&quot; só registra o envio. O registro definitivo é confirmado depois (na mão ou pela planilha).</p>}
        {acao?.tipo === 'confirmar' && <p className="text-[11px] text-zinc-500 mt-2">A categoria da cobrança vira Registro SPC (fica no histórico de categorias).</p>}
      </Modal>
    </div>
  )
}
