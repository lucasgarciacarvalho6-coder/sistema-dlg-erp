'use client'

import CrudPage from '@/components/erp/CrudPage'
import { useSessao } from '@/lib/erp/store'
import { opcoesColecao, opcoesEquipe, usuarioDoSetor } from '@/lib/erp/opcoes'
import { brl, mesAtual } from '@/lib/erp/format'
import { colecao } from '@/lib/erp/metrics'

// Venda de book aos pais pela equipe interna. Ao salvar: lança a meta de quem vendeu e registra
// o pagamento (boleto → parcelas em Contas a Receber; PIX, dinheiro e cartão → recebido na venda).
// As vendas externas (app do vendedor de books) aparecem aqui também, só para consulta.
export default function VendasEbooksPage() {
  const sessao = useSessao()
  return (
    <CrudPage
      colecao="vendas_ebooks"
      modulo="cobranca"
      setor="cobranca"
      moduloLabel="Cobrança / Vendas aos Pais"
      titulo="Vendas de Books"
      descricao="Registre a venda feita pela equipe interna. Boleto gera as parcelas em Contas a Receber; PIX, dinheiro e cartão ficam registrados como recebidos. As vendas externas do app aparecem com o selo Externa."
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
        { chave: 'formaPagamento', label: 'Forma de pagamento', tipo: 'select', opcoes: ['Boleto', 'PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito'], obrigatorio: true, padrao: () => 'Boleto' },
        { chave: 'parcelas', label: 'Parcelas', tipo: 'select', opcoes: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], obrigatorio: true, padrao: () => '1' },
        { chave: 'primeiroVencimento', label: '1º vencimento (boleto)', tipo: 'data', tabela: false },
        { chave: 'canal', label: 'Canal', tipo: 'texto', formulario: false, padrao: () => 'Interno', exibir: (r) => (r.canal === 'Externo' ? 'Externa (app)' : 'Interna') },
        { chave: 'cobradorId', label: 'Vendido por', tipo: 'select', opcoes: opcoesEquipe('cobranca'), obrigatorio: true, padrao: usuarioDoSetor('cobranca', sessao?.colaboradorId) },
        { chave: 'data', label: 'Data', tipo: 'data', obrigatorio: true },
      ]}
      kpis={(rs) => {
        const mes = rs.filter((r) => String(r.data).startsWith(mesAtual()) && r.canal !== 'Externo')
        return [
          { label: 'Vendidos no mês (internas)', valor: mes.length, tom: 'orange' },
          { label: 'Faturamento do mês', valor: brl(mes.reduce((a, r) => a + Number(r.valor || 0), 0)), tom: 'emerald' },
          { label: 'Ticket médio', valor: brl(mes.length ? mes.reduce((a, r) => a + Number(r.valor || 0), 0) / mes.length : 0), tom: 'blue' },
        ]
      }}
    />
  )
}
