'use client'

import CrudPage from '@/components/erp/CrudPage'
import { pagarConta } from '@/lib/erp/store'
import { brl, hoje } from '@/lib/erp/format'

// Comissões geradas automaticamente a cada venda de e-book (Cobrança) — % do contrato da escola
export default function ComissoesPage() {
  return (
    <CrudPage
      colecao="comissoes"
      modulo="financeiro"
      setor="financeiro"
      moduloLabel="Financeiro / Comissões"
      titulo="Comissões das Escolas"
      descricao="Repasses às escolas sobre a venda de e-books aos pais. Gerados automaticamente pela Cobrança."
      podeCriar={false}
      campos={[
        { chave: 'escola', label: 'Escola', tipo: 'texto', obrigatorio: true },
        { chave: 'referencia', label: 'Referência', tipo: 'texto' },
        { chave: 'baseCalculo', label: 'Base', tipo: 'moeda' },
        { chave: 'percentual', label: '%', tipo: 'percentual' },
        { chave: 'valor', label: 'Comissão', tipo: 'moeda', obrigatorio: true },
        { chave: 'vencimento', label: 'Vencimento', tipo: 'data' },
        { chave: 'dataPagamento', label: 'Pago em', tipo: 'data', formulario: false },
      ]}
      status={{
        campo: 'status',
        tons: { 'A pagar': 'orange', Vencida: 'red', Pago: 'emerald' },
        valor: (r) => (r.status === 'A pagar' && String(r.vencimento) < hoje() ? 'Vencida' : String(r.status)),
      }}
      kpis={(rs) => {
        const soma = (st: string) => brl(rs.filter((r) => r.status === st).reduce((a, r) => a + Number(r.valor || 0), 0))
        const porEscola = new Set(rs.filter((r) => r.status === 'A pagar').map((r) => r.escola)).size
        return [
          { label: 'A pagar', valor: soma('A pagar'), tom: 'orange' },
          { label: 'Escolas com repasse', valor: porEscola, tom: 'cyan' },
          { label: 'Já pagas', valor: soma('Pago'), tom: 'emerald' },
        ]
      }}
      acoes={[
        {
          label: 'Pagar comissão',
          tom: 'emerald',
          permissao: 'editar',
          visivel: (r) => r.status === 'A pagar',
          executar: (r) => pagarConta('comissoes', r.id),
        },
      ]}
    />
  )
}
