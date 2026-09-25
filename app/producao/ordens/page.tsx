'use client'

import CrudPage from '@/components/erp/CrudPage'
import { ETAPAS_PRODUCAO } from '@/lib/erp/config'
import { avancarOrdem } from '@/lib/erp/store'
import { opcoesEquipe } from '@/lib/erp/opcoes'
import { addDias, hoje, num } from '@/lib/erp/format'

// Ordens de produção. Criadas automaticamente a cada contrato de Vendas.
// "Avançar etapa" até "E-book gerado" lança a meta do editor; "Concluído" libera a Cobrança.
export default function OrdensProducaoPage() {
  return (
    <CrudPage
      colecao="ordens_producao"
      modulo="producao"
      setor="producao"
      moduloLabel="Produção / Ordens"
      titulo="Ordens de Produção"
      descricao="Planejamento e etapas de produção por escola: tratamento, diagramação, e-book, qualidade e entrega."
      rotuloNovo="Nova ordem"
      campos={[
        { chave: 'escola', label: 'Escola', tipo: 'texto', obrigatorio: true },
        { chave: 'alunos', label: 'Alunos', tipo: 'numero' },
        { chave: 'fotos', label: 'Fotos', tipo: 'numero' },
        { chave: 'responsavelId', label: 'Responsável', tipo: 'select', opcoes: opcoesEquipe('producao') },
        { chave: 'etapa', label: 'Etapa', tipo: 'select', opcoes: ETAPAS_PRODUCAO, obrigatorio: true, tabela: false },
        { chave: 'prazo', label: 'Prazo', tipo: 'data', padrao: () => addDias(hoje(), 30) },
      ]}
      status={{
        campo: 'etapa',
        tons: { 'Aguardando fotos': 'zinc', Tratamento: 'violet', Diagramação: 'blue', 'E-book gerado': 'cyan', 'Revisão de qualidade': 'yellow', Concluído: 'emerald' },
      }}
      kpis={(rs) => [
        { label: 'Em produção', valor: rs.filter((r) => r.etapa !== 'Concluído').length, tom: 'violet' },
        { label: 'Aguardando fotos', valor: rs.filter((r) => r.etapa === 'Aguardando fotos').length, tom: 'zinc' },
        { label: 'Prazo vencido', valor: rs.filter((r) => r.etapa !== 'Concluído' && String(r.prazo) < hoje()).length, tom: 'red' },
        { label: 'Fotos na fila', valor: num(rs.filter((r) => r.etapa !== 'Concluído').reduce((a, r) => a + Number(r.fotos || 0), 0)), tom: 'blue' },
      ]}
      acoes={[
        {
          label: 'Avançar etapa',
          tom: 'blue',
          permissao: 'editar',
          visivel: (r) => r.etapa !== 'Concluído',
          executar: (r) => avancarOrdem(r.id),
        },
      ]}
    />
  )
}
