'use client'

import CrudPage from '@/components/erp/CrudPage'
import { baixarTitulo, negociarTitulo } from '@/lib/erp/store'
import { tituloAtrasado } from '@/lib/erp/metrics'
import { brl, hoje } from '@/lib/erp/format'

const diasAtraso = (venc: string) => Math.max(0, Math.round((new Date(hoje()).getTime() - new Date(venc).getTime()) / 86_400_000))

// Clientes em atraso. "Negociar" gera um acordo que segue para aprovação da Gerência.
export default function InadimplenciaPage() {
  return (
    <CrudPage
      colecao="titulos"
      modulo="cobranca"
      setor="cobranca"
      moduloLabel="Cobrança / Inadimplência"
      titulo="Inadimplência"
      descricao="Títulos vencidos e não pagos. Negocie para gerar um acordo ou registre o pagamento."
      podeCriar={false}
      podeEditar={false}
      podeExcluir={false}
      filtro={tituloAtrasado}
      campos={[
        { chave: 'cliente', label: 'Responsável', tipo: 'texto' },
        { chave: 'escola', label: 'Escola', tipo: 'texto' },
        { chave: 'telefone', label: 'Telefone', tipo: 'telefone' },
        { chave: 'parcela', label: 'Parcela', tipo: 'texto' },
        { chave: 'valor', label: 'Valor', tipo: 'moeda' },
        { chave: 'vencimento', label: 'Vencimento', tipo: 'data' },
        { chave: 'atraso', label: 'Dias de atraso', tipo: 'numero', exibir: (r) => <span className="text-red-400 font-black">{diasAtraso(String(r.vencimento))} dias</span> },
      ]}
      kpis={(rs) => [
        { label: 'Clientes em atraso', valor: new Set(rs.map((r) => r.cliente)).size, tom: 'red' },
        { label: 'Valor em atraso', valor: brl(rs.reduce((a, r) => a + Number(r.valor || 0), 0)), tom: 'red' },
        { label: 'Atraso médio', valor: `${rs.length ? Math.round(rs.reduce((a, r) => a + diasAtraso(String(r.vencimento)), 0) / rs.length) : 0} dias`, tom: 'zinc' },
      ]}
      acoes={[
        { label: 'Negociar (3x)', tom: 'orange', permissao: 'criar', executar: (r) => negociarTitulo(r.id, 3) },
        { label: 'Recebido', tom: 'emerald', permissao: 'editar', executar: (r) => baixarTitulo(r.id) },
      ]}
    />
  )
}
