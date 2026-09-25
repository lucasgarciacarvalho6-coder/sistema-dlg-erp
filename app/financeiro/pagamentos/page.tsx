'use client'

import CrudPage from '@/components/erp/CrudPage'
import { CATEGORIAS_OPERACIONAIS } from '@/lib/erp/config'
import { pagarConta } from '@/lib/erp/store'
import { brl, mesAtual } from '@/lib/erp/format'

const OPERACIONAIS: readonly string[] = CATEGORIAS_OPERACIONAIS

// Pagamentos que chegam dos fechamentos do Operacional (bonificação das escolas,
// ajudantes, vendedores PJ e freelancers), já com os dados PIX de cada favorecido.
export default function PagamentosOperacionaisPage() {
  return (
    <CrudPage
      colecao="contas_pagar"
      modulo="financeiro"
      setor="financeiro"
      moduloLabel="Financeiro / Pagamentos Operacionais"
      titulo="Pagamentos Operacionais"
      descricao="Enviados pelo Operacional no fechamento: bonificação das escolas, ajudantes, vendedores PJ e freelancers. Faça o PIX e registre o pagamento."
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
      ]}
    />
  )
}
