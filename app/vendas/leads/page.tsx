'use client'

import CrudPage from '@/components/erp/CrudPage'
import { ETAPAS_LEAD } from '@/lib/erp/config'
import { atualizarRegistro, criarRegistro, useSessao } from '@/lib/erp/store'
import { opcoesEquipe, usuarioDoSetor } from '@/lib/erp/opcoes'
import { hoje, num } from '@/lib/erp/format'

export default function LeadsPage() {
  const sessao = useSessao()
  return (
    <CrudPage
      colecao="leads"
      modulo="vendas"
      setor="vendas"
      moduloLabel="Vendas / Prospecção"
      titulo="Leads & Prospecção"
      descricao="Escolas em prospecção. Ao converter, o lead vira contrato e dispara o fluxo para Operacional e Produção."
      rotuloNovo="Novo lead"
      campos={[
        { chave: 'escola', label: 'Escola', tipo: 'texto', obrigatorio: true },
        { chave: 'cidade', label: 'Cidade', tipo: 'texto', obrigatorio: true },
        { chave: 'uf', label: 'UF', tipo: 'texto', padrao: () => 'PR', tabela: false },
        { chave: 'contato', label: 'Contato', tipo: 'texto' },
        { chave: 'telefone', label: 'Telefone', tipo: 'telefone' },
        { chave: 'alunos', label: 'Alunos (estim.)', tipo: 'numero' },
        { chave: 'vendedoraId', label: 'Vendedora', tipo: 'select', opcoes: opcoesEquipe('vendas'), obrigatorio: true, padrao: usuarioDoSetor('vendas', sessao?.colaboradorId) },
        { chave: 'etapa', label: 'Etapa', tipo: 'select', opcoes: ETAPAS_LEAD, obrigatorio: true, tabela: false },
        { chave: 'observacao', label: 'Observação', tipo: 'textarea', tabela: false },
      ]}
      status={{ campo: 'etapa', tons: { Novo: 'zinc', 'Contato feito': 'blue', 'Visita agendada': 'cyan', Proposta: 'violet', Negociação: 'yellow', Convertido: 'emerald', Perdido: 'red' } }}
      kpis={(rs) => [
        { label: 'Leads ativos', valor: rs.filter((r) => r.etapa !== 'Convertido' && r.etapa !== 'Perdido').length, tom: 'blue' },
        { label: 'Em negociação', valor: rs.filter((r) => r.etapa === 'Negociação' || r.etapa === 'Proposta').length, tom: 'yellow' },
        { label: 'Convertidos', valor: rs.filter((r) => r.etapa === 'Convertido').length, tom: 'emerald' },
        {
          label: 'Alunos no funil',
          valor: num(rs.filter((r) => r.etapa !== 'Perdido' && r.etapa !== 'Convertido').reduce((a, r) => a + Number(r.alunos || 0), 0)),
          tom: 'zinc',
        },
      ]}
      acoes={[
        {
          label: 'Converter em contrato',
          tom: 'emerald',
          permissao: 'criar',
          visivel: (r) => r.etapa !== 'Convertido' && r.etapa !== 'Perdido',
          executar: (r) => {
            criarRegistro(
              'contratos',
              {
                escola: r.escola,
                cidade: r.cidade,
                uf: r.uf ?? 'PR',
                vendedoraId: r.vendedoraId,
                alunos: Number(r.alunos) || 0,
                comissaoPct: 10,
                data: hoje(),
                status: 'Ativo',
                observacao: 'Convertido a partir de lead',
              },
              'vendas',
            )
            atualizarRegistro('leads', r.id, { etapa: 'Convertido' }, 'vendas')
          },
        },
      ]}
    />
  )
}
