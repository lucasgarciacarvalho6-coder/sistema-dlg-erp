'use client'

import { useMemo, useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { parametros } from '@/lib/erp/parametros'
import { abrirArquivoContrato, anexarArquivoContrato, atualizarRegistro, baixarArquivoContrato, cancelarContratoEscola, confirmarContratoEscola, criarRegistro, excluirContratoEscola, urlArquivoContrato, useErp, usePode } from '@/lib/erp/store'
import { lerContratoLocal } from '@/lib/erp/leitura-contrato'
import { colecao } from '@/lib/erp/metrics'
import { CAMPOS_OBRIGATORIOS_CONTRATO, camposFaltando, corEquipe, equipeDaVisita, lerJSON, nomePJ, nomeVeiculo, pixCompleto } from '@/lib/erp/operacional'
import { brl, dataBR, num } from '@/lib/erp/format'
import Icon from '@/components/erp/Icon'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, TONS, Tabs, btnBranco, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

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

// Campos que a leitura automática pode preencher (vendedor vem por nome e é casado com o cadastro)
const CAMPOS_IA = ['escola', 'inep', 'cidade', 'uf', 'endereco', 'telefone', 'responsavel', 'fichasPrevistas', 'dataPrevista', 'bonificacaoPorFicha', 'pixNome', 'pixChave', 'pixBanco']
const normalizar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

type EstadoIA =
  | { estado: 'parado' }
  | { estado: 'lendo'; progresso: number; etapa: string }
  | { estado: 'ok'; lidos: number; texto: string; fonte: 'ia' | 'local'; aviso?: string }
  | { estado: 'erro'; msg: string }

export default function ContratosEscolaPage() {
  const s = useErp()
  const par = parametros(s)
  const bonMin = par.bonificacaoEscolaMin
  const bonMax = par.bonificacaoEscolaMax
  // atalhos de valor: de 1 em 1 se a faixa for curta, senão só mínimo e máximo
  const atalhosBonificacao = bonMax - bonMin <= 4 ? Array.from({ length: Math.floor(bonMax - bonMin) + 1 }, (_, i) => bonMin + i) : [bonMin, bonMax]
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
  // Cancelar / excluir (com confirmação)
  const [acao, setAcao] = useState<{ tipo: 'cancelar' | 'excluir'; contrato: Registro } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [executando, setExecutando] = useState(false)
  // Leitura automática (IA grátis do Google; sem ela, OCR no navegador): estado, campos preenchidos e a conferir
  const [ia, setIa] = useState<EstadoIA>({ estado: 'parado' })
  const [iaCampos, setIaCampos] = useState<Set<string>>(new Set())
  const [duvidas, setDuvidas] = useState<Set<string>>(new Set())
  const [ultimoArquivo, setUltimoArquivo] = useState<File | File[] | null>(null)
  // páginas já guardadas do contrato (fotos enviadas pelo app do vendedor ou arquivo anexado antes)
  const [paginasSalvas, setPaginasSalvas] = useState<{ caminho: string; url: string }[]>([])
  const [verTexto, setVerTexto] = useState(false)

  const contratos = colecao(s, 'contratos_escola')
  const vendedores = colecao(s, 'pj_vendedores').filter((v) => v.status !== 'Inativo' && v.tipo !== 'Books')
  const pCriar = podeFazer('operacional', 'criar')
  const pEditar = podeFazer('operacional', 'editar')
  // Escola já fotografada: fichas, fechamento e pagamentos dependem da visita → não cancela nem exclui
  const jaFotografado = (c: Registro) =>
    colecao(s, 'agenda_visitas').some((v) => v.contratoId === c.id && (v.status === 'Fotografada' || v.status === 'Fechamento enviado'))
  // Equipe direcionada para o contrato confirmado (da visita na agenda)
  const celulaEquipe = (c: Registro) => {
    if (c.status !== 'Na agenda') return <span className="text-[10px] text-zinc-600">—</span>
    const v = colecao(s, 'agenda_visitas')
      .filter((x) => x.contratoId === c.id && x.status !== 'Cancelada')
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))[0]
    if (!v) return <span className="text-[10px] text-zinc-600">—</span>
    const eq = equipeDaVisita(s, v)
    if (!eq.nome && !eq.veiculo && !eq.motorista && !eq.fotografos.length) return <Badge texto="Equipe a definir" tom="yellow" />
    return (
      <div className="text-[11px] leading-snug space-y-0.5">
        <p className={`font-black uppercase tracking-wider text-[10px] ${TONS[corEquipe(eq.nome)].texto}`}>{eq.nome || 'Equipe sem nome'}</p>
        <p className="text-zinc-300">🚐 {eq.veiculo ? nomeVeiculo(eq.veiculo) : String(v.carro || '') || <span className="text-yellow-400">sem veículo</span>}</p>
        <p className="text-zinc-400">
          🧑‍✈️ {eq.motorista ? String(eq.motorista.nome).split(' ')[0] : <span className="text-yellow-400">sem motorista</span>} • 📷{' '}
          {eq.fotografos.length ? eq.fotografos.map((f) => String(f.nome).split(' ')[0]).join(', ') : <span className="text-yellow-400">sem fotógrafo</span>}
        </p>
      </div>
    )
  }
  const pedirAcao = (tipo: 'cancelar' | 'excluir', contrato: Registro) => {
    setMotivo('')
    setAcao({ tipo, contrato })
  }
  const executarAcao = async () => {
    if (!acao) return
    setExecutando(true)
    const falha = acao.tipo === 'cancelar' ? await cancelarContratoEscola(acao.contrato.id, motivo) : await excluirContratoEscola(acao.contrato.id)
    setExecutando(false)
    if (falha) return
    setAcao(null)
    if (editando?.id === acao.contrato.id) setAberto(false)
  }

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
    setIa({ estado: 'parado' })
    setIaCampos(new Set())
    setDuvidas(new Set())
    setUltimoArquivo(null)
    setPaginasSalvas([])
    setAberto(true)
    if (c) void carregarPaginas(c)
  }

  // Mostra as páginas guardadas e, se o contrato veio do app e ainda não foi lido, já roda a leitura
  const carregarPaginas = async (c: Registro) => {
    const caminhos = lerJSON<string[]>(c.paginas, [])
    const lista = caminhos.length ? caminhos : c.arquivo && /\.(jpe?g|png|webp)$/i.test(String(c.arquivo)) ? [String(c.arquivo)] : []
    if (!lista.length) return
    const urls = await Promise.all(lista.map(async (caminho) => ({ caminho, url: (await urlArquivoContrato(caminho)) ?? '' })))
    const validas = urls.filter((u) => u.url)
    setPaginasSalvas(validas)
    if (validas[0]) setPreview(validas[0].url)
    const naoLido = c.origem === 'App' && c.status === 'Em conferência' && !String(c.telefone || '').trim() && !String(c.endereco || '').trim()
    if (naoLido) void lerPaginasSalvas(lista)
  }

  const lerPaginasSalvas = async (caminhos: string[]) => {
    const arquivos: File[] = []
    for (const [i, caminho] of caminhos.entries()) {
      const blob = await baixarArquivoContrato(caminho)
      if (blob) arquivos.push(new File([blob], `pagina-${i + 1}.jpg`, { type: blob.type || 'image/jpeg' }))
    }
    if (!arquivos.length) return setIa({ estado: 'erro', msg: 'Não consegui abrir as fotos do contrato.' })
    setUltimoArquivo(arquivos)
    await lerComIA(arquivos)
  }

  const lerComIA = async (arquivo: File | File[]) => {
    setIa({ estado: 'lendo', progresso: 0, etapa: 'Preparando' })
    setVerTexto(false)
    const r = await lerContratoLocal(
      arquivo,
      vendedores.map((v) => String(v.nome)),
      (p, etapa) => setIa({ estado: 'lendo', progresso: p, etapa }),
    )
    if ('erro' in r) return setIa({ estado: 'erro', msg: r.erro })
    const c = r.campos
    const novos: Record<string, string> = {}
    for (const k of CAMPOS_IA) {
      const v = c[k as keyof typeof c]
      if (v === undefined || String(v).trim() === '' || (NUMERICOS.includes(k) && !Number(v))) continue
      if (k === 'dataPrevista' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) continue
      novos[k] = k === 'uf' ? String(v).trim().toUpperCase().slice(0, 2) : String(v).trim()
    }
    if (c.vendedorNome) {
      const alvo = normalizar(String(c.vendedorNome))
      const v =
        vendedores.find((x) => normalizar(String(x.nome)) === alvo) ??
        vendedores.find((x) => normalizar(String(x.nome)).includes(alvo) || alvo.includes(normalizar(String(x.nome))))
      if (v) novos.vendedorId = v.id
    }
    // Preenche o que está vazio (ou que a própria IA tinha preenchido antes); o que a pessoa digitou fica
    setForm((f) => {
      const n = { ...f }
      for (const [k, v] of Object.entries(novos)) if (!String(f[k] ?? '').trim() || (NUMERICOS.includes(k) && !Number(f[k])) || iaCampos.has(k)) n[k] = v
      return n
    })
    // turmas, CNPJ da escola, assinatura... (o que não tem campo próprio) vão para a observação
    if (r.observacao) setForm((f) => (!f.observacao.trim() || iaCampos.has('observacao') ? { ...f, observacao: r.observacao } : f))
    const lidos = r.observacao ? [...Object.keys(novos), 'observacao'] : Object.keys(novos)
    setIaCampos(new Set(lidos))
    setDuvidas(new Set(r.duvidas.map((d) => (d === 'vendedorNome' ? 'vendedorId' : d)).filter((d) => lidos.includes(d))))
    setIa({ estado: 'ok', lidos: lidos.length, texto: r.texto, fonte: r.fonte, aviso: r.aviso })
  }

  const escolherArquivo = async (arquivo: File | undefined) => {
    if (!arquivo) return
    if (arquivo.type.startsWith('image/')) setPreview(URL.createObjectURL(arquivo))
    else setPreview(null)
    setUltimoArquivo(arquivo)
    // envio do arquivo e leitura automática acontecem ao mesmo tempo
    const leitura = lerComIA(arquivo)
    setEnviandoArquivo(true)
    const r = await anexarArquivoContrato(arquivo)
    setEnviandoArquivo(false)
    if ('erro' in r) setErro(r.erro)
    else setForm((f) => ({ ...f, arquivo: r.caminho }))
    await leitura
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

  // Marca do campo: "lido" = preenchido pela leitura automática; "confira" = achado sem rótulo, conferir
  const marcaIA = (chave: string) =>
    duvidas.has(chave) ? (
      <span className="ml-2 px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 text-[8px] font-black tracking-widest">CONFIRA</span>
    ) : iaCampos.has(chave) ? (
      <span className="ml-2 px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-300 text-[8px] font-black tracking-widest">LIDO</span>
    ) : null
  const destaqueIA = (chave: string) => (duvidas.has(chave) ? '!border-yellow-500/60' : '')
  const alterarCampo = (chave: string, valor: string) => {
    setForm((f) => ({ ...f, [chave]: valor }))
    if (duvidas.has(chave)) setDuvidas((d) => new Set([...d].filter((x) => x !== chave))) // conferido pela pessoa
  }

  const campo = (chave: string, label: string, obrigatorio = false, extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <div className="space-y-2">
      <label className={labelCls}>
        {label} {obrigatorio && <span className="text-blue-500">*</span>}
        {marcaIA(chave)}
      </label>
      <input value={form[chave] ?? ''} onChange={(e) => alterarCampo(chave, e.target.value)} className={`${inputCls} ${destaqueIA(chave)}`} {...extra} />
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
        <StatCard label="Em conferência" valor={emConferencia.length} detalhe={`${emConferencia.filter((c) => camposFaltando(c).length).length} com dados faltando`} />
        <StatCard label="Na agenda" valor={contratos.filter((c) => c.status === 'Na agenda').length} />
        <StatCard label="Fichas contratadas" valor={num(contratos.filter((c) => c.status !== 'Cancelado').reduce((a, c) => a + Number(c.fichasPrevistas || 0), 0))} />
        <StatCard
          label="PIX da escola pendente"
          valor={contratos.filter((c) => c.status !== 'Cancelado' && !pixCompleto(c)).length}
          tom={contratos.some((c) => c.status !== 'Cancelado' && !pixCompleto(c)) ? 'yellow' : 'zinc'}
          detalhe="Não bloqueia a revisão"
        />
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
                  {aba !== 'todos' && <th className="px-4 py-4 font-bold text-right">Bonificação</th>}
                  {aba !== 'agenda' && <th className="px-4 py-4 font-bold">Pendências</th>}
                  {(aba === 'agenda' || aba === 'todos') && <th className="px-4 py-4 font-bold">Equipe da viagem</th>}
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
                        <p className="text-white font-bold tracking-wide">
                          {String(c.escola)}
                          {c.origem === 'App' && <span className="ml-2 align-middle px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-300 text-[8px] font-black tracking-widest">📱 APP</span>}
                        </p>
                        <p className="text-[11px] text-zinc-500 font-mono">{String(c.cidade || '—')} - {String(c.uf || '')}</p>
                      </td>
                      <td className="px-4 py-4 text-zinc-400 whitespace-nowrap" title={String(nomePJ(s, c.vendedorId))}>
                        {/* primeiro e último nome: a tabela cabe em telas de notebook */}
                        {String(nomePJ(s, c.vendedorId)).split(' ').filter((_, i, a) => i === 0 || i === a.length - 1).join(' ')}
                      </td>
                      <td className="px-4 py-4 text-right text-white font-bold">{num(Number(c.fichasPrevistas || 0))}</td>
                      <td className="px-4 py-4 text-zinc-400 whitespace-nowrap">{dataBR(String(c.dataPrevista || ''))}</td>
                      {aba !== 'todos' && <td className="px-4 py-4 text-right text-zinc-300 whitespace-nowrap">{Number(c.bonificacaoPorFicha) ? `${brl(Number(c.bonificacaoPorFicha))}/ficha` : '—'}</td>}
                      {aba !== 'agenda' && (
                      <td className="px-4 py-4">
                        <div className="flex flex-col items-start gap-1.5">
                          {falta.length ? (
                            <span title={`Faltam: ${falta.join(', ')}`}>
                              <Badge texto={`Faltam ${falta.length} dados`} tom="yellow" />
                            </span>
                          ) : (
                            <Badge texto="Dados completos" />
                          )}
                          {!pixCompleto(c) && <Badge texto="PIX pendente" tom="yellow" />}
                        </div>
                      </td>
                      )}
                      {(aba === 'agenda' || aba === 'todos') && (
                        <td className="px-4 py-4 min-w-[200px]">
                          {celulaEquipe(c)}
                          {aba === 'agenda' && !pixCompleto(c) && (
                            <div className="mt-1.5">
                              <Badge texto="PIX pendente" tom="yellow" />
                            </div>
                          )}
                        </td>
                      )}
                      {/* nas outras abas o status já é o próprio filtro */}
                      {aba === 'todos' && (
                        <td className="px-4 py-4">
                          <Badge texto={String(c.status)} />
                        </td>
                      )}
                      <td className="px-3 py-4">
                        <div className="flex justify-end gap-0.5">
                          {c.status === 'Em conferência' && pEditar && (
                            <button
                              onClick={() => (falta.length ? abrir(c) : setConfirmar(c))}
                              title={falta.length ? `Faltam: ${falta.join(', ')}` : 'A diretora confirmou o contrato e a data: enviar para a Agenda Fotográfica'}
                              className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20"
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
                          {pEditar && c.status === 'Cancelado' && (
                            <button
                              onClick={() => atualizarRegistro('contratos_escola', c.id, { status: 'Em conferência' }, 'operacional')}
                              title="Cancelado por engano? Volta para a conferência"
                              className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20"
                            >
                              Reativar
                            </button>
                          )}
                          {pEditar && c.status !== 'Cancelado' && (
                            <button onClick={() => pedirAcao('cancelar', c)} title="Cancelar contrato (fica no histórico)" className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10">
                              <Icon nome="x" className="w-4 h-4" />
                            </button>
                          )}
                          {pEditar && (
                            <button onClick={() => pedirAcao('excluir', c)} title="Excluir contrato (erro de digitação, duplicado...)" className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10">
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
            {editando && pEditar && (
              <div className="mr-auto flex gap-1">
                {editando.status !== 'Cancelado' && (
                  <button onClick={() => pedirAcao('cancelar', editando)} className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/10 rounded-xl">
                    Cancelar contrato
                  </button>
                )}
                <button onClick={() => pedirAcao('excluir', editando)} className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/10 rounded-xl">
                  Excluir
                </button>
              </div>
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
              {paginasSalvas.length > 1 && (
                <span className="flex gap-2 mt-3 justify-center" onClick={(e) => e.preventDefault()}>
                  {paginasSalvas.map((p, i) => (
                    <button key={p.caminho} type="button" onClick={() => setPreview(p.url)} className={`w-12 h-16 rounded-lg overflow-hidden border ${preview === p.url ? 'border-blue-500' : 'border-white/[0.1]'}`} title={`Página ${i + 1}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={`Página ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </span>
              )}
              {form.arquivo && !enviandoArquivo && <p className="text-[10px] text-zinc-500 mt-3 truncate">📎 {form.arquivo.replace(/^[0-9a-f-]{36}-/, '')}</p>}
            </label>
            <div
              className={`rounded-2xl p-4 text-[11px] text-zinc-300 leading-relaxed border ${
                ia.estado === 'erro' ? 'bg-red-500/10 border-red-500/20' : ia.estado === 'ok' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/[0.03] border-white/[0.08]'
              }`}
            >
              <p className={`font-bold uppercase tracking-widest text-[10px] mb-1 ${ia.estado === 'erro' ? 'text-red-400' : ia.estado === 'ok' ? 'text-emerald-400' : 'text-zinc-300'}`}>
                Leitura automática (grátis)
              </p>
              {ia.estado === 'parado' && 'Anexe a foto ou o PDF do contrato: a IA lê o documento, inclusive a letra à mão, e preenche os campos ao lado. Você só confere antes de concluir. Foto de perto, reta e bem iluminada lê melhor.'}
              {ia.estado === 'lendo' && (
                <>
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
                    {ia.etapa === 'Lendo com IA' ? 'Lendo o contrato com IA... (alguns segundos)' : `${ia.etapa}... ${Math.round(ia.progresso * 100)}%`}
                  </span>
                  <span className="block h-1 mt-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <span className={`block h-full bg-blue-500 transition-all ${ia.etapa === 'Lendo com IA' ? 'animate-pulse' : ''}`} style={{ width: `${ia.etapa === 'Lendo com IA' ? 100 : Math.round(ia.progresso * 100)}%` }}></span>
                  </span>
                  {ia.etapa === 'Lendo o texto' && <span className="block mt-1 text-zinc-500">Leitura básica do navegador (na primeira vez baixa o idioma português, ~2 MB).</span>}
                </>
              )}
              {ia.estado === 'ok' && (
                <>
                  {ia.aviso && <span className="block mb-1 text-yellow-400 font-bold">{ia.aviso}</span>}
                  {ia.lidos > 0
                    ? `${ia.fonte === 'ia' ? 'A IA leu o contrato e preencheu' : 'Preenchi'} ${ia.lidos} campo(s), marcados com "LIDO". Confira todos antes de concluir.`
                    : 'Li o documento, mas não reconheci os campos. Veja o texto lido abaixo e preencha à mão.'}
                  {duvidas.size > 0 && <span className="text-yellow-400 font-bold"> {duvidas.size} campo(s) em amarelo estavam difíceis de ler: confira.</span>}
                  <button type="button" onClick={() => setVerTexto(!verTexto)} className="block mt-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white">
                    {verTexto ? '▾ Esconder o que foi lido' : '▸ Ver tudo o que foi lido'}
                  </button>
                  {verTexto && <pre className="mt-2 max-h-48 overflow-auto custom-scrollbar whitespace-pre-wrap text-[10px] text-zinc-400 bg-black/40 rounded-xl p-3">{ia.texto}</pre>}
                </>
              )}
              {ia.estado === 'erro' && ia.msg}
              {!ultimoArquivo && paginasSalvas.length > 0 && ia.estado !== 'lendo' && (
                <button type="button" onClick={() => lerPaginasSalvas(paginasSalvas.map((p) => p.caminho))} className="block mt-2 text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-white">
                  ▶ Ler as páginas deste contrato
                </button>
              )}
              {ultimoArquivo && ia.estado !== 'lendo' && ia.estado !== 'parado' && (
                <button type="button" onClick={() => lerComIA(ultimoArquivo)} className="block mt-2 text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-white">
                  ↻ Ler novamente
                </button>
              )}
            </div>
            {/* Checklist dos obrigatórios */}
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 space-y-1.5">
              <p className={`${labelCls} mb-2 block`}>Campos obrigatórios para ir à agenda</p>
              {CAMPOS_OBRIGATORIOS_CONTRATO.map((f) => {
                const ok = !faltando.includes(f.label)
                return (
                  <p key={f.chave} className={`text-xs flex items-center gap-2 ${ok ? 'text-zinc-400' : 'text-yellow-400 font-bold'}`}>
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
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Dados da escola</p>
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
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Contrato e bonificação</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className={labelCls}>
                    Vendedor de contrato (PJ) <span className="text-blue-500">*</span>
                    {marcaIA('vendedorId')}
                  </label>
                  <select value={form.vendedorId} onChange={(e) => alterarCampo('vendedorId', e.target.value)} className={`${inputCls} appearance-none ${destaqueIA('vendedorId')}`}>
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
                    {marcaIA('bonificacaoPorFicha')}
                  </label>
                  <div className="flex gap-2">
                    <input type="number" step="0.5" min={0} value={form.bonificacaoPorFicha} onChange={(e) => alterarCampo('bonificacaoPorFicha', e.target.value)} className={`${inputCls} ${destaqueIA('bonificacaoPorFicha')}`} />
                    {atalhosBonificacao.map((v) => (
                      <button key={v} type="button" onClick={() => setForm({ ...form, bonificacaoPorFicha: String(v) })} className={`px-3 rounded-xl text-xs font-bold border ${Number(form.bonificacaoPorFicha) === v ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 'border-white/[0.05] text-zinc-400 hover:text-white'}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-500">Doação à escola por aluno fotografado (entre R$ {bonMin} e R$ {bonMax} • faixa editável em ADM › Configurações).</p>
                </div>
                <div className="md:col-span-2">
                  <div className="space-y-2">
                    <label className={labelCls}>
                      Observação {marcaIA('observacao')}
                    </label>
                    <textarea rows={3} value={form.observacao ?? ''} onChange={(e) => alterarCampo('observacao', e.target.value)} className={`${inputCls} resize-y`} />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/[0.05]">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Dados PIX da escola <span className="text-zinc-500 normal-case tracking-normal font-medium">— pode completar depois</span></p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                {campo('pixNome', 'Titular (quem recebe)')}
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

      {/* Confirmação: cancelar ou excluir contrato */}
      <Modal
        aberto={!!acao}
        titulo={acao?.tipo === 'excluir' ? 'Excluir contrato?' : 'Cancelar contrato?'}
        subtitulo={acao ? `${acao.contrato.escola} • ${acao.contrato.cidade || ''}` : ''}
        onFechar={() => setAcao(null)}
        largura="max-w-lg"
        rodape={
          <>
            <button onClick={() => setAcao(null)} className={btnSecundario}>Voltar</button>
            {acao && !jaFotografado(acao.contrato) && (
              <button
                onClick={executarAcao}
                disabled={executando}
                className={`px-6 py-3 text-white text-xs font-bold uppercase tracking-widest rounded-xl disabled:opacity-60 bg-red-600 hover:bg-red-500`}
              >
                {executando ? 'Aguarde...' : acao.tipo === 'excluir' ? 'Excluir definitivamente' : 'Cancelar contrato'}
              </button>
            )}
          </>
        }
      >
        {acao && jaFotografado(acao.contrato) ? (
          <p className="text-sm text-yellow-400 font-bold">
            Esta escola já foi fotografada: fichas, fechamento e pagamentos dependem deste contrato, então ele não pode ser {acao.tipo === 'excluir' ? 'excluído' : 'cancelado'}.
          </p>
        ) : acao?.tipo === 'excluir' ? (
          <div className="space-y-3 text-sm text-zinc-300">
            <p>Use para <strong className="text-white">erro de digitação ou contrato importado em duplicidade</strong>. Será apagado:</p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li>o contrato e a foto/PDF anexada;</li>
              {acao.contrato.status === 'Na agenda' && <li>a visita na Agenda Fotográfica e o histórico dela;</li>}
              {acao.contrato.status === 'Na agenda' && <li>a ordem da Produção que aguardava as fotos.</li>}
            </ul>
            <p className="text-red-400 font-bold">Não dá para desfazer. Se a escola desistiu, prefira Cancelar (fica no histórico).</p>
          </div>
        ) : (
          <div className="space-y-4 text-sm text-zinc-300">
            <p>
              O contrato vai para a aba <strong className="text-white">Cancelados</strong>
              {acao?.contrato.status === 'Na agenda' ? ', a visita sai da agenda e a Produção é avisada' : ''}. Dá para reativar depois.
            </p>
            <div className="space-y-2">
              <label className={labelCls}>Motivo (opcional)</label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: escola desistiu, data não confirmada..." className={inputCls} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
