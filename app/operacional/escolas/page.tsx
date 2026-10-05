'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Registro } from '@/lib/erp/types'
import { atualizarRegistro, criarRegistro, excluirRegistro, useErp, usePode } from '@/lib/erp/store'
import { dataBR, mesAtual, num } from '@/lib/erp/format'
import { chaveEscola, escolasComHistorico, type EscolaComHistorico, type SituacaoAno } from '@/lib/erp/escolas'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import Icon from '@/components/erp/Icon'

// OPERAÇÕES › Escolas: todas as escolas que já estão no sistema (cadastro + as que aparecem nos contratos e na agenda),
// com o histórico de cada uma. Quase todo ano a empresa volta na mesma escola: o "Novo contrato desta escola"
// abre o contrato já preenchido com os dados da escola e o PIX do último contrato.

const FORM_VAZIO = { nome: '', cidade: '', uf: 'PR', inep: '', endereco: '', responsavel: '', telefone: '', status: 'Ativa', observacao: '' }
type FormEscola = typeof FORM_VAZIO
type Filtro = '' | SituacaoAno

export default function EscolasPage() {
  const s = useErp()
  const router = useRouter()
  const podeFazer = usePode()
  const pCriar = podeFazer('operacional', 'criar')
  const pEditar = podeFazer('operacional', 'editar')
  const ano = mesAtual().slice(0, 4)
  const [busca, setBusca] = useState('')
  const [uf, setUf] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('')
  const [aberta, setAberta] = useState<string | null>(null) // ficha da escola
  const [editando, setEditando] = useState<{ id: string | null; form: FormEscola } | null>(null) // cadastro novo (id null) ou edição

  const escolas = useMemo(() => escolasComHistorico(s, ano), [s, ano])
  const ufs = [...new Set(escolas.map((e) => e.uf).filter(Boolean))].sort()
  const termo = busca.trim().toLowerCase()
  const lista = escolas
    .filter((e) => !uf || e.uf === uf)
    .filter((e) => !filtro || e.esteAno === filtro)
    .filter((e) => !termo || [e.nome, e.cidade, e.inep, e.responsavel].some((x) => x.toLowerCase().includes(termo)))
  const conta = (sit: SituacaoAno) => escolas.filter((e) => e.esteAno === sit).length
  const escola = aberta ? escolas.find((e) => e.id === aberta) : undefined

  const abrirCadastro = (e?: EscolaComHistorico) =>
    setEditando({
      id: e?.registro ? e.id : null, // escola que só existia nos contratos: ao salvar, entra no cadastro
      form: e
        ? { nome: e.nome, cidade: e.cidade, uf: e.uf || 'PR', inep: e.inep, endereco: e.endereco, responsavel: e.responsavel, telefone: e.telefone, status: e.status || 'Ativa', observacao: String(e.registro?.observacao ?? '') }
        : { ...FORM_VAZIO },
    })
  const novoContrato = (e: EscolaComHistorico) => router.push(`/operacional/contratos?escola=${encodeURIComponent(e.id)}`)

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Módulo / Operações"
        titulo="Escolas"
        descricao={`Todas as escolas que já estão no sistema. Quase todo ano voltamos na mesma escola: abra a escola para ver o histórico e criar o contrato de ${ano} já preenchido.`}
        acoes={
          pCriar && (
            <button onClick={() => abrirCadastro()} className={btnPrimario}>
              <Icon nome="plus" className="w-4 h-4" /> Cadastrar escola
            </button>
          )
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Escolas no sistema" valor={num(escolas.length)} detalhe={`${num(escolas.filter((e) => e.anos.length > 1).length)} já fotografadas em mais de um ano`} />
        <StatCard label={`Fotografadas em ${ano}`} valor={num(conta('Fotografada'))} />
        <StatCard label={`Agendadas / em conferência`} valor={num(conta('Agendada') + conta('Contrato em conferência'))} detalhe={`${num(conta('Agendada'))} na agenda • ${num(conta('Contrato em conferência'))} em conferência`} />
        <StatCard label={`Sem contrato em ${ano}`} valor={num(conta('Sem contrato'))} detalhe="dá para voltar nelas" />
      </div>

      <Panel
        semPadding
        titulo={`Escolas (${num(lista.length)})`}
        subtitulo="Clique na escola para ver os dados, o histórico e criar o contrato novo"
        acoes={
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Icon nome="search" className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar escola, cidade, INEP ou responsável" className={`${inputCls} !py-2.5 pl-10 w-80 max-w-full`} />
            </div>
            <select value={uf} onChange={(e) => setUf(e.target.value)} className={`${inputCls} !py-2.5 !w-28`}>
              <option value="">Todas UF</option>
              {ufs.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} className={`${inputCls} !py-2.5 !w-56`}>
              <option value="">Todas as situações</option>
              <option value="Sem contrato">Sem contrato em {ano}</option>
              <option value="Contrato em conferência">Contrato em conferência</option>
              <option value="Agendada">Agendada em {ano}</option>
              <option value="Fotografada">Fotografada em {ano}</option>
            </select>
          </div>
        }
      >
        {lista.length === 0 ? (
          <EmptyState titulo="Nenhuma escola aqui" descricao="Cadastre a escola ou mude a busca e os filtros." />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-4 py-4 font-bold">Escola</th>
                  <th className="px-4 py-4 font-bold">Cidade</th>
                  <th className="px-4 py-4 font-bold">Contato</th>
                  <th className="px-4 py-4 font-bold">Anos fotografada</th>
                  <th className="px-4 py-4 font-bold">Última visita</th>
                  <th className="px-4 py-4 font-bold text-right">{ano}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {lista.map((e) => (
                  <tr key={e.id} onClick={() => setAberta(e.id)} className="cursor-pointer hover:bg-white/[0.03]" title="Abrir a escola">
                    <td className="px-4 py-3 min-w-[240px]">
                      <span className="block text-white font-bold">{e.nome}</span>
                      <span className="block text-[11px] text-zinc-500">
                        {e.inep ? `INEP ${e.inep}` : 'sem INEP'}
                        {e.status === 'Inativa' ? ' • inativa' : ''}
                        {!e.registro ? ' • ainda fora do cadastro' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {e.cidade}
                      {e.uf ? `/${e.uf}` : ''}
                    </td>
                    <td className="px-4 py-3 text-xs min-w-[170px]">
                      <span className="block text-zinc-200">{e.responsavel || '—'}</span>
                      <span className="block text-zinc-500">{e.telefone}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-1">
                        {e.anos.length ? (
                          e.anos.map((a) => (
                            <span key={a} className="px-2 py-0.5 rounded-md bg-white/[0.06] text-[10px] font-black text-zinc-200">
                              {a}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-zinc-600">—</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {e.ultimaVisita ? (
                        <>
                          <span className="block text-white font-bold">{dataBR(String(e.ultimaVisita.data))}</span>
                          <span className="block text-zinc-500">{num(Number(e.ultimaVisita.fichasFotografadas))} fichas</span>
                        </>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Badge texto={e.esteAno === 'Sem contrato' ? 'Sem contrato' : e.esteAno} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {escola && (
        <FichaEscola
          e={escola}
          ano={ano}
          pCriar={pCriar}
          pEditar={pEditar}
          pExcluir={podeFazer('operacional', 'excluir')}
          onEditar={() => abrirCadastro(escola)}
          onNovoContrato={() => novoContrato(escola)}
          onFechar={() => setAberta(null)}
        />
      )}
      {editando && <CadastroEscola key={editando.id ?? 'nova'} id={editando.id} inicial={editando.form} escolas={escolas} onFechar={() => setEditando(null)} />}
    </div>
  )
}

// Ficha da escola: dados + histórico de contratos e visitas
function FichaEscola({
  e,
  ano,
  pCriar,
  pEditar,
  pExcluir,
  onEditar,
  onNovoContrato,
  onFechar,
}: {
  e: EscolaComHistorico
  ano: string
  pCriar: boolean
  pEditar: boolean
  pExcluir: boolean
  onEditar: () => void
  onNovoContrato: () => void
  onFechar: () => void
}) {
  const linhas = [
    ...e.contratos.map((c) => ({ id: c.id, data: String(c.criadoEm ?? '').slice(0, 10), tipo: 'Contrato', detalhe: `${num(Number(c.fichasPrevistas))} fichas previstas`, status: String(c.status) })),
    ...e.visitas.map((v) => ({
      id: v.id,
      data: String(v.data),
      tipo: v.retornoDe ? 'Visita (retorno)' : 'Visita',
      detalhe: v.status === 'Agendada' ? `${num(Number(v.fichasConfirmadas))}/${num(Number(v.fichasPrevistas))} fichas confirmadas` : `${num(Number(v.fichasFotografadas))} fichas fotografadas`,
      status: String(v.status),
    })),
  ].sort((a, b) => b.data.localeCompare(a.data))
  const dado = (rotulo: string, valor: string) => (
    <div>
      <p className={labelCls}>{rotulo}</p>
      <p className="text-sm text-white mt-1 break-words">{valor || '—'}</p>
    </div>
  )
  // excluir: só a escola cadastrada sem contrato nem visita (cadastrada por engano); com histórico, inativar
  const [excluir, setExcluir] = useState(false)
  const historico = [e.contratos.length ? `${num(e.contratos.length)} contrato(s)` : '', e.visitas.length ? `${num(e.visitas.length)} visita(s)` : ''].filter(Boolean).join(' e ')
  const registro = e.registro
  return (
    <Modal
      aberto
      titulo={e.nome}
      subtitulo={`${e.cidade}${e.uf ? `/${e.uf}` : ''} • ${e.anos.length ? `fotografada em ${e.anos.join(', ')}` : 'ainda não fotografada'} • ${ano}: ${e.esteAno.toLowerCase()}`}
      onFechar={onFechar}
      largura="max-w-3xl"
      rodape={
        <>
          {pEditar && (
            <button onClick={onEditar} className={`${btnSecundario} ${pExcluir && registro ? '' : 'mr-auto'}`}>
              <Icon nome="edit" className="w-4 h-4" /> Editar escola
            </button>
          )}
          {pExcluir && registro && (
            <button onClick={() => setExcluir(true)} className="mr-auto px-4 py-3 text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/10 rounded-xl">
              Excluir
            </button>
          )}
          <button onClick={onFechar} className={btnSecundario}>
            Fechar
          </button>
          {pCriar && (
            <button onClick={onNovoContrato} className={btnPrimario}>
              Novo contrato desta escola →
            </button>
          )}
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {dado('INEP', e.inep)}
        {dado('Situação', e.status)}
        {dado('Endereço', e.endereco)}
        {dado('Telefone', e.telefone)}
        {dado('Responsável', e.responsavel)}
        {dado('Observação', String(e.registro?.observacao ?? ''))}
      </div>
      {!e.registro && <p className="text-[11px] text-zinc-500">Esta escola aparece nos contratos e na agenda, mas ainda não está no cadastro. Ao editar, ela entra no cadastro.</p>}
      <div className="space-y-2">
        <p className={labelCls}>Histórico ({num(linhas.length)})</p>
        {linhas.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhum contrato ou visita ainda.</p>
        ) : (
          <div className="rounded-2xl border border-white/[0.06] divide-y divide-white/[0.04]">
            {linhas.map((l) => (
              <div key={`${l.tipo}-${l.id}`} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-20 shrink-0 font-bold text-white">{l.data ? dataBR(l.data) : '—'}</span>
                  <span className="text-zinc-400">{l.tipo}</span>
                  <span className="text-zinc-300 truncate">{l.detalhe}</span>
                </span>
                <Badge texto={l.status} />
              </div>
            ))}
          </div>
        )}
      </div>
      {excluir && registro && (
        <Modal
          aberto
          titulo={historico ? 'Não dá para excluir' : 'Excluir escola?'}
          subtitulo={e.nome}
          onFechar={() => setExcluir(false)}
          largura="max-w-md"
          rodape={
            <>
              <button onClick={() => setExcluir(false)} className={btnSecundario}>Voltar</button>
              {historico ? (
                e.status !== 'Inativa' && (
                  <button onClick={() => atualizarRegistro('escolas', registro.id, { status: 'Inativa' }, 'operacional').then((x) => !x && setExcluir(false))} className={btnPrimario}>
                    Inativar
                  </button>
                )
              ) : (
                <button
                  onClick={() => excluirRegistro('escolas', registro.id, 'operacional').then((x) => !x && onFechar())}
                  className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl"
                >
                  Excluir
                </button>
              )}
            </>
          }
        >
          <p className="text-sm text-zinc-300">
            {historico
              ? `A escola já tem histórico (${historico}): excluir apagaria o que aconteceu. ${e.status === 'Inativa' ? 'Ela já está inativa.' : 'Inative: ela continua na lista com o histórico.'}`
              : 'A escola sai do cadastro. Use para cadastro feito por engano ou em duplicidade.'}
          </p>
        </Modal>
      )}
    </Modal>
  )
}

// Cadastro / edição da escola (no cadastro central de escolas). Não deixa duplicar: mesmo INEP ou mesmo nome + cidade + UF.
function CadastroEscola({ id, inicial, escolas, onFechar }: { id: string | null; inicial: FormEscola; escolas: EscolaComHistorico[]; onFechar: () => void }) {
  const [form, setForm] = useState<FormEscola>(inicial)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const campo = (k: keyof FormEscola, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const salvar = async () => {
    const nome = form.nome.trim()
    const cidade = form.cidade.trim()
    const ufTxt = form.uf.trim().toUpperCase()
    if (!nome || !cidade || !ufTxt) return setErro('Informe o nome, a cidade e a UF da escola.')
    const inep = form.inep.replace(/\D/g, '')
    const igual = escolas.find(
      (e) => e.registro && e.id !== id && ((inep && e.inep === inep) || chaveEscola(e.nome, e.cidade, e.uf) === chaveEscola(nome, cidade, ufTxt)),
    )
    if (igual) return setErro(`Esta escola já está cadastrada: ${igual.nome} (${igual.cidade}/${igual.uf}).`)
    setErro('')
    setSalvando(true)
    const dados: Partial<Registro> = {
      nome,
      cidade,
      uf: ufTxt,
      inep,
      endereco: form.endereco.trim(),
      responsavel: form.responsavel.trim(),
      telefone: form.telefone.trim(),
      status: form.status,
      observacao: form.observacao.trim(),
    }
    const falha = id ? await atualizarRegistro('escolas', id, dados, 'operacional') : await criarRegistro('escolas', dados as Omit<Registro, 'id' | 'criadoEm'>, 'operacional')
    setSalvando(false)
    if (!falha) onFechar()
  }
  const entrada = (k: keyof FormEscola, rotulo: string, extra: Record<string, unknown> = {}) => (
    <label className="space-y-1.5">
      <span className={labelCls}>{rotulo}</span>
      <input value={form[k]} onChange={(e) => campo(k, e.target.value)} className={inputCls} {...extra} />
    </label>
  )
  return (
    <Modal
      aberto
      titulo={id ? `Editar escola • ${inicial.nome}` : inicial.nome ? `Cadastrar escola • ${inicial.nome}` : 'Cadastrar escola'}
      subtitulo="Os dados ficam guardados para os próximos contratos da escola"
      onFechar={onFechar}
      largura="max-w-2xl"
      rodape={
        <>
          <button onClick={onFechar} className={btnSecundario}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando} className={btnPrimario}>
            {salvando ? 'Salvando...' : 'Salvar escola'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">{entrada('nome', 'Escola *', { placeholder: 'Ex.: E M JOSÉ EVARISTO COSTA', autoFocus: true })}</div>
        {entrada('cidade', 'Cidade *')}
        <div className="grid grid-cols-2 gap-3">
          {entrada('uf', 'UF *', { maxLength: 2 })}
          <label className="space-y-1.5">
            <span className={labelCls}>Situação</span>
            <select value={form.status} onChange={(e) => campo('status', e.target.value)} className={inputCls}>
              <option value="Ativa">Ativa</option>
              <option value="Inativa">Inativa</option>
            </select>
          </label>
        </div>
        {entrada('inep', 'INEP', { inputMode: 'numeric' })}
        {entrada('telefone', 'Telefone')}
        <div className="sm:col-span-2">{entrada('endereco', 'Endereço')}</div>
        {entrada('responsavel', 'Responsável (diretora)')}
        {entrada('observacao', 'Observação')}
      </div>
      {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
    </Modal>
  )
}
