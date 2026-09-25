'use client'

import CrudPage from '@/components/erp/CrudPage'

// Matéria-prima: mesma coleção de estoque do núcleo central (ADM > Cadastros)
export default function MateriaPrimaPage() {
  return (
    <CrudPage
      colecao="estoque"
      modulo="producao"
      setor="producao"
      moduloLabel="Produção / Matéria-prima"
      titulo="Matéria-prima & Estoque"
      descricao="Insumos de produção. Ao ficar abaixo do mínimo, Produção e ADM recebem alerta de estoque baixo."
      rotuloNovo="Novo item"
      campos={[
        { chave: 'item', label: 'Item', tipo: 'texto', obrigatorio: true },
        { chave: 'unidade', label: 'Unidade', tipo: 'texto', padrao: () => 'Unidade' },
        { chave: 'quantidade', label: 'Quantidade', tipo: 'numero', obrigatorio: true },
        { chave: 'minimo', label: 'Estoque mínimo', tipo: 'numero', obrigatorio: true },
      ]}
      status={{ campo: 'quantidade', tons: { 'Abaixo do mínimo': 'red', OK: 'emerald' }, valor: (r) => (Number(r.quantidade) < Number(r.minimo) ? 'Abaixo do mínimo' : 'OK') }}
      kpis={(rs) => [
        { label: 'Itens cadastrados', valor: rs.length, tom: 'blue' },
        { label: 'Abaixo do mínimo', valor: rs.filter((r) => Number(r.quantidade) < Number(r.minimo)).length, tom: 'red' },
      ]}
    />
  )
}
