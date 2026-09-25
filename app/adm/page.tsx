'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { SETORES } from '@/lib/erp/config'
import { useErp } from '@/lib/erp/store'
import { colecao, mesesDisponiveis, resumo, somar, tituloAtrasado } from '@/lib/erp/metrics'
import { brl, dataHoraBR, formatar, mesAtual, nomeMes, num, pct } from '@/lib/erp/format'
import Icon from '@/components/erp/Icon'
import { RankingGeral } from '@/components/erp/PainelSetores'
import { GradeEvolucao, ModoTV, PlacarAreas } from '@/components/erp/VisaoTV'
import EquipeCards from '@/components/erp/EquipeCards'
import { Badge, PageHeader, Panel, StatCard, TONS, btnBranco } from '@/components/erp/ui'

// VISÃO MESTRA (Diretoria): consolida em tempo real os dados que todos os setores
// gravam no núcleo central. Nenhum setor "envia" para o ADM — o ADM lê o núcleo.
export default function AdmVisaoTVPage() {
  const s = useErp()
  const [mes, setMes] = useState(mesAtual())

  const faturado = somar(s.lancamentos, { setor: 'cobranca', indicador: 'valor_recebido', mes })
  const faturadoHoje = resumo(s, 'cobranca', 'valor_recebido', mes).hoje
  const fotografado = resumo(s, 'operacional', 'fichas', mes)
  const contratos = resumo(s, 'vendas', 'contratos', mes)
  const ebooks = resumo(s, 'cobranca', 'ebooks_vendidos', mes)
  const ordens = colecao(s, 'ordens_producao')
  const emProducao = ordens.filter((o) => o.etapa !== 'Concluído').length
  const titulos = colecao(s, 'titulos')
  const abertos = titulos.filter((t) => t.status === 'Aberto' || t.status === 'Em acordo')
  const atrasados = titulos.filter(tituloAtrasado)
  const inadimplencia = abertos.length ? (atrasados.reduce((a, t) => a + Number(t.valor), 0) / abertos.reduce((a, t) => a + Number(t.valor), 0)) * 100 : 0
  const aprovacoesPendentes = colecao(s, 'aprovacoes').filter((a) => a.status === 'Pendente').length

  // Feed ao vivo: últimos lançamentos de todos os setores
  const feed = useMemo(
    () => [...s.lancamentos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm) || b.data.localeCompare(a.data)).slice(0, 10),
    [s.lancamentos],
  )

  // Modo TV: tela cheia só com a Visão TV (sem menu), com rotação automática de telas
  const [modoTV, setModoTV] = useState(false)
  const sairModoTV = useCallback(() => setModoTV(false), [])

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Diretoria / Visão Mestra"
        titulo="Visão TV • Todas as Áreas"
        descricao="Acompanhamento em tempo real da produção de todos os setores. Cada registro feito nas áreas aparece aqui na hora."
        acoes={
          <>
            <select value={mes} onChange={(e) => setMes(e.target.value)} className="bg-black/50 border border-white/[0.05] text-white text-xs font-bold uppercase tracking-widest rounded-xl px-4 py-3.5 outline-none focus:border-blue-500/50 appearance-none">
              {mesesDisponiveis(s).map((m) => (
                <option key={m} value={m}>{nomeMes(m)}</option>
              ))}
            </select>
            <button onClick={() => setModoTV(true)} className={btnBranco}>
              <Icon nome="expand" className="w-5 h-5" /> Tela cheia (TV)
            </button>
          </>
        }
      />

      {/* Números gigantes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-painel-2/80 backdrop-blur-xl border border-blue-500/30 p-8 rounded-3xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 opacity-80 shadow-[0_0_15px_#3b82f6]"></div>
          <div className="absolute -bottom-16 -right-16 w-56 h-56 bg-blue-500/20 blur-3xl rounded-full"></div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400 relative z-10">Total Faturado • Cobrança</p>
          <p className="text-5xl xl:text-6xl font-black text-white tracking-tighter mt-4 relative z-10 break-words">{brl(faturado)}</p>
          <p className="text-[10px] text-zinc-400 mt-4 uppercase tracking-widest font-bold relative z-10">Hoje: {brl(faturadoHoje)} • {nomeMes(mes)}</p>
        </div>
        <div className="bg-painel-2/80 backdrop-blur-xl border border-white/[0.08] p-8 rounded-3xl relative overflow-hidden">
          <div className={`absolute top-0 left-0 w-full h-1 ${TONS.blue.solido} opacity-50`}></div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Total Fotografado • Operacional</p>
          <p className="text-6xl xl:text-7xl font-black text-white tracking-tighter mt-4">{num(fotografado.mes)}</p>
          <p className="text-[10px] text-zinc-500 mt-4 uppercase tracking-widest font-bold">Fichas • {pct(fotografado.pctMes)} da meta mensal</p>
        </div>
        <div className="bg-painel-2/80 backdrop-blur-xl border border-violet-500/20 p-8 rounded-3xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-violet-500 opacity-60 shadow-[0_0_15px_#8b5cf6]"></div>
          <div className="absolute -bottom-16 -right-16 w-56 h-56 bg-violet-500/10 blur-3xl rounded-full"></div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400 relative z-10">Total em Produção</p>
          <p className="text-6xl xl:text-7xl font-black text-white tracking-tighter mt-4 relative z-10">{emProducao}</p>
          <p className="text-[10px] text-zinc-500 mt-4 uppercase tracking-widest font-bold relative z-10">Ordens abertas • {ordens.length - emProducao} concluídas</p>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard tom="emerald" label="Contratos no mês" valor={num(contratos.mes)} detalhe={`Meta ${num(contratos.meta.mensal)} • hoje ${num(contratos.hoje)}`} progresso={contratos.pctMes} />
        <StatCard tom="orange" label="E-books vendidos" valor={num(ebooks.mes)} detalhe={`Meta ${num(ebooks.meta.mensal)} • hoje ${num(ebooks.hoje)}`} progresso={ebooks.pctMes} />
        <StatCard tom="red" label="Inadimplência" valor={pct(inadimplencia)} detalhe={`${atrasados.length} título(s) em atraso`} />
        <Link href="/gerencia/aprovacoes" className="block">
          <StatCard tom="yellow" label="Aprovações pendentes" valor={aprovacoesPendentes} detalhe="Gerência • clique para ver" />
        </Link>
      </div>

      {/* Placar: cada área contra a meta do mês, com a marca de onde deveria estar hoje */}
      <PlacarAreas s={s} mes={mes} />

      {/* Cada colaborador: foto, metas do dia/mês, dias com meta batida e quanto falta */}
      <EquipeCards s={s} mes={mes} />

      {/* Evolução: acumulado realizado × linha da meta, uma área por gráfico */}
      <GradeEvolucao s={s} mes={mes} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <RankingGeral s={s} mes={mes} />
        <Panel
          titulo="Feed ao vivo"
          subtitulo="Últimos registros de todas as áreas"
          semPadding
          acoes={
            <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Tempo real
            </span>
          }
        >
          <div className="divide-y divide-white/[0.03]">
            {feed.map((l) => {
              const cfg = SETORES[l.setor]
              const ind = cfg.indicadores.find((i) => i.id === l.indicador)
              return (
                <div key={l.id} className="px-6 py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge texto={cfg.nome} tom={cfg.tom} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{s.colaboradores.find((c) => c.id === l.colaboradorId)?.nome ?? cfg.nome}</p>
                      <p className="text-[11px] text-zinc-500 truncate">{ind?.label} • {l.descricao || '—'}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-black ${TONS[cfg.tom].texto}`}>+{formatar(l.quantidade, ind?.unidade ?? 'qtd')}</p>
                    <p className="text-[10px] text-zinc-600 font-mono">{dataHoraBR(l.criadoEm)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      {modoTV && <ModoTV s={s} mes={mes} onSair={sairModoTV} />}
    </div>
  )
}
