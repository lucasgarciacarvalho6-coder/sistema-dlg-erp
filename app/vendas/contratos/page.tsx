'use client'

import CrudPage from '@/components/erp/CrudPage'
import { useSessao } from '@/lib/erp/store'
import { opcoesColecao, opcoesEquipe, usuarioDoSetor } from '@/lib/erp/opcoes'
import { mesAtual, num } from '@/lib/erp/format'

// Pedido = contrato com a escola. Ao salvar: lança a meta da vendedora, cria a
// tarefa de agendamento (Operacional), a ordem de produção (Produção) e notifica o ADM.
export default function ContratosVendasPage() {
  const sessao = useSessao()
  return (
    <CrudPage
      colecao="contratos"
      modulo="vendas"
      setor="vendas"
      moduloLabel="Vendas / Pedidos"
      titulo="Contratos com Escolas"
      descricao="Cada contrato fechado gera automaticamente a sessão fotográfica no Operacional e a ordem de produção."
      rotuloNovo="Novo contrato"
      campos={[
        { chave: 'escola', label: 'Escola', tipo: 'select', opcoes: opcoesColecao('escolas', 'nome'), obrigatorio: true },
        { chave: 'cidade', label: 'Cidade', tipo: 'texto', obrigatorio: true },
        { chave: 'uf', label: 'UF', tipo: 'texto', padrao: () => 'PR', tabela: false },
        { chave: 'vendedoraId', label: 'Vendedora', tipo: 'select', opcoes: opcoesEquipe('vendas'), obrigatorio: true, padrao: usuarioDoSetor('vendas', sessao?.colaboradorId) },
        { chave: 'alunos', label: 'Alunos', tipo: 'numero', obrigatorio: true },
        { chave: 'comissaoPct', label: 'Comissão escola', tipo: 'percentual', padrao: () => 10 },
        { chave: 'data', label: 'Data', tipo: 'data', obrigatorio: true },
        { chave: 'status', label: 'Status', tipo: 'select', opcoes: ['Ativo', 'Em agendamento', 'Finalizado', 'Cancelado'], obrigatorio: true, tabela: false },
        { chave: 'observacao', label: 'Observação', tipo: 'textarea', tabela: false },
      ]}
      status={{ campo: 'status', tons: {} }}
      kpis={(rs) => [
        { label: 'Contratos no mês', valor: rs.filter((r) => String(r.data).startsWith(mesAtual())).length, tom: 'emerald' },
        { label: 'Total de contratos', valor: rs.length, tom: 'blue' },
        { label: 'Alunos contratados', valor: num(rs.reduce((a, r) => a + Number(r.alunos || 0), 0)), tom: 'zinc' },
      ]}
    />
  )
}
