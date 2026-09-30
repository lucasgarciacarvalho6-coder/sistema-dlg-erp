'use client'

import { useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import CrudPage from '@/components/erp/CrudPage'
import { CATEGORIAS_OPERACIONAIS } from '@/lib/erp/config'
import { devolverFechamento, pagarConta, useErp } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { brl, mesAtual } from '@/lib/erp/format'
import { Modal, btnPrimario, btnSecundario, labelCls } from '@/components/erp/ui'

const OPERACIONAIS: readonly string[] = CATEGORIAS_OPERACIONAIS

// Pagamentos que chegam dos fechamentos do Operacional (bonificação das escolas,
// ajudantes, vendedores PJ e freelancers), já com os dados PIX de cada favorecido.
// Se algo vier errado, o Financeiro devolve o fechamento para a Operações corrigir (com o motivo).
export default function PagamentosOperacionaisPage() {
  const [devolver, setDevolver] = useState<Registro | null>(null)
  return (
    <>
      <CrudPage
        colecao="contas_pagar"
        modulo="financeiro"
        setor="financeiro"
        moduloLabel="Financeiro / Pagamentos Operacionais"
        titulo="Pagamentos Operacionais"
        descricao="Enviados pelo Operacional no fechamento: bonificação das escolas, ajudantes, vendedores PJ e freelancers. Faça o PIX e registre o pagamento. Se algo estiver errado, devolva para a Operações corrigir."
        podeCriar={false}
        podeExcluir={false}
        filtro={(r) => OPERACIONAIS.includes(String(r.categoria))}
        campos={[
          {
            chave: 'favorecido',
            label: 'Favorecido',
            tipo: 'texto',
            exibir: (r) => (
              <span className="block whitespace-normal max-w-[220px]">
                {String(r.favorecido || r.fornecedor || '—')}
                <span className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-0.5">{String(r.categoria)}</span>
              </span>
            ),
          },
          { chave: 'categoria', label: 'Tipo', tipo: 'texto', formulario: false, tabela: false },
          { chave: 'descricao', label: 'Referente a', tipo: 'texto', formulario: false, exibir: (r) => <span className="text-xs whitespace-normal block min-w-[220px] max-w-sm">{String(r.descricao)}</span> },
          {
            chave: 'pixChave',
            label: 'PIX',
            tipo: 'texto',
            exibir: (r) => (
              <span className="block">
                <span className="font-mono text-xs text-blue-400">{String(r.pixChave || '—')}</span>
                <span className="block text-[11px] text-zinc-500">{String(r.pixBanco || '')}</span>
              </span>
            ),
          },
          { chave: 'pixBanco', label: 'Banco', tipo: 'texto', tabela: false },
          { chave: 'valor', label: 'Valor', tipo: 'moeda', formulario: false, exibir: (r) => <span className="text-white font-black">{Number(r.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span> },
        ]}
        status={{ campo: 'status', tons: { 'A pagar': 'orange', Pago: 'emerald', 'Aguardando aprovação': 'yellow', Rejeitada: 'zinc' } }}
        kpis={(rs) => {
          const soma = (f: (r: (typeof rs)[number]) => boolean) => brl(rs.filter(f).reduce((a, r) => a + Number(r.valor || 0), 0))
          return [
            { label: 'A pagar', valor: soma((r) => r.status === 'A pagar'), tom: 'orange', detalhe: `${rs.filter((r) => r.status === 'A pagar').length} PIX pendente(s)` },
            { label: 'Bonificação escolas (a pagar)', valor: soma((r) => r.status === 'A pagar' && r.categoria === 'Bonificação escola'), tom: 'cyan' },
            { label: 'Vendedores e freelancers (a pagar)', valor: soma((r) => r.status === 'A pagar' && (r.categoria === 'Vendedor PJ' || r.categoria === 'Freelancer')), tom: 'violet' },
            { label: 'Pagos no mês', valor: soma((r) => r.status === 'Pago' && String(r.dataPagamento).startsWith(mesAtual())), tom: 'emerald' },
          ]
        }}
        acoes={[
          {
            label: 'PIX feito • registrar',
            tom: 'emerald',
            permissao: 'editar',
            visivel: (r) => r.status === 'A pagar',
            executar: (r) => pagarConta('contas_pagar', r.id),
          },
          {
            label: '↩ Devolver p/ Operações',
            tom: 'orange',
            permissao: 'editar',
            visivel: (r) => !!r.fechamentoId && (r.status === 'A pagar' || r.status === 'Aguardando aprovação'),
            executar: (r) => setDevolver(r),
          },
        ]}
      />
      {devolver && <DevolverFechamento conta={devolver} onFechar={() => setDevolver(null)} />}
    </>
  )
}

// Caixa da devolução: mostra tudo o que volta junto (o fechamento inteiro) e pede o motivo
function DevolverFechamento({ conta, onFechar }: { conta: Registro; onFechar: () => void }) {
  const s = useErp()
  const fechamento = colecao(s, 'fechamentos').find((f) => f.id === conta.fechamentoId)
  const doFechamento = colecao(s, 'contas_pagar').filter((c) => c.fechamentoId === conta.fechamentoId)
  const temPago = doFechamento.some((c) => c.status === 'Pago')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const confirmar = async () => {
    if (!motivo.trim()) return setErro('Escreva o motivo: é o que a Operações vai ler para corrigir.')
    setSalvando(true)
    const e = await devolverFechamento(conta.id, motivo)
    setSalvando(false)
    if (e) return setErro(e)
    onFechar()
  }

  return (
    <Modal
      aberto
      titulo="Devolver para a Operações"
      subtitulo={String(fechamento?.referencia ?? conta.descricao)}
      onFechar={onFechar}
      largura="max-w-2xl"
      rodape={
        <>
          <button onClick={onFechar} className={btnSecundario}>Voltar</button>
          <button onClick={confirmar} disabled={salvando || temPago} className={`${btnPrimario} disabled:opacity-50`}>
            {salvando ? 'Devolvendo…' : 'Devolver p/ Operações'}
          </button>
        </>
      }
    >
      <p className="text-sm text-zinc-300">
        O fechamento volta <strong className="text-white">inteiro</strong> para a Operações corrigir. Estes pagamentos saem da lista e voltam corrigidos quando ela reenviar:
      </p>
      <div className="bg-black/40 border border-white/[0.06] rounded-2xl divide-y divide-white/[0.04]">
        {doFechamento.map((c) => (
          <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="block text-white font-bold truncate">{String(c.favorecido || c.fornecedor)}</span>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                {String(c.categoria)} • PIX {String(c.pixChave || '—')}
              </span>
            </span>
            <span className="text-right shrink-0">
              <span className="block text-white font-black">{brl(Number(c.valor) || 0)}</span>
              <span className={`block text-[10px] font-bold uppercase tracking-widest ${c.status === 'Pago' ? 'text-emerald-400' : 'text-orange-400'}`}>{String(c.status)}</span>
            </span>
          </div>
        ))}
      </div>
      {temPago ? (
        <p className="text-xs font-bold text-red-400">Já existe PIX pago neste fechamento: não dá para devolver (para ninguém receber duas vezes).</p>
      ) : (
        <div className="space-y-2">
          <label className={labelCls}>Motivo da devolução (a Operações vai ver)</label>
          <textarea
            value={motivo}
            onChange={(e) => (setMotivo(e.target.value), setErro(''))}
            rows={3}
            autoFocus
            placeholder="Ex.: chave PIX da Marilza está errada; confirmar o número de fichas da escola."
            className="w-full bg-black/50 border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500/50 resize-none"
          />
        </div>
      )}
      {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
    </Modal>
  )
}
