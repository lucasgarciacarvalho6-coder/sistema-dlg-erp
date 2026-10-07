'use client'

// Financeiro › Contas a Receber agrupada por pessoa (07/10/2026). Todo recebimento é do Financeiro; a Cobrança só vê
// a inadimplência. A lista mostra um nome por linha, com o total em aberto e em atraso. Clicando no nome abre a ficha
// com as informações e todos os boletos; a baixa é dada lá.
// "Dar baixa" registra o recebimento e alimenta a meta de valor recebido do cobrador e o faturamento no painel do ADM.

import { useMemo, useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { atualizarRegistro, baixarTitulo, criarRegistro, excluirRegistro, useErp, usePode } from '@/lib/erp/store'
import { colecao, equipe, statusTitulo, tituloAtrasado } from '@/lib/erp/metrics'
import { brl, dataBR, hoje, mesAtual } from '@/lib/erp/format'
import { exportarCSV } from '@/lib/erp/export'
import {
  ORDEM_SITUACAO,
  TOM_SITUACAO,
  agruparPorPessoa,
  blocosPorVenda,
  chaveNome,
  chavePessoa,
  ordemParcela,
  ordenarPessoas,
  pessoaNaBusca,
  valorDe,
  type Pessoa,
  type SituacaoPessoa,
} from '@/lib/erp/contas-receber'
import Icon from '@/components/erp/Icon'
import { BuscaPessoas, CabecalhoVenda, DadosPessoa, Filtro, NomePessoa, Total } from '@/components/erp/ContasPessoa'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, btnBranco, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

const CAMPOS_FORM: { chave: string; label: string; tipo: 'texto' | 'moeda' | 'data' | 'cobrador'; obrigatorio?: boolean }[] = [
  { chave: 'cliente', label: 'Responsável', tipo: 'texto', obrigatorio: true },
  { chave: 'aluno', label: 'Aluno', tipo: 'texto' },
  { chave: 'escola', label: 'Escola', tipo: 'texto' },
  { chave: 'telefone', label: 'Telefone', tipo: 'texto' },
  { chave: 'parcela', label: 'Parcela', tipo: 'texto' },
  { chave: 'valor', label: 'Valor', tipo: 'moeda', obrigatorio: true },
  { chave: 'vencimento', label: 'Vencimento', tipo: 'data', obrigatorio: true },
  { chave: 'cobradorId', label: 'Cobrador', tipo: 'cobrador' },
]

export default function ContasReceber() {
  const s = useErp()
  const podeFazer = usePode()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<SituacaoPessoa | ''>('')
  const [aberta, setAberta] = useState<string | null>(null) // chave da pessoa com a ficha aberta
  const [form, setForm] = useState<{ titulo: Registro | null; valores: Record<string, string> } | null>(null)
  const [erroForm, setErroForm] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [baixa, setBaixa] = useState<Registro | null>(null)
  const [excluir, setExcluir] = useState<Registro | null>(null)

  const pCriar = podeFazer('financeiro', 'criar')
  const pEditar = podeFazer('financeiro', 'editar')
  const pExcluir = podeFazer('financeiro', 'excluir')
  const pExportar = podeFazer('financeiro', 'exportar')

  const titulos = colecao(s, 'titulos')
  const cobradores = equipe(s, 'cobranca')
  const nomeCobrador = (id: string) => s.colaboradores.find((c) => c.id === id)?.nome ?? ''

  const pessoas = useMemo(
    () => agruparPorPessoa(colecao(s, 'titulos'), (id) => s.colaboradores.find((c) => c.id === id)?.nome ?? '').sort(ordenarPessoas),
    [s],
  )
  const contagem = useMemo(() => {
    const c = new Map<SituacaoPessoa, number>()
    for (const p of pessoas) c.set(p.situacao, (c.get(p.situacao) ?? 0) + 1)
    return c
  }, [pessoas])
  const visiveis = useMemo(() => pessoas.filter((p) => (!filtro || p.situacao === filtro) && pessoaNaBusca(p, busca)), [pessoas, busca, filtro])
  const pessoa = aberta ? pessoas.find((p) => p.chave === aberta) : undefined

  const soma = (f: (t: Registro) => boolean) => brl(titulos.filter(f).reduce((a, t) => a + valorDe(t), 0))

  const abrirForm = (titulo: Registro | null) => {
    const valores: Record<string, string> = {}
    for (const c of CAMPOS_FORM) {
      const v = titulo?.[c.chave]
      valores[c.chave] = v === null || v === undefined ? '' : String(v)
    }
    if (!titulo) {
      valores.parcela = '1/1'
      valores.vencimento = hoje()
      valores.cobradorId = cobradores[0]?.id ?? ''
    }
    setErroForm(null)
    setForm({ titulo, valores })
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    const dados: Record<string, string | number> = {}
    for (const c of CAMPOS_FORM) {
      const v = (form.valores[c.chave] ?? '').trim()
      dados[c.chave] = c.tipo === 'moeda' ? Number(v.replace(',', '.')) || 0 : v
    }
    setSalvando(true)
    const erro = form.titulo
      ? await atualizarRegistro('titulos', form.titulo.id, dados, 'financeiro')
      : await criarRegistro('titulos', { ...dados, status: 'Aberto' }, 'financeiro')
    setSalvando(false)
    setErroForm(erro)
    if (erro) return
    // o nome mudou na edição: a ficha acompanha a pessoa nova (ou fecha, se era a única parcela)
    if (form.titulo && aberta && chavePessoa(form.titulo) !== chaveNome(dados.cliente)) setAberta(chaveNome(dados.cliente))
    setForm(null)
  }

  const exportar = () =>
    exportarCSV(
      'contas-a-receber',
      [
        { chave: 'cliente', label: 'Responsável' },
        { chave: 'aluno', label: 'Aluno' },
        { chave: 'escola', label: 'Escola' },
        { chave: 'telefone', label: 'Telefone' },
        { chave: 'parcela', label: 'Parcela' },
        { chave: 'valor', label: 'Valor' },
        { chave: 'vencimento', label: 'Vencimento' },
        { chave: 'situacao', label: 'Situação' },
        { chave: 'pagoEm', label: 'Pago em' },
        { chave: 'cobrador', label: 'Cobrador' },
      ],
      visiveis.flatMap((p) =>
        [...p.titulos].sort(ordemParcela).map((t) => ({
          cliente: String(t.cliente ?? ''),
          aluno: String(t.aluno ?? ''),
          escola: String(t.escola ?? ''),
          telefone: String(t.telefone ?? ''),
          parcela: String(t.parcela ?? ''),
          valor: brl(valorDe(t)),
          vencimento: dataBR(String(t.vencimento ?? '')),
          situacao: statusTitulo(t),
          pagoEm: t.dataPagamento ? dataBR(String(t.dataPagamento)) : '',
          cobrador: t.cobradorId ? nomeCobrador(String(t.cobradorId)) : '',
        })),
      ),
    )

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Financeiro / Contas a Receber"
        titulo="Contas a Receber"
        descricao="Um nome por linha. Clique no nome para ver as informações e os boletos da pessoa e dar a baixa ao receber."
        acoes={
          pCriar && (
            <button onClick={() => abrirForm(null)} className={btnBranco}>
              <Icon nome="plus" className="w-5 h-5" /> Novo título
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Em aberto" valor={soma((t) => t.status === 'Aberto')} />
        <StatCard label="Em atraso" valor={soma(tituloAtrasado)} tom={titulos.some(tituloAtrasado) ? 'red' : 'zinc'} />
        <StatCard label="Vence hoje" valor={soma((t) => t.status === 'Aberto' && t.vencimento === hoje())} tom={titulos.some((t) => t.status === 'Aberto' && t.vencimento === hoje()) ? 'yellow' : 'zinc'} />
        <StatCard label="Recebido no mês" valor={soma((t) => t.status === 'Pago' && String(t.dataPagamento).startsWith(mesAtual()))} />
      </div>

      <Panel
        semPadding
        titulo={`Pessoas • ${visiveis.length}`}
        acoes={
          <>
            <BuscaPessoas valor={busca} onChange={setBusca} rotulo="Pesquisar contas a receber" />
            {pExportar && (
              <button onClick={exportar} className={btnSecundario} title="Exportar as parcelas da lista em CSV">
                <Icon nome="download" className="w-4 h-4" /> CSV
              </button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap gap-2 px-5 py-4 border-b border-white/[0.05]">
          <Filtro ativo={filtro === ''} onClick={() => setFiltro('')}>Todos ({pessoas.length})</Filtro>
          {ORDEM_SITUACAO.filter((st) => contagem.get(st)).map((st) => (
            <Filtro key={st} ativo={filtro === st} onClick={() => setFiltro(filtro === st ? '' : st)}>
              {st} ({contagem.get(st)})
            </Filtro>
          ))}
        </div>

        {visiveis.length === 0 ? (
          <EmptyState titulo="Ninguém encontrado" descricao={busca || filtro ? 'Mude a pesquisa ou o filtro.' : 'Não há contas a receber.'} />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-5 py-3 font-bold">Responsável</th>
                  <th className="px-5 py-3 font-bold">Parcelas</th>
                  <th className="px-5 py-3 font-bold text-right">Em aberto</th>
                  <th className="px-5 py-3 font-bold text-right">Em atraso</th>
                  <th className="px-5 py-3 font-bold">Próximo vencimento</th>
                  <th className="px-5 py-3 font-bold">Situação</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {visiveis.map((p) => (
                  <tr key={p.chave} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => setAberta(p.chave)}>
                    <td className="px-5 py-3">
                      <NomePessoa p={p} />
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {p.pagas} de {p.titulos.length} paga(s)
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap font-bold text-white">{p.emAberto ? brl(p.emAberto) : <span className="text-zinc-600">—</span>}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap font-bold">{p.emAtraso ? <span className="text-red-400">{brl(p.emAtraso)}</span> : <span className="text-zinc-600">—</span>}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {p.proximo ? <span className={p.proximo < hoje() ? 'text-red-400 font-bold' : ''}>{dataBR(p.proximo)}</span> : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge texto={p.situacao} tom={TOM_SITUACAO[p.situacao]} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400 whitespace-nowrap">Abrir →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        aberto={!!pessoa}
        titulo={pessoa?.nome ?? ''}
        subtitulo={pessoa ? `Contas a receber • ${pessoa.titulos.length} parcela(s)` : ''}
        onFechar={() => setAberta(null)}
        largura="max-w-4xl"
        rodape={<button onClick={() => setAberta(null)} className={btnSecundario}>Fechar</button>}
      >
        {pessoa && (
          <FichaPessoa
            p={pessoa}
            vendas={colecao(s, 'vendas_ebooks')}
            pBaixa={pEditar}
            pEditar={pEditar}
            pExcluir={pExcluir}
            onBaixa={setBaixa}
            onEditar={abrirForm}
            onExcluir={setExcluir}
          />
        )}
      </Modal>

      <Modal
        aberto={!!form}
        titulo={form?.titulo ? `Editar parcela ${String(form.titulo.parcela ?? '')}` : 'Novo título'}
        subtitulo="Financeiro / Contas a Receber"
        onFechar={() => setForm(null)}
        rodape={
          <>
            <button onClick={() => setForm(null)} className={btnSecundario}>Cancelar</button>
            <button form="form-titulo" type="submit" disabled={salvando} className={btnPrimario}>{salvando ? 'Salvando...' : 'Salvar'}</button>
          </>
        }
      >
        {form && (
          <form id="form-titulo" onSubmit={salvar} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {CAMPOS_FORM.map((c) => (
              <div key={c.chave} className="space-y-2">
                <label className={labelCls}>
                  {c.label} {c.obrigatorio && <span className="text-blue-500">*</span>}
                </label>
                {c.tipo === 'cobrador' ? (
                  <select value={form.valores[c.chave] ?? ''} onChange={(e) => setForm({ ...form, valores: { ...form.valores, [c.chave]: e.target.value } })} className={`${inputCls} appearance-none`}>
                    <option value="">—</option>
                    {cobradores.map((co) => (
                      <option key={co.id} value={co.id}>{co.nome}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={c.tipo === 'data' ? 'date' : c.tipo === 'moeda' ? 'number' : 'text'}
                    step={c.tipo === 'moeda' ? '0.01' : undefined}
                    min={c.tipo === 'moeda' ? 0 : undefined}
                    required={c.obrigatorio}
                    aria-label={c.label}
                    value={form.valores[c.chave] ?? ''}
                    onChange={(e) => setForm({ ...form, valores: { ...form.valores, [c.chave]: e.target.value } })}
                    className={inputCls}
                  />
                )}
              </div>
            ))}
            {erroForm && <p className="md:col-span-2 text-xs font-bold text-red-400">{erroForm}</p>}
          </form>
        )}
      </Modal>

      <Modal
        aberto={!!baixa}
        titulo="Dar baixa"
        subtitulo="O recebimento entra na meta do cobrador e no faturamento"
        onFechar={() => setBaixa(null)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setBaixa(null)} className={btnSecundario}>Cancelar</button>
            <button
              onClick={() => {
                if (baixa) void baixarTitulo(baixa.id)
                setBaixa(null)
              }}
              className={btnPrimario}
            >
              Confirmar baixa
            </button>
          </>
        }
      >
        {baixa && (
          <p className="text-sm text-zinc-300">
            Confirmar o recebimento da parcela <strong className="text-white">{String(baixa.parcela)}</strong> de{' '}
            <strong className="text-white">{String(baixa.cliente)}</strong>, no valor de <strong className="text-white">{brl(valorDe(baixa))}</strong> (vencimento{' '}
            {dataBR(String(baixa.vencimento))})?
          </p>
        )}
      </Modal>

      <Modal
        aberto={!!excluir}
        titulo="Confirmar exclusão"
        subtitulo="Esta ação ficará registrada na auditoria"
        onFechar={() => setExcluir(null)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setExcluir(null)} className={btnSecundario}>Cancelar</button>
            <button
              onClick={() => {
                if (excluir) void excluirRegistro('titulos', excluir.id, 'financeiro')
                setExcluir(null)
              }}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all"
            >
              Excluir
            </button>
          </>
        }
      >
        {excluir && (
          <p className="text-sm text-zinc-300">
            Excluir a parcela <strong className="text-white">{String(excluir.parcela)}</strong> de <strong className="text-white">{String(excluir.cliente)}</strong> ({brl(valorDe(excluir))})? Não é possível desfazer.
          </p>
        )}
      </Modal>
    </div>
  )
}

function FichaPessoa({
  p,
  vendas,
  pBaixa,
  pEditar,
  pExcluir,
  onBaixa,
  onEditar,
  onExcluir,
}: {
  p: Pessoa
  vendas: Registro[]
  pBaixa: boolean
  pEditar: boolean
  pExcluir: boolean
  onBaixa: (t: Registro) => void
  onEditar: (t: Registro) => void
  onExcluir: (t: Registro) => void
}) {
  return (
    <div className="space-y-6">
      <DadosPessoa p={p} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Total rotulo="Total" valor={brl(p.total)} />
        <Total rotulo="Recebido" valor={brl(p.recebido)} />
        <Total rotulo="Em aberto" valor={brl(p.emAberto)} />
        <Total rotulo="Em atraso" valor={brl(p.emAtraso)} tom="red" />
      </div>

      {blocosPorVenda(p.titulos, vendas).map(({ vendaId, ts, venda }) => (
        <div key={vendaId || 'avulso'} className="rounded-2xl border border-white/[0.06] overflow-hidden">
          <CabecalhoVenda vendaId={vendaId} venda={venda} ts={ts} />
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Parcela</th>
                  <th className="px-4 py-2.5 font-bold">Vencimento</th>
                  <th className="px-4 py-2.5 font-bold text-right">Valor</th>
                  <th className="px-4 py-2.5 font-bold">Situação</th>
                  <th className="px-4 py-2.5 font-bold">Pago em</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {ts.map((t) => {
                  const st = statusTitulo(t)
                  return (
                    <tr key={t.id}>
                      <td className="px-4 py-2.5 font-bold text-white whitespace-nowrap">{String(t.parcela ?? '—')}</td>
                      <td className={`px-4 py-2.5 whitespace-nowrap ${st === 'Atrasado' ? 'text-red-400 font-bold' : ''}`}>{dataBR(String(t.vencimento ?? ''))}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap font-bold text-white">{brl(valorDe(t))}</td>
                      <td className="px-4 py-2.5">
                        <Badge texto={st} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{t.dataPagamento ? dataBR(String(t.dataPagamento)) : <span className="text-zinc-600">—</span>}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end items-center gap-1.5">
                          {pBaixa && t.status === 'Aberto' && (
                            <button
                              onClick={() => onBaixa(t)}
                              className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap transition-all text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20"
                            >
                              Dar baixa
                            </button>
                          )}
                          {pEditar && (
                            <button onClick={() => onEditar(t)} title="Editar parcela" className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.05] transition-all">
                              <Icon nome="edit" className="w-4 h-4" />
                            </button>
                          )}
                          {pExcluir && (
                            <button onClick={() => onExcluir(t)} title="Excluir parcela" className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                              <Icon nome="trash" className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
