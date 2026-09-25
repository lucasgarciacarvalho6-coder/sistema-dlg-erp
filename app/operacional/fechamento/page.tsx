'use client'

import { useMemo, useState } from 'react'
import type { Registro, Tom } from '@/lib/erp/types'
import { parametros } from '@/lib/erp/parametros'
import { atualizarRegistro, criarRegistro, enviarFechamento, useErp, usePode } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import {
  calcularFechamentoEscola,
  contratoDaVisita,
  diasFreelancerSemana,
  fechamentoExistente,
  fichasVendedorSemana,
  lerJSON,
  semanasComVisitas,
  valorDiaFreelancer,
  type Ajudante,
  type Beneficiario,
} from '@/lib/erp/operacional'
import { brl, dataBR, num, rotuloSemana, uid } from '@/lib/erp/format'
import { imprimirRecibos } from '@/lib/erp/export'
import Icon from '@/components/erp/Icon'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, Tabs, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

type Aba = 'escolas' | 'vendedores' | 'freelancers'
const TOM_FECH: Record<string, Tom> = { Rascunho: 'yellow', 'Enviado ao financeiro': 'blue', Pago: 'emerald' }
const n = (v: unknown) => Number(v) || 0
const t = (v: unknown) => (v === null || v === undefined ? '' : String(v))

function StatusFechamento({ f }: { f?: Registro }) {
  if (!f) return <Badge texto="A preparar" tom="orange" />
  return <Badge texto={t(f.status)} tom={TOM_FECH[t(f.status)] ?? 'zinc'} />
}

export default function FechamentoOperacionalPage() {
  const s = useErp()
  const par = parametros(s)
  const podeFazer = usePode()
  const pEditar = podeFazer('operacional', 'editar')
  const [aba, setAba] = useState<Aba>('escolas')
  const semanas = useMemo(() => semanasComVisitas(s), [s])
  const [semana, setSemana] = useState(semanas[1] ?? semanas[0]) // padrão: semana passada (fechamento da semana)
  // ?visita=ID (vindo da agenda ou da Gestão Diária) abre direto o fechamento da escola
  const [editorEscola, setEditorEscola] = useState<Registro | null>(() => {
    const id = new URLSearchParams(window.location.search).get('visita')
    return colecao(s, 'agenda_visitas').find((x) => x.id === id) ?? null
  })
  const [editorSemanal, setEditorSemanal] = useState<{ tipo: 'vendedor' | 'freelancer'; pessoa: Registro } | null>(null)

  const fechamentos = colecao(s, 'fechamentos')
  const visitasFeitas = colecao(s, 'agenda_visitas')
    .filter((v) => ['Fotografada', 'Fechamento enviado'].includes(t(v.status)))
    .sort((a, b) => t(b.data).localeCompare(t(a.data)))
  const soma = (st: string) => fechamentos.filter((f) => f.status === st).reduce((a, f) => a + n(f.total), 0)

  const recibos = (f: Registro) =>
    imprimirRecibos(`Recibos • ${f.referencia}`, s.empresa.nome, lerJSON<Beneficiario[]>(f.beneficiarios, []))

  const enviar = async (f: Registro) => {
    await enviarFechamento(f.id)
  }

  const acoes = (f: Registro | undefined, abrir: () => void) => (
    <div className="flex justify-end gap-2">
      {(!f || f.status === 'Rascunho') && pEditar && (
        <button onClick={abrir} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap text-blue-400 border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20">
          {f ? 'Editar' : 'Preparar'}
        </button>
      )}
      {f && (
        <button onClick={() => recibos(f)} title="Imprimir recibos" className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.05]">
          <Icon nome="report" className="w-4 h-4" />
        </button>
      )}
      {f?.status === 'Rascunho' && pEditar && (
        <button onClick={() => enviar(f)} className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border whitespace-nowrap text-emerald-400 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20">
          Enviar ao financeiro
        </button>
      )}
    </div>
  )

  const thCls = 'px-6 py-4 font-bold'
  const cabecalho = (cols: string[]) => (
    <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
      <tr>
        {cols.map((c, i) => (
          <th key={c} className={`${thCls} ${i >= cols.length - 3 ? 'text-right' : ''}`}>{c}</th>
        ))}
      </tr>
    </thead>
  )

  const seletorSemana = (
    <select value={semana} onChange={(e) => setSemana(e.target.value)} className="bg-black/50 border border-white/[0.05] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl px-4 py-2.5 outline-none focus:border-blue-500/50">
      {semanas.map((w) => (
        <option key={w} value={w}>Semana {rotuloSemana(w)}</option>
      ))}
    </select>
  )

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Módulo / Operações / Agenda Fotográfica"
        titulo="Fechamento Operacional"
        descricao="Prepare os pagamentos do trabalho realizado, imprima os recibos e envie ao Financeiro, que faz os PIX."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard tom="yellow" label="Em rascunho" valor={brl(soma('Rascunho'))} detalhe={`${fechamentos.filter((f) => f.status === 'Rascunho').length} fechamento(s)`} />
        <StatCard tom="blue" label="No financeiro (a pagar)" valor={brl(soma('Enviado ao financeiro'))} detalhe={`${fechamentos.filter((f) => f.status === 'Enviado ao financeiro').length} fechamento(s)`} />
        <StatCard tom="emerald" label="Pagos" valor={brl(soma('Pago'))} detalhe={`${fechamentos.filter((f) => f.status === 'Pago').length} fechamento(s)`} />
      </div>

      <Tabs
        abas={[
          { id: 'escolas', label: 'Fechamento diário das escolas' },
          { id: 'vendedores', label: 'Semanal dos vendedores' },
          { id: 'freelancers', label: 'Adiantamentos dos freelancers' },
        ]}
        ativa={aba}
        onChange={setAba}
      />

      {aba === 'escolas' && (
        <Panel semPadding titulo="Escolas fotografadas" subtitulo="Bonificação da escola + ajudantes da visita">
          {visitasFeitas.length === 0 ? (
            <EmptyState titulo="Nenhuma visita fotografada" descricao="Encerre as visitas na Agenda Fotográfica para fazer o fechamento." />
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-zinc-300">
                {cabecalho(['Escola', 'Data', 'Fichas', 'Valor unit.', 'Total', 'Status', 'Ações'])}
                <tbody className="divide-y divide-white/[0.02]">
                  {visitasFeitas.map((v) => {
                    const f = fechamentoExistente(s, 'escola', v.id, t(v.data))
                    const c = contratoDaVisita(s, v)
                    return (
                      <tr key={v.id} className="hover:bg-white/[0.02]">
                        <td className="px-6 py-4">
                          <p className="text-white font-bold">{t(v.escola)}</p>
                          <p className="text-[11px] text-zinc-500">{t(v.cidade)} - {t(v.uf)}</p>
                        </td>
                        <td className="px-6 py-4 text-zinc-400">{dataBR(t(v.data))}</td>
                        <td className="px-6 py-4 text-white font-bold">{num(n(f?.quantidade ?? v.fichasFotografadas))}</td>
                        <td className="px-6 py-4 text-zinc-400">{brl(n(f?.valorUnitario ?? c?.bonificacaoPorFicha))}</td>
                        <td className="px-6 py-4 text-right text-white font-black">{f ? brl(n(f.total)) : '—'}</td>
                        <td className="px-6 py-4 text-right"><StatusFechamento f={f} /></td>
                        <td className="px-6 py-4">{acoes(f, () => setEditorEscola(v))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {aba === 'vendedores' && (
        <Panel semPadding titulo="Fechamento semanal dos vendedores PJ" subtitulo="Valor por aluno fotografado nas escolas do vendedor" acoes={seletorSemana}>
          {(() => {
            const linhas = colecao(s, 'pj_vendedores')
              .map((vd) => ({ vd, calc: fichasVendedorSemana(s, vd.id, semana), f: fechamentoExistente(s, 'vendedor', vd.id, semana) }))
              .filter((l) => l.calc.fichas > 0 || l.f)
            if (!linhas.length) return <EmptyState titulo="Sem fichas fotografadas nesta semana" descricao="Escolha outra semana ou encerre as visitas na agenda." />
            return (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-sm text-zinc-300">
                  {cabecalho(['Vendedor', 'Escolas', 'Alunos fotografados', 'Valor por aluno', 'Total', 'Status', 'Ações'])}
                  <tbody className="divide-y divide-white/[0.02]">
                    {linhas.map(({ vd, calc, f }) => (
                      <tr key={vd.id} className="hover:bg-white/[0.02]">
                        <td className="px-6 py-4 text-white font-bold">{t(vd.nome)}</td>
                        <td className="px-6 py-4 text-xs text-zinc-400">{calc.visitas.map((v) => t(v.escola)).join(', ') || '—'}</td>
                        <td className="px-6 py-4 text-white font-bold">{num(n(f?.quantidade ?? calc.fichas))}</td>
                        <td className="px-6 py-4 text-zinc-400">{brl(n(f?.valorUnitario ?? vd.valorPorFicha))}</td>
                        <td className="px-6 py-4 text-right text-white font-black">{brl(n(f?.total ?? calc.fichas * n(vd.valorPorFicha)))}</td>
                        <td className="px-6 py-4 text-right"><StatusFechamento f={f} /></td>
                        <td className="px-6 py-4">{acoes(f, () => setEditorSemanal({ tipo: 'vendedor', pessoa: vd }))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </Panel>
      )}

      {aba === 'freelancers' && (
        <Panel semPadding titulo="Adiantamentos semanais dos freelancers" subtitulo={`Diária + R$ ${par.alimentacaoDiaria} de alimentação por dia trabalhado (dias vêm da agenda)`} acoes={seletorSemana}>
          {(() => {
            const linhas = colecao(s, 'freelancers')
              .map((fr) => ({ fr, dias: diasFreelancerSemana(s, fr.id, semana), f: fechamentoExistente(s, 'freelancer', fr.id, semana) }))
              .filter((l) => l.dias.length > 0 || l.f || l.fr.status === 'Ativo')
            if (!linhas.length) return <EmptyState titulo="Nenhum freelancer cadastrado" descricao="Cadastre fotógrafos e motoristas em Controle Operacional." />
            return (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-sm text-zinc-300">
                  {cabecalho(['Freelancer', 'Função', 'Dias na agenda', 'Diária + alimentação', 'Total', 'Status', 'Ações'])}
                  <tbody className="divide-y divide-white/[0.02]">
                    {linhas.map(({ fr, dias, f }) => {
                      const qtd = n(f?.quantidade ?? dias.length)
                      const dia = n(f?.valorUnitario ?? valorDiaFreelancer(n(fr.diaria), par.alimentacaoDiaria))
                      return (
                        <tr key={fr.id} className="hover:bg-white/[0.02]">
                          <td className="px-6 py-4 text-white font-bold">{t(fr.nome)}</td>
                          <td className="px-6 py-4 text-zinc-400">{t(fr.tipo)}{fr.nivel ? ` • ${fr.nivel}` : ''}</td>
                          <td className="px-6 py-4 text-zinc-300" title={dias.map((d) => dataBR(d)).join(', ')}>
                            <span className="text-white font-bold">{qtd}</span> {dias.length ? <span className="text-[11px] text-zinc-500">({dias.map((d) => d.slice(8)).join(', ')})</span> : ''}
                          </td>
                          <td className="px-6 py-4 text-zinc-400">{brl(dia)}</td>
                          <td className="px-6 py-4 text-right text-white font-black">{brl(n(f?.total ?? qtd * dia))}</td>
                          <td className="px-6 py-4 text-right"><StatusFechamento f={f} /></td>
                          <td className="px-6 py-4">{acoes(f, () => setEditorSemanal({ tipo: 'freelancer', pessoa: fr }))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </Panel>
      )}

      {editorEscola && <EditorEscola key={editorEscola.id} visita={editorEscola} onFechar={() => setEditorEscola(null)} />}
      {editorSemanal && <EditorSemanal key={editorSemanal.pessoa.id + semana} tipo={editorSemanal.tipo} pessoa={editorSemanal.pessoa} semana={semana} onFechar={() => setEditorSemanal(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fechamento diário da escola: bonificação + ajudantes
// ---------------------------------------------------------------------------
function EditorEscola({ visita, onFechar }: { visita: Registro; onFechar: () => void }) {
  const s = useErp()
  const contrato = contratoDaVisita(s, visita)
  const existente = fechamentoExistente(s, 'escola', visita.id, t(visita.data))
  const [fichas, setFichas] = useState(String(existente?.quantidade ?? visita.fichasFotografadas ?? 0))
  const [valor, setValor] = useState(String(existente?.valorUnitario ?? contrato?.bonificacaoPorFicha ?? 0))
  const [pix, setPix] = useState({
    pixNome: t(existente?.pixNome ?? contrato?.pixNome),
    pixChave: t(existente?.pixChave ?? contrato?.pixChave),
    pixBanco: t(existente?.pixBanco ?? contrato?.pixBanco),
  })
  const [ajudantes, setAjudantes] = useState<Ajudante[]>(lerJSON<Ajudante[]>(existente?.ajudantes, []))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const calc = calcularFechamentoEscola({ escola: t(visita.escola), data: t(visita.data), fichasBonificadas: n(fichas), valorUnitario: n(valor.replace(',', '.')), ...pix, ajudantes })

  const salvar = async (enviarDepois: boolean) => {
    if (enviarDepois) {
      const semPix = calc.beneficiarios.filter((b) => !b.pixChave.trim()).map((b) => b.nome)
      if (semPix.length) return setErro(`Informe a chave PIX de: ${semPix.join(', ')}.`)
    }
    setSalvando(true)
    const id = existente?.id ?? uid()
    const dados = {
      tipo: 'escola',
      refId: visita.id,
      periodo: t(visita.data),
      referencia: t(visita.escola),
      data: t(visita.data),
      quantidade: n(fichas),
      valorUnitario: n(valor.replace(',', '.')),
      subtotal: calc.totalEscola,
      ajudantes: JSON.stringify(ajudantes.filter((a) => a.nome.trim())),
      beneficiarios: JSON.stringify(calc.beneficiarios),
      total: calc.total,
      ...pix,
      observacao: '',
    }
    let falha = existente ? await atualizarRegistro('fechamentos', id, dados, 'operacional') : await criarRegistro('fechamentos', { ...dados, id, status: 'Rascunho', enviadoEm: '' }, 'operacional')
    // PIX informado aqui completa o cadastro do contrato (cada dado no seu lugar)
    if (!falha && contrato && !t(contrato.pixChave) && pix.pixChave) await atualizarRegistro('contratos_escola', contrato.id, pix, 'operacional')
    if (!falha && enviarDepois) falha = await enviarFechamento(id)
    setSalvando(false)
    setErro(falha)
    if (!falha) onFechar()
  }

  const campoPix = (k: keyof typeof pix, label: string) => (
    <div className="space-y-2">
      <label className={labelCls}>{label}</label>
      <input value={pix[k]} onChange={(e) => setPix({ ...pix, [k]: e.target.value })} className={inputCls} />
    </div>
  )

  return (
    <Modal
      aberto
      titulo={`Fechamento diário • ${visita.escola}`}
      subtitulo={`Visita de ${dataBR(t(visita.data))} • ${num(n(visita.fichasFotografadas))} crianças fotografadas`}
      onFechar={onFechar}
      largura="max-w-3xl"
      rodape={
        <>
          <button onClick={onFechar} className={btnSecundario}>Fechar</button>
          <button onClick={() => imprimirRecibos(`Recibos • ${visita.escola}`, s.empresa.nome, calc.beneficiarios)} disabled={!calc.beneficiarios.length} className={btnSecundario}>
            <Icon nome="report" className="w-4 h-4" /> Imprimir recibos
          </button>
          <button onClick={() => salvar(false)} disabled={salvando} className={btnSecundario}>Salvar rascunho</button>
          <button onClick={() => salvar(true)} disabled={salvando || !calc.beneficiarios.length} className={btnPrimario}>
            {salvando ? 'Enviando...' : 'Enviar ao financeiro'}
          </button>
        </>
      }
    >
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 space-y-4">
        <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">Bonificação da escola</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
          <div>
            <p className={labelCls}>Crianças fotografadas</p>
            <p className="text-2xl font-black text-white mt-2">{num(n(visita.fichasFotografadas))}</p>
          </div>
          <div className="space-y-2">
            <label className={labelCls}>Fichas bonificadas</label>
            <input type="number" min={0} value={fichas} onChange={(e) => setFichas(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-2">
            <label className={labelCls}>Valor por ficha (R$)</label>
            <input type="number" min={0} step="0.5" value={valor} onChange={(e) => setValor(e.target.value)} className={inputCls} />
          </div>
          <div className="text-right">
            <p className={labelCls}>Total da escola</p>
            <p className="text-2xl font-black text-emerald-400 mt-2">{brl(calc.totalEscola)}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-white/[0.05]">
          {campoPix('pixNome', 'Nome completo de quem recebe')}
          {campoPix('pixChave', 'Chave PIX')}
          {campoPix('pixBanco', 'Banco')}
        </div>
        <p className="text-[10px] text-zinc-500">Dados PIX carregados do contrato da escola.{contrato && !t(contrato.pixChave) ? ' Ao salvar, o PIX também fica registrado no contrato.' : ''}</p>
      </div>

      <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">Ajudantes da visita</p>
          <button onClick={() => setAjudantes([...ajudantes, { nome: '', valor: 0, pixChave: '', pixBanco: '' }])} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">
            + Adicionar ajudante
          </button>
        </div>
        {ajudantes.length === 0 && <p className="text-xs text-zinc-500">Sem ajudantes nesta visita.</p>}
        {ajudantes.map((a, i) => (
          <div key={i} className="grid grid-cols-12 gap-3 items-end">
            {(
              [
                ['nome', 'Nome', 'col-span-12 md:col-span-4'],
                ['valor', 'Valor combinado', 'col-span-4 md:col-span-2'],
                ['pixChave', 'Chave PIX', 'col-span-8 md:col-span-3'],
                ['pixBanco', 'Banco', 'col-span-10 md:col-span-2'],
              ] as const
            ).map(([k, label, cls]) => (
              <div key={k} className={`space-y-2 ${cls}`}>
                <label className={labelCls}>{label}</label>
                <input
                  type={k === 'valor' ? 'number' : 'text'}
                  min={0}
                  value={k === 'valor' ? String(a.valor || '') : a[k]}
                  onChange={(e) => setAjudantes(ajudantes.map((x, j) => (j === i ? { ...x, [k]: k === 'valor' ? Number(e.target.value) || 0 : e.target.value } : x)))}
                  className={inputCls}
                />
              </div>
            ))}
            <button onClick={() => setAjudantes(ajudantes.filter((_, j) => j !== i))} className="col-span-2 md:col-span-1 p-3.5 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10" title="Remover">
              <Icon nome="trash" className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 bg-black/40 border border-white/[0.05] p-5 rounded-2xl text-center">
        <div>
          <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Escola</p>
          <p className="text-lg font-black text-white mt-1">{brl(calc.totalEscola)}</p>
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Ajudantes</p>
          <p className="text-lg font-black text-white mt-1">{brl(calc.totalAjudantes)}</p>
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Total do fechamento</p>
          <p className="text-2xl font-black text-emerald-400 mt-1">{brl(calc.total)}</p>
        </div>
      </div>
      {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Semanal: vendedor PJ (alunos fotografados × valor) e freelancer (dias × (diária + alimentação))
// ---------------------------------------------------------------------------
function EditorSemanal({ tipo, pessoa, semana, onFechar }: { tipo: 'vendedor' | 'freelancer'; pessoa: Registro; semana: string; onFechar: () => void }) {
  const s = useErp()
  const par = parametros(s)
  const existente = fechamentoExistente(s, tipo, pessoa.id, semana)
  const calcVend = tipo === 'vendedor' ? fichasVendedorSemana(s, pessoa.id, semana) : null
  const dias = tipo === 'freelancer' ? diasFreelancerSemana(s, pessoa.id, semana) : []
  const [qtd, setQtd] = useState(String(existente?.quantidade ?? (tipo === 'vendedor' ? calcVend?.fichas : dias.length) ?? 0))
  const [diaria, setDiaria] = useState(String(tipo === 'freelancer' ? (existente ? n(existente.valorUnitario) - par.alimentacaoDiaria : n(pessoa.diaria)) : 0))
  const [valorAluno, setValorAluno] = useState(String(existente?.valorUnitario ?? pessoa.valorPorFicha ?? 0))
  const [pix, setPix] = useState({ pixNome: t(existente?.pixNome ?? pessoa.pixNome ?? pessoa.nome), pixChave: t(existente?.pixChave ?? pessoa.pixChave), pixBanco: t(existente?.pixBanco ?? pessoa.pixBanco) })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const unit = tipo === 'vendedor' ? n(valorAluno) : valorDiaFreelancer(n(diaria), par.alimentacaoDiaria)
  const total = Math.round(n(qtd) * unit * 100) / 100
  const beneficiarios: Beneficiario[] =
    total > 0
      ? [
          {
            categoria: tipo === 'vendedor' ? 'Vendedor PJ' : 'Freelancer',
            nome: pix.pixNome || t(pessoa.nome),
            valor: total,
            pixChave: pix.pixChave,
            pixBanco: pix.pixBanco,
            descricao:
              tipo === 'vendedor'
                ? `Vendedor ${pessoa.nome} — ${n(qtd)} alunos fotografados × ${brl(unit)} (semana ${rotuloSemana(semana)})`
                : `Adiantamento ${pessoa.tipo} ${pessoa.nome} — ${n(qtd)} dia(s) × ${brl(unit)} (semana ${rotuloSemana(semana)})`,
          },
        ]
      : []

  const salvar = async (enviarDepois: boolean) => {
    if (enviarDepois && !pix.pixChave.trim()) return setErro('Informe a chave PIX.')
    setSalvando(true)
    const id = existente?.id ?? uid()
    const dados = {
      tipo,
      refId: pessoa.id,
      periodo: semana,
      referencia: `${pessoa.nome} • semana ${rotuloSemana(semana)}`,
      data: semana,
      quantidade: n(qtd),
      valorUnitario: unit,
      subtotal: total,
      ajudantes: '[]',
      beneficiarios: JSON.stringify(beneficiarios),
      total,
      ...pix,
      observacao: '',
    }
    let falha = existente ? await atualizarRegistro('fechamentos', id, dados, 'operacional') : await criarRegistro('fechamentos', { ...dados, id, status: 'Rascunho', enviadoEm: '' }, 'operacional')
    // PIX informado aqui completa o cadastro do PJ
    if (!falha && !t(pessoa.pixChave) && pix.pixChave) await atualizarRegistro(tipo === 'vendedor' ? 'pj_vendedores' : 'freelancers', pessoa.id, pix, 'operacional')
    if (!falha && enviarDepois) falha = await enviarFechamento(id)
    setSalvando(false)
    setErro(falha)
    if (!falha) onFechar()
  }

  return (
    <Modal
      aberto
      titulo={tipo === 'vendedor' ? `Fechamento semanal • ${pessoa.nome}` : `Adiantamento semanal • ${pessoa.nome}`}
      subtitulo={`Semana ${rotuloSemana(semana)} • ${tipo === 'vendedor' ? 'vendedor de contrato PJ' : `${pessoa.tipo} freelancer`}`}
      onFechar={onFechar}
      largura="max-w-2xl"
      rodape={
        <>
          <button onClick={onFechar} className={btnSecundario}>Fechar</button>
          <button onClick={() => imprimirRecibos(`Recibo • ${pessoa.nome}`, s.empresa.nome, beneficiarios)} disabled={!beneficiarios.length} className={btnSecundario}>
            <Icon nome="report" className="w-4 h-4" /> Imprimir recibo
          </button>
          <button onClick={() => salvar(false)} disabled={salvando} className={btnSecundario}>Salvar rascunho</button>
          <button onClick={() => salvar(true)} disabled={salvando || total <= 0} className={btnPrimario}>
            {salvando ? 'Enviando...' : 'Enviar ao financeiro'}
          </button>
        </>
      }
    >
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 space-y-4">
        {tipo === 'vendedor' ? (
          <>
            <p className="text-xs text-zinc-400">
              Escolas da semana: <strong className="text-white">{calcVend?.visitas.map((v) => `${v.escola} (${num(n(v.fichasFotografadas))})`).join(', ') || '—'}</strong>
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className={labelCls}>Alunos fotografados</label>
                <input type="number" min={0} value={qtd} onChange={(e) => setQtd(e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-2">
                <label className={labelCls}>Valor por aluno (R$)</label>
                <input type="number" min={0} step="0.5" value={valorAluno} onChange={(e) => setValorAluno(e.target.value)} className={inputCls} />
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-zinc-400">
              Dias na agenda: <strong className="text-white">{dias.length ? dias.map((d) => dataBR(d).slice(0, 5)).join(', ') : 'nenhum'}</strong> — ajuste se houve viagem ou dia extra.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className={labelCls}>Dias trabalhados</label>
                <input type="number" min={0} value={qtd} onChange={(e) => setQtd(e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-2">
                <label className={labelCls}>Diária (R$)</label>
                <input type="number" min={0} step="10" value={diaria} onChange={(e) => setDiaria(e.target.value)} className={inputCls} />
              </div>
              <div>
                <p className={labelCls}>Alimentação / dia</p>
                <p className="text-lg font-black text-white mt-3">{brl(par.alimentacaoDiaria)}</p>
              </div>
            </div>
          </>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-white/[0.05]">
          {(['pixNome', 'pixChave', 'pixBanco'] as const).map((k) => (
            <div key={k} className="space-y-2">
              <label className={labelCls}>{k === 'pixNome' ? 'Nome de quem recebe' : k === 'pixChave' ? 'Chave PIX' : 'Banco'}</label>
              <input value={pix[k]} onChange={(e) => setPix({ ...pix, [k]: e.target.value })} className={inputCls} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between items-center bg-black/40 border border-white/[0.05] p-5 rounded-2xl">
        <p className="text-xs text-zinc-400">
          {num(n(qtd))} × {brl(unit)}
          {tipo === 'freelancer' && <span className="text-zinc-500"> (diária {brl(n(diaria))} + alimentação {brl(par.alimentacaoDiaria)})</span>}
        </p>
        <p className="text-2xl font-black text-emerald-400">{brl(total)}</p>
      </div>
      {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
    </Modal>
  )
}
