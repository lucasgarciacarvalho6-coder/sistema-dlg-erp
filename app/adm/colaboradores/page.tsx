'use client'

import { useMemo, useRef, useState } from 'react'
import type { Colaborador, Setor } from '@/lib/erp/types'
import { SETORES_ERP, SETORES, perfilDoSetor } from '@/lib/erp/config'
import { avisar, definirFoto, excluirColaborador, salvarColaborador, useErp, usePode, useUsuario } from '@/lib/erp/store'
import { dataBR, hoje, iniciais } from '@/lib/erp/format'
import Icon from '@/components/erp/Icon'
import { Avatar, Badge, EmptyState, Modal, PageHeader, Panel, StatCard, TONS, btnBranco, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

// vendedores externos são cadastrados em ADM › Vendedores externos.
// Não existe setor "Vendas" interno na DLG (a venda interna é o Vendas Rebolo): fica fora do cadastro.
const SETORES_IDS = SETORES_ERP.filter((x) => x !== 'vendas')

type Form = {
  nome: string
  cpf: string
  email: string
  telefone: string
  setor: Setor
  funcao: string
  dataAdmissao: string
  senha: string
  status: 'ATIVO' | 'INATIVO'
  semMeta: boolean
}

const vazio = (): Form => ({ nome: '', cpf: '', email: '', telefone: '', setor: 'operacional', funcao: SETORES.operacional.funcoes[0], dataAdmissao: hoje(), senha: '', status: 'ATIVO', semMeta: false })

export default function ColaboradoresPage() {
  const s = useErp()
  const eu = useUsuario()
  const podeFazer = usePode()
  const [busca, setBusca] = useState('')
  const [filtroSetor, setFiltroSetor] = useState<Setor | ''>('')
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<Colaborador | null>(null)
  const [form, setForm] = useState<Form>(vazio)
  const [erro, setErro] = useState('')
  const [excluir, setExcluir] = useState<Colaborador | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [fotoDe, setFotoDe] = useState<string | null>(null) // id do colaborador cuja foto está sendo enviada
  const inputFoto = useRef<HTMLInputElement>(null)
  const alvoFoto = useRef<string | null>(null)

  const escolherFoto = (id: string) => {
    alvoFoto.current = id
    inputFoto.current?.click()
  }

  const enviarFoto = async (arquivo: File | undefined) => {
    const id = alvoFoto.current
    if (!arquivo || !id) return
    setFotoDe(id)
    const erro = await definirFoto(id, arquivo)
    setFotoDe(null)
    avisar(erro ?? 'Foto atualizada.', erro ? 'erro' : 'ok')
    if (inputFoto.current) inputFoto.current.value = ''
  }

  const pCriar = podeFazer('usuarios', 'criar')
  const pEditar = podeFazer('usuarios', 'editar')
  const pExcluir = podeFazer('usuarios', 'excluir')

  const lista = useMemo(() => {
    const t = busca.toLowerCase()
    return s.colaboradores
      .filter((c) => (!filtroSetor || c.setor === filtroSetor) && (!t || `${c.nome} ${c.email} ${c.funcao}`.toLowerCase().includes(t)))
      .sort((a, b) => a.setor.localeCompare(b.setor) || a.nome.localeCompare(b.nome))
  }, [s.colaboradores, busca, filtroSetor])

  const abrirNovo = () => {
    setForm(vazio())
    setEditando(null)
    setErro('')
    setAberto(true)
  }

  const abrirEdicao = (c: Colaborador) => {
    setForm({ nome: c.nome, cpf: c.cpf, email: c.email, telefone: c.telefone, setor: c.setor, funcao: c.funcao, dataAdmissao: c.dataAdmissao, senha: '', status: c.status, semMeta: !!c.semMeta })
    setEditando(c)
    setErro('')
    setAberto(true)
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editando && form.senha.length < 6) return setErro('Defina uma senha inicial com ao menos 6 caracteres.')
    if (editando && form.senha && form.senha.length < 6) return setErro('A nova senha precisa ter ao menos 6 caracteres.')
    const { senha, ...resto } = form
    setSalvando(true)
    const erroSalvar = await salvarColaborador({ ...resto, senha: senha || editando?.senha || '' }, editando?.id)
    setSalvando(false)
    if (erroSalvar) return setErro(erroSalvar)
    setAberto(false)
  }

  const alternarStatus = (c: Colaborador) => {
    const { id, criadoEm, perfil, ...dados } = c
    void criadoEm
    void perfil
    salvarColaborador({ ...dados, status: c.status === 'ATIVO' ? 'INATIVO' : 'ATIVO' }, id)
  }

  const ativos = s.colaboradores.filter((c) => c.status === 'ATIVO')

  return (
    <div className="space-y-8 animate-fade-in-up">
      <input ref={inputFoto} type="file" accept="image/*" className="hidden" onChange={(e) => enviarFoto(e.target.files?.[0])} />
      <PageHeader
        modulo="Diretoria / Usuários"
        titulo="Colaboradores"
        descricao="Cadastre cada profissional e defina o setor dele. O setor determina a área que ele acessa após o login e as metas que alimentam o seu dashboard."
        acoes={
          pCriar && (
            <button onClick={abrirNovo} className={btnBranco}>
              <Icon nome="plus" className="w-5 h-5" /> Novo colaborador
            </button>
          )
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 xl:grid-cols-9 gap-4">
        <StatCard label="Total" valor={s.colaboradores.length} detalhe={`${ativos.length} ativos`} />
        {SETORES_IDS.map((x) => (
          <button key={x} onClick={() => setFiltroSetor(filtroSetor === x ? '' : x)} className="text-left">
            <div className={`bg-painel-2/80 border ${filtroSetor === x ? 'border-blue-500/50' : 'border-white/[0.05]'} p-5 rounded-3xl hover:-translate-y-1 transition-all h-full`}>
              <p className={`text-[9px] font-bold uppercase tracking-[0.15em] ${TONS[SETORES[x].tom].texto} mb-2`}>{SETORES[x].nome}</p>
              <p className="text-3xl font-black text-white">{ativos.filter((c) => c.setor === x).length}</p>
            </div>
          </button>
        ))}
      </div>

      <Panel
        semPadding
        titulo={`Diretório • ${lista.length} colaborador(es)`}
        acoes={
          <>
            <select value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value as Setor | '')} className="bg-black/50 border border-white/[0.05] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl px-4 py-2.5 outline-none focus:border-blue-500/50">
              <option value="">Todos os setores</option>
              {SETORES_IDS.map((x) => (
                <option key={x} value={x}>{SETORES[x].nome}</option>
              ))}
            </select>
            <div className="relative group">
              <Icon nome="search" className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-blue-500 transition-colors" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou e-mail..." className="bg-black/50 border border-white/[0.05] rounded-xl pl-11 pr-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 w-64" />
            </div>
          </>
        }
      >
        {lista.length === 0 ? (
          <EmptyState titulo="Nenhum colaborador" descricao="Ajuste os filtros ou cadastre um novo colaborador." />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-6 py-4 font-bold">Colaborador</th>
                  <th className="px-6 py-4 font-bold">Setor</th>
                  <th className="px-6 py-4 font-bold">Função</th>
                  <th className="px-6 py-4 font-bold">Perfil</th>
                  <th className="px-6 py-4 font-bold">Contato</th>
                  <th className="px-6 py-4 font-bold">Admissão</th>
                  <th className="px-6 py-4 font-bold">Status</th>
                  <th className="px-6 py-4 font-bold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {lista.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={!pEditar || fotoDe === c.id}
                          onClick={() => escolherFoto(c.id)}
                          title={pEditar ? 'Clique para trocar a foto' : undefined}
                          className="relative group/foto shrink-0 disabled:cursor-default"
                        >
                          <Avatar texto={iniciais(c.nome)} foto={c.foto} tamanho="w-10 h-10" />
                          {pEditar && (
                            <span className={`absolute inset-0 rounded-xl bg-black/60 flex items-center justify-center transition-opacity ${fotoDe === c.id ? 'opacity-100' : 'opacity-0 group-hover/foto:opacity-100'}`}>
                              <Icon nome="camera" className="w-4 h-4 text-white" />
                            </span>
                          )}
                        </button>
                        <div>
                          <p className="text-white font-bold">{c.nome}</p>
                          <p className="text-[11px] text-zinc-500">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge texto={SETORES[c.setor].nome} tom={SETORES[c.setor].tom} />
                        {c.semMeta && SETORES[c.setor].indicadores.length > 0 && <Badge texto="Sem meta" tom="zinc" />}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-zinc-400 whitespace-nowrap">{c.funcao}</td>
                    <td className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400">{c.perfil}</td>
                    <td className="px-6 py-4 text-zinc-500 whitespace-nowrap">{c.telefone || '—'}</td>
                    <td className="px-6 py-4 text-zinc-500">{dataBR(c.dataAdmissao)}</td>
                    <td className="px-6 py-4"><Badge texto={c.status} /></td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        {pEditar && c.id !== eu?.id && (
                          <button onClick={() => alternarStatus(c)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap ${c.status === 'ATIVO' ? 'text-red-400 border-red-500/20 bg-red-500/10' : 'text-blue-400 border-blue-500/20 bg-blue-500/10'}`}>
                            {c.status === 'ATIVO' ? 'Desativar' : 'Ativar'}
                          </button>
                        )}
                        {pEditar && (
                          <button onClick={() => abrirEdicao(c)} title="Editar" className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.05]">
                            <Icon nome="edit" className="w-4 h-4" />
                          </button>
                        )}
                        {pExcluir && c.id !== eu?.id && (
                          <button onClick={() => setExcluir(c)} title="Excluir" className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10">
                            <Icon nome="trash" className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        aberto={aberto}
        titulo={editando ? 'Editar colaborador' : 'Cadastrar novo colaborador'}
        subtitulo="O setor define a área de acesso após o login"
        onFechar={() => setAberto(false)}
        rodape={
          <>
            <button onClick={() => setAberto(false)} className={btnSecundario}>Cancelar</button>
            <button form="form-colab" type="submit" disabled={salvando} className={btnPrimario}>{salvando ? 'Salvando...' : 'Salvar colaborador'}</button>
          </>
        }
      >
        <form id="form-colab" onSubmit={salvar} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2 flex items-center gap-4 bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4">
            {(() => {
              const atual = editando ? s.colaboradores.find((c) => c.id === editando.id) : undefined
              return (
                <>
                  <Avatar texto={iniciais(form.nome || '?')} foto={atual?.foto} tamanho="w-16 h-16" arredondado="rounded-2xl" textoCls="text-lg" />
                  <div className="flex-1">
                    <p className={labelCls}>Foto de perfil</p>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {editando ? 'Aparece no card do colaborador na Visão TV.' : 'Adicione depois de salvar — aqui ou pelo próprio colaborador no menu do perfil.'}
                    </p>
                  </div>
                  {editando && (
                    <button type="button" disabled={fotoDe === editando.id} onClick={() => escolherFoto(editando.id)} className={btnSecundario}>
                      <Icon nome="camera" className="w-4 h-4" /> {fotoDe === editando.id ? 'Enviando...' : atual?.foto ? 'Trocar' : 'Enviar foto'}
                    </button>
                  )}
                </>
              )
            })()}
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className={labelCls}>Nome completo *</label>
            <input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inputCls} placeholder="Ex.: Carlos Alberto da Silva" />
          </div>
          <div className="space-y-2">
            <label className={labelCls}>CPF</label>
            <input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className={inputCls} placeholder="000.000.000-00" />
          </div>
          <div className="space-y-2">
            <label className={labelCls}>Telefone</label>
            <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className={inputCls} placeholder="(00) 00000-0000" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className={labelCls}>E-mail de acesso *</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} placeholder="nome@dlgphotos.com" />
          </div>
          <div className="space-y-2">
            <label className={labelCls}>Setor *</label>
            <select
              value={form.setor}
              onChange={(e) => {
                const setor = e.target.value as Setor
                setForm({ ...form, setor, funcao: SETORES[setor].funcoes[0] })
              }}
              className={`${inputCls} appearance-none`}
            >
              {SETORES_IDS.map((x) => (
                <option key={x} value={x}>{SETORES[x].nome}</option>
              ))}
            </select>
            <p className="text-[10px] text-zinc-500">
              Perfil: <strong className="text-white">{perfilDoSetor(form.setor)}</strong> • entra em <strong className="text-white">{SETORES[form.setor].home}</strong>
            </p>
          </div>
          <div className="space-y-2">
            <label className={labelCls}>Função *</label>
            <select value={form.funcao} onChange={(e) => setForm({ ...form, funcao: e.target.value })} className={`${inputCls} appearance-none`}>
              {SETORES[form.setor].funcoes.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          {SETORES[form.setor].indicadores.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <label className={labelCls}>Meta</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: false, t: '✅ Tem meta', d: 'Aparece nos cards de meta, no ranking e soma na meta do setor.' },
                  { v: true, t: '⛔ Sem meta', d: 'Ex.: Financeiro e Gerência. Fica fora dos cards e do ranking; o que lançar continua contando no setor.' },
                ].map((o) => (
                  <button
                    key={String(o.v)}
                    type="button"
                    onClick={() => setForm({ ...form, semMeta: o.v })}
                    className={`text-left p-3 rounded-xl border transition-all ${form.semMeta === o.v ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/[0.06] hover:bg-white/[0.02]'}`}
                  >
                    <p className="text-xs font-black text-white">{o.t}</p>
                    <p className="text-[10px] text-zinc-500 mt-1">{o.d}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <label className={labelCls}>Data de admissão</label>
            <input type="date" value={form.dataAdmissao} onChange={(e) => setForm({ ...form, dataAdmissao: e.target.value })} className={inputCls} />
          </div>
          <div className="space-y-2">
            <label className={labelCls}>{editando ? 'Nova senha (opcional)' : 'Senha inicial *'}</label>
            <input type="text" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className={inputCls} placeholder={editando ? 'Deixe em branco para manter' : 'mín. 6 caracteres'} />
          </div>
          {erro && <p className="md:col-span-2 text-xs font-bold text-red-400">{erro}</p>}
        </form>
      </Modal>

      <Modal
        aberto={!!excluir}
        titulo="Excluir colaborador"
        subtitulo="Ação registrada na auditoria"
        onFechar={() => setExcluir(null)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setExcluir(null)} className={btnSecundario}>Cancelar</button>
            <button
              onClick={async () => {
                if (excluir) await excluirColaborador(excluir.id)
                setExcluir(null)
              }}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl"
            >
              Excluir
            </button>
          </>
        }
      >
        <p className="text-sm text-zinc-300">
          Excluir <strong className="text-white">{excluir?.nome}</strong>? O histórico de produção é mantido. Prefira <em>Desativar</em> para bloquear o acesso sem apagar o cadastro.
        </p>
      </Modal>
    </div>
  )
}
