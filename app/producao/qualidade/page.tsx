'use client'

import CrudPage from '@/components/erp/CrudPage'
import { useSessao } from '@/lib/erp/store'
import { opcoesColecao, opcoesEquipe, usuarioDoSetor } from '@/lib/erp/opcoes'
import { mesAtual, num } from '@/lib/erp/format'

export default function QualidadePage() {
  const sessao = useSessao()
  return (
    <CrudPage
      colecao="qualidade"
      modulo="producao"
      setor="producao"
      moduloLabel="Produção / Qualidade"
      titulo="Qualidade & Perdas"
      descricao="Apontamentos de retrabalho, perdas e não conformidades por ordem de produção."
      rotuloNovo="Novo apontamento"
      campos={[
        { chave: 'ordem', label: 'Ordem (escola)', tipo: 'select', opcoes: opcoesColecao('ordens_producao', 'escola'), obrigatorio: true },
        { chave: 'tipo', label: 'Tipo', tipo: 'select', opcoes: ['Retrabalho', 'Perda', 'Não conformidade', 'Aprovado'], obrigatorio: true, tabela: false },
        { chave: 'descricao', label: 'Descrição', tipo: 'texto', obrigatorio: true },
        { chave: 'quantidade', label: 'Qtd. fotos', tipo: 'numero' },
        { chave: 'responsavelId', label: 'Responsável', tipo: 'select', opcoes: opcoesEquipe('producao'), padrao: usuarioDoSetor('producao', sessao?.colaboradorId) },
        { chave: 'data', label: 'Data', tipo: 'data' },
      ]}
      status={{ campo: 'tipo', tons: { Retrabalho: 'yellow', Perda: 'red', 'Não conformidade': 'orange', Aprovado: 'emerald' } }}
      kpis={(rs) => {
        const mes = rs.filter((r) => String(r.data).startsWith(mesAtual()))
        return [
          { label: 'Apontamentos no mês', valor: mes.length, tom: 'blue' },
          { label: 'Fotos perdidas (mês)', valor: num(mes.filter((r) => r.tipo === 'Perda').reduce((a, r) => a + Number(r.quantidade || 0), 0)), tom: 'red' },
          { label: 'Retrabalhos (mês)', valor: mes.filter((r) => r.tipo === 'Retrabalho').length, tom: 'yellow' },
        ]
      }}
    />
  )
}
