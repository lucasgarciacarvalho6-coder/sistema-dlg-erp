'use client'

import { useMemo, useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { BONIFICACAO_ESCOLA_MAX, BONIFICACAO_ESCOLA_MIN } from '@/lib/erp/config'
import { abrirArquivoContrato, anexarArquivoContrato, atualizarRegistro, confirmarContratoEscola, criarRegistro, useErp, usePode } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { CAMPOS_OBRIGATORIOS_CONTRATO, camposFaltando, nomePJ, pixCompleto } from '@/lib/erp/operacional'
import { brl, dataBR, num } from '@/lib/erp/format'
import Icon from '@/components/erp/Icon'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, Tabs, btnBranco, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

type Aba = 'conferencia' | 'agenda' | 'todos' | 'cancelados'

const VAZIO: Record<string, string> = {
  escola: '',
  inep: '',
  cidade: '',
  uf: 'PR',
  endereco: '',
  telefone: '',
  responsavel: '',
  vendedorId: '',
  fichasPrevistas: '',
  dataPrevista: '',
  bonificacaoPorFicha: '',
  pixNome: '',
  pixChave: '',
  pixBanco: '',
  arquivo: '',
  observacao: '',
}

const NUMERICOS = ['fichasPrevistas', 'bonificacaoPorFicha']

export default function ContratosEscolaPage() {
  const s = useErp()
  const podeFazer = usePode()
  const [aba, setAba] = useState<Aba>('conferencia')
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<Registro | null>(null)
  const [form, setForm] = useState<Record<string, string>>(VAZIO)
  const [preview, setPreview] = useState<string | null>(null)
  const [enviandoArquivo, setEnviandoArquivo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<Registro | null>(null)

  const contratos = colecao(s, 'contratos_escola')
  const vendedores = colecao(s, 'pj_vendedores').filter((v) => v.status !== 'Inativo')
  const pCriar = podeFazer('operacional', 'criar')
  const pEditar = podeFazer('operacional', 'editar')

  const lista = useMemo(() => {
    const t = busca.toLowerCase()
    return contratos
      .filter((c) =>
        aba === 'conferencia' ? c.status === 'Em conferência' : aba === 'agenda' ? c.status === 'Na agenda' : aba === 'cancelados' ? c.status === 'Cancelado' : true,
      )
      .filter((c) => !t || `${c.escola} ${c.cidade} ${nomePJ(s, c.vendedorId)}`.toLowerCase().includes(t))
  }, [contratos, aba, busca, s])

  const abrir = (c?: Registro) => {
    const base = { ...VAZIO }
    if (c) for (const k of Object.keys(VAZIO)) base[k] = c[k] === null || c[k] === undefined ? '' : String(c[k])
    setForm(base)
    setEditando(c ?? null)
    setPreview(null)
    setErro(null)
    setAberto(true)
  }

  const escolherArquivo = async (arquivo: File | undefined) => {
    if (!arquivo) return
    if (arquivo.type.startsWith('image/')) setPreview(URL.createObjectURL(arquivo))
    else setPreview(null)
    setEnviandoArquivo(true)
    const r = await anexarArquivoContrato(arquivo)
    setEnviandoArquivo(false)
    if ('erro' in r) setErro(r.erro)
    else setForm((f) => ({ ...f, arquivo: r.caminho }))
  }

  const dados = () => {
    const d: Record<string, string | number> = {}
    for (const [k, v] of Object.entries(form)) d[k] = NUMERICOS.includes(k) ? Number(v.replace(',', '.')) || 0 : v.trim()
    return d
  }
  const faltando = camposFaltando(dados() as Registro)

  const salvar = async (enviarAgenda: boolean) => {
    if (!form.escola.trim()) return setErro('Informe ao menos o nome da escola.')
    setSalvando(true)
    const falha = editando
      ? await atualizarRegistro('contratos_escola', editando.id, dados(), 'operacional')
      : await criarRegistro('contratos_escola', { ...dados(), status: 'Em conferência' }, 'operacional')
    let falhaAgenda: string | null = null
    if (!falha && enviarAgenda && editando) falhaAgenda = await confirmarContratoEscola(editando.id)
    setSalvando(false)
    setErro(falha ?? falhaAgenda)
    if (!falha && !falhaAgenda) setAberto(false)
  }

  const campo = (chave: string, label: string, obrigatorio = false, extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <div className="space-y-2">
      <label className={labelCls}>
        {label} {obrigatorio && <span className="text-blue-500">*</span>}
      </label>
      <input value={form[chave] ?? ''} onChange={(e) => setForm({ ...form, [chave]: e.target.value })} className={inputCls} {...extra} />
    </div>
  )

  const emConferencia = contratos.filter((c) => c.status === 'Em conferência')

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Módulo / Operações"
        titulo="Contratos de Escola"
        descricao="Importe o contrato do vendedor, confira os dados e confirme com a diretora. Confirmado, ele vai para a Agenda Fotográfica."
        acoes={
          pCriar && (
            <button onClick={() => abrir()} className={btnBranco}>
              <Icon nome="upload" className="w-5 h-5" /> Importar contrato
            </button>
          )
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-6">
        <StatCard label="Total de contratos" valor={contratos.length} tom="zinc" />
        <StatCard label="Em conferência" valor={emConferencia.length} tom="orange" detalhe={`${emConferencia.filter((c) => camposFaltando(c).length).length} com dados faltando`} />
        <StatCard label="Na agenda" valor={contratos.filter((c) => c.status === 'Na agenda').length} tom="blue" />
        <StatCard label="Fichas contratadas" valor={num(contratos.filter((c) => c.status !== 'Cancelado').reduce((a, c) => a + Number(c.fichasPrevistas || 0), 0))} tom="emerald" />
        <StatCard label="PIX da escola pendente" valor={contratos.filter((c) => c.status !== 'Cancelado' && !pixCompleto(c)).length} tom="yellow" detalhe="Não bloqueia a revisão" />
      </div>

      <Tabs
        abas={[
          { id: 'conferencia', label: `Em conferência (${emConferencia.length})` },
          { id: 'agenda', label: 'Na agenda' },
          { id: 'todos', label: 'Todos' },
          { id: 'cancelados', label: 'Cancelados' },
        ]}
        ativa={aba}
        onChange={setAba}
      />

      <Panel
        semPadding
        titulo={`Base de contratos • ${lista.length}`}
        acoes={
          <div className="relative group">
            <Icon nome="search" className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-blue-500 transition-colors" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar escola, cidade ou vendedor..." className="bg-black/50 border border-white/[0.05] rounded-xl pl-11 pr-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 w-72" />
          </div>
        }
      >
        {lista.length === 0 ? (
          <EmptyState titulo="Nenhum contrato aqui" descricao={aba === 'conferencia' ? 'Importe um contrato para começar a conferência.' : 'Nada para exibir neste filtro.'} />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-4 py-4 font-bold">Escola</th>
                  <th className="px-4 py-4 font-bold">Vendedor PJ</th>
                  <th className="px-4 py-4 font-bold text-right">Fichas</th>
                  <th className="px-4 py-4 font-bold">Data</th>
                  <th className="px-4 py-4 font-bold text-right">Bonificação</th>
                  <th className="px-4 py-4 font-bold">Pendências</th>
                  {aba === 'todos' && <th className="px-4 py-4 font-bold">Status</th>}
                  <th className="px-4 py-4 font-bold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {lista.map((c) => {
                  const falta = camposFaltando(c)
                  return (
                    <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-4 min-w-[220px]">
                        <p className="text-white font-bold tracking-wide">{String(c.escola)}</p>
                        <p className="text-[11px] text-zinc-500 font-mono">{String(c.cidade || '—')} - {String(c.uf || '')}</p>
                      </td>
                      <td className="px-4 py-4 text-zinc-400 whitespace-nowrap">{nomePJ(s, c.vendedorId)}</td>
                      <td className="px-4 py-4 text-right text-white font-bold">{num(Number(c.fichasPrevistas || 0))}</td>
                      <td className="px-4 py-4 text-zinc-400 whitespace-nowrap">{dataBR(String(c.dataPrevista || ''))}</td>
                      <td className="px-4 py-4 text-right text-zinc-300 whitespace-nowrap">{Number(c.bonificacaoPorFicha) ? `${brl(Number(c.bonificacaoPorFicha))}/ficha` : '—'}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col items-start gap-1.5">
                          {falta.length ? (
                            <span title={`Faltam: ${falta.join(', ')}`}>
                              <Badge texto={`Faltam ${falta.length} dados`} tom="orange" />
                            </span>
                          ) : (
                            <Badge texto="Dados completos" tom="emerald" />
                          )}
                          {!pixCompleto(c) && <Badge texto="PIX pendente" tom="yellow" />}
                        </div>
                      </td>
                      {/* nas outras abas o status já é o próprio filtro */}
                      {aba === 'todos' && (
                        <td className="px-4 py-4">
                          <Badge texto={String(c.status)} tom={c.status === 'Na agenda' ? 'blue' : c.status === 'Cancelado' ? 'red' : 'orange'} />
                        </td>
                      )}
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          {c.status === 'Em conferência' && pEditar && (
                            <button
                              onClick={() => (falta.length ? abrir(c) : setConfirmar(c))}
                              title={falta.length ? `Faltam: ${falta.join(', ')}` : 'A diretora confirmou o contrato e a data: enviar para a Agenda Fotográfica'}
                              className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap text-emerald-400 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20"
                            >
                              {falta.length ? 'Completar' : 'Enviar à agenda →'}
                            </button>
                          )}
                          {c.arquivo && (
                            <button onClick={() => abrirArquivoContrato(String(c.arquivo))} title={String(c.arquivo)} className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.05]">
                              <Icon nome="doc" className="w-4 h-4" />
                            </button>
                          )}
                          {pEditar && (
                            <button onClick={() => abrir(c)} title="Revisar / editar" className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.05]">
                              <Icon nome="edit" className="w-4 h-4" />
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
        )}
      </Panel>

      {/* Importar / revisar contrato */}
      <Modal
        aberto={aberto}
        titulo={editando ? `Revisar contrato • ${editando.escola}` : 'Importar contrato'}
        subtitulo="Confira os dados antes de concluir • PIX da escola pode ser completado depois"
        onFechar={() => setAberto(false)}
        largura="max-w-5xl"
        rodape={
          <>
            {editando && editando.status === 'Em conferência' && (
              <button
                onClick={async () => {
                  setSalvando(true)
                  const f = await atualizarRegistro('contratos_escola', editando.id, { status: 'Cancelado' }, 'operacional')
                  setSalvando(false)
                  if (!f) setAberto(false)
                }}
                className="mr-auto px-5 py-3 text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/10 rounded-xl"
              >
                Cancelar contrato
              </button>
            )}
            <button onClick={() => setAberto(false)} className={btnSecundario}>Fechar</button>
            <button onClick={() => salvar(false)} disabled={salvando || enviandoArquivo} className={btnSecundario}>
              {salvando ? 'Salvando...' : 'Salvar em conferência'}
            </button>
            {editando && editando.status === 'Em conferência' && (
              <button onClick={() => salvar(true)} disabled={salvando || enviandoArquivo || faltando.length > 0} className={btnPrimario} title={faltando.length ? `Faltam: ${faltando.join(', ')}` : ''}>
                Diretora confirmou • enviar para agenda
              </button>
            )}
          </>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Documento */}
          <div className="lg:col-span-2 space-y-4">
            <label className="block border border-dashed border-white/[0.1] hover:border-blue-500/50 bg-white/[0.02] rounded-3xl p-6 text-center cursor-pointer transition-all group">
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => escolherArquivo(e.target.files?.[0])} />
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Contrato" className="w-full max-h-80 object-contain rounded-xl" />
              ) : (
                <div className="py-8">
                  <div className="w-14 h-14 bg-white/[0.05] group-hover:bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4 transition-all">
                    <Icon nome="upload" className="w-6 h-6 text-zinc-400 group-hover:text-blue-500" />
                  </div>
                  <p className="text-white font-bold text-sm uppercase tracking-widest">{form.arquivo ? 'Trocar arquivo' : 'Anexar contrato'}</p>
                  <p className="text-zinc-600 text-[10px] uppercase tracking-widest mt-1">Foto ou PDF • até 10 MB</p>
                </div>
              )}
              {enviandoArquivo && <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mt-3">Enviando arquivo...</p>}
              {form.arquivo && !enviandoArquivo && <p className="text-[10px] text-zinc-500 mt-3 truncate">📎 {form.arquivo.replace(/^[0-9a-f-]{36}-/, '')}</p>}
            </label>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-[11px] text-zinc-300 leading-relaxed">
              <p className="font-bold text-blue-400 uppercase tracking-widest text-[10px] mb-1">Leitura automática (em breve)</p>
              Nesta versão, confira o documento e preencha os campos ao lado. A leitura por IA vai preencher tudo sozinha e você só revisa.
            </div>
            {/* Checklist dos obrigatórios */}
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 space-y-1.5">
              <p className={`${labelCls} mb-2 block`}>Campos obrigatórios para ir à agenda</p>
              {CAMPOS_OBRIGATORIOS_CONTRATO.map((f) => {
                const ok = !faltando.includes(f.label)
                return (
                  <p key={f.chave} className={`text-xs flex items-center gap-2 ${ok ? 'text-zinc-400' : 'text-orange-400 font-bold'}`}>
                    <span className="w-4">{ok ? '✓' : '•'}</span> {f.label}
                  </p>
                )
              })}
              <p className="text-xs flex items-center gap-2 text-zinc-500 pt-1 border-t border-white/[0.05] mt-2">
                <span className="w-4">{pixCompleto(dados() as Registro) ? '✓' : '○'}</span> PIX da escola (opcional agora)
              </p>
            </div>
          </div>

          {/* Campos */}
          <div className="lg:col-span-3 space-y-6">
            <div className="space-y-4">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">Dados da escola</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">{campo('escola', 'Escola', true, { placeholder: 'Nome como está no contrato' })}</div>
                {campo('cidade', 'Cidade', true)}
                <div className="grid grid-cols-2 gap-4">
                  {campo('uf', 'UF')}
                  {campo('inep', 'INEP')}
                </div>
                <div className="md:col-span-2">{campo('endereco', 'Endereço', true)}</div>
                {campo('telefone', 'Telefone', true)}
                {campo('responsavel', 'Responsável (diretora)', true)}
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/[0.05]">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">Contrato e bonificação</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className={labelCls}>
                    Vendedor de contrato (PJ) <span className="text-blue-500">*</span>
                  </label>
                  <select value={form.vendedorId} onChange={(e) => setForm({ ...form, vendedorId: e.target.value })} className={`${inputCls} appearance-none`}>
                    <option value="">Selecione...</option>
                    {vendedores.map((v) => (
                      <option key={v.id} value={v.id}>{String(v.nome)}</option>
                    ))}
                  </select>
                </div>
                {campo('fichasPrevistas', 'Fichas previstas (alunos)', true, { type: 'number', min: 0 })}
                {campo('dataPrevista', 'Data agendada', true, { type: 'date' })}
                <div className="space-y-2">
                  <label className={labelCls}>
                    Bonificação por ficha (R$) <span className="text-blue-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input type="number" step="0.5" min={0} value={form.bonificacaoPorFicha} onChange={(e) => setForm({ ...form, bonificacaoPorFicha: e.target.value })} className={inputCls} />
                    {Array.from({ length: BONIFICACAO_ESCOLA_MAX - BONIFICACAO_ESCOLA_MIN + 1 }, (_, i) => BONIFICACAO_ESCOLA_MIN + i).map((v) => (
                      <button key={v} type="button" onClick={() => setForm({ ...form, bonificacaoPorFicha: String(v) })} className={`px-3 rounded-xl text-xs font-bold border ${Number(form.bonificacaoPorFicha) === v ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 'border-white/[0.05] text-zinc-400 hover:text-white'}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-500">Doação à escola por aluno fotografado (entre R$ {BONIFICACAO_ESCOLA_MIN} e R$ {BONIFICACAO_ESCOLA_MAX}).</p>
                </div>
                <div className="md:col-span-2">{campo('observacao', 'Observação')}</div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/[0.05]">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">Dados PIX da escola <span className="text-zinc-500 normal-case tracking-normal font-medium">— pode completar depois</span></p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {campo('pixNome', 'Nome de quem recebe')}
                {campo('pixChave', 'Chave PIX')}
                {campo('pixBanco', 'Banco')}
              </div>
            </div>
            {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
          </div>
        </div>
      </Modal>

      {/* Confirmação: diretora deu ok → agenda */}
      <Modal
        aberto={!!confirmar}
        titulo="Enviar para a Agenda Fotográfica"
        subtitulo="Diretora confirmou o contrato e a data"
        onFechar={() => setConfirmar(null)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setConfirmar(null)} className={btnSecundario}>Voltar</button>
            <button
              onClick={async () => {
                if (confirmar) await confirmarContratoEscola(confirmar.id)
                setConfirmar(null)
              }}
              className={btnPrimario}
            >
              Confirmar e enviar
            </button>
          </>
        }
      >
        {confirmar && (
          <div className="space-y-3 text-sm text-zinc-300">
            <p>
              <strong className="text-white">{String(confirmar.escola)}</strong> ({String(confirmar.cidade)}) em{' '}
              <strong className="text-white">{dataBR(String(confirmar.dataPrevista))}</strong>, {num(Number(confirmar.fichasPrevistas))} fichas previstas.
            </p>
            <p className="text-xs text-zinc-500">A visita entra na agenda e a Produção recebe a ordem aguardando as fotos.</p>
            {!pixCompleto(confirmar) && <p className="text-xs text-yellow-400">PIX da escola ainda pendente — lembre de completar antes do fechamento.</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}
