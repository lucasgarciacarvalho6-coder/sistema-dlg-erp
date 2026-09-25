'use client'

import CrudPage from '@/components/erp/CrudPage'
import { atualizarRegistro } from '@/lib/erp/store'
import { opcoesEquipe } from '@/lib/erp/opcoes'
import { addDias, hoje } from '@/lib/erp/format'

// Tarefas / ordens de serviço / pendências do setor operacional
export default function TarefasOperacionaisPage() {
  return (
    <CrudPage
      colecao="tarefas_operacionais"
      modulo="operacional"
      setor="operacional"
      moduloLabel="Operacional / Tarefas"
      titulo="Tarefas & Pendências"
      descricao="Ordens de serviço de campo. Contratos novos de Vendas geram automaticamente a tarefa de agendamento da sessão."
      rotuloNovo="Nova tarefa"
      campos={[
        { chave: 'titulo', label: 'Tarefa', tipo: 'texto', obrigatorio: true },
        { chave: 'escola', label: 'Escola', tipo: 'texto' },
        { chave: 'cidade', label: 'Cidade', tipo: 'texto' },
        { chave: 'responsavelId', label: 'Responsável', tipo: 'select', opcoes: opcoesEquipe('operacional') },
        { chave: 'prioridade', label: 'Prioridade', tipo: 'select', opcoes: ['Alta', 'Média', 'Baixa'], obrigatorio: true },
        { chave: 'prazo', label: 'Prazo', tipo: 'data', padrao: () => addDias(hoje(), 3) },
        { chave: 'status', label: 'Status', tipo: 'select', opcoes: ['Pendente', 'Em andamento', 'Concluída'], obrigatorio: true, tabela: false },
      ]}
      status={{
        campo: 'status',
        tons: { Pendente: 'orange', 'Em andamento': 'blue', Concluída: 'emerald', Atrasada: 'red' },
        valor: (r) => (r.status !== 'Concluída' && String(r.prazo) < hoje() ? 'Atrasada' : String(r.status)),
      }}
      kpis={(rs) => [
        { label: 'Pendentes', valor: rs.filter((r) => r.status === 'Pendente').length, tom: 'orange' },
        { label: 'Em andamento', valor: rs.filter((r) => r.status === 'Em andamento').length, tom: 'blue' },
        { label: 'Atrasadas', valor: rs.filter((r) => r.status !== 'Concluída' && String(r.prazo) < hoje()).length, tom: 'red' },
        { label: 'Concluídas', valor: rs.filter((r) => r.status === 'Concluída').length, tom: 'emerald' },
      ]}
      acoes={[
        { label: 'Iniciar', tom: 'blue', permissao: 'editar', visivel: (r) => r.status === 'Pendente', executar: (r) => atualizarRegistro('tarefas_operacionais', r.id, { status: 'Em andamento' }, 'operacional') },
        { label: 'Concluir', tom: 'emerald', permissao: 'editar', visivel: (r) => r.status === 'Em andamento', executar: (r) => atualizarRegistro('tarefas_operacionais', r.id, { status: 'Concluída' }, 'operacional') },
      ]}
    />
  )
}
