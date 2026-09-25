'use client'

import CrudPage from '@/components/erp/CrudPage'
import { baixarTitulo } from '@/lib/erp/store'
import { opcoesEquipe } from '@/lib/erp/opcoes'
import { statusTitulo, tituloAtrasado } from '@/lib/erp/metrics'
import { brl, hoje, mesAtual } from '@/lib/erp/format'

// Contas a receber (títulos / parcelas). "Dar baixa" registra o recebimento e
// alimenta a meta de valor recebido e o faturamento no painel do ADM.
export default function TitulosPage() {
  return (
    <CrudPage
      colecao="titulos"
      modulo="cobranca"
      setor="cobranca"
      moduloLabel="Cobrança / Contas a Receber"
      titulo="Contas a Receber"
      descricao="Títulos e parcelas geradas pelas vendas de e-books. Dê baixa ao receber."
      rotuloNovo="Novo título"
      campos={[
        { chave: 'cliente', label: 'Responsável', tipo: 'texto', obrigatorio: true },
        { chave: 'aluno', label: 'Aluno', tipo: 'texto', tabela: false },
        { chave: 'escola', label: 'Escola', tipo: 'texto' },
        { chave: 'parcela', label: 'Parcela', tipo: 'texto', padrao: () => '1/1' },
        { chave: 'valor', label: 'Valor', tipo: 'moeda', obrigatorio: true },
        { chave: 'vencimento', label: 'Vencimento', tipo: 'data', obrigatorio: true },
        { chave: 'dataPagamento', label: 'Pago em', tipo: 'data', formulario: false },
        { chave: 'cobradorId', label: 'Cobrador', tipo: 'select', opcoes: opcoesEquipe('cobranca'), tabela: false },
        { chave: 'status', label: 'Status', tipo: 'texto', formulario: false, tabela: false, padrao: () => 'Aberto' },
      ]}
      status={{ campo: 'status', tons: { Aberto: 'blue', Atrasado: 'red', Pago: 'emerald', 'Em acordo': 'yellow' }, valor: statusTitulo }}
      kpis={(rs) => {
        const soma = (f: (r: (typeof rs)[number]) => boolean) => brl(rs.filter(f).reduce((a, r) => a + Number(r.valor || 0), 0))
        return [
          { label: 'Em aberto', valor: soma((r) => r.status === 'Aberto'), tom: 'blue' },
          { label: 'Em atraso', valor: soma(tituloAtrasado), tom: 'red' },
          { label: 'Vence hoje', valor: soma((r) => r.status === 'Aberto' && r.vencimento === hoje()), tom: 'yellow' },
          { label: 'Recebido no mês', valor: soma((r) => r.status === 'Pago' && String(r.dataPagamento).startsWith(mesAtual())), tom: 'emerald' },
        ]
      }}
      acoes={[
        {
          label: 'Dar baixa',
          tom: 'emerald',
          permissao: 'editar',
          visivel: (r) => r.status === 'Aberto',
          executar: (r) => baixarTitulo(r.id),
        },
      ]}
    />
  )
}
