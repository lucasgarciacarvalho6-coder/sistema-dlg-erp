'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Registro } from '@/lib/erp/types'
import { STATUS_VENDEDOR_PJ } from '@/lib/erp/config'
import { parametros } from '@/lib/erp/parametros'
import { atualizarRegistro, criarRegistro, resolverPendencia, useErp, usePode, useUsuario } from '@/lib/erp/store'
import { colecao, diaReferencia, esperadoAteHoje, resumo, serieMes, somar } from '@/lib/erp/metrics'
import { STATUS_VEICULO, historicoDoCadastro, nomePJ, pendenciasDoDia, resolucoesDoDia, responsavelOperacional, type AcaoPendencia, type Pendencia } from '@/lib/erp/operacional'
import { ehDiaUtil } from '@/lib/erp/calendario'
import PainelMeta from '@/components/erp/PainelMeta'
import { addDias, dataBR, hoje, inicioSemana, mesAtual, nomeMes, num, pct, rotuloSemana } from '@/lib/erp/format'
import CrudPage, { type Campo } from '@/components/erp/CrudPage'
import Icon from '@/components/erp/Icon'
import { PillSituacao } from '@/components/erp/status'
import { situacaoResumo } from '@/lib/erp/metrics'
import { BarChart, Badge, EmptyState, Modal, PageHeader, Panel, ProgressBar, StatCard, Tabs, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

type Aba = 'gestao' | 'dashboard' | 'rota' | 'vendedores' | 'fotografos' | 'motoristas' | 'veiculos'

const ABAS: { id: Aba; label: string }[] = [
  { id: 'gestao', label: 'Gestão diária' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'rota', label: 'Controle de rota' },
  { id: 'vendedores', label: 'Vendedores de contrato' },
  { id: 'fotografos', label: 'Fotógrafos' },
  { id: 'motoristas', label: 'Motoristas' },
  { id: 'veiculos', label: 'Veículos' },
]

const PIX: Campo[] = [
  { chave: 'pixNome', label: 'PIX • nome de quem recebe', tipo: 'texto', tabela: false },
  { chave: 'pixChave', label: 'PIX • chave', tipo: 'texto', tabela: false },
  { chave: 'pixBanco', label: 'PIX • banco', tipo: 'texto', tabela: false },
]

export default function ControleOperacionalPage() {
  // ?aba=vendedores (links da Gestão Diária)
  const [aba, setAba] = useState<Aba>(() => {
    const a = new URLSearchParams(window.location.search).get('aba') as Aba | null
    return a && ABAS.some((x) => x.id === a) ? a : 'gestao'
  })

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Módulo / Operações"
        titulo="Controle Operacional"
        descricao="O que precisa ser resolvido hoje, metas, rotas dos vendedores e cadastro das equipes de campo."
      />
      <Tabs abas={ABAS} ativa={aba} onChange={setAba} />
      {aba === 'gestao' && <GestaoDiaria irPara={setAba} />}
      {aba === 'dashboard' && <DashboardOperacional />}
      {aba === 'rota' && <ControleRota />}
      {aba === 'vendedores' && <VendedoresContrato />}
      {aba === 'fotografos' && <Freelancers tipo="Fotógrafo" />}
      {aba === 'motoristas' && <Freelancers tipo="Motorista" />}
      {aba === 'veiculos' && <Veiculos />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// GESTÃO DIÁRIA — pendências acionáveis. Somem sozinhas quando resolvidas na origem,
// ou pelo "Resolver": Resolvido • Contato sem sucesso (volta amanhã) • Excluir (sai de vez), com observação
// ---------------------------------------------------------------------------
const OPCOES_RESOLVER: { id: AcaoPendencia; t: string; d: string; cls: string }[] = [
  { id: 'Resolvido', t: '✅ Resolvido', d: 'Sai da lista. Se o problema continuar, volta amanhã.', cls: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' },
  { id: 'Sem sucesso', t: '📵 Contato sem sucesso', d: 'Sai de hoje e volta amanhã para tentar de novo.', cls: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-300' },
  { id: 'Excluída', t: '🗑 Excluir pendência', d: 'Sai de vez: este item não volta mais.', cls: 'border-red-500/50 bg-red-500/10 text-red-300' },
]
const TOM_ACAO: Record<string, 'emerald' | 'yellow' | 'red'> = { Resolvido: 'emerald', 'Sem sucesso': 'yellow', 'Excluída': 'red' }

function ResolverPendencia({ p, onFechar, irPara }: { p: Pendencia; onFechar: () => void; irPara: (a: Aba) => void }) {
  const [acao, setAcao] = useState<AcaoPendencia | ''>('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const ultima = p.ultima
  // a tela de origem pode ser outra aba desta mesma página (ex.: Vendedores de contrato)
  const abaDoLink = p.link.startsWith('/operacional/controle?aba=') ? (p.link.split('aba=')[1] as Aba) : null

  const confirmar = async () => {
    if (!acao) return setErro('Escolha o que aconteceu.')
    if (acao !== 'Resolvido' && !obs.trim()) return setErro('Escreva a observação.')
    setErro('')
    setSalvando(true)
    const e = await resolverPendencia(p, acao, obs)
    setSalvando(false)
    if (e) return setErro(e)
    onFechar()
  }

  return (
    <Modal
      aberto
      titulo="Resolver pendência"
      subtitulo={p.area}
      onFechar={onFechar}
      rodape={
        <>
          {abaDoLink ? (
            <button onClick={() => (irPara(abaDoLink), onFechar())} className="mr-auto px-4 py-3 text-xs font-bold uppercase tracking-widest text-blue-400 hover:bg-blue-500/10 rounded-xl">
              Abrir tela de origem →
            </button>
          ) : (
            <Link href={p.link} className="mr-auto px-4 py-3 text-xs font-bold uppercase tracking-widest text-blue-400 hover:bg-blue-500/10 rounded-xl">
              Abrir tela de origem →
            </Link>
          )}
          <button onClick={onFechar} className={btnSecundario}>Cancelar</button>
          <button onClick={() => void confirmar()} disabled={salvando} className={acao === 'Excluída' ? 'px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl disabled:opacity-50' : btnPrimario}>
            {salvando ? 'Salvando...' : acao === 'Excluída' ? 'Excluir pendência' : 'Confirmar'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4">
          <p className="text-base font-black text-white">{p.titulo}</p>
          <p className="text-sm text-zinc-400 mt-1">{p.detalhe}</p>
          {ultima && (
            <p className="text-xs text-zinc-400 mt-3 pt-3 border-t border-white/[0.05]">
              <Badge texto={String(ultima.acao)} tom={TOM_ACAO[String(ultima.acao)] ?? 'zinc'} /> em {dataBR(String(ultima.data))}
              {ultima.autor ? ` por ${ultima.autor}` : ''}
              {ultima.observacao ? <span className="block mt-1 text-zinc-300">“{String(ultima.observacao)}”</span> : null}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {OPCOES_RESOLVER.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setAcao(o.id)}
              className={`text-left p-3 rounded-xl border transition-all ${acao === o.id ? o.cls : 'border-white/[0.06] text-zinc-300 hover:bg-white/[0.02]'}`}
            >
              <p className="text-sm font-black">{o.t}</p>
              <p className="text-[10px] text-zinc-500 mt-1">{o.d}</p>
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Observação {acao && acao !== 'Resolvido' ? '*' : ''}</label>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={4}
            className={inputCls}
            placeholder={acao === 'Excluída' ? 'Por que está excluindo esta pendência?' : acao === 'Sem sucesso' ? 'Ex.: liguei 2 vezes, não atendeu; mandei WhatsApp.' : 'O que foi feito?'}
          />
          {p.area === 'Vendedores' && acao && acao !== 'Excluída' && <p className="text-[11px] text-zinc-500">Fica registrado também no histórico de contatos do vendedor.</p>}
          {p.area === 'Tarefas' && acao === 'Resolvido' && <p className="text-[11px] text-zinc-500">A tarefa fica como concluída.</p>}
        </div>
        {erro && <p className="text-sm font-bold text-red-400">{erro}</p>}
      </div>
    </Modal>
  )
}

function GestaoDiaria({ irPara }: { irPara: (a: Aba) => void }) {
  const s = useErp()
  const podeFazer = usePode()
  const pendencias = useMemo(() => pendenciasDoDia(s), [s])
  const resolvidasHoje = useMemo(() => resolucoesDoDia(s), [s])
  const altas = pendencias.filter((p) => p.prioridade === 'alta')
  const areas = ['Contratos', 'Agenda', 'Fechamento', 'Vendedores', 'Tarefas'] as const
  const [resolvendo, setResolvendo] = useState<Pendencia | null>(null)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
        <StatCard destaque tom={altas.length ? 'red' : 'emerald'} label="Para hoje" valor={pendencias.length} detalhe={`${altas.length} urgente(s)`} />
        {areas.map((a) => (
          <StatCard key={a} label={a} valor={pendencias.filter((p) => p.area === a).length} tom="zinc" />
        ))}
      </div>
      <Panel semPadding titulo="Pendências do dia" subtitulo="Resolva pelo botão (com observação) ou na tela de origem: o item sai da lista sozinho">
        {pendencias.length === 0 ? (
          <EmptyState titulo="Tudo em dia 🎉" descricao="Nenhuma pendência entre contratos, agenda e fechamentos." />
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {pendencias.map((p) => (
              <div key={p.id} className="px-6 py-4 flex items-center gap-4 hover:bg-white/[0.02]">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.prioridade === 'alta' ? 'bg-red-500' : 'bg-yellow-500'}`}></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge texto={p.area} />
                    {p.prioridade === 'alta' && <span className="text-[10px] font-black uppercase tracking-widest text-red-400">Urgente</span>}
                  </div>
                  <p className="text-sm font-bold text-white mt-1.5">{p.titulo}</p>
                  <p className="text-[11px] text-zinc-500">{p.detalhe}</p>
                  {p.ultima && (
                    <p className="text-[11px] text-zinc-400 mt-1">
                      ↺ {String(p.ultima.acao)} em {dataBR(String(p.ultima.data))}
                      {p.ultima.observacao ? `: ${String(p.ultima.observacao)}` : ''}
                    </p>
                  )}
                </div>
                {podeFazer('operacional', 'criar') ? (
                  <button onClick={() => setResolvendo(p)} className="shrink-0 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20">
                    Resolver →
                  </button>
                ) : (
                  <Link href={p.link} className="shrink-0 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20">
                    Ver →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel semPadding titulo={`Resolvidas hoje • ${resolvidasHoje.length}`} subtitulo="O que a coordenação fez com as pendências hoje">
        {resolvidasHoje.length === 0 ? (
          <p className="p-6 text-xs text-zinc-500">Nenhuma pendência resolvida hoje ainda.</p>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {resolvidasHoje.map((r) => (
              <div key={r.id} className="px-6 py-3.5 flex items-start gap-4">
                <Badge texto={String(r.acao)} tom={TOM_ACAO[String(r.acao)] ?? 'zinc'} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">{String(r.titulo)}</p>
                  {r.observacao ? <p className="text-[11px] text-zinc-400">{String(r.observacao)}</p> : null}
                </div>
                <p className="text-[10px] text-zinc-500 whitespace-nowrap text-right">
                  {new Date(String(r.criadoEm)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {r.autor ? <span className="block">{String(r.autor)}</span> : null}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {resolvendo && <ResolverPendencia p={resolvendo} onFechar={() => setResolvendo(null)} irPara={irPara} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DASHBOARD — metas diária, semanal e mensal de fichas fotografadas
// ---------------------------------------------------------------------------
function DashboardOperacional() {
  const s = useErp()
  const mes = mesAtual()
  const r = resumo(s, 'operacional', 'fichas', mes)
  const semana = inicioSemana(hoje())
  const feitoSemana = [0, 1, 2, 3, 4, 5, 6].reduce((a, i) => a + somar(s.lancamentos, { setor: 'operacional', indicador: 'fichas', data: addDias(semana, i) }), 0)
  const uteisSemana = [0, 1, 2, 3, 4, 5, 6].filter((i) => ehDiaUtil(addDias(semana, i))).length
  const metaSemana = r.meta.diaria * uteisSemana // seg a sex, sem feriados
  const esperado = esperadoAteHoje(mes)
  const visitasSemana = colecao(s, 'agenda_visitas').filter((v) => String(v.data) >= semana && String(v.data) <= addDias(semana, 6) && v.status !== 'Cancelada')
  const rotas = colecao(s, 'rotas').filter((x) => x.status === 'Ativa')
  const cidades = colecao(s, 'rota_cidades').filter((c) => rotas.some((x) => x.id === c.rotaId))

  const bloco = (rotulo: string, feito: number, meta: number, detalhe: string) => {
    const p = meta > 0 ? (feito / meta) * 100 : 0
    return (
      <div className="bg-painel-2/80 border border-white/[0.05] p-6 rounded-3xl space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400">{rotulo}</p>
        <div className="flex items-end justify-between">
          <p className="text-4xl font-black text-white tracking-tight">{num(feito)}</p>
          <p className="text-sm font-bold text-zinc-500">de {num(meta)}</p>
        </div>
        <ProgressBar valor={p} />
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
          <span className="text-white">{pct(p)}</span>
          <span className="text-zinc-500">{meta - feito > 0 ? `Faltam ${num(meta - feito)}` : 'Meta batida ✓'}</span>
        </div>
        <p className="text-[10px] text-zinc-500">{detalhe}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Meta da coordenação (RMC): todas as fichas das visitas contam para ela */}
      <PainelMeta s={s} colaborador={responsavelOperacional(s)} indicadorId="fichas" mes={mes} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {bloco('Meta diária • hoje', r.hoje, r.meta.diaria, 'Fichas fotografadas hoje')}
        {bloco('Meta semanal', feitoSemana, metaSemana, `Semana ${rotuloSemana(semana)} • ${uteisSemana} dias úteis • ${visitasSemana.length} visita(s)`)}
        {bloco(`Meta mensal • ${nomeMes(mes)}`, r.mes, r.meta.mensal, `Projeção do mês: ${num(r.projecao)} fichas`)}
      </div>
      <div className="flex items-center gap-3">
        <PillSituacao situacao={situacaoResumo(r, mes)} />
        <span className="text-xs text-zinc-400">
          Hoje deveria estar em {pct(esperado)} da meta do mês • está em {pct(r.pctMes)} • necessário {num(r.necessarioDia)} fichas/dia
        </span>
      </div>
      <Panel titulo="Fichas fotografadas por dia" subtitulo={nomeMes(mes)}>
        <BarChart valores={serieMes(s.lancamentos, { setor: 'operacional', indicador: 'fichas' }, mes)} meta={r.meta.diaria} limite={diaReferencia(mes)} />
      </Panel>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Rotas ativas" valor={rotas.length} />
        <StatCard label="Cidades nas rotas" valor={cidades.length} tom="zinc" />
        <StatCard label="Cidades visitadas" valor={cidades.filter((c) => c.visitada === 'Sim').length} />
        <StatCard label="Contratos nas visitas" valor={cidades.reduce((a, c) => a + Number(c.contratos || 0), 0)} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CONTROLE DE ROTA — por vendedor e estado
// ---------------------------------------------------------------------------
function ControleRota() {
  const s = useErp()
  const podeFazer = usePode()
  const vendedores = colecao(s, 'pj_vendedores')
    .filter((v) => v.status !== 'Inativo')
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
  // Abre no primeiro vendedor que já tem rota ativa
  const [vendedorId, setVendedorId] = useState(() => {
    const comRota = vendedores.find((v) => colecao(s, 'rotas').some((r) => r.vendedorId === v.id && r.status === 'Ativa'))
    return String((comRota ?? vendedores[0])?.id ?? '')
  })
  const [nova, setNova] = useState({ uf: 'PR', nome: '' })
  const [erro, setErro] = useState<string | null>(null)

  const rotasTodas = colecao(s, 'rotas')
  const rotasDoVendedor = rotasTodas.filter((r) => r.vendedorId === vendedorId && r.status === 'Ativa')
  const cidadesDe = (rotaId: string) => colecao(s, 'rota_cidades').filter((c) => c.rotaId === rotaId)

  const criarRota = async () => {
    if (!vendedorId) return setErro('Cadastre um vendedor primeiro.')
    const falha = await criarRegistro('rotas', { vendedorId, uf: nova.uf, nome: nova.nome || `Rota ${nova.uf}`, status: 'Ativa' }, 'operacional')
    setErro(falha)
    if (!falha) setNova({ uf: nova.uf, nome: '' })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Um "aba" por vendedor */}
      <div className="flex flex-wrap gap-2">
        {vendedores.map((v) => {
          const rs = rotasTodas.filter((r) => r.vendedorId === v.id && r.status === 'Ativa')
          return (
            <button
              key={v.id}
              onClick={() => setVendedorId(v.id)}
              className={`px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all ${vendedorId === v.id ? 'bg-blue-600/10 text-blue-400 border-blue-500/30' : 'text-zinc-500 hover:text-white border-white/[0.05]'}`}
            >
              {String(v.nome).split(' ')[0]} <span className="text-zinc-600">({rs.length})</span>
            </button>
          )
        })}
        {vendedores.length === 0 && <p className="text-xs text-zinc-500">Cadastre vendedores na aba “Vendedores de contrato”.</p>}
      </div>

      {podeFazer('operacional', 'criar') && vendedorId && (
        <div className="bg-painel/80 border border-white/[0.05] rounded-3xl p-6">
          <p className="text-lg font-bold text-white tracking-wide">Nova rota operacional</p>
          <p className="text-[10px] text-zinc-400 uppercase tracking-widest mt-0.5 mb-5">Orienta as cidades e a ordem de visitação de {nomePJ(s, vendedorId)}</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <label className={labelCls}>Estado / UF</label>
              <input value={nova.uf} maxLength={2} onChange={(e) => setNova({ ...nova, uf: e.target.value.toUpperCase() })} className={inputCls} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className={labelCls}>Nome da rota</label>
              <input value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="Ex.: Rota Noroeste" className={inputCls} />
            </div>
            <button onClick={criarRota} className={btnPrimario}>
              <Icon nome="plus" className="w-4 h-4" /> Criar rota
            </button>
          </div>
          {erro && <p className="text-xs font-bold text-red-400 mt-3">{erro}</p>}
        </div>
      )}

      {rotasDoVendedor.length === 0 && vendedorId && <EmptyState titulo="Nenhuma rota ativa" descricao="Crie uma rota e adicione as cidades na ordem de visitação." />}

      {rotasDoVendedor.map((rota) => {
        const cs = cidadesDe(rota.id)
        return (
          <div key={rota.id} className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{String(rota.uf)} • {nomePJ(s, rota.vendedorId)}</span>
                <h3 className="text-xl font-black text-white mt-1">{String(rota.nome)}</h3>
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                {[
                  ['Cidades', cs.length],
                  ['Visitadas', cs.filter((c) => c.visitada === 'Sim').length],
                  ['Fecharam', cs.filter((c) => c.fechou === 'SIM').length],
                  ['Contratos', cs.reduce((a, c) => a + Number(c.contratos || 0), 0)],
                ].map(([r, v]) => (
                  <div key={String(r)} className="bg-white/[0.02] border border-white/[0.05] px-4 py-2 rounded-xl text-center">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{r}</p>
                    <p className="text-lg font-black text-white">{v}</p>
                  </div>
                ))}
                {podeFazer('operacional', 'editar') && (
                  <button onClick={() => atualizarRegistro('rotas', rota.id, { status: 'Arquivada' }, 'operacional')} className="text-zinc-500 hover:text-red-400 bg-white/[0.02] hover:bg-red-500/10 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 border border-transparent hover:border-red-500/20">
                    <Icon nome="trash" className="w-4 h-4" /> Arquivar rota
                  </button>
                )}
              </div>
            </div>
            <CrudPage
              embutido
              colecao="rota_cidades"
              modulo="operacional"
              setor="operacional"
              moduloLabel="Controle de rota"
              titulo="Cidades da rota"
              descricao="Ordem de visitação, resultado e motivo quando não fecha"
              rotuloNovo="Adicionar cidade"
              filtro={(c) => c.rotaId === rota.id}
              campos={[
                { chave: 'ordem', label: 'Ordem', tipo: 'numero', padrao: () => cs.length + 1 },
                { chave: 'cidade', label: 'Cidade', tipo: 'texto', obrigatorio: true },
                { chave: 'dataVisita', label: 'Data visita', tipo: 'data' },
                { chave: 'visitada', label: 'Visitada', tipo: 'select', opcoes: ['Não', 'Sim'], obrigatorio: true, tabela: false },
                { chave: 'fechou', label: 'Fechou?', tipo: 'select', opcoes: ['SIM', 'NÃO'], exibir: (r) => (r.fechou ? <Badge texto={String(r.fechou)} tom={r.fechou === 'SIM' ? 'emerald' : 'red'} /> : '—') },
                { chave: 'contratos', label: 'Contratos', tipo: 'numero' },
                { chave: 'motivo', label: 'Motivo (se não)', tipo: 'texto' },
                { chave: 'observacao', label: 'Observação', tipo: 'textarea', tabela: false },
                { chave: 'rotaId', label: 'Rota', tipo: 'texto', tabela: false, formulario: false, padrao: () => rota.id },
              ]}
              status={{ campo: 'visitada', tons: {}, valor: (r) => (r.visitada === 'Sim' ? 'Visitada' : 'Pendente') }}
            />
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// VENDEDORES DE CONTRATO (PJ) — cadastro, valor por aluno e histórico de contatos
// ---------------------------------------------------------------------------
function VendedoresContrato() {
  const [contatoDe, setContatoDe] = useState<Registro | null>(null)
  return (
    <div className="animate-fade-in">
      <CrudPage
        embutido
        colecao="pj_vendedores"
        modulo="operacional"
        setor="operacional"
        moduloLabel="Vendedores de contrato"
        titulo="Vendedores de contrato (PJ)"
        descricao="Recebem por aluno fotografado nas escolas que fecham — entra no fechamento semanal. O acesso ao app é criado em ADM › Vendedores externos."
        rotuloNovo="Novo vendedor"
        filtro={(r) => r.tipo !== 'Books'}
        campos={[
          { chave: 'tipo', label: 'Tipo', tipo: 'texto', tabela: false, formulario: false, padrao: () => 'Contrato' },
          { chave: 'nome', label: 'Nome', tipo: 'texto', obrigatorio: true },
          { chave: 'telefone', label: 'Contato', tipo: 'telefone' },
          { chave: 'cidade', label: 'Cidade', tipo: 'texto' },
          { chave: 'uf', label: 'UF', tipo: 'texto', padrao: () => 'PR', tabela: false },
          { chave: 'valorPorFicha', label: 'R$ por aluno', tipo: 'moeda', obrigatorio: true },
          { chave: 'ultimoContato', label: 'Último contato', tipo: 'data', formulario: false },
          { chave: 'status', label: 'Situação', tipo: 'select', opcoes: [...STATUS_VENDEDOR_PJ], obrigatorio: true, tabela: false },
          ...PIX,
          { chave: 'observacao', label: 'Observação', tipo: 'textarea', tabela: false },
        ]}
        status={{ campo: 'status', tons: {} }}
        kpis={(rs) => [
          { label: 'Cadastrados', valor: rs.length, tom: 'blue' },
          { label: 'Ativos', valor: rs.filter((r) => r.status === 'Ativo').length, tom: 'emerald' },
          { label: 'Em negociação', valor: rs.filter((r) => r.status === 'Em negociação').length, tom: 'yellow' },
          { label: 'Inativos', valor: rs.filter((r) => r.status === 'Inativo').length, tom: 'red' },
        ]}
        acoes={[{ label: 'Contatos', tom: 'blue', executar: (r) => setContatoDe(r) }]}
        historico={(r, s) => historicoDoCadastro(s, 'pj_vendedores', r)}
        inativar={{ campo: 'status', valor: 'Inativo' }}
      />
      {contatoDe && <HistoricoContatos pessoa={contatoDe} onFechar={() => setContatoDe(null)} />}
    </div>
  )
}

function HistoricoContatos({ pessoa, onFechar }: { pessoa: Registro; onFechar: () => void }) {
  const s = useErp()
  const usuario = useUsuario()
  const podeFazer = usePode()
  const [assunto, setAssunto] = useState('')
  const [data, setData] = useState(hoje())
  const [erro, setErro] = useState<string | null>(null)
  const historico = colecao(s, 'historico_contatos')
    .filter((h) => h.pessoaId === pessoa.id)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))

  const registrar = async () => {
    if (!assunto.trim()) return setErro('Descreva o assunto do contato.')
    const falha = await criarRegistro('historico_contatos', { pessoaId: pessoa.id, data, assunto, autor: usuario?.nome ?? '' }, 'operacional')
    if (!falha && data >= String(pessoa.ultimoContato || '')) await atualizarRegistro('pj_vendedores', pessoa.id, { ultimoContato: data }, 'operacional')
    setErro(falha)
    if (!falha) setAssunto('')
  }

  return (
    <Modal aberto titulo={`Contatos • ${pessoa.nome}`} subtitulo={`${pessoa.telefone || 'sem telefone'} • último contato ${dataBR(String(pessoa.ultimoContato || ''))}`} onFechar={onFechar} largura="max-w-2xl" rodape={<button onClick={onFechar} className={btnSecundario}>Fechar</button>}>
      {podeFazer('operacional', 'criar') && (
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className={labelCls}>Data</label>
              <input type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-2 md:col-span-3">
              <label className={labelCls}>Assunto</label>
              <input value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Ex.: Confirmou 2 escolas em Pérola" className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={registrar} className={btnPrimario}>Registrar contato</button>
          </div>
          {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
        </div>
      )}
      <div className="space-y-3">
        {historico.length === 0 && <p className="text-xs text-zinc-500">Nenhum contato registrado.</p>}
        {historico.map((h) => (
          <div key={h.id} className="bg-black/50 border border-white/[0.05] p-4 rounded-2xl">
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>{dataBR(String(h.data))}</span>
              <span>{String(h.autor || '')}</span>
            </div>
            <p className="text-sm text-zinc-200 mt-1">{String(h.assunto)}</p>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// FOTÓGRAFOS e MOTORISTAS (freelancers PJ)
// ---------------------------------------------------------------------------
function Freelancers({ tipo }: { tipo: 'Fotógrafo' | 'Motorista' }) {
  const fotografo = tipo === 'Fotógrafo'
  const par = parametros(useErp()) // valores editáveis em ADM › Configurações
  return (
    <div className="animate-fade-in">
      <CrudPage
        key={tipo}
        embutido
        colecao="freelancers"
        modulo="operacional"
        setor="operacional"
        moduloLabel={fotografo ? 'Fotógrafos' : 'Motoristas'}
        titulo={fotografo ? 'Fotógrafos' : 'Motoristas'}
        descricao={
          fotografo
            ? `Diária entre R$ ${par.diariaFotografoMin} e R$ ${par.diariaFotografoMax} (iniciante ou profissional) + R$ ${par.alimentacaoDiaria} de alimentação por dia trabalhado`
            : `Diária em média R$ ${par.diariaMotorista} + R$ ${par.alimentacaoDiaria} de alimentação • pode incluir sábado e domingo conforme a viagem`
        }
        rotuloNovo={fotografo ? 'Novo fotógrafo' : 'Novo motorista'}
        filtro={(r) => r.tipo === tipo}
        campos={[
          { chave: 'nome', label: 'Nome', tipo: 'texto', obrigatorio: true },
          { chave: 'cidade', label: 'Cidade onde reside', tipo: 'texto' },
          { chave: 'uf', label: 'UF', tipo: 'texto', padrao: () => 'PR', tabela: false },
          { chave: 'telefone', label: 'Contato', tipo: 'telefone' },
          ...(fotografo ? [{ chave: 'nivel', label: 'Nível', tipo: 'select' as const, opcoes: ['Iniciante', 'Profissional'] }] : []),
          { chave: 'diaria', label: 'Diária', tipo: 'moeda', obrigatorio: true, padrao: () => (fotografo ? par.diariaFotografoMin : par.diariaMotorista) },
          { chave: 'status', label: 'Situação', tipo: 'select', opcoes: ['Ativo', 'Inativo'], obrigatorio: true, tabela: false },
          ...PIX,
          { chave: 'tipo', label: 'Tipo', tipo: 'texto', tabela: false, formulario: false, padrao: () => tipo },
        ]}
        status={{ campo: 'status', tons: {}, valor: (r) => (r.status === 'Ativo' ? (fotografo ? 'Ativo' : 'Pronto p/ viagem') : 'Inativo') }}
        kpis={(rs) => [
          { label: 'Cadastrados', valor: rs.length, tom: 'blue' },
          { label: fotografo ? 'Ativos' : 'Ativos • prontos para viagem', valor: rs.filter((r) => r.status === 'Ativo').length, tom: 'emerald' },
          { label: 'Inativos', valor: rs.filter((r) => r.status !== 'Ativo').length, tom: 'red' },
        ]}
        historico={(r, s) => historicoDoCadastro(s, 'freelancers', r)}
        inativar={{ campo: 'status', valor: 'Inativo' }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// VEÍCULOS da operação (vão na equipe de cada viagem, junto com motorista e fotógrafos)
// ---------------------------------------------------------------------------
function Veiculos() {
  const s = useErp()
  const visitas = colecao(s, 'agenda_visitas').filter((v) => v.status === 'Agendada' || v.status === 'Fotografada')
  const hj = hoje()
  const naEstradaHoje = new Set(visitas.filter((v) => v.data === hj && v.veiculoId).map((v) => String(v.veiculoId)))
  const proxima = (id: string) =>
    visitas
      .filter((v) => v.veiculoId === id && v.status === 'Agendada' && String(v.data) >= hj)
      .sort((a, b) => String(a.data).localeCompare(String(b.data)))[0]
  return (
    <div className="animate-fade-in">
      <CrudPage
        embutido
        colecao="veiculos"
        modulo="operacional"
        setor="operacional"
        moduloLabel="Veículos"
        titulo="Veículos"
        descricao="Carros e vans da operação. Na agenda, cada visita recebe a equipe da viagem: veículo, motorista e de 1 a 4 fotógrafos."
        rotuloNovo="Novo veículo"
        campos={[
          { chave: 'modelo', label: 'Modelo', tipo: 'texto', obrigatorio: true },
          { chave: 'placa', label: 'Placa', tipo: 'texto', obrigatorio: true, exibir: (r) => <span className="font-mono font-bold text-white">{String(r.placa || '').toUpperCase()}</span> },
          { chave: 'ano', label: 'Ano', tipo: 'numero', tabela: false },
          { chave: 'cor', label: 'Cor', tipo: 'texto', tabela: false },
          { chave: 'lugares', label: 'Lugares', tipo: 'numero', obrigatorio: true, padrao: () => 5 },
          { chave: 'status', label: 'Situação', tipo: 'select', opcoes: [...STATUS_VEICULO], obrigatorio: true, padrao: () => 'Disponível', tabela: false },
          {
            chave: 'proximaViagem',
            label: 'Próxima viagem',
            tipo: 'texto',
            formulario: false,
            exibir: (r) => {
              const v = proxima(r.id)
              return v ? (
                <span className="text-xs">
                  <strong className="text-white">{dataBR(String(v.data))}</strong> <span className="text-zinc-400">• {String(v.cidade)}-{String(v.uf)}</span>
                  {v.equipe ? <span className="text-zinc-300"> • {String(v.equipe)}</span> : null}
                </span>
              ) : (
                <span className="text-xs text-zinc-500">—</span>
              )
            },
          },
          { chave: 'observacao', label: 'Observação', tipo: 'textarea', tabela: false },
        ]}
        status={{
          campo: 'status',
          tons: { 'Em manutenção': 'yellow' },
          valor: (r) => (r.status === 'Disponível' && naEstradaHoje.has(r.id) ? 'Na estrada hoje' : String(r.status || 'Disponível')),
        }}
        kpis={(rs) => [
          { label: 'Cadastrados', valor: rs.length, tom: 'blue' },
          { label: 'Disponíveis', valor: rs.filter((r) => r.status === 'Disponível').length, tom: 'emerald' },
          { label: 'Na estrada hoje', valor: rs.filter((r) => naEstradaHoje.has(r.id)).length, tom: 'blue' },
          { label: 'Em manutenção', valor: rs.filter((r) => r.status === 'Em manutenção').length, tom: 'yellow' },
        ]}
        historico={(r, s) => historicoDoCadastro(s, 'veiculos', r)}
        inativar={{ campo: 'status', valor: 'Inativo' }}
      />
    </div>
  )
}
