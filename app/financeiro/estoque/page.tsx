'use client'

// FINANCEIRO › Estoque e Cargas (SQL 029). Só o Financeiro mexe; a Produção só vê (Produção › Estoque).
//  • Estoque por escola: as caixas que a Produção conferiu.
//  • Nova carga: vendedor de books + caixas de várias escolas → "Em venda" (sem prazo) + romaneio para assinar.
//  • Em venda: trocar o vendedor, pôr/tirar caixas, cancelar (as caixas voltam ao estoque).
//  • Acerto na volta, por escola: vendidos e que voltaram (álbuns e pôsteres/brindes); a diferença fica registrada.
//  • O que voltou fica "aguardando Rebolo" até o Financeiro encaminhar (na ficha da escola).

import { useMemo, useState } from 'react'
import type { ErpState } from '@/lib/erp/types'
import { acertarCarga, cancelarCarga, criarCarga, desfazerAcerto, editarCarga, useErp, usePode } from '@/lib/erp/store'
import { caixasDisponiveis, estoquePorEscola, resumoCargas, rotuloLote, vendedoresDeBooks, albunsDaCaixa, posteresDaCaixa, type CargaResumo } from '@/lib/erp/estoque'
import { addDias, dataBR, hoje, num } from '@/lib/erp/format'
import { imprimirCarga } from '@/components/financeiro/romaneio'
import { FichaEstoqueEscola, TabelaEstoqueEscolas } from '@/components/erp/EstoqueAlbuns'
import Icon from '@/components/erp/Icon'
import { Badge, EmptyState, Modal, PageHeader, StatCard, Tabs, btnBranco, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

type Aba = 'escolas' | 'venda' | 'encerradas'
const pst = (v: number) => (v ? ` • ${num(v)} pôst.` : '')

// dias desde a saída (só informação: a carga não tem prazo)
const diasFora = (desde: string) => {
  let d = 0
  for (let x = desde; x < hoje() && d < 999; x = addDias(x, 1)) d++
  return d
}

export default function EstoqueCargasPage() {
  const s = useErp()
  const pEditar = usePode()('financeiro', 'editar')
  const [aba, setAba] = useState<Aba>('escolas')
  const [ficha, setFicha] = useState<string | null>(null)
  const [form, setForm] = useState<{ editando: CargaResumo | null } | null>(null)
  const [acerto, setAcerto] = useState<CargaResumo | null>(null)
  const [motivo, setMotivo] = useState<{ tipo: 'cancelar' | 'desfazer'; r: CargaResumo } | null>(null)

  const escolas = useMemo(() => estoquePorEscola(s), [s])
  const cargas = useMemo(() => resumoCargas(s), [s])
  const emVenda = cargas.filter((r) => r.carga.status === 'Em venda')
  const fechadas = cargas.filter((r) => r.carga.status !== 'Em venda')
  const soma = (f: (e: (typeof escolas)[number]) => number) => escolas.reduce((a, e) => a + f(e), 0)
  const escolaAberta = escolas.find((e) => e.lote.id === ficha)
  const empresa = s.empresa.nome

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Módulo / Financeiro"
        titulo="Estoque e Cargas"
        descricao="O estoque de álbuns de cada escola, a carga de cada vendedor de books e o acerto na volta. O que volta vai para o Rebolo."
        acoes={
          pEditar && (
            <button onClick={() => setForm({ editando: null })} className={btnBranco}>
              <Icon nome="plus" className="w-5 h-5" /> Nova carga
            </button>
          )
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-6">
        <StatCard label="Em estoque" valor={num(soma((e) => e.emEstoque.albuns))} detalhe={`álbuns • ${num(soma((e) => e.emEstoque.caixas.length))} caixa(s)${pst(soma((e) => e.emEstoque.posteres))}`} />
        <StatCard label="Em venda" valor={num(soma((e) => e.emVenda.albuns))} detalhe={`álbuns • ${num(emVenda.length)} carga(s) com vendedor`} />
        <StatCard
          label="Aguardando Rebolo"
          valor={num(soma((e) => e.aguardandoRebolo.albuns))}
          tom={soma((e) => e.aguardandoRebolo.albuns + e.aguardandoRebolo.posteres) > 0 ? 'yellow' : 'zinc'}
          detalhe="voltaram e ainda não foram ao Rebolo"
        />
        <StatCard label="Vendidos" valor={num(soma((e) => e.vendidos.albuns))} detalhe={`álbuns • ${num(fechadas.filter((r) => r.carga.status === 'Encerrada').length)} carga(s) acertada(s)`} />
        <StatCard label="Diferença registrada" valor={num(soma((e) => e.diferenca.albuns))} tom={soma((e) => e.diferenca.albuns + e.diferenca.posteres) > 0 ? 'yellow' : 'zinc'} detalhe="álbuns que não voltaram nem foram vendidos" />
      </div>

      <Tabs
        abas={[
          { id: 'escolas', label: 'Estoque por escola' },
          { id: 'venda', label: `Cargas em venda (${emVenda.length})` },
          { id: 'encerradas', label: 'Acertadas e canceladas' },
        ]}
        ativa={aba}
        onChange={setAba}
      />

      {aba === 'escolas' && <TabelaEstoqueEscolas escolas={escolas} onAbrir={setFicha} />}
      {aba === 'venda' && (
        <ListaCargas
          lista={emVenda}
          vazio="Nenhuma carga em venda. Use “Nova carga” para separar as caixas de um vendedor."
          pEditar={pEditar}
          onImprimir={(r) => imprimirCarga(r, 'romaneio', empresa)}
          onEditar={(r) => setForm({ editando: r })}
          onAcerto={setAcerto}
          onCancelar={(r) => setMotivo({ tipo: 'cancelar', r })}
        />
      )}
      {aba === 'encerradas' && (
        <ListaCargas lista={fechadas} vazio="Nenhuma carga acertada ainda." pEditar={pEditar} onImprimir={(r) => imprimirCarga(r, 'acerto', empresa)} onDesfazer={(r) => setMotivo({ tipo: 'desfazer', r })} />
      )}

      {escolaAberta && <FichaEstoqueEscola s={s} e={escolaAberta} podeMexer={pEditar} onFechar={() => setFicha(null)} />}
      {form && <FormCarga key={form.editando?.carga.id ?? 'nova'} s={s} editando={form.editando} empresa={empresa} onFechar={() => setForm(null)} />}
      {acerto && <AcertoCarga key={acerto.carga.id} r={acerto} onFechar={() => setAcerto(null)} />}
      {motivo && <MotivoCarga {...motivo} onFechar={() => setMotivo(null)} />}
    </div>
  )
}

// ---------------- Lista de cargas ----------------
function ListaCargas({
  lista,
  vazio,
  pEditar,
  onImprimir,
  onEditar,
  onAcerto,
  onCancelar,
  onDesfazer,
}: {
  lista: CargaResumo[]
  vazio: string
  pEditar: boolean
  onImprimir: (r: CargaResumo) => void
  onEditar?: (r: CargaResumo) => void
  onAcerto?: (r: CargaResumo) => void
  onCancelar?: (r: CargaResumo) => void
  onDesfazer?: (r: CargaResumo) => void
}) {
  if (!lista.length) return <div className="bg-painel/80 border border-white/[0.05] rounded-3xl"><EmptyState titulo="Nada aqui" descricao={vazio} /></div>
  const botao = 'px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap'
  return (
    <div className="space-y-4">
      {lista.map((r) => {
        const c = r.carga
        const dias = diasFora(String(c.dataSaida))
        return (
          <div key={c.id} className="bg-painel/80 border border-white/[0.06] rounded-3xl p-5 flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="lg:w-36 shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Carga</p>
              <p className="text-3xl font-black text-white leading-none">nº {String(c.numero)}</p>
              <div className="mt-2">
                <Badge texto={String(c.status)} />
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-white font-bold">
                {String(c.vendedor)}
                {c.rota ? <span className="text-zinc-400 font-medium"> • {String(c.rota)}</span> : null}
              </p>
              <p className="text-xs text-zinc-400">
                Saiu em {dataBR(String(c.dataSaida))}
                {c.status === 'Em venda' ? ` • há ${num(dias)} dia(s) com o vendedor` : ''} • {num(r.escolas.length)} escola(s) • {num(r.caixas)} caixa(s) •{' '}
                <strong className="text-white">{num(r.albuns)} álbuns</strong>
                {pst(r.posteres)}
              </p>
              <p className="text-[11px] text-zinc-500 truncate" title={r.escolas.map((e) => `${e.escola} (${[e.cidade, rotuloLote(e)].filter(Boolean).join(' • ')})`).join(' • ')}>
                {r.escolas.map((e) => `${e.escola} (${[e.cidade, rotuloLote(e)].filter(Boolean).join(' • ')})`).join(' • ')}
              </p>
              {c.status === 'Encerrada' && (
                <p className="text-xs text-zinc-300">
                  Acerto em {dataBR(String(c.acertoEm))}: vendidos <strong className="text-white">{num(r.vendidos.albuns)}</strong> • voltaram{' '}
                  <strong className="text-white">{num(r.voltaram.albuns)}</strong> • diferença{' '}
                  <strong className={r.diferenca.albuns + r.diferenca.posteres > 0 ? 'text-yellow-400' : 'text-white'}>{num(r.diferenca.albuns)}</strong>
                  {r.diferenca.posteres ? ` (+${num(r.diferenca.posteres)} pôst.)` : ''}
                </p>
              )}
              {c.status === 'Cancelada' && <p className="text-xs text-zinc-400">Cancelada em {dataBR(String(c.canceladaEm))}: {String(c.motivoCancelamento || '')}</p>}
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {c.status !== 'Cancelada' && (
                <button onClick={() => onImprimir(r)} className={`${botao} text-zinc-300 border-white/[0.08] hover:bg-white/[0.05]`}>
                  <Icon nome="report" className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                  {c.status === 'Encerrada' ? 'Imprimir acerto' : 'Romaneio'}
                </button>
              )}
              {pEditar && c.status === 'Em venda' && (
                <>
                  <button onClick={() => onEditar?.(r)} className={`${botao} text-zinc-300 border-white/[0.08] hover:bg-white/[0.05]`}>
                    Editar
                  </button>
                  <button onClick={() => onAcerto?.(r)} className={`${botao} text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20`}>
                    Acerto da volta
                  </button>
                  <button onClick={() => onCancelar?.(r)} className={`${botao} text-red-400 border-transparent hover:bg-red-500/10`}>
                    Cancelar
                  </button>
                </>
              )}
              {pEditar && c.status === 'Encerrada' && (
                <button onClick={() => onDesfazer?.(r)} className={`${botao} text-red-400 border-transparent hover:bg-red-500/10`}>
                  Desfazer acerto
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------- Nova carga / editar carga ----------------
function FormCarga({ s, editando, empresa, onFechar }: { s: ErpState; editando: CargaResumo | null; empresa: string; onFechar: () => void }) {
  const atuais = useMemo(() => (editando ? editando.escolas.flatMap((e) => e.caixas.map((c) => c.id)) : []), [editando])
  const grupos = useMemo(() => caixasDisponiveis(s, atuais), [s, atuais])
  const vendedores = vendedoresDeBooks(s, String(editando?.carga.vendedorId ?? ''))
  const [vendedorId, setVendedorId] = useState(String(editando?.carga.vendedorId ?? ''))
  const [rota, setRota] = useState(String(editando?.carga.rota ?? ''))
  const [obs, setObs] = useState(String(editando?.carga.observacao ?? ''))
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(atuais))
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [montada, setMontada] = useState<string | null>(null) // id da carga nova (para imprimir o romaneio)
  const resumoMontada = montada ? resumoCargas(s).find((r) => r.carga.id === montada) : undefined

  const alternar = (ids: string[], marcar: boolean) =>
    setMarcadas((m) => {
      const n = new Set(m)
      for (const id of ids) {
        if (marcar) n.add(id)
        else n.delete(id)
      }
      return n
    })
  const termo = busca.trim().toLowerCase()
  const visiveis = grupos.filter((g) => !termo || `${g.escola} ${g.cidade} ${g.uf}`.toLowerCase().includes(termo) || g.caixas.some((c) => marcadas.has(c.id)))
  const escolhidas = grupos
    .map((g) => ({ ...g, caixas: g.caixas.filter((c) => marcadas.has(c.id)) }))
    .filter((g) => g.caixas.length)
  const tot = escolhidas.reduce((a, g) => ({ caixas: a.caixas + g.caixas.length, albuns: a.albuns + g.caixas.reduce((x, c) => x + albunsDaCaixa(c), 0), posteres: a.posteres + g.caixas.reduce((x, c) => x + posteresDaCaixa(c), 0) }), { caixas: 0, albuns: 0, posteres: 0 })

  const salvar = async () => {
    setErro('')
    if (!vendedorId) return setErro('Escolha o vendedor de books.')
    if (!marcadas.size) return setErro('Marque as caixas que vão na carga.')
    setSalvando(true)
    if (editando) {
      const e = await editarCarga(editando.carga.id, {
        vendedorId,
        adicionar: [...marcadas].filter((id) => !atuais.includes(id)),
        remover: atuais.filter((id) => !marcadas.has(id)),
        rota,
        observacao: obs,
      })
      setSalvando(false)
      if (e) return setErro(e)
      return onFechar()
    }
    const r = await criarCarga(vendedorId, [...marcadas], rota, obs)
    setSalvando(false)
    if (r.erro) return setErro(r.erro)
    setMontada(r.id)
  }

  if (montada)
    return (
      <Modal
        aberto
        titulo={`Carga${resumoMontada ? ` nº ${String(resumoMontada.carga.numero)}` : ''} montada`}
        subtitulo="Em venda com o vendedor"
        onFechar={onFechar}
        largura="max-w-lg"
        rodape={
          <>
            <button onClick={onFechar} className={btnSecundario}>Fechar</button>
            <button onClick={() => resumoMontada && imprimirCarga(resumoMontada, 'romaneio', empresa)} disabled={!resumoMontada} className={btnPrimario}>
              <Icon nome="report" className="w-4 h-4" /> Imprimir romaneio
            </button>
          </>
        }
      >
        <p className="text-sm text-zinc-300">
          {resumoMontada ? (
            <>
              <strong className="text-white">{String(resumoMontada.carga.vendedor)}</strong> leva {num(resumoMontada.escolas.length)} escola(s), {num(resumoMontada.caixas)} caixa(s):{' '}
              <strong className="text-white">{num(resumoMontada.albuns)} álbuns</strong>
              {pst(resumoMontada.posteres)}.
            </>
          ) : (
            'Carregando a carga...'
          )}
        </p>
        <p className="text-[11px] text-zinc-500">Imprima o romaneio para o vendedor assinar. Na volta, use “Acerto da volta” em Cargas em venda.</p>
      </Modal>
    )

  return (
    <Modal
      aberto
      titulo={editando ? `Editar carga nº ${String(editando.carga.numero)}` : 'Nova carga'}
      subtitulo={editando ? 'Trocar o vendedor, pôr ou tirar caixas' : 'Escolha o vendedor de books e as caixas que ele leva'}
      onFechar={onFechar}
      largura="max-w-5xl"
      rodape={
        <>
          <span className="mr-auto self-center text-xs text-zinc-400">
            {num(escolhidas.length)} escola(s) • {num(tot.caixas)} caixa(s) • <strong className="text-white">{num(tot.albuns)} álbuns</strong>
            {pst(tot.posteres)}
          </span>
          <button onClick={onFechar} className={btnSecundario}>Voltar</button>
          <button onClick={salvar} disabled={salvando} className={btnPrimario}>
            {salvando ? 'Salvando...' : editando ? 'Salvar carga' : 'Montar carga'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className={labelCls}>
            Vendedor de books <span className="text-blue-500">*</span>
          </label>
          <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className={`${inputCls} appearance-none`}>
            <option value="">Selecione...</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {String(v.nome)}
                {v.cidade ? ` • ${String(v.cidade)}` : ''}
              </option>
            ))}
          </select>
          {vendedores.length === 0 && <p className="text-[10px] text-yellow-400">Cadastre o vendedor de books em ADM › Vendedores externos.</p>}
        </div>
        <div className="space-y-2">
          <label className={labelCls}>Rota (opcional)</label>
          <input value={rota} onChange={(e) => setRota(e.target.value)} placeholder="Ex.: Sul de Minas" className={inputCls} />
        </div>
        <div className="space-y-2">
          <label className={labelCls}>Observação</label>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" className={inputCls} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.05]">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Caixas no estoque (por escola)</p>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar escola ou cidade..." className="campo-busca bg-black/50 border border-white/[0.05] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 w-64" />
      </div>
      {visiveis.length === 0 ? (
        <p className="text-sm text-zinc-500">{grupos.length ? 'Nenhuma escola com essa busca.' : 'Nenhuma caixa no estoque: as caixas entram quando a Produção confere.'}</p>
      ) : (
        <div className="space-y-3">
          {visiveis.map((g) => {
            const ids = g.caixas.map((c) => c.id)
            const todas = ids.every((id) => marcadas.has(id))
            const algumas = ids.some((id) => marcadas.has(id))
            return (
              <div key={g.loteId} className={`rounded-2xl border p-4 space-y-3 ${algumas ? 'border-blue-500/30 bg-blue-500/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={todas} onChange={() => alternar(ids, !todas)} className="w-4 h-4 accent-blue-600" />
                  <span className="min-w-0">
                    <span className="text-white font-bold">{g.escola}</span>
                    <span className="text-xs text-zinc-500">
                      {' '}
                      • {g.cidade}
                      {g.uf ? `-${g.uf}` : ''}
                      {rotuloLote(g) ? ` • ${rotuloLote(g)}` : ''} • {num(g.caixas.length)} caixa(s) • {num(g.caixas.reduce((a, c) => a + albunsDaCaixa(c), 0))} álbuns
                    </span>
                  </span>
                </label>
                <div className="flex flex-wrap gap-2 pl-7">
                  {g.caixas.map((c) => {
                    const on = marcadas.has(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => alternar([c.id], !on)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${on ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'border-white/[0.06] text-zinc-400 hover:text-white'}`}
                      >
                        {on ? '✓ ' : ''}Caixa {String(c.numero)} • {num(albunsDaCaixa(c))} álb.{posteresDaCaixa(c) ? ` • ${num(posteresDaCaixa(c))} pôst.` : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
    </Modal>
  )
}

// ---------------- Acerto na volta ----------------
type Digitado = { av: string; ar: string; pv: string; pr: string; obs: string }

function AcertoCarga({ r, onFechar }: { r: CargaResumo; onFechar: () => void }) {
  const [v, setV] = useState<Record<string, Digitado>>(() =>
    Object.fromEntries(r.escolas.map((e) => [e.loteId, { av: '', ar: '', pv: e.posteres ? '' : '0', pr: e.posteres ? '' : '0', obs: '' }])),
  )
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const muda = (loteId: string, k: keyof Digitado, valor: string) => setV((x) => ({ ...x, [loteId]: { ...x[loteId], [k]: valor } }))
  const vazio = (t: string) => t.trim() === ''
  const dif = (lev: number, a: string, b: string) => (vazio(a) || vazio(b) ? null : lev - (Number(a) || 0) - (Number(b) || 0))
  const salvar = async () => {
    setErro('')
    for (const e of r.escolas) {
      const d = v[e.loteId]
      if (vazio(d.av) || vazio(d.ar) || vazio(d.pv) || vazio(d.pr)) return setErro(`${e.escola}: informe os vendidos e os que voltaram.`)
      if ((dif(e.albuns, d.av, d.ar) ?? 0) < 0) return setErro(`${e.escola}: vendidos + voltaram passa dos ${num(e.albuns)} álbuns levados.`)
      if ((dif(e.posteres, d.pv, d.pr) ?? 0) < 0) return setErro(`${e.escola}: vendidos + voltaram passa dos ${num(e.posteres)} pôsteres/brindes levados.`)
    }
    setSalvando(true)
    const e = await acertarCarga(
      r.carga.id,
      r.escolas.map((x) => ({
        loteId: x.loteId,
        albunsVendidos: Number(v[x.loteId].av) || 0,
        albunsVoltaram: Number(v[x.loteId].ar) || 0,
        posteresVendidos: Number(v[x.loteId].pv) || 0,
        posteresVoltaram: Number(v[x.loteId].pr) || 0,
        observacao: v[x.loteId].obs,
      })),
      obs,
    )
    setSalvando(false)
    if (e) return setErro(e)
    onFechar()
  }
  const celDif = (d: number | null) =>
    d === null ? (
      <span className="text-zinc-600">—</span>
    ) : d === 0 ? (
      <span className="text-zinc-300 font-bold">✓ bate</span>
    ) : d > 0 ? (
      <span className="text-yellow-400 font-bold">faltam {num(d)}</span>
    ) : (
      <span className="text-red-400 font-bold">passou {num(-d)}</span>
    )
  const entrada = (loteId: string, k: keyof Digitado, rotulo: string) => (
    <div className="space-y-1.5">
      <label className={labelCls}>{rotulo}</label>
      <input type="number" min={0} value={v[loteId][k]} onChange={(e) => muda(loteId, k, e.target.value)} className={inputCls} />
    </div>
  )
  return (
    <Modal
      aberto
      titulo={`Acerto da carga nº ${String(r.carga.numero)}`}
      subtitulo={`${String(r.carga.vendedor)} • saiu em ${dataBR(String(r.carga.dataSaida))} • ${num(r.albuns)} álbuns${pst(r.posteres)}`}
      onFechar={onFechar}
      largura="max-w-4xl"
      rodape={
        <>
          <button onClick={onFechar} className={btnSecundario}>Voltar</button>
          <button onClick={salvar} disabled={salvando} className={btnPrimario}>
            {salvando ? 'Salvando...' : 'Encerrar carga'}
          </button>
        </>
      }
    >
      <p className="text-xs text-zinc-400">Para cada escola, conte o que voltou e informe quantos foram vendidos. A diferença (levados − vendidos − voltaram) fica registrada.</p>
      <div className="space-y-4">
        {r.escolas.map((e) => {
          const d = v[e.loteId]
          return (
            <div key={e.loteId} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
              <p className="text-sm">
                <strong className="text-white">{e.escola}</strong>
                <span className="text-zinc-500">
                  {' '}
                  • {e.cidade}
                  {e.uf ? `-${e.uf}` : ''}
                  {rotuloLote(e) ? ` • ${rotuloLote(e)}` : ''} • caixa(s) {e.caixas.map((c) => String(c.numero)).join(', ')} • levou <strong className="text-white">{num(e.albuns)} álbuns</strong>
                  {pst(e.posteres)}
                </span>
              </p>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                {entrada(e.loteId, 'av', 'Álbuns vendidos')}
                {entrada(e.loteId, 'ar', 'Álbuns voltaram')}
                <div className="space-y-1.5">
                  <p className={labelCls}>Diferença</p>
                  <p className="py-3.5 text-sm">{celDif(dif(e.albuns, d.av, d.ar))}</p>
                </div>
                {e.posteres > 0 ? (
                  <>
                    {entrada(e.loteId, 'pv', 'Pôst. vendidos')}
                    {entrada(e.loteId, 'pr', 'Pôst. voltaram')}
                    <div className="space-y-1.5">
                      <p className={labelCls}>Diferença</p>
                      <p className="py-3.5 text-sm">{celDif(dif(e.posteres, d.pv, d.pr))}</p>
                    </div>
                  </>
                ) : (
                  <p className="md:col-span-3 text-[11px] text-zinc-500 pb-4">Sem pôsteres/brindes nesta escola.</p>
                )}
              </div>
              <input value={d.obs} onChange={(x) => muda(e.loteId, 'obs', x.target.value)} placeholder="Observação desta escola (ex.: o que aconteceu com a diferença)" className={inputCls} />
            </div>
          )
        })}
      </div>
      <div className="space-y-2">
        <label className={labelCls}>Observação do acerto</label>
        <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" className={inputCls} />
      </div>
      {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
    </Modal>
  )
}

// ---------------- Cancelar carga / desfazer acerto (com motivo) ----------------
function MotivoCarga({ tipo, r, onFechar }: { tipo: 'cancelar' | 'desfazer'; r: CargaResumo; onFechar: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const cancelar = tipo === 'cancelar'
  const confirmar = async () => {
    if (!motivo.trim()) return setErro('Informe o motivo.')
    setSalvando(true)
    const e = cancelar ? await cancelarCarga(r.carga.id, motivo) : await desfazerAcerto(r.carga.id, motivo)
    setSalvando(false)
    if (e) return setErro(e)
    onFechar()
  }
  return (
    <Modal
      aberto
      titulo={cancelar ? `Cancelar a carga nº ${String(r.carga.numero)}?` : `Desfazer o acerto da carga nº ${String(r.carga.numero)}?`}
      subtitulo={`${String(r.carga.vendedor)} • ${num(r.albuns)} álbuns`}
      onFechar={onFechar}
      largura="max-w-lg"
      rodape={
        <>
          <button onClick={onFechar} className={btnSecundario}>Voltar</button>
          <button onClick={confirmar} disabled={salvando} className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl disabled:opacity-60">
            {salvando ? 'Aguarde...' : cancelar ? 'Cancelar carga' : 'Desfazer acerto'}
          </button>
        </>
      }
    >
      <p className="text-sm text-zinc-300">
        {cancelar
          ? 'Use para carga montada por engano: as caixas voltam para o estoque e a carga fica no histórico como cancelada.'
          : 'A carga volta para "Em venda" e você faz o acerto de novo. Se o que voltou já foi encaminhado ao Rebolo, desfaça esse envio antes (na ficha da escola).'}
      </p>
      <div className="space-y-2">
        <label className={labelCls}>
          Motivo <span className="text-blue-500">*</span>
        </label>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={cancelar ? 'Ex.: vendedor errado' : 'Ex.: contei errado os que voltaram'} className={inputCls} autoFocus />
      </div>
      {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
    </Modal>
  )
}
