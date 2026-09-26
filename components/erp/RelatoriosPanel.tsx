'use client'

import type { ErpState, Modulo, Registro, Setor } from '@/lib/erp/types'
import { SETORES } from '@/lib/erp/config'
import { useErp, usePode } from '@/lib/erp/store'
import { colecao, nomeColaborador, statusTitulo } from '@/lib/erp/metrics'
import { dataBR } from '@/lib/erp/format'
import { exportarCSV, exportarExcel, exportarPDF, type Coluna } from '@/lib/erp/export'
import Icon from './Icon'
import { PageHeader, Panel } from './ui'

interface Relatorio {
  id: string
  titulo: string
  descricao: string
  modulo: Modulo
  gerar: (s: ErpState) => { colunas: Coluna[]; linhas: Record<string, unknown>[] }
}

const deColecao = (nome: string, colunas: Coluna[], mapa?: (r: Registro, s: ErpState) => Record<string, unknown>) => (s: ErpState) => ({
  colunas,
  linhas: colecao(s, nome).map((r) => (mapa ? { ...r, ...mapa(r, s) } : r)),
})

const producaoSetor = (setor: Setor) => (s: ErpState) => ({
  colunas: [
    { chave: 'data', label: 'Data' },
    { chave: 'colaborador', label: 'Colaborador' },
    { chave: 'indicador', label: 'Indicador' },
    { chave: 'quantidade', label: 'Quantidade/Valor' },
    { chave: 'descricao', label: 'Descrição' },
  ],
  linhas: s.lancamentos
    .filter((l) => l.setor === setor)
    .sort((a, b) => b.data.localeCompare(a.data))
    .map((l) => ({ data: dataBR(l.data), colaborador: nomeColaborador(s, l.colaboradorId), indicador: SETORES[setor].indicadores.find((i) => i.id === l.indicador)?.label, quantidade: l.quantidade, descricao: l.descricao })),
})

const RELATORIOS: Relatorio[] = [
  {
    id: 'colaboradores',
    titulo: 'Colaboradores',
    descricao: 'Relatório administrativo • equipe, setores e perfis',
    modulo: 'usuarios',
    gerar: (s) => ({
      colunas: [
        { chave: 'nome', label: 'Nome' },
        { chave: 'email', label: 'E-mail' },
        { chave: 'setor', label: 'Setor' },
        { chave: 'funcao', label: 'Função' },
        { chave: 'perfil', label: 'Perfil' },
        { chave: 'status', label: 'Status' },
      ],
      linhas: s.colaboradores.map((c) => ({ ...c, setor: SETORES[c.setor].nome })),
    }),
  },
  { id: 'prod-vendas', titulo: 'Produção de Vendas', descricao: 'Contratos e visitas por vendedora', modulo: 'vendas', gerar: producaoSetor('vendas') },
  {
    id: 'contratos',
    titulo: 'Contratos com escolas',
    descricao: 'Relatório de vendas • pedidos fechados',
    modulo: 'vendas',
    gerar: deColecao('contratos', [
      { chave: 'escola', label: 'Escola' },
      { chave: 'cidade', label: 'Cidade' },
      { chave: 'vendedora', label: 'Vendedora' },
      { chave: 'alunos', label: 'Alunos' },
      { chave: 'data', label: 'Data' },
      { chave: 'status', label: 'Status' },
    ], (r, s) => ({ vendedora: nomeColaborador(s, r.vendedoraId), data: dataBR(String(r.data)) })),
  },
  { id: 'prod-operacional', titulo: 'Produção Operacional', descricao: 'Fichas fotografadas por equipe', modulo: 'operacional', gerar: producaoSetor('operacional') },
  { id: 'prod-producao', titulo: 'Produção (books produzidos)', descricao: 'Books produzidos por pessoa (lançados pelo app)', modulo: 'producao', gerar: producaoSetor('producao') },
  {
    id: 'titulos',
    titulo: 'Contas a receber',
    descricao: 'Relatório de cobrança • títulos e parcelas',
    modulo: 'cobranca',
    gerar: deColecao('titulos', [
      { chave: 'cliente', label: 'Responsável' },
      { chave: 'escola', label: 'Escola' },
      { chave: 'parcela', label: 'Parcela' },
      { chave: 'valor', label: 'Valor' },
      { chave: 'vencimento', label: 'Vencimento' },
      { chave: 'situacao', label: 'Situação' },
    ], (r) => ({ vencimento: dataBR(String(r.vencimento)), situacao: statusTitulo(r) })),
  },
  { id: 'prod-cobranca', titulo: 'Produção da Cobrança', descricao: 'E-books vendidos e valores recebidos', modulo: 'cobranca', gerar: producaoSetor('cobranca') },
  {
    id: 'contas',
    titulo: 'Contas a pagar',
    descricao: 'Relatório financeiro • despesas',
    modulo: 'financeiro',
    gerar: deColecao('contas_pagar', [
      { chave: 'descricao', label: 'Descrição' },
      { chave: 'fornecedor', label: 'Fornecedor' },
      { chave: 'categoria', label: 'Categoria' },
      { chave: 'valor', label: 'Valor' },
      { chave: 'vencimento', label: 'Vencimento' },
      { chave: 'status', label: 'Status' },
    ], (r) => ({ vencimento: dataBR(String(r.vencimento)) })),
  },
  {
    id: 'pagamentos-operacionais',
    titulo: 'Pagamentos operacionais',
    descricao: 'Relatório financeiro • escolas, ajudantes, vendedores PJ e freelancers',
    modulo: 'financeiro',
    gerar: (s) => ({
      colunas: [
        { chave: 'favorecido', label: 'Favorecido' },
        { chave: 'categoria', label: 'Tipo' },
        { chave: 'descricao', label: 'Referente a' },
        { chave: 'pixChave', label: 'Chave PIX' },
        { chave: 'valor', label: 'Valor' },
        { chave: 'status', label: 'Status' },
      ],
      linhas: colecao(s, 'contas_pagar').filter((r) => r.fechamentoId),
    }),
  },
  {
    id: 'agenda',
    titulo: 'Agenda fotográfica',
    descricao: 'Relatório operacional • visitas, fichas e equipes',
    modulo: 'operacional',
    gerar: deColecao('agenda_visitas', [
      { chave: 'data', label: 'Data' },
      { chave: 'escola', label: 'Escola' },
      { chave: 'cidade', label: 'Cidade' },
      { chave: 'fichasPrevistas', label: 'Previstas' },
      { chave: 'fichasConfirmadas', label: 'Confirmadas' },
      { chave: 'fichasFotografadas', label: 'Fotografadas' },
      { chave: 'status', label: 'Status' },
    ], (r) => ({ data: dataBR(String(r.data)) })),
  },
  {
    id: 'aprovacoes',
    titulo: 'Aprovações',
    descricao: 'Relatório gerencial • decisões',
    modulo: 'gerencia',
    gerar: deColecao('aprovacoes', [
      { chave: 'tipo', label: 'Tipo' },
      { chave: 'descricao', label: 'Descrição' },
      { chave: 'solicitante', label: 'Solicitante' },
      { chave: 'valor', label: 'Valor' },
      { chave: 'status', label: 'Status' },
      { chave: 'decididoPor', label: 'Decidido por' },
    ]),
  },
  {
    id: 'auditoria',
    titulo: 'Auditoria',
    descricao: 'Logs de login, alterações e exclusões',
    modulo: 'auditoria',
    gerar: (s) => ({
      colunas: [
        { chave: 'data', label: 'Data/Hora' },
        { chave: 'tipo', label: 'Tipo' },
        { chave: 'usuarioNome', label: 'Usuário' },
        { chave: 'setor', label: 'Setor' },
        { chave: 'descricao', label: 'Descrição' },
        { chave: 'ip', label: 'IP' },
      ],
      linhas: s.auditoria.map((l) => ({ ...l, data: new Date(l.data).toLocaleString('pt-BR') })),
    }),
  },
]

export default function RelatoriosPanel({ modulo }: { modulo: string }) {
  const s = useErp()
  const podeFazer = usePode()
  const disponiveis = RELATORIOS.filter((r) => podeFazer(r.modulo, 'visualizar'))

  const baixar = (r: Relatorio, formato: 'csv' | 'xls' | 'pdf') => {
    const { colunas, linhas } = r.gerar(s)
    const nome = `relatorio-${r.id}`
    if (formato === 'csv') exportarCSV(nome, colunas, linhas)
    else if (formato === 'xls') exportarExcel(nome, colunas, linhas)
    else exportarPDF(r.titulo, colunas, linhas)
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader modulo={modulo} titulo="Relatórios" descricao="Exporte os dados de cada área em PDF, Excel ou CSV. Você só vê os relatórios dos módulos que o seu perfil acessa." />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {disponiveis.map((r) => {
          const qtd = r.gerar(s).linhas.length
          const exporta = podeFazer(r.modulo, 'exportar')
          return (
            <Panel key={r.id}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center border border-white/[0.1] shrink-0">
                  <Icon nome="report" className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white">{r.titulo}</h3>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">{r.descricao}</p>
                  <p className="text-xs text-blue-400 font-bold mt-2">{qtd} registro(s)</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-5">
                {(['pdf', 'xls', 'csv'] as const).map((f) => (
                  <button
                    key={f}
                    disabled={!exporta || qtd === 0}
                    onClick={() => baixar(r, f)}
                    className="py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-white/[0.05] bg-white/[0.03] text-zinc-300 hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/30 transition-all disabled:opacity-30 disabled:pointer-events-none"
                  >
                    {f === 'xls' ? 'Excel' : f.toUpperCase()}
                  </button>
                ))}
              </div>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
