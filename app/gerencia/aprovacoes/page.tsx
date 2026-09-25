'use client'

import CrudPage from '@/components/erp/CrudPage'
import { SETORES } from '@/lib/erp/config'
import { decidirAprovacao } from '@/lib/erp/store'
import { brl } from '@/lib/erp/format'
import type { Setor } from '@/lib/erp/types'

// Aprovações geradas automaticamente pelos fluxos (acordos de cobrança, contas acima do limite)
export default function AprovacoesPage() {
  return (
    <CrudPage
      colecao="aprovacoes"
      modulo="gerencia"
      setor="gerencia"
      moduloLabel="Gerência / Aprovações"
      titulo="Aprovações"
      descricao="Solicitações enviadas pelos setores. Ao decidir, o setor de origem e o ADM são notificados."
      podeCriar={false}
      podeEditar={false}
      campos={[
        { chave: 'tipo', label: 'Tipo', tipo: 'texto' },
        { chave: 'descricao', label: 'Descrição', tipo: 'texto' },
        { chave: 'setorOrigem', label: 'Origem', tipo: 'texto', exibir: (r) => SETORES[r.setorOrigem as Setor]?.nome ?? '—' },
        { chave: 'solicitante', label: 'Solicitante', tipo: 'texto' },
        { chave: 'valor', label: 'Valor', tipo: 'moeda' },
        { chave: 'decididoPor', label: 'Decidido por', tipo: 'texto' },
        { chave: 'decididoEm', label: 'Em', tipo: 'data' },
      ]}
      status={{ campo: 'status', tons: { Pendente: 'yellow', Aprovado: 'emerald', Rejeitado: 'red' } }}
      kpis={(rs) => [
        { label: 'Pendentes', valor: rs.filter((r) => r.status === 'Pendente').length, tom: 'yellow' },
        { label: 'Aprovadas', valor: rs.filter((r) => r.status === 'Aprovado').length, tom: 'emerald' },
        { label: 'Rejeitadas', valor: rs.filter((r) => r.status === 'Rejeitado').length, tom: 'red' },
        { label: 'Valor pendente', valor: brl(rs.filter((r) => r.status === 'Pendente').reduce((a, r) => a + Number(r.valor || 0), 0)), tom: 'blue' },
      ]}
      acoes={[
        { label: 'Aprovar', tom: 'emerald', permissao: 'editar', visivel: (r) => r.status === 'Pendente', executar: (r) => decidirAprovacao(r.id, true) },
        { label: 'Rejeitar', tom: 'red', permissao: 'editar', visivel: (r) => r.status === 'Pendente', executar: (r) => decidirAprovacao(r.id, false) },
      ]}
    />
  )
}
