'use client'

import { useRef, useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { avisar, atualizarRegistro, criarRegistro, excluirRegistro, useErp, usePode } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { dataBR, num } from '@/lib/erp/format'
import { fichasDoLote, lotesProducao } from '@/lib/erp/producao'
import { EmptyState, Modal, PageHeader, Panel, ProgressBar, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import Icon from '@/components/erp/Icon'

// PRODUÇÃO › Fichas: as escolas chegam sozinhas (as mesmas do Controle da produção).
// Clicou na escola → página dela com os alunos (código, nome e quantidade de fotos), cadastrados um por um.

export default function FichasPage() {
  const s = useErp()
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const lotes = lotesProducao(s)
  const lote = aberta ? lotes.find((l) => l.id === aberta) : undefined
  if (lote) return <FichasDaEscola lote={lote} onVoltar={() => setAberta(null)} />

  const fichasPorLote = new Map<string, number>()
  for (const f of colecao(s, 'producao_fichas')) fichasPorLote.set(String(f.loteId), (fichasPorLote.get(String(f.loteId)) ?? 0) + 1)
  const termo = busca.trim().toLowerCase()
  const lista = lotes
    .filter((l) => !termo || [l.escola, l.cidade, l.uf].some((x) => String(x ?? '').toLowerCase().includes(termo)))
    .sort((a, b) => String(b.dataFoto).localeCompare(String(a.dataFoto)) || String(a.escola).localeCompare(String(b.escola)))
  const th = 'px-5 py-4 font-bold whitespace-nowrap'

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader modulo="Módulo / Produção" titulo="Fichas dos alunos" descricao="Todas as escolas da Produção aparecem aqui sozinhas. Clique na escola para cadastrar os alunos: código, nome e quantidade de fotos." />
      <Panel
        semPadding
        titulo="Escolas"
        subtitulo={`${lista.length} escola(s)`}
        acoes={
          <div className="relative w-80 max-w-full">
            <Icon nome="search" className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar escola ou cidade" className={`${inputCls} !py-2.5 pl-10`} />
          </div>
        }
      >
        {lista.length === 0 ? (
          <EmptyState titulo="Nenhuma escola" descricao={termo ? 'Nenhuma escola com esse nome ou cidade.' : 'As escolas aparecem aqui quando a visita é encerrada nas Operações.'} />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className={th}>Escola</th>
                  <th className={th}>Data da foto</th>
                  <th className={`${th} text-right`}>Alunos</th>
                  <th className={`${th} w-64`}>Fichas cadastradas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {lista.map((l) => {
                  const feitas = fichasPorLote.get(l.id) ?? 0
                  const alunos = Number(l.alunos) || 0
                  return (
                    <tr key={l.id} onClick={() => setAberta(l.id)} title="Abrir as fichas desta escola" className="cursor-pointer hover:bg-white/[0.03]">
                      <td className="px-5 py-3 min-w-[240px]">
                        <span className="block text-white font-bold">{String(l.escola)}</span>
                        <span className="block text-[11px] text-zinc-500">
                          {String(l.cidade)}
                          {l.uf ? `/${String(l.uf)}` : ''}
                          {l.retorno ? <span className="text-zinc-400 font-black"> • ↺ Retorno</span> : null}
                        </span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap font-bold text-white">{dataBR(String(l.dataFoto))}</td>
                      <td className="px-5 py-3 text-right font-bold text-white">{num(alunos)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-black whitespace-nowrap ${alunos > 0 && feitas >= alunos ? 'text-emerald-400' : 'text-white'}`}>
                            {num(feitas)} de {num(alunos)}
                          </span>
                          <ProgressBar valor={alunos > 0 ? (feitas / alunos) * 100 : 0} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

type Form = { id: string; codigo: string; nome: string; qtdFotos: string }
const vazio: Form = { id: '', codigo: '', nome: '', qtdFotos: '' }

function FichasDaEscola({ lote, onVoltar }: { lote: Registro; onVoltar: () => void }) {
  const s = useErp()
  const podeFazer = usePode()
  const pCriar = podeFazer('edicao', 'criar')
  const pEditar = podeFazer('edicao', 'editar')
  const [form, setForm] = useState<Form | null>(null) // aberto = cadastrar (id vazio) ou corrigir
  const [msg, setMsg] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [apagar, setApagar] = useState<string | null>(null) // 1º clique pede confirmação
  const refCodigo = useRef<HTMLInputElement>(null)
  const alunos = fichasDoLote(s, lote.id)
  const totalFotos = alunos.reduce((a, f) => a + (Number(f.qtdFotos) || 0), 0)

  const salvar = async () => {
    if (!form) return
    const codigo = form.codigo.trim()
    const nome = form.nome.trim()
    const qtd = Number(form.qtdFotos || 0)
    if (!codigo || !nome) return setMsg('Preencha o código e o nome do aluno.')
    if (!Number.isInteger(qtd) || qtd < 0) return setMsg('Quantidade de fotos inválida.')
    if (alunos.some((f) => f.id !== form.id && String(f.codigo).trim().toLowerCase() === codigo.toLowerCase())) return setMsg(`O código ${codigo} já está cadastrado nesta escola.`)
    setSalvando(true)
    const dados = { loteId: lote.id, codigo, nome, qtdFotos: qtd }
    const erro = form.id ? await atualizarRegistro('producao_fichas', form.id, dados, 'edicao') : await criarRegistro('producao_fichas', dados, 'edicao')
    setSalvando(false)
    if (erro) return setMsg(erro)
    if (form.id) {
      avisar('Aluno corrigido.', 'ok')
      setForm(null)
    } else {
      // cadastro um por um: limpa e já fica pronto para o próximo aluno
      setForm(vazio)
      setMsg(`✓ ${nome} cadastrado. Pode digitar o próximo aluno.`)
      setTimeout(() => refCodigo.current?.focus(), 0)
    }
  }

  const excluir = async (id: string) => {
    if (apagar !== id) return setApagar(id)
    setApagar(null)
    const erro = await excluirRegistro('producao_fichas', id, 'edicao')
    if (!erro) avisar('Aluno excluído.', 'ok')
  }

  const th = 'px-5 py-4 font-bold whitespace-nowrap'
  return (
    <div className="space-y-8 animate-fade-in-up">
      <button onClick={onVoltar} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">
        ← Voltar para as escolas
      </button>
      <PageHeader
        modulo="Produção / Fichas"
        titulo={String(lote.escola)}
        descricao={`${String(lote.cidade)}${lote.uf ? `/${String(lote.uf)}` : ''} • foto em ${dataBR(String(lote.dataFoto))} • ${num(Number(lote.alunos))} alunos fotografados${lote.retorno ? ' • ↺ retorno' : ''}`}
        acoes={
          pCriar && (
            <button
              onClick={() => {
                setForm(vazio)
                setMsg('')
              }}
              className={btnPrimario}
            >
              <Icon nome="plus" className="w-4 h-4" /> Cadastrar aluno
            </button>
          )
        }
      />

      <Panel semPadding titulo={`Alunos (${num(alunos.length)} de ${num(Number(lote.alunos))})`} subtitulo={`${num(totalFotos)} foto(s) no total`}>
        {alunos.length === 0 ? (
          <EmptyState titulo="Nenhum aluno cadastrado" descricao="Clique em “Cadastrar aluno” e digite o código, o nome e a quantidade de fotos de cada aluno." />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className={th}>Código</th>
                  <th className={th}>Nome do aluno</th>
                  <th className={`${th} text-right`}>Fotos</th>
                  {pEditar && <th className={`${th} text-right`}>Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {alunos.map((f) => (
                  <tr key={f.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3 font-black text-white whitespace-nowrap">{String(f.codigo)}</td>
                    <td className="px-5 py-3 text-white">{String(f.nome)}</td>
                    <td className="px-5 py-3 text-right font-bold text-white">{num(Number(f.qtdFotos))}</td>
                    {pEditar && (
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => {
                            setForm({ id: f.id, codigo: String(f.codigo), nome: String(f.nome), qtdFotos: String(f.qtdFotos ?? '') })
                            setMsg('')
                          }}
                          title="Corrigir"
                          className="p-2 text-zinc-400 hover:text-white"
                        >
                          <Icon nome="edit" className="w-4 h-4" />
                        </button>
                        <button onClick={() => excluir(f.id)} title="Excluir" className={`p-2 ${apagar === f.id ? 'text-red-400 font-black text-[10px] uppercase tracking-widest' : 'text-zinc-400 hover:text-red-400'}`}>
                          {apagar === f.id ? 'Confirmar?' : <Icon nome="trash" className="w-4 h-4" />}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        aberto={!!form}
        titulo={form?.id ? 'Corrigir aluno' : 'Cadastrar aluno'}
        subtitulo={String(lote.escola)}
        onFechar={() => setForm(null)}
        rodape={
          <>
            <button onClick={() => setForm(null)} className={btnSecundario}>
              {form?.id ? 'Cancelar' : 'Fechar'}
            </button>
            <button disabled={salvando} onClick={salvar} className={btnPrimario}>
              {salvando ? 'Salvando...' : form?.id ? 'Salvar' : 'Salvar aluno'}
            </button>
          </>
        }
      >
        {form && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void salvar()
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_140px] gap-3">
              <label className="space-y-1.5">
                <span className={labelCls}>Código</span>
                <input ref={refCodigo} autoFocus value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Ex.: 1024" className={inputCls} />
              </label>
              <label className="space-y-1.5">
                <span className={labelCls}>Nome do aluno</span>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" className={inputCls} />
              </label>
              <label className="space-y-1.5">
                <span className={labelCls}>Quantidade de fotos</span>
                <input type="number" min={0} value={form.qtdFotos} onChange={(e) => setForm({ ...form, qtdFotos: e.target.value })} placeholder="0" className={inputCls} />
              </label>
            </div>
            {/* Enter salva (cadastro rápido, um aluno atrás do outro) */}
            <button type="submit" className="hidden" aria-hidden="true" />
            {msg && <p className={`text-xs font-bold ${msg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</p>}
          </form>
        )}
      </Modal>
    </div>
  )
}
