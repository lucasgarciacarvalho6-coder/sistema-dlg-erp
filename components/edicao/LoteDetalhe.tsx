'use client'

import { useState, type ReactNode } from 'react'
import type { Registro } from '@/lib/erp/types'
import { ajustarLote, avancarLote, corrigirEtapaLote, useErp, usePode, useUsuario } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { dataBR, dataHoraBR, hoje, num } from '@/lib/erp/format'
import { ETAPAS_LOTE, TOM_ETAPA, diasAtraso, etapaDoLote, indiceEtapa, type AcaoLote, type DadosAcaoLote, type EtapaLote } from '@/lib/erp/producao'
import { Modal, TONS, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import { Drive, TextoComLinks } from './LinkDrive'

// PRODUÇÃO › janela de uma escola: as 7 etapas com as datas, o botão do próximo passo,
// álbuns/pôsteres, a correção de etapa (só o ADM) e o histórico.

const curta = (iso: unknown) => (iso ? dataBR(String(iso)).slice(0, 5) : '')
const btnPerigo =
  'px-5 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-bold uppercase tracking-widest rounded-xl transition-all inline-flex items-center justify-center gap-2 disabled:opacity-40'
const caixaCls = 'rounded-2xl border border-white/[0.06] bg-white/[0.02]'
const resumoCls = 'px-5 py-4 cursor-pointer select-none text-xs font-bold uppercase tracking-widest text-zinc-300 hover:text-white'

export default function LoteDetalhe({ loteId, onFechar }: { loteId: string | null; onFechar: () => void }) {
  const s = useErp()
  const l = loteId ? colecao(s, 'producao_lotes').find((x) => x.id === loteId) : undefined
  if (!l) return null
  const etapa = etapaDoLote(l)
  const subtitulo = [`${String(l.cidade)}${l.uf ? `/${String(l.uf)}` : ''}`, `foto em ${dataBR(String(l.dataFoto))}`, l.vendedor ? `vendedor ${String(l.vendedor)}` : '', l.retorno ? '↺ retorno' : '']
    .filter(Boolean)
    .join(' • ')
  return (
    <Modal aberto titulo={String(l.escola)} subtitulo={subtitulo} onFechar={onFechar} largura="max-w-3xl">
      <LinhaDoTempo l={l} />
      <Numeros l={l} />
      <ProximoPasso key={etapa} l={l} />
      <Ajuste key={`${l.albuns}-${l.posteres}-${l.observacao}`} l={l} />
      <CorrigirEtapa key={`c-${etapa}-${l.editorId}`} l={l} />
      <Historico l={l} />
    </Modal>
  )
}

// As 7 etapas: ✓ as que já passaram, destaque na atual, e o dia em que a escola entrou em cada uma
function LinhaDoTempo({ l }: { l: Registro }) {
  const s = useErp()
  const atual = indiceEtapa(l)
  const editor = colecao(s, 'editores').find((e) => e.id === l.editorId)
  const analista = s.colaboradores.find((c) => c.id === l.aprovadoQualidadePor)?.nome
  const info: Record<EtapaLote, string> = {
    'Aguardando fotos': l.fotosRecebidasEm ? `fotos ✓ ${curta(l.fotosRecebidasEm)}` : `foto ${curta(l.dataFoto)}`,
    'Em edição': [editor ? String(editor.nome) : '', curta(l.enviadoEditorEm), l.entregaPrevista ? `prev. ${curta(l.entregaPrevista)}` : ''].filter(Boolean).join(' • '),
    'Análise de qualidade': curta(l.devolvidoEditorEm),
    'Conferência final': [curta(l.aprovadoQualidadeEm), analista ?? ''].filter(Boolean).join(' • '),
    'Aguardando revelação': curta(l.confirmadoEm),
    Revelando: curta(l.revelandoEm),
    'Na caixa': curta(l.naCaixaEm),
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
      {ETAPAS_LOTE.map((e, i) => {
        const feito = i < atual
        const agora = i === atual
        const t = TONS[TOM_ETAPA[e]]
        return (
          <div key={e} className={`rounded-xl border px-3 py-2.5 ${agora ? `${t.borda} ${t.suave}` : feito ? 'border-white/[0.08] bg-white/[0.03]' : 'border-white/[0.04] opacity-40'}`}>
            <p className={`text-[9px] font-black uppercase tracking-widest leading-tight ${agora ? t.texto : feito ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {feito ? '✓ ' : ''}
              {e}
            </p>
            <p className="text-[10px] text-zinc-400 mt-1 leading-tight min-h-[1em]">{i <= atual ? info[e] : ''}</p>
          </div>
        )
      })}
    </div>
  )
}

function Numeros({ l }: { l: Registro }) {
  const s = useErp()
  const contados = Number(l.albunsContados) || 0
  const analista = s.colaboradores.find((c) => c.id === l.aprovadoQualidadePor)?.nome
  const itens: [string, string, string][] = [
    ['Alunos', num(Number(l.alunos)), ''],
    ['Álbuns', num(Number(l.albuns)), ''],
    ['Pôsteres', num(Number(l.posteres)), ''],
    ['Voltas ao editor', num(Number(l.voltas)), Number(l.reprovados) > 0 ? `${num(Number(l.reprovados))} álbuns reprovados` : ''],
  ]
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {itens.map(([rotulo, valor, detalhe]) => (
          <div key={rotulo} className={`${caixaCls} px-4 py-3`}>
            <p className={labelCls}>{rotulo}</p>
            <p className="text-xl font-black text-white mt-1">{valor}</p>
            {detalhe && <p className="text-[10px] font-bold text-red-400">{detalhe}</p>}
          </div>
        ))}
      </div>
      {contados > 0 && (
        <p className="text-[11px] font-bold text-emerald-400">
          ✓ {num(contados)} álbuns na meta{analista ? ` de ${analista}` : ''}
          {l.confirmadoEm ? ` (conferência final em ${dataBR(String(l.confirmadoEm))})` : ''}
        </p>
      )}
      {(!!l.driveEnvio || !!l.driveDevolucao) && (
        <p className="text-[11px] text-zinc-400">
          {!!l.driveEnvio && (
            <>
              Drive do envio: <Drive valor={l.driveEnvio} />
            </>
          )}
          {!!l.driveEnvio && !!l.driveDevolucao && ' • '}
          {!!l.driveDevolucao && (
            <>
              Drive do recebimento: <Drive valor={l.driveDevolucao} />
            </>
          )}
        </p>
      )}
      {!!l.observacao && <p className="text-[11px] text-zinc-400">Obs.: {String(l.observacao)}</p>}
    </div>
  )
}

// O botão da etapa em que a escola está (mesmas regras do banco: SQL 022)
function ProximoPasso({ l }: { l: Registro }) {
  const s = useErp()
  const eu = useUsuario()
  const podeFazer = usePode()
  const etapa = etapaDoLote(l)
  const [enviando, setEnviando] = useState(false)
  const [reprovando, setReprovando] = useState(false)
  const [editorId, setEditorId] = useState('')
  const [qtd, setQtd] = useState('')
  const [motivo, setMotivo] = useState('')
  const [analistaId, setAnalistaId] = useState('')
  const [prevista, setPrevista] = useState('') // data prevista da entrega do editor
  const [recebido, setRecebido] = useState(hoje()) // data em que o editor devolveu
  const [drive, setDrive] = useState('') // drive do envio / do recebimento (texto livre)
  if (!podeFazer('edicao', 'editar')) return null
  const dia = hoje()
  const atraso = diasAtraso(l, dia)

  const albuns = Number(l.albuns) || 0
  const editores = colecao(s, 'editores').filter((e) => e.status === 'Ativo')
  const analistas = s.colaboradores.filter((c) => c.setor === 'edicao' && c.status === 'ATIVO')
  const nomeEditor = String(colecao(s, 'editores').find((e) => e.id === l.editorId)?.nome ?? 'o editor')
  const aprovou = s.colaboradores.find((c) => c.id === l.aprovadoQualidadePor)?.nome
  const souAdm = eu?.perfil === 'ADM'
  // ADM/Gerência aprovando pela colaboradora: escolhe quem fez a análise (a meta é dela)
  const escolheAnalista = eu?.setor !== 'edicao' && analistas.length > 0
  const t = TONS[TOM_ETAPA[etapa]]

  const fazer = async (acao: AcaoLote, dados: DadosAcaoLote = {}) => {
    setEnviando(true)
    await avancarLote(l.id, acao, dados)
    setEnviando(false)
  }

  const caixa = (titulo: string, texto: ReactNode, conteudo: ReactNode) => (
    <div className={`rounded-2xl border ${t.borda} ${t.suave} p-5 space-y-4`}>
      <div>
        <p className={`text-[10px] font-black uppercase tracking-widest ${t.texto}`}>{titulo}</p>
        <p className="text-sm text-zinc-300 mt-1">{texto}</p>
      </div>
      {conteudo}
    </div>
  )

  const formReprovar = (acao: 'reprovar_qualidade' | 'reprovar_conferencia') => (
    <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[130px_1fr_190px] gap-3">
        <label className="space-y-1.5">
          <span className={labelCls}>Álbuns com erro</span>
          <input type="number" min={1} max={albuns} value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="Ex.: 3" className={inputCls} />
        </label>
        <label className="space-y-1.5">
          <span className={labelCls}>Motivo</span>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: foto tremida, nome errado na capa" className={inputCls} />
        </label>
        <label className="space-y-1.5">
          <span className={labelCls}>Nova entrega prevista</span>
          <input type="date" min={dia} value={prevista} onChange={(e) => setPrevista(e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={() => setReprovando(false)} className={btnSecundario}>
          Cancelar
        </button>
        <button disabled={enviando || !prevista} onClick={() => fazer(acao, { quantidade: Number(qtd), motivo, prevista })} className={btnPerigo}>
          Devolver ao editor
        </button>
      </div>
    </div>
  )

  const seletorAnalista = (
    <label className="block space-y-1.5 max-w-sm">
      <span className={labelCls}>Quem fez a análise de qualidade</span>
      <select value={analistaId} onChange={(e) => setAnalistaId(e.target.value)} className={inputCls}>
        <option value="">Escolha…</option>
        {analistas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
    </label>
  )

  switch (etapa) {
    case 'Aguardando fotos':
      return caixa(
        'Próximo passo: enviar ao editor',
        l.fotosRecebidasEm
          ? `Fotos recebidas em ${dataBR(String(l.fotosRecebidasEm))}. Escolha o editor que vai fazer a diagramação e a montagem.`
          : 'Aguardando as fotos dos fotógrafos. Quando chegarem, envie ao editor.',
        <div className="space-y-3">
          {!l.fotosRecebidasEm && (
            <button disabled={enviando} onClick={() => fazer('fotos')} className={btnSecundario}>
              ✓ Fotos recebidas
            </button>
          )}
          {editores.length ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="space-y-1.5">
                  <span className={labelCls}>Editor</span>
                  <select value={editorId} onChange={(e) => setEditorId(e.target.value)} className={inputCls}>
                    <option value="">Escolha o editor…</option>
                    {editores.map((e) => (
                      <option key={e.id} value={e.id}>
                        {String(e.nome)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className={labelCls}>Entrega prevista</span>
                  <input type="date" min={dia} value={prevista} onChange={(e) => setPrevista(e.target.value)} className={inputCls} />
                </label>
                <label className="space-y-1.5">
                  <span className={labelCls}>Drive do envio</span>
                  <input value={drive} onChange={(e) => setDrive(e.target.value)} placeholder="Cole o link do Google Drive / OneDrive ou escreva" className={inputCls} />
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-zinc-500">O envio fica registrado com a data de hoje ({dataBR(dia)}).</p>
                <button disabled={enviando || !editorId || !prevista} onClick={() => fazer('enviar_editor', { editorId, prevista, drive })} className={btnPrimario}>
                  Enviar ao editor
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs text-orange-300">Cadastre os editores em Produção › Editores.</p>
          )}
        </div>,
      )
    case 'Em edição':
      return caixa(
        'Com o editor',
        <>
          {nomeEditor}
          {l.enviadoEditorEm ? ` desde ${dataBR(String(l.enviadoEditorEm))}` : ''}
          {l.driveEnvio ? (
            <>
              {' ('}
              <Drive valor={l.driveEnvio} />)
            </>
          ) : (
            ''
          )}
          {l.entregaPrevista ? ` • entrega prevista ${dataBR(String(l.entregaPrevista))}` : ''}.
          {Number(l.voltas) > 0 ? ` Já voltou ${num(Number(l.voltas))} vez(es) para correção.` : ''}
          {atraso > 0 && <span className="block mt-1 font-bold text-red-400">⚠ Atrasada {num(atraso)} dia(s): a entrega era para {dataBR(String(l.entregaPrevista))}.</span>}
        </>,
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className={labelCls}>Data do recebimento</span>
              <input type="date" max={dia} value={recebido} onChange={(e) => setRecebido(e.target.value)} className={inputCls} />
            </label>
            <label className="space-y-1.5">
              <span className={labelCls}>Drive do recebimento</span>
              <input value={drive} onChange={(e) => setDrive(e.target.value)} placeholder="Cole o link do Google Drive / OneDrive ou escreva" className={inputCls} />
            </label>
          </div>
          <div className="flex justify-end">
            <button disabled={enviando || !recebido} onClick={() => fazer('editor_devolveu', { data: recebido, drive })} className={btnPrimario}>
              Editor devolveu → análise de qualidade
            </button>
          </div>
        </div>,
      )
    case 'Análise de qualidade':
      return caixa(
        'Análise de qualidade',
        'Confira se todos os álbuns estão no padrão da empresa. Se algum tiver erro, devolva ao editor.',
        reprovando ? (
          formReprovar('reprovar_qualidade')
        ) : (
          <div className="space-y-3">
            {escolheAnalista && seletorAnalista}
            <div className="flex flex-wrap gap-2">
              <button disabled={enviando || (escolheAnalista && !analistaId)} onClick={() => fazer('aprovar_qualidade', { analistaId })} className={btnPrimario}>
                ✓ Aprovar todos ({num(albuns)} álbuns)
              </button>
              <button onClick={() => setReprovando(true)} className={btnPerigo}>
                Reprovar álbuns
              </button>
            </div>
          </div>
        ),
      )
    case 'Conferência final':
      if (!souAdm) return caixa('Conferência final', `Aprovada na análise de qualidade${aprovou ? ` por ${aprovou}` : ''}. Aguardando a conferência final do ADM.`, null)
      return caixa(
        'Conferência final (ADM)',
        `${num(albuns)} álbuns aprovados na análise de qualidade${aprovou ? ` por ${aprovou}` : ''}. Ao aprovar, a escola vai para a Revelação e os álbuns entram na meta de quem fez a análise.`,
        reprovando ? (
          formReprovar('reprovar_conferencia')
        ) : (
          <div className="space-y-3">
            {!l.aprovadoQualidadePor && !(Number(l.albunsContados) > 0) && analistas.length > 0 && seletorAnalista}
            <div className="flex flex-wrap gap-2">
              <button disabled={enviando} onClick={() => fazer('confirmar', { analistaId })} className={btnPrimario}>
                ✓ Aprovar e liberar para a Revelação
              </button>
              <button onClick={() => setReprovando(true)} className={btnPerigo}>
                Devolver ao editor
              </button>
            </div>
          </div>
        ),
      )
    case 'Aguardando revelação':
      return caixa(
        'Aguardando a Revelação',
        `Liberada${l.confirmadoEm ? ` em ${dataBR(String(l.confirmadoEm))}` : ''}. Marque quando a Revelação pegar o HD para revelar.`,
        <button disabled={enviando} onClick={() => fazer('revelando')} className={btnPrimario}>
          A Revelação pegou o HD → Revelando
        </button>,
      )
    case 'Revelando':
      return caixa(
        'Revelando',
        `A Revelação está com o HD${l.revelandoEm ? ` desde ${dataBR(String(l.revelandoEm))}` : ''}.`,
        <button disabled={enviando} onClick={() => fazer('na_caixa')} className={btnPrimario}>
          Revelado → Na caixa
        </button>,
      )
    case 'Na caixa':
      return caixa('Concluída', `Álbuns revelados e na caixa${l.naCaixaEm ? ` desde ${dataBR(String(l.naCaixaEm))}` : ''}.`, null)
  }
}

// Álbuns (1 aluno = 1 álbum, ajustável), pôsteres (não contam) e observação
function Ajuste({ l }: { l: Registro }) {
  const podeFazer = usePode()
  const [albuns, setAlbuns] = useState(String(l.albuns ?? 0))
  const [posteres, setPosteres] = useState(String(l.posteres ?? 0))
  const [obs, setObs] = useState(String(l.observacao ?? ''))
  const [salvando, setSalvando] = useState(false)
  if (!podeFazer('edicao', 'editar')) return null
  const contado = Number(l.albunsContados) > 0
  const mudou = Number(albuns) !== Number(l.albuns) || Number(posteres) !== Number(l.posteres) || obs.trim() !== String(l.observacao ?? '')
  const salvar = async () => {
    setSalvando(true)
    await ajustarLote(l.id, Number(albuns), Number(posteres), obs)
    setSalvando(false)
  }
  return (
    <details className={caixaCls}>
      <summary className={resumoCls}>Álbuns, pôsteres e observação</summary>
      <div className="px-5 pb-5 space-y-3">
        <p className="text-[11px] text-zinc-500">Cada aluno vira 1 álbum, mas dá para ajustar. O pôster fica anotado e não conta na meta.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <span className={labelCls}>Álbuns</span>
            <input type="number" min={0} value={albuns} disabled={contado} onChange={(e) => setAlbuns(e.target.value)} className={`${inputCls} disabled:opacity-50`} />
          </label>
          <label className="space-y-1.5">
            <span className={labelCls}>Pôsteres</span>
            <input type="number" min={0} value={posteres} onChange={(e) => setPosteres(e.target.value)} className={inputCls} />
          </label>
        </div>
        {contado && <p className="text-[11px] text-emerald-400">Os álbuns já entraram na meta: a quantidade de álbuns não muda mais.</p>}
        <label className="block space-y-1.5">
          <span className={labelCls}>Observação</span>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: 5 alunos faltaram no dia" className={inputCls} />
        </label>
        <div className="flex justify-end">
          <button disabled={!mudou || salvando} onClick={salvar} className={btnSecundario}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </details>
  )
}

// Só o ADM: escola trazida de antes do controle (colocar na etapa certa) ou clique errado
function CorrigirEtapa({ l }: { l: Registro }) {
  const s = useErp()
  const eu = useUsuario()
  const [etapa, setEtapa] = useState<EtapaLote>(etapaDoLote(l))
  const [editorId, setEditorId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  if (eu?.perfil !== 'ADM') return null
  const editores = colecao(s, 'editores')
  const corrigir = async () => {
    setSalvando(true)
    await corrigirEtapaLote(l.id, etapa, editorId, motivo)
    setSalvando(false)
  }
  return (
    <details className={caixaCls}>
      <summary className={resumoCls}>Corrigir etapa (ADM)</summary>
      <div className="px-5 pb-5 space-y-3">
        <p className="text-[11px] text-zinc-500">
          Para as escolas trazidas de antes do controle ou um clique errado. As datas das etapas seguintes são apagadas, e os álbuns que já entraram na meta não contam de novo.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <span className={labelCls}>Etapa certa</span>
            <select value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaLote)} className={inputCls}>
              {ETAPAS_LOTE.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          {ETAPAS_LOTE.indexOf(etapa) >= 1 && (
            <label className="space-y-1.5">
              <span className={labelCls}>Editor</span>
              <select value={editorId} onChange={(e) => setEditorId(e.target.value)} className={inputCls}>
                <option value="">{l.editorId ? 'Manter o atual' : 'Sem editor'}</option>
                {editores.map((e) => (
                  <option key={e.id} value={e.id}>
                    {String(e.nome)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="block space-y-1.5">
          <span className={labelCls}>Motivo</span>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: escola da planilha antiga" className={inputCls} />
        </label>
        <div className="flex justify-end">
          <button disabled={salvando} onClick={corrigir} className={btnSecundario}>
            {salvando ? 'Corrigindo...' : 'Corrigir etapa'}
          </button>
        </div>
      </div>
    </details>
  )
}

function Historico({ l }: { l: Registro }) {
  const s = useErp()
  const itens = colecao(s, 'producao_historico')
    .filter((h) => h.loteId === l.id)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))
  return (
    <div className="space-y-2">
      <p className={labelCls}>Histórico</p>
      <div className={`${caixaCls} divide-y divide-white/[0.04]`}>
        {itens.map((h) => {
          const e = ETAPAS_LOTE.includes(String(h.etapa) as EtapaLote) ? (String(h.etapa) as EtapaLote) : 'Aguardando fotos'
          return (
            <div key={h.id} className="px-4 py-3 flex gap-3">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TONS[TOM_ETAPA[e]].solido}`}></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white">
                  {String(h.acao)}
                  <span className="text-zinc-500 font-normal">
                    {' '}
                    • {dataHoraBR(String(h.data))}
                    {h.autor ? ` • ${String(h.autor)}` : ''}
                  </span>
                </p>
                {!!h.descricao && (
                  <p className="text-[11px] text-zinc-400 mt-0.5 break-words">
                    <TextoComLinks texto={String(h.descricao)} />
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
