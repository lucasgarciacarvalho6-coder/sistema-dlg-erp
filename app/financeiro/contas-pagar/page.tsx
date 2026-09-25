'use client'

import CrudPage from '@/components/erp/CrudPage'
import { VALOR_APROVACAO_CONTA } from '@/lib/erp/config'
import { pagarConta } from '@/lib/erp/store'
import { opcoesColecao } from '@/lib/erp/opcoes'
import { brl, hoje } from '@/lib/erp/format'

export default function ContasPagarPage() {
  return (
    <CrudPage
      colecao="contas_pagar"
      modulo="financeiro"
      setor="financeiro"
      moduloLabel="Financeiro / Contas a Pagar"
      titulo="Contas a Pagar"
      descricao={`Despesas da operação. Contas a partir de ${brl(VALOR_APROVACAO_CONTA)} vão automaticamente para aprovação da Gerência.`}
      rotuloNovo="Nova conta"
      campos={[
        { chave: 'descricao', label: 'Descrição', tipo: 'texto', obrigatorio: true },
        { chave: 'fornecedor', label: 'Fornecedor', tipo: 'select', opcoes: opcoesColecao('fornecedores', 'nome') },
        { chave: 'categoria', label: 'Categoria', tipo: 'select', opcoes: ['Produção', 'Operacional', 'Administrativo', 'Investimento', 'Impostos'], obrigatorio: true },
        { chave: 'valor', label: 'Valor', tipo: 'moeda', obrigatorio: true },
        { chave: 'vencimento', label: 'Vencimento', tipo: 'data', obrigatorio: true },
        { chave: 'dataPagamento', label: 'Pago em', tipo: 'data', formulario: false },
        { chave: 'status', label: 'Status', tipo: 'texto', formulario: false, tabela: false, padrao: () => 'A pagar' },
      ]}
      status={{
        campo: 'status',
        tons: { 'A pagar': 'orange', Vencida: 'red', Pago: 'emerald', 'Aguardando aprovação': 'yellow', Rejeitada: 'zinc' },
        valor: (r) => (r.status === 'A pagar' && String(r.vencimento) < hoje() ? 'Vencida' : String(r.status)),
      }}
      kpis={(rs) => {
        const soma = (f: (r: (typeof rs)[number]) => boolean) => brl(rs.filter(f).reduce((a, r) => a + Number(r.valor || 0), 0))
        return [
          { label: 'Em aberto', valor: soma((r) => r.status === 'A pagar'), tom: 'orange' },
          { label: 'Vencidas', valor: soma((r) => r.status === 'A pagar' && String(r.vencimento) < hoje()), tom: 'red' },
          { label: 'Aguardando aprovação', valor: soma((r) => r.status === 'Aguardando aprovação'), tom: 'yellow' },
          { label: 'Pagas', valor: soma((r) => r.status === 'Pago'), tom: 'emerald' },
        ]
      }}
      acoes={[
        {
          label: 'Registrar pagamento',
          tom: 'emerald',
          permissao: 'editar',
          visivel: (r) => r.status === 'A pagar',
          executar: (r) => pagarConta('contas_pagar', r.id),
        },
      ]}
    />
  )
}
