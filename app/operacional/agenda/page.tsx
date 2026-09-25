'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Registro } from '@/lib/erp/types'
import { atualizarRegistro, encerrarVisita, registrarHistoricoVisita, useErp, usePode } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { contratoDaVisita, fotografosDa, nomePJ, pixCompleto } from '@/lib/erp/operacional'
import { addDias, dataBR, diasNoMes, hoje, mesAtual, nomeMes, num } from '@/lib/erp/format'
import Icon from '@/components/erp/Icon'
import { Modal, PageHeader, TONS, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import type { Tom } from '@/lib/erp/types'

const TOM_STATUS: Record<string, Tom> = { Agendada: 'blue', Fotografada: 'emerald', 'Fechamento enviado': 'violet', Cancelada: 'red' }
const DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']

function semanasDoMes(mes: string) {
  const inicio = `${mes}-01`
  const [a, m] = mes.split('-').map(Number)
  const diaSemana = (new Date(a, m - 1, 1).getDay() + 6) % 7 // segunda = 0
  let cursor = addDias(inicio, -diaSemana)
  const fim = `${mes}-${String(diasNoMes(mes)).padStart(2, '0')}`
  const semanas: string[][] = []
  while (cursor <= fim) {
    semanas.push(Array.from({ length: 7 }, (_, i) => addDias(cursor, i)))
    cursor = addDias(cursor, 7)
  }
  return semanas
}

function mesVizinho(mes: string, delta: number) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function AgendaFotograficaPage() {
  const s = useErp()
  const podeFazer = usePode()
  const pEditar = podeFazer('operacional', 'editar')
  // Link direto (?visita=ID) vindo da Gestão Diária: abre a visita no mês dela
  const [inicial] = useState(() => {
    const id = new URLSearchParams(window.location.search).get('visita')
    return colecao(s, 'agenda_visitas').find((x) => x.id === id) ?? null
  })
  const [mes, setMes] = useState(inicial ? String(inicial.data).slice(0, 7) : mesAtual())
  const [visitaId, setVisitaId] = useState<string | null>(inicial?.id ?? null)

  const visitas = colecao(s, 'agenda_visitas')
  const doMes = visitas.filter((v) => String(v.data).startsWith(mes) && v.status !== 'Cancelada')
  const previstas = doMes.reduce((a, v) => a + Number(v.fichasPrevistas || 0), 0)
  const confirmadas = doMes.reduce((a, v) => a + Number(v.fichasConfirmadas || 0), 0)
  const fotografadas = doMes.reduce((a, v) => a + Number(v.fichasFotografadas || 0), 0)
  const semanas = useMemo(() => semanasDoMes(mes), [mes])
  const visita = visitas.find((v) => v.id === visitaId) ?? null
  const responsavelRMC = s.colaboradores.find((c) => c.setor === 'operacional' && /rmc|coorden/i.test(c.funcao))

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Módulo / Operações"
        titulo="Agenda Fotográfica"
        descricao="Contratos confirmados viram visitas. Acompanhe fichas autorizadas, equipe, visita realizada e o fechamento."
        acoes={
          <>
            {responsavelRMC && (
              <div className="bg-painel/80 border border-white/[0.05] px-5 py-3 rounded-2xl flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-black text-xs">
                  {responsavelRMC.nome.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Responsável • RMC</p>
                  <p className="text-xs font-bold text-white">{responsavelRMC.nome}</p>
                </div>
              </div>
            )}
            <Link href="/operacional/fechamento" className={btnSecundario}>
              <Icon nome="wallet" className="w-4 h-4" /> Fechamento operacional
            </Link>
          </>
        }
      />

      {/* Controle do mês + indicadores */}
      <div className="bg-painel/80 border border-white/[0.05] rounded-3xl p-6 flex flex-col lg:flex-row items-center justify-between gap-6 shadow-2xl">
        <div className="flex items-center gap-2 bg-black/50 border border-white/[0.05] rounded-xl p-1.5">
          <button onClick={() => setMes(mesVizinho(mes, -1))} className="p-2 hover:bg-white/[0.05] rounded-lg text-zinc-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="px-4 text-sm font-black text-white tracking-wide min-w-[160px] text-center">{nomeMes(mes)}</span>
          <button onClick={() => setMes(mesVizinho(mes, 1))} className="p-2 hover:bg-white/[0.05] rounded-lg text-zinc-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full lg:w-auto">
          <div className="bg-white/[0.02] border border-white/[0.05] px-5 py-3 rounded-2xl text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Previstas</p>
            <p className="text-xl font-black text-white">{num(previstas)}</p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 px-5 py-3 rounded-2xl text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-blue-400 mb-1">Confirmadas</p>
            <p className="text-xl font-black text-blue-400">{num(confirmadas)}</p>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/20 px-5 py-3 rounded-2xl text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-orange-400 mb-1">Faltam confirmar</p>
            <p className="text-xl font-black text-orange-400">{num(Math.max(0, previstas - confirmadas))}</p>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 px-5 py-3 rounded-2xl text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 mb-1">Fotografadas</p>
            <p className="text-xl font-black text-emerald-400">{num(fotografadas)}</p>
          </div>
        </div>
      </div>

      {/* Calendário mensal */}
      <div className="bg-painel/80 border border-white/[0.05] rounded-3xl p-6 shadow-2xl overflow-x-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-6 border-b border-white/[0.05] pb-4 min-w-[900px]">
          <h3 className="text-sm font-bold text-white uppercase tracking-widest">{doMes.length} visita(s) no mês</h3>
          <span className="text-xs text-zinc-500">Clique numa escola para ver dados, histórico e atualizar fichas</span>
        </div>
        <div className="grid grid-cols-7 gap-3 mb-3 text-center min-w-[900px]">
          {DIAS.map((d) => (
            <div key={d} className="bg-white/[0.02] border border-white/[0.05] py-2.5 rounded-xl text-[11px] font-black text-zinc-400 uppercase tracking-widest">{d}</div>
          ))}
        </div>
        <div className="space-y-3 min-w-[900px]">
          {semanas.map((semana) => (
            <div key={semana[0]} className="grid grid-cols-7 gap-3 items-start">
              {semana.map((dia) => {
                const doDia = visitas.filter((v) => v.data === dia && v.status !== 'Cancelada')
                const foraDoMes = !dia.startsWith(mes)
                const eHoje = dia === hoje()
                return (
                  <div key={dia} className={`min-h-[120px] rounded-2xl p-2 space-y-2 border ${eHoje ? 'border-blue-500/40 bg-blue-500/[0.04]' : 'border-dashed border-white/[0.04]'} ${foraDoMes ? 'opacity-35' : ''}`}>
                    <p className={`text-[10px] font-black px-1 ${eHoje ? 'text-blue-400' : 'text-zinc-600'}`}>{Number(dia.slice(8))}{eHoje && ' • HOJE'}</p>
                    {doDia.map((v) => (
                      <button key={v.id} onClick={() => setVisitaId(v.id)} className="w-full text-left bg-blue-950/20 border border-blue-500/20 rounded-2xl p-3 space-y-1.5 hover:border-blue-500 transition-all group">
                        <div className="flex justify-between items-center gap-1">
                          <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded truncate">{String(v.cidade).toUpperCase()} - {String(v.uf)}</span>
                          {v.equipe && <span className="text-[9px] font-bold text-blue-400">{String(v.equipe)}</span>}
                        </div>
                        <p className="text-[11px] font-bold text-white group-hover:text-blue-400 transition-colors leading-tight">{String(v.escola)}</p>
                        <div className="text-[10px] text-zinc-400 pt-1 border-t border-white/[0.05]">
                          <p className="text-blue-400 font-medium truncate">👤 {nomePJ(s, v.vendedorId)}</p>
                          {v.carro && <p className="text-zinc-500">🚗 {String(v.carro)}</p>}
                        </div>
                        {/* Card estreito: fichas e situação empilhadas para não vazar a borda */}
                        <div className="pt-1 space-y-1 text-[10px] font-bold">
                          <p className="text-zinc-400">Fichas: <span className="text-white">{v.status === 'Agendada' ? `${num(Number(v.fichasConfirmadas))}/${num(Number(v.fichasPrevistas))}` : num(Number(v.fichasFotografadas))}</span></p>
                          <p className={`flex items-center gap-1.5 uppercase tracking-wider text-[9px] ${TONS[TOM_STATUS[String(v.status)] ?? 'zinc'].texto}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TONS[TOM_STATUS[String(v.status)] ?? 'zinc'].solido}`}></span>
                            {v.status === 'Fechamento enviado' ? 'Fechado' : String(v.status)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {visita && <DetalheVisita key={visita.id} visita={visita} podeEditar={pEditar} onFechar={() => setVisitaId(null)} />}
    </div>
  )
}

function DetalheVisita({ visita, podeEditar, onFechar }: { visita: Registro; podeEditar: boolean; onFechar: () => void }) {
  const s = useErp()
  const contrato = contratoDaVisita(s, visita)
  const historico = colecao(s, 'agenda_historico')
    .filter((h) => h.visitaId === visita.id)
    .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))
  const fotografos = colecao(s, 'freelancers').filter((f) => f.tipo === 'Fotógrafo' && (f.status === 'Ativo' || fotografosDa(visita).includes(f.id)))
  const motoristas = colecao(s, 'freelancers').filter((f) => f.tipo === 'Motorista' && (f.status === 'Ativo' || f.id === visita.motoristaId))
  const agendada = visita.status === 'Agendada'

  const [equipe, setEquipe] = useState({
    data: String(visita.data),
    equipe: String(visita.equipe || ''),
    carro: String(visita.carro || ''),
    fotografoIds: fotografosDa(visita),
    motoristaId: String(visita.motoristaId || ''),
  })
  const [fichas, setFichas] = useState('')
  const [descricao, setDescricao] = useState('')
  const [fotografadas, setFotografadas] = useState(String(visita.fichasConfirmadas || ''))
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  const salvarEquipe = async () => {
    const erro = await atualizarRegistro('agenda_visitas', visita.id, { ...equipe, fotografoIds: equipe.fotografoIds.join(',') }, 'operacional')
    setMsg(erro ? { ok: false, texto: erro } : { ok: true, texto: 'Equipe e data salvas.' })
  }

  const registrar = async (comFichas: boolean) => {
    if (!descricao.trim()) return setMsg({ ok: false, texto: 'Descreva o contato (o que a diretora informou).' })
    if (comFichas && (fichas === '' || Number(fichas) < 0)) return setMsg({ ok: false, texto: 'Informe o total de fichas autorizadas.' })
    const erro = await registrarHistoricoVisita(visita.id, { tipo: comFichas ? 'Atualização de fichas' : 'Contato', fichas: comFichas ? Number(fichas) : undefined, descricao })
    if (!erro) {
      setFichas('')
      setDescricao('')
    }
    setMsg(erro ? { ok: false, texto: erro } : { ok: true, texto: 'Histórico atualizado.' })
  }

  const etapa = agendada ? (Number(visita.fichasConfirmadas) > 0 ? 1 : 0) : visita.status === 'Fotografada' ? 2 : 3
  const passos = ['Confirmação de fichas', 'Sessão fotografada', 'Fechamento']

  return (
    <Modal
      aberto
      titulo={agendada ? 'Visita fotográfica agendada' : visita.status === 'Cancelada' ? 'Visita cancelada' : 'Visita fotográfica encerrada'}
      subtitulo={`${visita.escola} • ${dataBR(String(visita.data))}`}
      onFechar={onFechar}
      largura="max-w-3xl"
      rodape={
        <>
          {agendada && podeEditar && (
            <button onClick={() => atualizarRegistro('agenda_visitas', visita.id, { status: 'Cancelada' }, 'operacional').then((e) => !e && onFechar())} className="mr-auto px-5 py-3 text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/10 rounded-xl">
              Cancelar visita
            </button>
          )}
          {visita.status === 'Fotografada' && (
            <Link href={`/operacional/fechamento?visita=${visita.id}`} className={btnPrimario}>
              Preparar fechamento →
            </Link>
          )}
          <button onClick={onFechar} className={btnSecundario}>Fechar detalhes</button>
        </>
      }
    >
      {/* Etapas */}
      <div className="flex flex-wrap items-center gap-2">
        {passos.map((p, i) => (
          <span key={p} className="flex items-center gap-2">
            <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full border ${i < etapa ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : i === etapa ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-white/[0.02] text-zinc-500 border-white/[0.05]'}`}>
              {i + 1}. {p}
            </span>
            {i < passos.length - 1 && <span className="text-zinc-600">→</span>}
          </span>
        ))}
      </div>

      {/* Dados da escola */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-widest">Dados da escola</div>
        <p className="text-base font-black text-white">{String(visita.escola)}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-white/[0.05]">
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold">Endereço</p>
            <p className="text-xs text-zinc-300">{String(visita.endereco || '—')}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold">Cidade / UF</p>
            <p className="text-xs text-zinc-300">{String(visita.cidade)} - {String(visita.uf)}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold">Telefone</p>
            <p className="text-xs text-blue-400 font-mono font-bold">{String(visita.telefone || '—')}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-white/[0.05]">
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold">Responsável (diretora/coord.)</p>
            <p className="text-xs text-white font-bold">{String(visita.responsavel || '—')}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold">Vendedor PJ</p>
            <p className="text-xs text-white font-bold">{nomePJ(s, visita.vendedorId)}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold">Bonificação • PIX</p>
            <p className="text-xs text-zinc-300">
              {contrato ? `R$ ${Number(contrato.bonificacaoPorFicha).toFixed(2).replace('.', ',')}/ficha` : '—'} • {contrato && pixCompleto(contrato) ? <span className="text-emerald-400">PIX ok</span> : <span className="text-yellow-400">PIX pendente</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-5 gap-3 bg-black/40 border border-white/[0.05] p-4 rounded-2xl text-center">
        {[
          ['Data', dataBR(String(visita.data)), 'text-white'],
          ['Previstas', num(Number(visita.fichasPrevistas)), 'text-white'],
          ['Confirmadas', num(Number(visita.fichasConfirmadas)), 'text-emerald-400'],
          ['Fotografadas', num(Number(visita.fichasFotografadas)), 'text-blue-400'],
          ['Equipe', [visita.equipe, visita.carro].filter(Boolean).join(' • ') || '—', 'text-white'],
        ].map(([r, v, c]) => (
          <div key={r}>
            <p className="text-[9px] text-zinc-500 uppercase font-bold">{r}</p>
            <p className={`text-xs font-bold mt-1 ${c}`}>{v}</p>
          </div>
        ))}
      </div>

      {agendada && podeEditar && (
        <>
          {/* Equipe e data */}
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 space-y-4">
            <p className="text-xs font-bold text-white uppercase tracking-wider">Equipe, carro e data</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className={labelCls}>Data da visita</label>
                <input type="date" value={equipe.data} onChange={(e) => setEquipe({ ...equipe, data: e.target.value })} className={inputCls} />
              </div>
              <div className="space-y-2">
                <label className={labelCls}>Equipe</label>
                <input value={equipe.equipe} onChange={(e) => setEquipe({ ...equipe, equipe: e.target.value })} placeholder="Ex.: E2" className={inputCls} />
              </div>
              <div className="space-y-2">
                <label className={labelCls}>Carro</label>
                <input value={equipe.carro} onChange={(e) => setEquipe({ ...equipe, carro: e.target.value })} placeholder="Ex.: Carro 01" className={inputCls} />
              </div>
            </div>
            <div className="space-y-2">
              <label className={labelCls}>Fotógrafos</label>
              <div className="flex flex-wrap gap-2">
                {fotografos.map((f) => {
                  const on = equipe.fotografoIds.includes(f.id)
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setEquipe({ ...equipe, fotografoIds: on ? equipe.fotografoIds.filter((x) => x !== f.id) : [...equipe.fotografoIds, f.id] })}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${on ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 'border-white/[0.05] text-zinc-400 hover:text-white'}`}
                    >
                      {on ? '✓ ' : ''}
                      {String(f.nome)}
                    </button>
                  )
                })}
                {fotografos.length === 0 && <p className="text-xs text-zinc-500">Cadastre fotógrafos em Controle Operacional › Fotógrafos.</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2 md:col-span-2">
                <label className={labelCls}>Motorista</label>
                <select value={equipe.motoristaId} onChange={(e) => setEquipe({ ...equipe, motoristaId: e.target.value })} className={`${inputCls} appearance-none`}>
                  <option value="">—</option>
                  {motoristas.map((m) => (
                    <option key={m.id} value={m.id}>{String(m.nome)}</option>
                  ))}
                </select>
              </div>
              <button onClick={salvarEquipe} className={btnSecundario}>Salvar equipe</button>
            </div>
          </div>

          {/* Atualizar fichas / registrar contato */}
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 space-y-4">
            <p className="text-xs font-bold text-white uppercase tracking-wider">Contato com a diretora • fichas autorizadas</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className={labelCls}>Total autorizado</label>
                <input type="number" min={0} value={fichas} onChange={(e) => setFichas(e.target.value)} placeholder={String(visita.fichasConfirmadas || 0)} className={inputCls} />
              </div>
              <div className="space-y-2 md:col-span-3">
                <label className={labelCls}>O que foi conversado</label>
                <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Coordenadora confirmou 35 fichas retornadas." className={inputCls} />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => registrar(false)} className={btnSecundario}>Registrar só o contato</button>
              <button onClick={() => registrar(true)} className={btnPrimario}>Atualizar fichas</button>
            </div>
          </div>

          {/* Encerrar */}
          <div className="bg-emerald-500/[0.05] border border-emerald-500/20 rounded-2xl p-5 space-y-4">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Encerrar visita (após o trabalho)</p>
            <div className="flex flex-col md:flex-row gap-4 md:items-end">
              <div className="space-y-2 flex-1">
                <label className={labelCls}>Fichas fotografadas</label>
                <input type="number" min={1} value={fotografadas} onChange={(e) => setFotografadas(e.target.value)} className={inputCls} />
              </div>
              <button
                onClick={async () => {
                  const erro = await encerrarVisita(visita.id, Number(fotografadas))
                  if (erro) setMsg({ ok: false, texto: erro })
                }}
                className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all"
              >
                Encerrar visita
              </button>
            </div>
            <p className="text-[10px] text-zinc-500">As fichas entram na meta do Operacional e as fotos seguem para tratamento na Produção.</p>
          </div>
        </>
      )}

      {msg && <p className={`text-xs font-bold ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.texto}</p>}

      {/* Histórico */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Histórico completo • contatos e fichas</h4>
          <span className="text-[10px] bg-white/[0.05] text-zinc-400 px-2.5 py-1 rounded-full">{historico.length} registros</span>
        </div>
        {historico.length === 0 && <p className="text-xs text-zinc-500">Nenhum contato registrado ainda.</p>}
        {historico.map((h) => (
          <div key={h.id} className="bg-black/50 border border-white/[0.05] p-4 rounded-2xl space-y-2">
            <div className="flex justify-between items-center gap-2">
              <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase rounded">{String(h.tipo)}</span>
              <span className="text-[10px] text-zinc-500 font-mono">
                {dataBR(String(h.data))}
                {h.fichasDepois !== '' && h.fichasDepois !== null && (
                  <>
                    {' '}• <strong className="text-white">{String(h.fichasAntes ?? 0)} → {String(h.fichasDepois)} fichas</strong>
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-zinc-200">{String(h.descricao || '')}</p>
            <p className="text-[9px] text-zinc-500 pt-1 border-t border-white/[0.03]">Registro por: {String(h.autor || '—')}</p>
          </div>
        ))}
      </div>
    </Modal>
  )
}
