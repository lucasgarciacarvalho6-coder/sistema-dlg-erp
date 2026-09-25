'use client'

import { useState } from 'react'
import CrudPage, { type Campo } from '@/components/erp/CrudPage'
import { PageHeader, Tabs } from '@/components/erp/ui'

type Aba = 'escolas' | 'produtos' | 'fornecedores' | 'estoque' | 'filiais'

const CAMPOS: Record<Aba, { titulo: string; descricao: string; novo: string; campos: Campo[] }> = {
  escolas: {
    titulo: 'Escolas (Clientes)',
    descricao: 'Instituições atendidas • base usada por Vendas, Operacional e Cobrança',
    novo: 'Nova escola',
    campos: [
      { chave: 'nome', label: 'Escola', tipo: 'texto', obrigatorio: true },
      { chave: 'cidade', label: 'Cidade', tipo: 'texto', obrigatorio: true },
      { chave: 'uf', label: 'UF', tipo: 'texto', padrao: () => 'PR' },
      { chave: 'inep', label: 'INEP', tipo: 'texto' },
      { chave: 'responsavel', label: 'Responsável', tipo: 'texto' },
      { chave: 'telefone', label: 'Telefone', tipo: 'telefone' },
      { chave: 'status', label: 'Situação', tipo: 'select', opcoes: ['Ativa', 'Inativa'], obrigatorio: true },
    ],
  },
  produtos: {
    titulo: 'Produtos e Pacotes',
    descricao: 'Catálogo vendido aos pais • alimenta a Tabela de Preços de Vendas',
    novo: 'Novo produto',
    campos: [
      { chave: 'nome', label: 'Produto', tipo: 'texto', obrigatorio: true },
      { chave: 'categoria', label: 'Categoria', tipo: 'select', opcoes: ['E-book', 'Combo', 'Impresso'], obrigatorio: true },
      { chave: 'preco', label: 'Preço', tipo: 'moeda', obrigatorio: true },
      { chave: 'status', label: 'Situação', tipo: 'select', opcoes: ['Ativo', 'Inativo'], obrigatorio: true },
    ],
  },
  fornecedores: {
    titulo: 'Fornecedores',
    descricao: 'Parceiros usados pelo Financeiro em contas a pagar',
    novo: 'Novo fornecedor',
    campos: [
      { chave: 'nome', label: 'Fornecedor', tipo: 'texto', obrigatorio: true },
      { chave: 'categoria', label: 'Categoria', tipo: 'texto' },
      { chave: 'telefone', label: 'Telefone', tipo: 'telefone' },
      { chave: 'status', label: 'Situação', tipo: 'select', opcoes: ['Ativo', 'Inativo'], obrigatorio: true },
    ],
  },
  estoque: {
    titulo: 'Estoque',
    descricao: 'Itens abaixo do mínimo geram alerta para Produção e ADM',
    novo: 'Novo item',
    campos: [
      { chave: 'item', label: 'Item', tipo: 'texto', obrigatorio: true },
      { chave: 'unidade', label: 'Unidade', tipo: 'texto', padrao: () => 'Unidade' },
      { chave: 'quantidade', label: 'Quantidade', tipo: 'numero', obrigatorio: true },
      { chave: 'minimo', label: 'Estoque mínimo', tipo: 'numero', obrigatorio: true },
    ],
  },
  filiais: {
    titulo: 'Empresas / Filiais',
    descricao: 'Unidades da DLG Photos',
    novo: 'Nova unidade',
    campos: [
      { chave: 'nome', label: 'Unidade', tipo: 'texto', obrigatorio: true },
      { chave: 'tipo', label: 'Tipo', tipo: 'select', opcoes: ['Matriz', 'Filial', 'Base operacional'], obrigatorio: true },
      { chave: 'cnpj', label: 'CNPJ', tipo: 'texto' },
      { chave: 'cidade', label: 'Cidade', tipo: 'texto' },
      { chave: 'uf', label: 'UF', tipo: 'texto', padrao: () => 'PR' },
      { chave: 'status', label: 'Situação', tipo: 'select', opcoes: ['Ativa', 'Inativa'], obrigatorio: true },
    ],
  },
}

const TONS_SITUACAO = { Ativa: 'emerald', Ativo: 'emerald', Inativa: 'red', Inativo: 'red', 'Abaixo do mínimo': 'orange', OK: 'emerald' } as const

export default function CadastrosPage() {
  const [aba, setAba] = useState<Aba>('escolas')
  const cfg = CAMPOS[aba]
  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader modulo="Núcleo Central de Dados" titulo="Cadastros Centrais" descricao="Dados compartilhados por todos os setores. Cada área enxerga apenas o que precisa." />
      <Tabs abas={(Object.keys(CAMPOS) as Aba[]).map((id) => ({ id, label: CAMPOS[id].titulo }))} ativa={aba} onChange={setAba} />
      <CrudPage
        key={aba}
        embutido
        colecao={aba}
        modulo="cadastros"
        setor="adm"
        moduloLabel="Núcleo Central"
        titulo={cfg.titulo}
        descricao={cfg.descricao}
        rotuloNovo={cfg.novo}
        campos={cfg.campos.map((c) => (c.chave === 'status' ? { ...c, tabela: false } : c))}
        status={
          aba === 'estoque'
            ? { campo: 'quantidade', tons: TONS_SITUACAO, valor: (r) => (Number(r.quantidade) < Number(r.minimo) ? 'Abaixo do mínimo' : 'OK') }
            : { campo: 'status', tons: TONS_SITUACAO }
        }
      />
    </div>
  )
}
