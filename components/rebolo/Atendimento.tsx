'use client'

// Atendimento de uma ficha: dados, histórico de contatos e as ações
//  • Registrar contato: Sem resposta (tentar de novo) • Em negociação • Agendado • Descarte (motivo)
//  • Fechar venda: Completo (com as opções sem maleta / sem moldura / com pôster que a faixa tem) ou Pôster com Moldura,
//    forma de pagamento pelo preço da faixa (sem entrada, até 15x, parcela mínima R$ 100) e a comissão da vendedora
//  • Pedir desconto fora da tabela (Gerência aprova)

import { useState } from 'react'
import Link from 'next/link'
import type { Registro, Valor } from '@/lib/erp/types'
import type { ResultadoContato } from '@/lib/erp/fluxos'
import { addDias, brl, dataBR, hoje } from '@/lib/erp/format'
import { fecharVendaRebolo, pedirDescontoRebolo, reabrirFichaRebolo, registrarContatoRebolo, usePode } from '@/lib/erp/store'
import {
  comissaoDaVenda,
  EM_ABERTO,
  faixaDaFicha,
  formatarTelefone,
  FORMAS_REBOLO,
  maxParcelas,
  mesesDesde,
  MOTIVOS_DESCARTE,
  nomeDaVenda,
  opcoesDaFaixa,
  precoVenda,
  PRODUTOS_REBOLO,
  type FormaRebolo,
  type OpcaoCompleto,
  type ProdutoRebolo,
} from '@/lib/erp/rebolo'
import { Badge, Tabs, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import { dataHoraCurta, FaixaBadge, QuadroFaixa, SituacaoBadge, Telefones, useRebolo } from './comum'

type Aba = 'contato' | 'venda' | 'desconto'

export default function Atendimento({ ficha, onFechar }: { ficha: Registro; onFechar: () => void }) {
  const { eu, supervisao, contatos, tabela, nome, pacoteDe, vendas } = useRebolo()
  const podeFazer = usePode()
  const minha = ficha.vendedoraId === eu?.id || supervisao
  const aberta = EM_ABERTO.includes(String(ficha.situacao))
  const podeAgir = minha && aberta && podeFazer('rebolo', 'editar')
  const [aba, setAba] = useState<Aba>('contato')
  const historico = contatos.filter((c) => c.fichaId === ficha.id).sort((a, b) => String(b.data).localeCompare(String(a.data)))
  const faixa = faixaDaFicha(String(ficha.dataVisita), tabela)
  const venda = vendas.find((v) => v.fichaReboloId === ficha.id && v.conferencia !== 'Cancelada')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Ficha + histórico */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <SituacaoBadge situacao={ficha.situacao} />
            <FaixaBadge ficha={ficha} tabela={tabela} />
            <Badge texto={`P${pacoteDe(ficha)?.numero ?? '?'}`} />
            {Number(ficha.tentativas) > 0 && <Badge texto={`${ficha.tentativas} tentativa(s)`} />}
          </div>
          <p className="text-lg font-black text-white">{String(ficha.aluno)}</p>
          <p className="text-zinc-400">
            Ficha <strong className="text-white">{String(ficha.numeroFicha)}</strong> • {String(ficha.escola)}
            {ficha.serie ? ` • ${ficha.serie}` : ''}
          </p>
          <p className="text-zinc-400">
            Visita {dataBR(String(ficha.dataVisita))} ({mesesDesde(String(ficha.dataVisita))} meses) • {String(ficha.qtdFotos || 0)} fotos
          </p>
          <p className="text-zinc-400">
            {[ficha.nomeMae && `Mãe: ${ficha.nomeMae}`, ficha.nomePai && `Pai: ${ficha.nomePai}`].filter(Boolean).join(' • ') || 'Pais não informados'}
          </p>
          <p className="text-zinc-400">
            {[ficha.rua, ficha.numero, ficha.apto && `apto ${ficha.apto}`, ficha.bairro, [ficha.cidade, ficha.uf].filter(Boolean).join('/')].filter(Boolean).join(', ') || 'Endereço não informado'}
            {ficha.fazenda ? ` • Fazenda ${ficha.fazenda}` : ''}
          </p>
          {ficha.pontoReferencia ? <p className="text-zinc-500 text-xs">Referência: {String(ficha.pontoReferencia)}</p> : null}
          {ficha.horario ? <p className="text-zinc-400">Melhor horário: <strong className="text-white">{String(ficha.horario)}</strong></p> : null}
          {ficha.agendadoPara ? <p className="text-zinc-200 font-bold">📅 Agendado: {dataHoraCurta(ficha.agendadoPara)}</p> : null}
          <div className="pt-2"><Telefones ficha={ficha} /></div>
          <p className="text-[11px] text-zinc-500 pt-1">Vendedora: {nome(ficha.vendedoraId)}</p>
        </div>

        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4">
          <p className={labelCls}>Histórico de contatos</p>
          {historico.length === 0 ? (
            <p className="text-xs text-zinc-500 mt-2">Nenhum contato ainda.</p>
          ) : (
            <ul className="mt-2 space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
              {historico.map((c) => (
                <li key={c.id} className="text-xs border-l-2 border-blue-500/40 pl-3">
                  <p className="font-bold text-white">{String(c.resultado)}</p>
                  <p className="text-zinc-500">{dataHoraCurta(c.data)} • {nome(c.vendedoraId)}</p>
                  {c.observacao ? <p className="text-zinc-300">{String(c.observacao)}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Ações (com a tabela de preços da faixa na frente, para a ligação) */}
      <div className="lg:col-span-3 space-y-4">
        <QuadroFaixa tabela={tabela} faixa={faixa} meses={mesesDesde(String(ficha.dataVisita))} />
        {!aberta ? (
          <SemAcao ficha={ficha} venda={venda} supervisao={supervisao} />
        ) : !podeAgir ? (
          <p className="text-sm text-zinc-400">Esta ficha é de {nome(ficha.vendedoraId)}. Só ela ou a supervisão registram os contatos.</p>
        ) : (
          <>
            <Tabs
              abas={[
                { id: 'contato' as Aba, label: 'Registrar contato' },
                { id: 'venda' as Aba, label: 'Fechar venda' },
                { id: 'desconto' as Aba, label: 'Pedir desconto' },
              ]}
              ativa={aba}
              onChange={setAba}
            />
            {aba === 'contato' && <RegistrarContato ficha={ficha} onFeito={onFechar} />}
            {aba === 'venda' && <FecharVenda ficha={ficha} faixa={faixa} onFeito={onFechar} />}
            {aba === 'desconto' && <PedirDesconto ficha={ficha} faixa={faixa} />}
          </>
        )}
      </div>
    </div>
  )
}

function SemAcao({ ficha, venda, supervisao }: { ficha: Registro; venda?: Registro; supervisao: boolean }) {
  const [reabrindo, setReabrindo] = useState(false)
  if (ficha.situacao === 'Descarte')
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-300">
          Descartada: <strong className="text-red-400">{String(ficha.motivoDescarte || '—')}</strong>. O álbum fica guardado na empresa.
        </p>
        {supervisao && (
          <button
            disabled={reabrindo}
            onClick={async () => {
              setReabrindo(true)
              await reabrirFichaRebolo(ficha.id)
              setReabrindo(false)
            }}
            className={btnSecundario}
          >
            ↺ Reabrir e devolver para a fila
          </button>
        )}
      </div>
    )
  return (
    <div className="space-y-2 text-sm text-zinc-300">
      <p>
        Situação: <SituacaoBadge situacao={ficha.situacao} />
      </p>
      {venda && (
        <p>
          Venda: {String(venda.pacote)} • {brl(Number(venda.valor) || 0)} • {String(venda.conferencia)}{' '}
          <Link href="/rebolo/vendas" className="text-blue-400 font-bold">Ver em Vendas →</Link>
        </p>
      )}
      {ficha.rastreio ? <p>Enviado • rastreio <strong className="text-white">{String(ficha.rastreio)}</strong></p> : null}
    </div>
  )
}

function RegistrarContato({ ficha, onFeito }: { ficha: Registro; onFeito: () => void }) {
  const [resultado, setResultado] = useState<ResultadoContato | ''>('')
  const [motivo, setMotivo] = useState('')
  const [agendado, setAgendado] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const opcoes: { id: ResultadoContato; t: string; d: string; cls: string }[] = [
    { id: 'Sem resposta', t: '📵 Sem resposta', d: 'Fica em "Tentar de novo"', cls: 'border-yellow-500/40 text-yellow-300' },
    { id: 'Em negociação', t: '💬 Em negociação', d: 'Conversando com a família', cls: 'border-white/[0.15] text-zinc-200' },
    { id: 'Agendado', t: '📅 Agendado', d: 'Retornar em data e hora marcadas', cls: 'border-white/[0.15] text-zinc-200' },
    { id: 'Descarte', t: '🗑 Descarte', d: 'Não vende: o álbum fica congelado', cls: 'border-red-500/40 text-red-300' },
  ]
  const salvar = async () => {
    if (!resultado) return setErro('Escolha o resultado do contato.')
    setErro('')
    setSalvando(true)
    const e = await registrarContatoRebolo(ficha.id, {
      resultado,
      observacao: obs,
      motivo: resultado === 'Descarte' ? motivo : undefined,
      agendadoPara: resultado === 'Agendado' && agendado ? new Date(agendado).toISOString() : undefined,
    })
    setSalvando(false)
    if (e) return setErro(e)
    onFeito()
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setResultado(o.id)}
            className={`text-left p-3 rounded-xl border transition-all ${resultado === o.id ? `${o.cls} bg-white/[0.05]` : 'border-white/[0.06] text-zinc-300 hover:bg-white/[0.02]'}`}
          >
            <p className="text-sm font-black">{o.t}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">{o.d}</p>
          </button>
        ))}
      </div>
      {resultado === 'Descarte' && (
        <div className="space-y-1.5">
          <label className={labelCls}>Motivo do descarte *</label>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${inputCls} appearance-none`}>
            <option value="">Escolha</option>
            {MOTIVOS_DESCARTE.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {Number(ficha.tentativas) < 1 && motivo === 'Sem retorno' && <p className="text-[11px] text-yellow-400">Ainda não há tentativa sem resposta registrada. Tente de novo antes de descartar por falta de retorno.</p>}
        </div>
      )}
      {resultado === 'Agendado' && (
        <div className="space-y-1.5">
          <label className={labelCls}>Data e hora do retorno *</label>
          <input type="datetime-local" value={agendado} onChange={(e) => setAgendado(e.target.value)} className={inputCls} />
        </div>
      )}
      <div className="space-y-1.5">
        <label className={labelCls}>Observação</label>
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} className={inputCls} placeholder="O que foi conversado" />
      </div>
      {erro && <p className="text-sm font-bold text-red-400">{erro}</p>}
      <button disabled={salvando} onClick={() => void salvar()} className={`${btnPrimario} w-full`}>
        {salvando ? 'Salvando...' : 'Registrar contato'}
      </button>
    </div>
  )
}

function FecharVenda({ ficha, faixa, onFeito }: { ficha: Registro; faixa: 1 | 2 | 3; onFeito: () => void }) {
  const { tabela } = useRebolo()
  const disponiveis = PRODUTOS_REBOLO.filter((p) => FORMAS_REBOLO.some((f) => tabela.preco(faixa, p.id, f.id) > 0))
  const [produto, setProduto] = useState<ProdutoRebolo | ''>(disponiveis[0]?.id ?? '')
  const [forma, setForma] = useState<FormaRebolo>('boleto')
  // opções do Completo que a faixa tem (sem maleta, sem moldura, com pôster); podem ser marcadas juntas
  const opcoesFaixa = opcoesDaFaixa(tabela, faixa)
  const [marcadas, setMarcadas] = useState<OpcaoCompleto[]>([])
  const opcoes = produto === 'completo' ? marcadas.filter((o) => opcoesFaixa.some((x) => x.id === o)) : []
  const alternar = (o: OpcaoCompleto) => setMarcadas((m) => (m.includes(o) ? m.filter((x) => x !== o) : [...m, o]))
  const precoTabela = produto ? precoVenda(tabela, faixa, produto, forma, opcoes) : 0
  const descontoOk = ficha.descontoStatus === 'Aprovado' && Number(ficha.descontoValor) > 0
  const [usarDesconto, setUsarDesconto] = useState(false)
  const valor = usarDesconto && descontoOk ? Number(ficha.descontoValor) : precoTabela
  const max = produto ? maxParcelas(tabela, faixa, forma, valor) : 1
  const [parcelas, setParcelas] = useState(1)
  const n = Math.min(parcelas, max)
  const [d, setD] = useState({
    responsavel: String(ficha.nomeMae || ficha.nomePai || '').toUpperCase(),
    cpf: '',
    rg: '',
    whatsapp: String(ficha.whatsapp1 || ''),
    primeiroVencimento: addDias(hoje(), 30),
    observacao: '',
  })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const parcelamento = forma === 'pix' || n <= 1 ? 'À vista' : `${n}x ${brl(Math.round((valor / n) * 100) / 100)}`
  const precos = FORMAS_REBOLO.map((f) => ({ ...f, preco: produto ? precoVenda(tabela, faixa, produto, f.id, opcoes) : 0 }))
  const comissao = comissaoDaVenda(tabela, forma, valor)

  const salvar = async () => {
    if (!produto) return setErro('Escolha o produto.')
    if (!(valor > 0)) return setErro('Este produto não tem preço nessa forma de pagamento (Tabela de Preços).')
    if (!d.responsavel.trim()) return setErro('Informe o nome do comprador.')
    if (d.cpf.replace(/\D/g, '').length !== 11) return setErro('Informe o CPF do comprador (11 dígitos).')
    if (forma === 'boleto' && !d.primeiroVencimento) return setErro('Informe o 1º vencimento do boleto.')
    setErro('')
    setSalvando(true)
    const formaPagamento = FORMAS_REBOLO.find((f) => f.id === forma)!.formaPagamento
    const dados: Record<string, Valor> = {
      responsavel: d.responsavel.trim().toUpperCase(),
      aluno: '',
      modelo: String(ficha.aluno),
      numeroFicha: String(ficha.numeroFicha),
      escola: String(ficha.escola),
      telefone: d.whatsapp,
      whatsapp: d.whatsapp,
      cpf: d.cpf,
      rg: d.rg,
      endereco: [ficha.rua, ficha.numero].filter(Boolean).join(', '),
      bairro: String(ficha.bairro || ''),
      cep: String(ficha.cep || ''),
      cidade: String(ficha.cidade || ''),
      uf: String(ficha.uf || ''),
      nomePai: String(ficha.nomePai || ''),
      nomeMae: String(ficha.nomeMae || ''),
      pacote: nomeDaVenda(produto, opcoes),
      quantidade: 1,
      qtdFotos: Number(ficha.qtdFotos) || 0,
      valor,
      formaPagamento,
      parcelas: forma === 'pix' ? 1 : n,
      formaParcelamento: parcelamento,
      primeiroVencimento: forma === 'boleto' ? d.primeiroVencimento : '',
      observacao: [d.observacao.trim(), usarDesconto && descontoOk ? `Desconto aprovado (tabela ${brl(precoTabela)})` : ''].filter(Boolean).join(' • '),
      anexos: '{}',
      referencias: '[]',
    }
    const e = await fecharVendaRebolo(ficha.id, dados)
    setSalvando(false)
    if (e) return setErro(e)
    onFeito()
  }

  if (!disponiveis.length) return <p className="text-sm text-yellow-400">Nenhum produto com preço na faixa {faixa}. Peça à Gerência para preencher a Tabela de Preços.</p>

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Produto • faixa {faixa}</label>
        <div className="grid grid-cols-2 gap-2">
          {disponiveis.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProduto(p.id)}
              className={`text-left p-3 rounded-xl border ${produto === p.id ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/[0.06] hover:bg-white/[0.02]'}`}
            >
              <p className="text-sm font-black text-white">{p.nome}</p>
              <p className="text-[10px] text-zinc-500">{FORMAS_REBOLO.map((f) => `${f.nome} ${brl(tabela.preco(faixa, p.id, f.id))}`).join(' • ')}</p>
            </button>
          ))}
        </div>
      </div>
      {produto === 'completo' && opcoesFaixa.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {opcoesFaixa.map((o) => (
            <label key={o.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer ${opcoes.includes(o.id) ? 'border-blue-500/50 bg-blue-500/10 text-white' : 'border-white/[0.06] text-zinc-300'}`}>
              <input type="checkbox" checked={opcoes.includes(o.id)} onChange={() => alternar(o.id)} />
              {o.nome} ({o.sinal < 0 ? '−' : '+'}
              {brl(tabela.opcao(faixa, o.id)).replace(/,00$/, '')})
            </label>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {precos.map((f) => (
          <button
            key={f.id}
            type="button"
            disabled={!(f.preco > 0)}
            onClick={() => setForma(f.id)}
            className={`p-3 rounded-xl border text-center disabled:opacity-30 ${forma === f.id ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/[0.06]'}`}
          >
            <p className="text-xs font-black text-white">{f.nome}</p>
            <p className="text-sm font-bold text-white">{brl(f.preco)}</p>
          </button>
        ))}
      </div>
      {descontoOk && (
        <label className="flex items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" checked={usarDesconto} onChange={(e) => setUsarDesconto(e.target.checked)} /> Usar desconto aprovado pela Gerência: {brl(Number(ficha.descontoValor))}
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelCls}>Parcelas (máx. {max}x)</label>
          <select value={n} disabled={forma === 'pix'} onChange={(e) => setParcelas(Number(e.target.value))} className={`${inputCls} appearance-none`}>
            {Array.from({ length: max }, (_, i) => i + 1).map((p) => (
              <option key={p} value={p}>
                {p === 1 ? `À vista • ${brl(valor)}` : `${p}x de ${brl(valor / p)}`}
              </option>
            ))}
          </select>
        </div>
        {forma === 'boleto' ? (
          <div className="space-y-1.5">
            <label className={labelCls}>1º vencimento *</label>
            <input type="date" value={d.primeiroVencimento} onChange={(e) => setD({ ...d, primeiroVencimento: e.target.value })} className={inputCls} />
          </div>
        ) : (
          <div />
        )}
      </div>
      <p className="text-xs text-zinc-400">
        {produto && <strong className="text-white">{nomeDaVenda(produto, opcoes)}</strong>} • Total <strong className="text-white">{brl(valor)}</strong> • {parcelamento} • sem entrada
      </p>
      {valor > 0 && (
        <p className="text-xs text-zinc-400">
          Comissão da vendedora ({FORMAS_REBOLO.find((f) => f.id === forma)!.nome} {tabela.comissao(forma)}%): <strong className="text-white">{brl(comissao)}</strong>
        </p>
      )}
      <p className="text-sm font-black text-white pt-2 border-t border-white/[0.06]">Comprador</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <label className={labelCls}>Nome completo *</label>
          <input value={d.responsavel} onChange={(e) => setD({ ...d, responsavel: e.target.value })} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>CPF *</label>
          <input value={d.cpf} onChange={(e) => setD({ ...d, cpf: e.target.value })} inputMode="numeric" placeholder="000.000.000-00" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>RG</label>
          <input value={d.rg} onChange={(e) => setD({ ...d, rg: e.target.value })} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>WhatsApp</label>
          <input value={d.whatsapp} onChange={(e) => setD({ ...d, whatsapp: formatarTelefone(e.target.value) })} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Observação</label>
          <input value={d.observacao} onChange={(e) => setD({ ...d, observacao: e.target.value })} className={inputCls} />
        </div>
      </div>
      {erro && <p className="text-sm font-bold text-red-400">{erro}</p>}
      <button disabled={salvando} onClick={() => void salvar()} className={`${btnPrimario} w-full`}>
        {salvando ? 'Salvando...' : `Fechar venda • ${brl(valor)}`}
      </button>
      <p className="text-[11px] text-zinc-500">Depois: em Vendas, gere o contrato, mande para o cliente assinar e anexe o PDF assinado para o Financeiro conferir.</p>
    </div>
  )
}

function PedirDesconto({ ficha, faixa }: { ficha: Registro; faixa: 1 | 2 | 3 }) {
  const { tabela } = useRebolo()
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const status = String(ficha.descontoStatus || '')
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Preço de tabela na faixa {faixa}:{' '}
        {PRODUTOS_REBOLO.filter((p) => tabela.preco(faixa, p.id, 'pix') > 0)
          .map((p) => `${p.nome} ${brl(tabela.preco(faixa, p.id, 'pix'))} (PIX)`)
          .join(' • ')}
      </p>
      {status && (
        <p className="text-sm">
          Último pedido: <strong className="text-white">{brl(Number(ficha.descontoValor) || 0)}</strong> •{' '}
          <Badge texto={status} tom={status === 'Aprovado' ? 'emerald' : status === 'Rejeitado' ? 'red' : 'yellow'} />
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelCls}>Valor com desconto (R$)</label>
          <input type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Motivo</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} placeholder="Ex.: cliente fecha hoje no PIX" />
        </div>
      </div>
      <button
        disabled={salvando || status === 'Pendente'}
        onClick={async () => {
          setSalvando(true)
          await pedirDescontoRebolo(ficha.id, Number(valor), motivo)
          setSalvando(false)
        }}
        className={`${btnSecundario} w-full`}
      >
        {status === 'Pendente' ? 'Aguardando a Gerência...' : 'Enviar para a Gerência aprovar'}
      </button>
      <p className="text-[11px] text-zinc-500">Aprovado, o valor aparece em &quot;Fechar venda&quot; para usar.</p>
    </div>
  )
}
