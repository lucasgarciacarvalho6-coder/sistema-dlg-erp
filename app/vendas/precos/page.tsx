'use client'

import CrudPage from '@/components/erp/CrudPage'

// Tabela de preços: leitura do cadastro central de produtos (mantido pelo ADM)
export default function TabelaPrecosPage() {
  return (
    <CrudPage
      colecao="produtos"
      modulo="vendas"
      setor="vendas"
      moduloLabel="Vendas / Produtos"
      titulo="Tabela de Preços"
      descricao="Pacotes ofertados aos pais. Os preços são mantidos pelo ADM em Cadastros Centrais."
      podeCriar={false}
      podeEditar={false}
      podeExcluir={false}
      filtro={(r) => r.status === 'Ativo'}
      campos={[
        { chave: 'nome', label: 'Produto', tipo: 'texto' },
        { chave: 'categoria', label: 'Categoria', tipo: 'texto' },
        { chave: 'preco', label: 'Preço', tipo: 'moeda' },
      ]}
    />
  )
}
