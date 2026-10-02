'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Registro } from '@/lib/erp/types'
import { agendarRetorno, atualizarRegistro, encerrarVisita, registrarHistoricoVisita, useErp, usePode } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { MAX_FOTOGRAFOS, conflitosEquipe, contratoDaVisita, corEquipe, equipeDaVisita, fotografosDa, nomePJ, nomeVeiculo, pixCompleto, retornoDaVisita, ultimaComposicao } from '@/lib/erp/operacional'
import { addDias, dataBR, diasNoMes, hoje, mesAtual, nomeMes, num } from '@/lib/erp/format'
import Icon from '@/components/erp/Icon'
import { Modal, PageHeader, TONS, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import type { Tom } from '@/lib/erp/types'

// status sem cor (regra do ADM: cor só para alerta); vermelho só na visita de dia anterior que ainda não foi encerrada
const tomStatus = (v: Registro): Tom => (v.status === 'Agendada' && String(v.data) < hoje() ? 'red' : 'zinc')
const DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']
const SEM_EQUIPE = '__sem__'
const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const diaSemana = (iso: string) => DIA_SEMANA[new Date(`${iso}T12:00:00`).getDay()]
const rotuloStatus = (st: unknown) => (st === 'Fechamento enviado' ? 'Fechado' : String(st))

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

  const [visao, setVisao] = useState<'calendario' | 'equipes'>('calendario')
  const [filtroEquipe, setFiltroEquipe] = useState('')
  const [filtroUF, setFiltroUF] = useState('')

  const visitas = colecao(s, 'agenda_visitas')
  const ativasDoMes = visitas.filter((v) => String(v.data).startsWith(mes) && v.status !== 'Cancelada')
  const equipesDoMes = [...new Set(ativasDoMes.map((v) => String(v.equipe || '').trim()).filter(Boolean))].sort()
  const ufsDoMes = [...new Set(ativasDoMes.map((v) => String(v.uf || '')).filter(Boolean))].sort()
  // filtros (equipe e estado) valem para o calendário e para a visão por equipe
  const passa = (v: Registro) =>
    (!filtroEquipe || (filtroEquipe === SEM_EQUIPE ? !String(v.equipe || '').trim() : String(v.equipe || '').trim() === filtroEquipe)) && (!filtroUF || v.uf === filtroUF)
  const doMes = ativasDoMes.filter(passa)
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
                <div className="w-9 h-9 rounded-xl bg-white/[0.06] text-zinc-200 border border-white/[0.12] flex items-center justify-center font-black text-xs">
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
          <div className="bg-white/[0.02] border border-white/[0.05] px-5 py-3 rounded-2xl text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Confirmadas</p>
            <p className="text-xl font-black text-white">{num(confirmadas)}</p>
          </div>
          <div className={`px-5 py-3 rounded-2xl text-center border ${previstas > confirmadas ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-white/[0.02] border-white/[0.05]'}`}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Faltam confirmar</p>
            <p className={`text-xl font-black ${previstas > confirmadas ? 'text-yellow-400' : 'text-white'}`}>{num(Math.max(0, previstas - confirmadas))}</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.05] px-5 py-3 rounded-2xl text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Fotografadas</p>
            <p className="text-xl font-black text-white">{num(fotografadas)}</p>
          </div>
        </div>
      </div>

      {/* Visão + filtros (várias equipes rodando em estados diferentes no mesmo dia) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex bg-black/50 border border-white/[0.05] rounded-xl p-1">
          {(
            [
              ['calendario', 'Calendário'],
              ['equipes', 'Por equipe'],
            ] as const
          ).map(([id, rotulo]) => (
            <button key={id} onClick={() => setVisao(id)} className={`px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${visao === id ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
              {rotulo}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={filtroEquipe} onChange={(e) => setFiltroEquipe(e.target.value)} className="bg-black/50 border border-white/[0.08] rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white outline-none">
            <option value="">Todas as equipes</option>
            {equipesDoMes.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
            <option value={SEM_EQUIPE}>Sem equipe definida</option>
          </select>
          <select value={filtroUF} onChange={(e) => setFiltroUF(e.target.value)} className="bg-black/50 border border-white/[0.08] rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white outline-none">
            <option value="">Todos os estados</option>
            {ufsDoMes.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          {(filtroEquipe || filtroUF) && (
            <button onClick={() => (setFiltroEquipe(''), setFiltroUF(''))} className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white px-2">
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {visao === 'equipes' && <PorEquipe s={s} visitas={doMes} onAbrir={setVisitaId} />}

      {/* Calendário mensal */}
      {visao === 'calendario' && (
      <div className="bg-painel/80 border border-white/[0.05] rounded-3xl p-6 shadow-2xl overflow-x-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-6 border-b border-white/[0.05] pb-4 min-w-[900px]">
          <h3 className="text-sm font-bold text-white uppercase tracking-widest">{doMes.length} visita(s) no mês</h3>
          <span className="text-xs text-zinc-500">Vermelho = visita de dia anterior ainda sem encerrar • clique para ver dados, equipe e fichas</span>
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
                const doDia = doMes
                  .filter((v) => v.data === dia)
                  .sort((a, b) => `${a.equipe || 'zz'}${a.uf}`.localeCompare(`${b.equipe || 'zz'}${b.uf}`))
                const foraDoMes = !dia.startsWith(mes)
                const eHoje = dia === hoje()
                const equipesDia = new Set(doDia.map((v) => String(v.equipe || '').trim()).filter(Boolean))
                const ufsDia = [...new Set(doDia.map((v) => String(v.uf)))]
                return (
                  <div key={dia} className={`min-h-[120px] rounded-2xl p-1.5 space-y-1.5 border ${eHoje ? 'border-blue-500/40 bg-blue-500/[0.04]' : 'border-dashed border-white/[0.04]'} ${foraDoMes ? 'opacity-35' : ''}`}>
                    <div className="flex items-center justify-between gap-1 px-1">
                      <p className={`text-[10px] font-black ${eHoje ? 'text-blue-400' : 'text-zinc-600'}`}>{Number(dia.slice(8))}{eHoje && ' • HOJE'}</p>
                      {equipesDia.size > 1 && (
                        <span className="text-[8px] font-black uppercase tracking-wider text-zinc-400" title={`${equipesDia.size} equipes em campo: ${ufsDia.join(', ')}`}>
                          {equipesDia.size} eq • {ufsDia.join(' · ')}
                        </span>
                      )}
                    </div>
                    {doDia.map((v) => {
                      const eq = equipeDaVisita(s, v)
                      const cor = TONS[corEquipe(eq.nome)]
                      const st = TONS[tomStatus(v)]
                      return (
                        <button
                          key={v.id}
                          onClick={() => setVisitaId(v.id)}
                          title={`${v.escola} • ${v.cidade}-${v.uf}${eq.nome ? ` • ${eq.nome}` : ''}`}
                          className="relative w-full text-left bg-white/[0.03] border border-white/[0.06] rounded-xl pl-3 pr-2 py-2 space-y-1 hover:border-blue-500/50 transition-all group"
                        >
                          <span className={`absolute left-1 top-2 bottom-2 w-1 rounded-full ${eq.nome ? cor.solido : 'bg-zinc-700'}`}></span>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9px] font-black text-white bg-white/[0.08] px-1.5 py-0.5 rounded">{String(v.uf)}</span>
                            <span className={`text-[9px] font-black uppercase tracking-wider truncate ${eq.nome ? cor.texto : 'text-zinc-500'}`}>{eq.nome || 'Sem equipe'}</span>
                          </div>
                          <p className="text-[11px] font-bold text-white group-hover:text-blue-400 transition-colors leading-tight line-clamp-2">{String(v.escola)}</p>
                          {v.retornoDe && <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">↺ Retorno</p>}
                          <p className="text-[10px] text-zinc-400 truncate">{String(v.cidade)}</p>
                          <div className="flex items-center justify-between gap-1 text-[9px] font-bold">
                            <span className="text-zinc-400">
                              {v.status === 'Agendada' ? `${num(Number(v.fichasConfirmadas))}/${num(Number(v.fichasPrevistas))}` : num(Number(v.fichasFotografadas))} fichas
                            </span>
                            <span className={`flex items-center gap-1 uppercase ${st.texto}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.solido}`}></span>
                              {rotuloStatus(v.status)}
                            </span>
                          </div>
                          {v.status === 'Agendada' && !eq.completa && <p className="text-[9px] font-bold text-yellow-400 leading-tight">⚠ falta {eq.faltando.join(', ')}</p>}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      )}

      {visita && <DetalheVisita key={visita.id} visita={visita} podeEditar={pEditar} onFechar={() => setVisitaId(null)} />}
    </div>
  )
}

// Roteiro de cada equipe no mês: composição (veículo, motorista, fotógrafos) e as escolas por data
function PorEquipe({ s, visitas, onAbrir }: { s: ReturnType<typeof useErp>; visitas: Registro[]; onAbrir: (id: string) => void }) {
  const grupos = new Map<string, Registro[]>()
  for (const v of [...visitas].sort((a, b) => String(a.data).localeCompare(String(b.data)))) {
    const k = String(v.equipe || '').trim()
    grupos.set(k, [...(grupos.get(k) ?? []), v])
  }
  const ordem = [...grupos.keys()].sort((a, b) => (a ? (b ? a.localeCompare(b) : -1) : 1)) // "sem equipe" por último
  if (!ordem.length) return <div className="bg-painel/80 border border-white/[0.05] rounded-3xl p-10 text-center text-sm text-zinc-500">Nenhuma visita no mês com esses filtros.</div>

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {ordem.map((nome) => {
        const lista = grupos.get(nome)!
        const cor = TONS[corEquipe(nome)]
        // composição: da próxima visita agendada (ou da última, se todas já passaram)
        const ref = lista.find((v) => v.status === 'Agendada' && String(v.data) >= hoje()) ?? lista[lista.length - 1]
        const eq = equipeDaVisita(s, ref)
        const ufs = [...new Set(lista.map((v) => String(v.uf)))]
        const fichas = lista.reduce((a, v) => a + Number(v.status === 'Agendada' ? v.fichasPrevistas : v.fichasFotografadas) || 0, 0)
        const diasDuplos = new Set(lista.filter((v, i) => lista.some((o, j) => j !== i && o.data === v.data && o.cidade !== v.cidade)).map((v) => String(v.data)))
        return (
          <div key={nome || SEM_EQUIPE} className={`bg-painel/80 border rounded-3xl overflow-hidden ${nome ? cor.borda : 'border-yellow-500/20'}`}>
            <div className="px-6 py-4 border-b border-white/[0.05] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full ${nome ? cor.solido : 'bg-yellow-500'}`}></span>
                <div>
                  <p className="text-base font-black text-white">{nome || 'Sem equipe definida'}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    {lista.length} escola(s) • {num(fichas)} fichas • {ufs.join(' · ')}
                  </p>
                </div>
              </div>
              {nome && (
                <div className="text-[11px] text-zinc-300 text-right space-y-0.5">
                  <p>🚐 {eq.veiculo ? nomeVeiculo(eq.veiculo) : String(ref.carro || '') || <span className="text-yellow-400">sem veículo</span>}</p>
                  <p>🧑‍✈️ {eq.motorista ? String(eq.motorista.nome) : <span className="text-yellow-400">sem motorista</span>}</p>
                  <p>📷 {eq.fotografos.length ? eq.fotografos.map((f) => String(f.nome).split(' ')[0]).join(', ') : <span className="text-yellow-400">sem fotógrafo</span>}</p>
                </div>
              )}
            </div>
            <div className="divide-y divide-white/[0.03]">
              {lista.map((v) => {
                const st = TONS[tomStatus(v)]
                const e = equipeDaVisita(s, v)
                return (
                  <button key={v.id} onClick={() => onAbrir(v.id)} className="w-full text-left px-6 py-3 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                    <div className="w-14 shrink-0 text-center">
                      <p className="text-sm font-black text-white">{dataBR(String(v.data)).slice(0, 5)}</p>
                      <p className="text-[9px] font-bold uppercase text-zinc-500">{diaSemana(String(v.data))}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{String(v.escola)}</p>
                      <p className="text-[10px] text-zinc-400">
                        {String(v.cidade)}-{String(v.uf)}
                        {v.retornoDe && <span className="text-zinc-400 font-bold"> • ↺ Retorno</span>}
                        {diasDuplos.has(String(v.data)) && <span className="text-yellow-400 font-bold"> • 2 cidades no mesmo dia</span>}
                        {v.status === 'Agendada' && !e.completa && <span className="text-yellow-400 font-bold"> • falta {e.faltando.join(', ')}</span>}
                      </p>
                    </div>
                    <span className={`flex items-center gap-1.5 text-[9px] font-bold uppercase whitespace-nowrap ${st.texto}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.solido}`}></span>
                      {rotuloStatus(v.status)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
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
  const veiculos = colecao(s, 'veiculos').filter((v) => v.status !== 'Inativo' || v.id === visita.veiculoId)
  const nomesEquipes = [...new Set(colecao(s, 'agenda_visitas').map((v) => String(v.equipe || '').trim()).filter(Boolean))].sort()
  const agendada = visita.status === 'Agendada'
  const encerrada = visita.status === 'Fotografada' || visita.status === 'Fechamento enviado'
  const atual = equipeDaVisita(s, visita)
  const retorno = retornoDaVisita(s, visita)
  const origem = visita.retornoDe ? colecao(s, 'agenda_visitas').find((v) => v.id === visita.retornoDe) : undefined
  const [caixaRetorno, setCaixaRetorno] = useState<'encerrar' | 'agendar' | null>(null)

  const [equipe, setEquipe] = useState({
    data: String(visita.data),
    equipe: String(visita.equipe || ''),
    veiculoId: String(visita.veiculoId || ''),
    fotografoIds: fotografosDa(visita),
    motoristaId: String(visita.motoristaId || ''),
  })
  const veiculoEscolhido = veiculos.find((v) => v.id === equipe.veiculoId)
  const pessoas = equipe.fotografoIds.length + (equipe.motoristaId ? 1 : 0)
  const conflitos = conflitosEquipe(s, visita, equipe)
  const repetir = ultimaComposicao(s, equipe.equipe, visita.id)
  const alternarFotografo = (id: string) => {
    const on = equipe.fotografoIds.includes(id)
    if (!on && equipe.fotografoIds.length >= MAX_FOTOGRAFOS) return
    setEquipe({ ...equipe, fotografoIds: on ? equipe.fotografoIds.filter((x) => x !== id) : [...equipe.fotografoIds, id] })
  }
  const [fichas, setFichas] = useState('')
  const [descricao, setDescricao] = useState('')
  const [fotografadas, setFotografadas] = useState(String(visita.fichasConfirmadas || ''))
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  const salvarEquipe = async () => {
    if (equipe.fotografoIds.length > MAX_FOTOGRAFOS) return setMsg({ ok: false, texto: `A equipe pode ter no máximo ${MAX_FOTOGRAFOS} fotógrafos.` })
    const erro = await atualizarRegistro(
      'agenda_visitas',
      visita.id,
      {
        data: equipe.data,
        equipe: equipe.equipe.trim(),
        veiculoId: equipe.veiculoId,
        carro: veiculoEscolhido ? nomeVeiculo(veiculoEscolhido) : String(visita.carro || ''),
        fotografoIds: equipe.fotografoIds.join(','),
        motoristaId: equipe.motoristaId,
      },
      'operacional',
    )
    setMsg(erro ? { ok: false, texto: erro } : { ok: true, texto: 'Equipe da viagem salva.' })
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
      subtitulo={`${visita.escola} • ${dataBR(String(visita.data))}${origem ? ` • ↺ Retorno da visita de ${dataBR(String(origem.data))}` : ''}`}
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
            <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full border ${i < etapa ? 'bg-white/[0.04] text-zinc-300 border-white/[0.1]' : i === etapa ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-white/[0.02] text-zinc-500 border-white/[0.05]'}`}>
              {i + 1}. {p}
            </span>
            {i < passos.length - 1 && <span className="text-zinc-600">→</span>}
          </span>
        ))}
      </div>

      {/* Dados da escola */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-widest">Dados da escola</div>
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
            <p className="text-xs text-white font-mono font-bold">{String(visita.telefone || '—')}</p>
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
          ['Confirmadas', num(Number(visita.fichasConfirmadas)), 'text-white'],
          ['Fotografadas', num(Number(visita.fichasFotografadas)), 'text-white'],
          ['Equipe', atual.nome || '—', 'text-white'],
        ].map(([r, v, c]) => (
          <div key={r}>
            <p className="text-[9px] text-zinc-500 uppercase font-bold">{r}</p>
            <p className={`text-xs font-bold mt-1 ${c}`}>{v}</p>
          </div>
        ))}
      </div>

      {agendada && podeEditar && (
        <>
          {/* Equipe da viagem: veículo + motorista + 1 a 4 fotógrafos */}
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-white uppercase tracking-wider">Equipe da viagem e data</p>
              {atual.completa ? (
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">✓ Equipe completa</span>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">Falta: {atual.faltando.join(', ')}</span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className={labelCls}>Data da visita</label>
                <input type="date" value={equipe.data} onChange={(e) => setEquipe({ ...equipe, data: e.target.value })} className={inputCls} />
              </div>
              <div className="space-y-2">
                <label className={labelCls}>Nome da equipe</label>
                <input list="nomes-equipes" value={equipe.equipe} onChange={(e) => setEquipe({ ...equipe, equipe: e.target.value })} placeholder="Ex.: Equipe 1, Equipe SP" className={inputCls} />
                <datalist id="nomes-equipes">
                  {nomesEquipes.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <label className={labelCls}>Veículo</label>
                <select value={equipe.veiculoId} onChange={(e) => setEquipe({ ...equipe, veiculoId: e.target.value })} className={`${inputCls} appearance-none`}>
                  <option value="">{visita.carro && !visita.veiculoId ? `${String(visita.carro)} (texto antigo)` : '—'}</option>
                  {veiculos.map((v) => (
                    <option key={v.id} value={v.id} disabled={v.status === 'Em manutenção' && v.id !== visita.veiculoId}>
                      {nomeVeiculo(v)} • {String(v.lugares || '?')} lugares{v.status === 'Em manutenção' ? ' (em manutenção)' : ''}
                    </option>
                  ))}
                </select>
                {veiculos.length === 0 && <p className="text-[10px] text-zinc-500">Cadastre em Controle Operacional › Veículos.</p>}
              </div>
            </div>

            {repetir && (repetir.veiculoId !== equipe.veiculoId || repetir.motoristaId !== equipe.motoristaId || String(repetir.fotografoIds || '') !== equipe.fotografoIds.join(',')) && (
              <button
                type="button"
                onClick={() =>
                  setEquipe({ ...equipe, veiculoId: String(repetir.veiculoId || ''), motoristaId: String(repetir.motoristaId || ''), fotografoIds: fotografosDa(repetir).slice(0, MAX_FOTOGRAFOS) })
                }
                className="w-full text-left px-4 py-3 rounded-xl border border-blue-500/20 bg-blue-500/10 text-xs text-blue-300 hover:bg-blue-500/20"
              >
                ↺ Repetir a composição da <strong className="text-white">{equipe.equipe}</strong> usada em {String(repetir.escola)} ({dataBR(String(repetir.data))}): veículo, motorista e{' '}
                {fotografosDa(repetir).length} fotógrafo(s)
              </button>
            )}

            <div className="space-y-2">
              <label className={labelCls}>
                Fotógrafos • {equipe.fotografoIds.length}/{MAX_FOTOGRAFOS}
              </label>
              <div className="flex flex-wrap gap-2">
                {fotografos.map((f) => {
                  const on = equipe.fotografoIds.includes(f.id)
                  const cheio = !on && equipe.fotografoIds.length >= MAX_FOTOGRAFOS
                  return (
                    <button
                      key={f.id}
                      type="button"
                      disabled={cheio}
                      onClick={() => alternarFotografo(f.id)}
                      title={cheio ? `Máximo de ${MAX_FOTOGRAFOS} fotógrafos por equipe` : ''}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all disabled:opacity-30 ${on ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 'border-white/[0.05] text-zinc-400 hover:text-white'}`}
                    >
                      {on ? '✓ ' : ''}
                      {String(f.nome)}
                      {f.nivel ? <span className="text-zinc-500 font-medium"> • {String(f.nivel)}</span> : null}
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

            {veiculoEscolhido && Number(veiculoEscolhido.lugares) > 0 && pessoas > Number(veiculoEscolhido.lugares) && (
              <p className="text-[11px] font-bold text-yellow-400">⚠ O veículo tem {String(veiculoEscolhido.lugares)} lugares e a equipe tem {pessoas} pessoas.</p>
            )}
            {conflitos.map((c) => (
              <p key={c} className="text-[11px] font-bold text-yellow-400">⚠ {c}</p>
            ))}
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
          <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-5 space-y-4">
            <p className="text-xs font-bold text-white uppercase tracking-wider">Encerrar visita (após o trabalho)</p>
            <div className="flex flex-col md:flex-row gap-4 md:items-end">
              <div className="space-y-2 flex-1">
                <label className={labelCls}>Fichas fotografadas</label>
                <input type="number" min={1} value={fotografadas} onChange={(e) => setFotografadas(e.target.value)} className={inputCls} />
              </div>
              <button
                onClick={() => {
                  if (!(Number(fotografadas) > 0)) return setMsg({ ok: false, texto: 'Informe quantas fichas foram fotografadas.' })
                  setMsg(null)
                  setCaixaRetorno('encerrar') // pergunta se haverá retorno antes de encerrar
                }}
                className="px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all"
              >
                Encerrar visita
              </button>
            </div>
            <p className="text-[10px] text-zinc-500">As fichas entram na meta do Operacional e as fotos seguem para tratamento na Produção.</p>
          </div>
        </>
      )}

      {!(agendada && podeEditar) && (atual.nome || atual.veiculo || atual.motorista || atual.fotografos.length > 0) && (
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold">Equipe</p>
            <p className="text-white font-bold">{atual.nome || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold">Veículo</p>
            <p className="text-zinc-300">{atual.veiculo ? nomeVeiculo(atual.veiculo) : String(visita.carro || '—')}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold">Motorista</p>
            <p className="text-zinc-300">{atual.motorista ? String(atual.motorista.nome) : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold">Fotógrafos</p>
            <p className="text-zinc-300">{atual.fotografos.map((f) => String(f.nome)).join(', ') || '—'}</p>
          </div>
        </div>
      )}

      {/* Retorno: fichas que ficaram para outro dia */}
      {encerrada && retorno && (
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-bold text-zinc-300">
            ↺ Retorno agendado: <span className="text-white">{num(Number(retorno.fichasPrevistas))} fichas</span> em <span className="text-white">{dataBR(String(retorno.data))}</span>
          </p>
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{rotuloStatus(retorno.status)}</span>
        </div>
      )}
      {encerrada && !retorno && podeEditar && (
        <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <p className="text-xs text-zinc-300">Ficaram fichas para outro dia? Agende o retorno: ele entra na agenda como uma nova visita.</p>
          <button onClick={() => setCaixaRetorno('agendar')} className={btnSecundario}>
            ↺ Agendar retorno
          </button>
        </div>
      )}

      {msg && <p className={`text-xs font-bold ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.texto}</p>}

      {caixaRetorno && (
        <CaixaRetorno
          visita={visita}
          modo={caixaRetorno}
          fotografadas={Number(fotografadas)}
          onFechar={() => setCaixaRetorno(null)}
          onAviso={(texto) => setMsg({ ok: false, texto })}
        />
      )}

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
              <span className="px-2.5 py-0.5 bg-white/[0.05] text-zinc-300 border border-white/[0.1] text-[9px] font-black uppercase rounded">{String(h.tipo)}</span>
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

// Caixa do retorno. modo 'encerrar': pergunta "Haverá retorno?" e encerra a visita (com ou sem retorno).
// modo 'agendar': visita já encerrada, só agenda o retorno. O retorno vira uma visita nova na agenda.
function CaixaRetorno({ visita, modo, fotografadas, onFechar, onAviso }: { visita: Registro; modo: 'encerrar' | 'agendar'; fotografadas: number; onFechar: () => void; onAviso: (texto: string) => void }) {
  const [haRetorno, setHaRetorno] = useState<boolean | null>(modo === 'agendar' ? true : null)
  const [fichas, setFichas] = useState('')
  const [data, setData] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const confirmar = async () => {
    if (haRetorno === null) return setErro('Informe se haverá retorno.')
    if (haRetorno) {
      if (!(Number(fichas) > 0)) return setErro('Informe quantas fichas ficaram para o retorno.')
      if (!data) return setErro('Informe a data do retorno.')
      if (data <= String(visita.data)) return setErro('A data do retorno tem que ser depois da visita.')
    }
    setSalvando(true)
    if (modo === 'encerrar') {
      const e = await encerrarVisita(visita.id, fotografadas)
      if (e) {
        setSalvando(false)
        return setErro(e)
      }
    }
    if (haRetorno) {
      const e = await agendarRetorno(visita.id, Number(fichas), data)
      if (e) {
        setSalvando(false)
        if (modo === 'encerrar') {
          // a visita já foi encerrada: o retorno pode ser agendado pelo botão "Agendar retorno"
          onAviso(`Visita encerrada, mas o retorno não foi agendado: ${e} Use o botão "Agendar retorno".`)
          return onFechar()
        }
        return setErro(e)
      }
    }
    onFechar()
  }

  const opcao = (valor: boolean, rotulo: string) => (
    <button
      type="button"
      onClick={() => (setHaRetorno(valor), setErro(''))}
      className={`flex-1 px-5 py-4 rounded-2xl border text-sm font-black uppercase tracking-widest transition-all ${
        haRetorno === valor ? 'border-blue-500/60 bg-blue-500/15 text-blue-300' : 'border-white/[0.08] text-zinc-400 hover:text-white'
      }`}
    >
      {rotulo}
    </button>
  )

  return (
    <Modal
      aberto
      titulo={modo === 'encerrar' ? 'Encerrar visita' : 'Agendar retorno'}
      subtitulo={`${visita.escola} • ${dataBR(String(visita.data))}${modo === 'encerrar' ? ` • ${num(fotografadas)} fichas fotografadas` : ''}`}
      onFechar={onFechar}
      largura="max-w-lg"
      rodape={
        <>
          <button onClick={onFechar} className={btnSecundario}>Voltar</button>
          <button onClick={confirmar} disabled={salvando} className={`${btnPrimario} disabled:opacity-50`}>
            {salvando ? 'Salvando…' : modo === 'encerrar' ? 'Encerrar visita' : 'Agendar retorno'}
          </button>
        </>
      }
    >
      {modo === 'encerrar' && (
        <div className="space-y-3">
          <p className="text-base font-black text-white">Haverá retorno?</p>
          <div className="flex gap-3">
            {opcao(false, 'Não')}
            {opcao(true, 'Sim')}
          </div>
        </div>
      )}
      {haRetorno && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={labelCls}>Fichas para o retorno</label>
            <input type="number" min={1} value={fichas} onChange={(e) => setFichas(e.target.value)} placeholder="Ex.: 15" className={inputCls} autoFocus />
          </div>
          <div className="space-y-2">
            <label className={labelCls}>Data do retorno</label>
            <input type="date" min={addDias(String(visita.data), 1)} value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
          </div>
          <p className="md:col-span-2 text-[11px] text-zinc-500">O retorno entra direto na Agenda Fotográfica como uma nova visita da mesma escola. Depois é só montar a equipe e confirmar as fichas.</p>
        </div>
      )}
      {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
    </Modal>
  )
}
