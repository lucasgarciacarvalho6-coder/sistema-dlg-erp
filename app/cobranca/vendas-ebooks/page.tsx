'use client'

import CrudPage from '@/components/erp/CrudPage'
import { useSessao } from '@/lib/erp/store'
import { opcoesColecao, opcoesEquipe, usuarioDoSetor } from '@/lib/erp/opcoes'
import { brl, mesAtual } from '@/lib/erp/format'
import { colecao } from '@/lib/erp/metrics'

// Venda de e-book aos pais. Ao salvar: lança a meta do cobrador, gera as parcelas
// em Contas a Receber e a comissão da escola no Financeiro.
export default function VendasEbooksPage() {
  const sessao = useSessao()
  return (
    <CrudPage
      colecao="vendas_ebooks"
      modulo="cobranca"
      setor="cobranca"
      moduloLabel="Cobrança / Vendas aos Pais"
      titulo="Vendas de E-books"
      descricao="Registre a venda para o responsável do aluno. As parcelas e a comissão da escola são geradas automaticamente."
      rotuloNovo="Nova venda"
      podeEditar={false}
      campos={[
        { chave: 'responsavel', label: 'Responsável', tipo: 'texto', obrigatorio: true },
        { chave: 'aluno', label: 'Aluno', tipo: 'texto', obrigatorio: true },
        { chave: 'escola', label: 'Escola', tipo: 'select', opcoes: opcoesColecao('contratos', 'escola'), obrigatorio: true },
        { chave: 'telefone', label: 'Telefone', tipo: 'telefone', tabela: false },
        { chave: 'pacote', label: 'Pacote', tipo: 'select', opcoes: opcoesColecao('produtos', 'nome'), obrigatorio: true },
        {
          chave: 'valor',
          label: 'Valor',
          tipo: 'moeda',
          obrigatorio: true,
          padrao: (s) => Number(colecao(s, 'produtos')[0]?.preco ?? 0),
        },
        { chave: 'parcelas', label: 'Parcelas', tipo: 'select', opcoes: ['1', '2', '3', '4', '5', '6'], obrigatorio: true },
        { chave: 'cobradorId', label: 'Vendido por', tipo: 'select', opcoes: opcoesEquipe('cobranca'), obrigatorio: true, padrao: usuarioDoSetor('cobranca', sessao?.colaboradorId) },
        { chave: 'data', label: 'Data', tipo: 'data', obrigatorio: true },
      ]}
      kpis={(rs) => {
        const mes = rs.filter((r) => String(r.data).startsWith(mesAtual()))
        return [
          { label: 'Vendidos no mês', valor: mes.length, tom: 'orange' },
          { label: 'Faturamento do mês', valor: brl(mes.reduce((a, r) => a + Number(r.valor || 0), 0)), tom: 'emerald' },
          { label: 'Ticket médio', valor: brl(mes.length ? mes.reduce((a, r) => a + Number(r.valor || 0), 0) / mes.length : 0), tom: 'blue' },
        ]
      }}
    />
  )
}
