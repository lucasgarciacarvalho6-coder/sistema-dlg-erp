'use client'

import CrudPage from '@/components/erp/CrudPage'
import { addDias, brl, hoje } from '@/lib/erp/format'

// Acordos de negociação. Todo acordo novo vai para aprovação da Gerência.
export default function AcordosPage() {
  return (
    <CrudPage
      colecao="acordos"
      modulo="cobranca"
      setor="cobranca"
      moduloLabel="Cobrança / Negociação"
      titulo="Acordos"
      descricao="Negociações com responsáveis em atraso. Novos acordos aguardam aprovação da Gerência antes de ficarem ativos."
      rotuloNovo="Novo acordo"
      campos={[
        { chave: 'cliente', label: 'Responsável', tipo: 'texto', obrigatorio: true },
        { chave: 'escola', label: 'Escola', tipo: 'texto' },
        { chave: 'telefone', label: 'Telefone', tipo: 'telefone', tabela: false },
        { chave: 'valorOriginal', label: 'Valor original', tipo: 'moeda', obrigatorio: true },
        { chave: 'valorAcordo', label: 'Valor acordado', tipo: 'moeda', obrigatorio: true },
        { chave: 'parcelas', label: 'Parcelas', tipo: 'numero', obrigatorio: true },
        { chave: 'primeiroVencimento', label: '1º vencimento', tipo: 'data', padrao: () => addDias(hoje(), 7) },
        { chave: 'status', label: 'Status', tipo: 'texto', formulario: false, tabela: false, padrao: () => 'Aguardando aprovação' },
      ]}
      status={{ campo: 'status', tons: { 'Aguardando aprovação': 'yellow' } }}
      kpis={(rs) => [
        { label: 'Acordos ativos', valor: rs.filter((r) => r.status === 'Ativo').length, tom: 'emerald' },
        { label: 'Aguardando aprovação', valor: rs.filter((r) => r.status === 'Aguardando aprovação').length, tom: 'yellow' },
        { label: 'Valor negociado', valor: brl(rs.filter((r) => r.status !== 'Rejeitado').reduce((a, r) => a + Number(r.valorAcordo || 0), 0)), tom: 'blue' },
      ]}
    />
  )
}
