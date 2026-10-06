'use client'

// Pacotes (caixas de 10 álbuns que voltaram do vendedor externo) e o cadastro das fichas.
// Sem trava (pedido de 06/10/2026): a vendedora abre um pacote novo (Padrão ou Avulso) a qualquer momento.
// Número do pacote por vendedora (SQL 034): cada uma tem a sua sequência; a supervisão ajusta o próximo número.
// Pacote Padrão: ao criar, já abre a tela com os 10 álbuns para cadastrar tudo de uma vez (FichasLote).

import { useMemo, useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import { abrirPacoteRebolo, avisar, definirProximoPacoteRebolo, usePode } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { imprimirEtiquetaPacote, imprimirEtiquetas } from '@/lib/erp/impressao-rebolo'
import { escolaFicha, pacoteFinalizado, proximoPacote, SITUACOES_FICHA, TOM_SITUACAO } from '@/lib/erp/rebolo'
import { dataBR } from '@/lib/erp/format'
import Icon from '@/components/erp/Icon'
import { EmptyState, Modal, PageHeader, Panel, StatCard, TONS, btnBranco, btnPrimario, btnSecundario } from '@/components/erp/ui'
import FichaForm from '@/components/rebolo/FichaForm'
import FichasLote from '@/components/rebolo/FichasLote'
import { FaixaBadge, SituacaoBadge, Telefones, useRebolo } from '@/components/rebolo/comum'

type Filtro = 'andamento' | 'finalizados' | 'todos'

export default function PacotesReboloPage() {
  const { eu, supervisao, pacotes, fichas, vendedoras, nome, tabela } = useRebolo()
  const podeFazer = usePode()
  const [filtro, setFiltro] = useState<Filtro>('andamento')
  const [vendedora, setVendedora] = useState('')
  const [novo, setNovo] = useState(false)
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [form, setForm] = useState<{ ficha: Registro | null } | null>(null)
  // tela dos 10 álbuns: id do pacote, ou 'novo' = o pacote que acabou de ser criado (aparece quando chega da gravação)
  const [lote, setLote] = useState<string | null>(null)
  const [antes, setAntes] = useState<Set<string> | null>(null) // meus pacotes antes de criar o novo

  const linhas = useMemo(
    () =>
      pacotes
        .filter((p) => (supervisao ? !vendedora || p.vendedoraId === vendedora : p.vendedoraId === eu?.id))
        .map((p) => ({ p, fichas: fichas.filter((f) => f.pacoteId === p.id) }))
        .filter(({ fichas: fs }) => filtro === 'todos' || (filtro === 'finalizados' ? pacoteFinalizado(fs) : !pacoteFinalizado(fs)))
        // o número repete entre vendedoras: com todas na lista, agrupa por vendedora
        .sort((a, b) => (supervisao && !vendedora ? nome(a.p.vendedoraId).localeCompare(nome(b.p.vendedoraId)) : 0) || Number(b.p.numero) - Number(a.p.numero)),
    [pacotes, fichas, supervisao, vendedora, eu, filtro, nome],
  )
  const total = linhas.reduce((a, l) => a + l.fichas.length, 0)
  const aberto = pacotes.find((p) => p.id === abertoId) ?? null
  const fichasAberto = aberto ? fichas.filter((f) => f.pacoteId === aberto.id).sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm))) : []
  const capacidade = aberto?.tipo === 'Avulso' ? 1 : 10
  const podeCadastrar = !!aberto && (aberto.vendedoraId === eu?.id || supervisao) && podeFazer('rebolo', 'criar')
  const meus = pacotes.filter((p) => p.vendedoraId === eu?.id)

  const abrir = async (tipo: 'Padrão' | 'Avulso') => {
    setNovo(false)
    const ids = new Set(meus.map((p) => p.id))
    const erro = await abrirPacoteRebolo(tipo)
    if (!erro && tipo === 'Padrão') {
      setAntes(ids)
      setLote('novo')
    }
  }
  const meuNovo = antes ? meus.filter((p) => !antes.has(p.id)).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))[0] : undefined
  const pacoteLote = lote === 'novo' ? (meuNovo ?? null) : (pacotes.find((p) => p.id === lote) ?? null)
  const fecharLote = () => {
    if (pacoteLote) setAbertoId(pacoteLote.id)
    setLote(null)
  }

  // etiqueta do pacote (para colar na caixa): primeiro nome da vendedora; com o sobrenome se outra tiver o mesmo primeiro nome
  const etiquetaPacote = () => {
    if (!aberto) return
    const completo = String(nome(aberto.vendedoraId)).trim()
    const partes = completo.split(/\s+/)
    const repetido = vendedoras.filter((v) => v.id !== aberto.vendedoraId && String(v.nome).trim().split(/\s+/)[0].toLowerCase() === partes[0]?.toLowerCase()).length > 0
    const erro = imprimirEtiquetaPacote(aberto, fichasAberto, repetido && partes.length > 1 ? `${partes[0]} ${partes.at(-1)}` : partes[0] || completo)
    if (erro) avisar(erro)
  }
  const etiquetas = async () => {
    if (!aberto) return
    const erro = await imprimirEtiquetas(aberto, fichasAberto, nome(aberto.vendedoraId))
    if (erro) avisar(erro)
  }

  const chip = (ativo: boolean) =>
    `px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border ${ativo ? 'bg-blue-600/10 text-blue-400 border-blue-500/30' : 'text-zinc-500 border-transparent hover:text-white'}`

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Vendas Rebolo / Pacotes"
        titulo="Pacotes e Fichas"
        descricao="Cada caixa que volta do vendedor externo vira um pacote de 10 álbuns (ou avulso, de 1). Cadastre as fichas, imprima as etiquetas e siga para os contatos."
        acoes={
          eu?.setor === 'rebolo' &&
          podeFazer('rebolo', 'criar') && (
            <button onClick={() => setNovo(true)} className={btnBranco}>
              <Icon nome="plus" className="w-5 h-5" /> Novo pacote
            </button>
          )
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Pacotes na lista" valor={linhas.length} detalhe={`${total} álbuns`} />
        <StatCard label="Aguardando contato" valor={linhas.reduce((a, l) => a + l.fichas.filter((f) => f.situacao === 'Aguardando contato').length, 0)} />
        <StatCard label="Em negociação / agendados" valor={linhas.reduce((a, l) => a + l.fichas.filter((f) => f.situacao === 'Em negociação' || f.situacao === 'Agendado').length, 0)} />
        <StatCard label="Vendidos" valor={linhas.reduce((a, l) => a + l.fichas.filter((f) => f.situacao === 'Vendida').length, 0)} />
      </div>

      <Panel
        semPadding
        titulo="Pacote de vendas"
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            {(['andamento', 'finalizados', 'todos'] as Filtro[]).map((f) => (
              <button key={f} onClick={() => setFiltro(f)} className={chip(filtro === f)}>
                {f === 'andamento' ? 'Em andamento' : f === 'finalizados' ? 'Finalizados' : 'Todos'}
              </button>
            ))}
            {supervisao && (
              <select value={vendedora} onChange={(e) => setVendedora(e.target.value)} className="bg-black/50 border border-white/[0.05] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl px-3 py-2 outline-none">
                <option value="">Todas as vendedoras</option>
                {vendedoras.map((v) => (
                  <option key={v.id} value={v.id}>{v.nome}</option>
                ))}
              </select>
            )}
          </div>
        }
      >
        {linhas.length === 0 ? (
          <EmptyState titulo="Nenhum pacote" descricao={filtro === 'andamento' ? 'Abra um novo pacote quando pegar uma caixa para cadastrar.' : 'Ajuste o filtro.'} />
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-5 py-4 font-bold">Vendedora</th>
                  <th className="px-5 py-4 font-bold">Pacote</th>
                  {SITUACOES_FICHA.map((st) => (
                    <th key={st} className={`px-3 py-4 font-bold text-center whitespace-nowrap ${TONS[TOM_SITUACAO[st]].texto}`}>{st}</th>
                  ))}
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {linhas.map(({ p, fichas: fs }) => (
                  <tr key={p.id} className={`hover:bg-white/[0.02] cursor-pointer ${abertoId === p.id ? 'bg-blue-500/[0.06]' : ''}`} onClick={() => setAbertoId(p.id)}>
                    <td className="px-5 py-3.5 text-white font-bold whitespace-nowrap">{nome(p.vendedoraId)}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <p className="font-black text-white">P{String(p.numero)}</p>
                      <p className="text-[10px] text-zinc-500">
                        {fs.length}/{p.tipo === 'Avulso' ? 1 : 10} álbuns • {String(p.tipo)} {pacoteFinalizado(fs) && '• finalizado'}
                      </p>
                    </td>
                    {SITUACOES_FICHA.map((st) => {
                      const n = fs.filter((f) => f.situacao === st).length
                      return (
                        <td key={st} className="px-3 py-3.5 text-center">
                          <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-black ${n ? `${TONS[TOM_SITUACAO[st]].suave} ${TONS[TOM_SITUACAO[st]].texto}` : 'text-zinc-700'}`}>{n}</span>
                        </td>
                      )
                    })}
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Abrir →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {aberto && (
        <Panel
          semPadding
          titulo={`Pacote P${aberto.numero} • ${nome(aberto.vendedoraId)}`}
          subtitulo={`${fichasAberto.length} de ${capacidade} ficha(s) • aberto em ${dataBR(String(aberto.criadoEm).slice(0, 10))}`}
          acoes={
            <div className="flex flex-wrap gap-2">
              <button onClick={etiquetaPacote} className={btnSecundario} title="Etiqueta para colar na caixa: número do pacote, vendedora e cidades (6 por folha A4)">
                <Icon nome="doc" className="w-4 h-4" /> Imprimir etiquetas
              </button>
              <button onClick={() => void etiquetas()} disabled={!fichasAberto.length} className={btnSecundario} title="Uma etiqueta por álbum, com QR code (10 por folha A4)">
                Etiquetas das fichas
              </button>
              {podeCadastrar && fichasAberto.length < capacidade && (
                <button onClick={() => (aberto.tipo === 'Avulso' ? setForm({ ficha: null }) : setLote(aberto.id))} className={btnPrimario}>
                  <Icon nome="plus" className="w-4 h-4" /> {aberto.tipo === 'Avulso' ? 'Cadastrar ficha' : 'Cadastrar fichas'}
                </button>
              )}
            </div>
          }
        >
          {fichasAberto.length === 0 ? (
            <EmptyState titulo="Nenhuma ficha neste pacote" descricao="Cadastre as fichas da caixa (uma por álbum)." />
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-zinc-300">
                <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                  <tr>
                    <th className="px-5 py-3 font-bold">Ficha</th>
                    <th className="px-5 py-3 font-bold">Aluno / escola</th>
                    <th className="px-5 py-3 font-bold">Faixa</th>
                    <th className="px-5 py-3 font-bold">Cidade</th>
                    <th className="px-5 py-3 font-bold">Contato</th>
                    <th className="px-5 py-3 font-bold">Situação</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {fichasAberto.map((f) => (
                    <tr key={f.id} className="hover:bg-white/[0.02] align-top">
                      <td className="px-5 py-3 font-black text-white">{String(f.numeroFicha)}</td>
                      <td className="px-5 py-3">
                        <p className="font-bold text-white">{String(f.aluno)}</p>
                        <p className="text-[11px] text-zinc-500">{[escolaFicha(f), `visita ${dataBR(String(f.dataVisita))}`].filter(Boolean).join(' • ')}</p>
                      </td>
                      <td className="px-5 py-3"><FaixaBadge ficha={f} tabela={tabela} /></td>
                      <td className="px-5 py-3 whitespace-nowrap">{[f.cidade, f.uf].filter(Boolean).join('/') || '—'}</td>
                      <td className="px-5 py-3"><Telefones ficha={f} /></td>
                      <td className="px-5 py-3">
                        <SituacaoBadge situacao={f.situacao} />
                        {f.motivoDescarte ? <p className="text-[10px] text-red-400 mt-1">{String(f.motivoDescarte)}</p> : null}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {podeCadastrar && (
                          <button onClick={() => setForm({ ficha: f })} title="Editar ficha" className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.05]">
                            <Icon nome="edit" className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {supervisao && <NumeracaoPacotes />}

      <Modal aberto={novo} titulo="Novo pacote de vendas" subtitulo="Escolha o tipo de pacote" onFechar={() => setNovo(false)} largura="max-w-lg">
        <div className="space-y-3">
          <button onClick={() => void abrir('Padrão')} className="w-full text-left p-5 rounded-2xl border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.06]">
            <p className="font-black text-white">📦 Pacote Padrão (10 álbuns)</p>
            <p className="text-xs text-zinc-400 mt-1">A caixa que voltou do vendedor externo: 10 álbuns para contatar e vender.</p>
          </button>
          <button onClick={() => void abrir('Avulso')} className="w-full text-left p-5 rounded-2xl border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.06]">
            <p className="font-black text-white">📘 Pacote Avulso (1 álbum)</p>
            <p className="text-xs text-zinc-400 mt-1">Um álbum solto ou uma venda de pacote ofertado antes do sistema. Segue o mesmo fluxo (contrato → Financeiro).</p>
          </button>
        </div>
      </Modal>

      <Modal
        aberto={!!form && !!aberto}
        titulo={form?.ficha ? `Editar ficha ${form.ficha.numeroFicha}` : 'Cadastrar ficha'}
        subtitulo="Dados da ficha de cadastro que veio com o álbum"
        onFechar={() => setForm(null)}
        largura="max-w-5xl"
      >
        {form && aberto && <FichaForm key={form.ficha?.id ?? 'nova'} pacote={aberto} ficha={form.ficha} onFechar={() => setForm(null)} />}
      </Modal>

      <Modal
        aberto={!!pacoteLote}
        titulo={pacoteLote ? `Cadastrar as fichas • P${pacoteLote.numero}` : ''}
        subtitulo="Preencha os álbuns da caixa e salve tudo de uma vez"
        onFechar={fecharLote}
        largura="max-w-6xl"
      >
        {pacoteLote && <FichasLote key={pacoteLote.id} pacote={pacoteLote} onFechar={fecharLote} />}
      </Modal>

    </div>
  )
}

// Supervisão: o próximo número de pacote de cada vendedora (cada uma tem a sua sequência; pode repetir entre elas)
function NumeracaoPacotes() {
  const { s, vendedoras, pacotes } = useRebolo()
  const numeracao = colecao(s, 'rebolo_numeracao')
  const [digitado, setDigitado] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const salvar = async (vendedoraId: string, numero: number) => {
    setSalvando(vendedoraId)
    const erro = await definirProximoPacoteRebolo(vendedoraId, numero)
    setSalvando(null)
    if (!erro)
      setDigitado((d) => {
        const resto = { ...d }
        delete resto[vendedoraId]
        return resto
      })
  }
  return (
    <Panel semPadding titulo="Numeração dos pacotes" subtitulo="Cada vendedora tem a sua sequência e continua de onde parou. O número pode repetir entre vendedoras.">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-sm text-zinc-300">
          <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
            <tr>
              <th className="px-5 py-3 font-bold">Vendedora</th>
              <th className="px-5 py-3 font-bold">Último pacote</th>
              <th className="px-5 py-3 font-bold">Próximo pacote</th>
              <th className="px-5 py-3 font-bold">Mudar o próximo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {vendedoras.map((v) => {
              const dela = pacotes.filter((p) => p.vendedoraId === v.id)
              const ultimo = dela.length ? Math.max(...dela.map((p) => Number(p.numero) || 0)) : 0
              const proximo = proximoPacote(
                numeracao.find((n) => n.vendedoraId === v.id),
                dela,
              )
              const valor = digitado[v.id] ?? String(proximo)
              const n = Number(valor)
              return (
                <tr key={v.id}>
                  <td className="px-5 py-3 font-bold text-white">{v.nome}</td>
                  <td className="px-5 py-3">{ultimo ? `P${ultimo}` : '—'}</td>
                  <td className="px-5 py-3 font-black text-white">P{proximo}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={valor}
                        onChange={(e) => setDigitado((d) => ({ ...d, [v.id]: e.target.value }))}
                        aria-label={`Próximo pacote de ${v.nome}`}
                        className="w-28 bg-black/50 border border-white/[0.05] rounded-xl px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-blue-500/50 transition-all"
                      />
                      <button disabled={salvando === v.id || !Number.isInteger(n) || n < 1 || n === proximo} onClick={() => void salvar(v.id, n)} className={btnSecundario}>
                        {salvando === v.id ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
