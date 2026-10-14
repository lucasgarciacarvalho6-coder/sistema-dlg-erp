'use client'

// Atendimento de uma ficha: dados, histórico de contatos e as ações
//  • Registrar contato: Sem resposta (tentar de novo) • Em negociação • Agendado • Descarte (motivo)
//  • Fechar venda: Completo (com as opções sem maleta / sem moldura / com pôster que a faixa tem) ou Pôster com Moldura,
//    forma de pagamento pelo preço da faixa (sem entrada, até 15x, parcela mínima R$ 100) e a comissão da vendedora
//  • Pedir desconto fora da tabela (Gerência aprova)
//  • Editar a venda já fechada (a efetivar ou devolvida) sem cancelar: o mesmo formulário de Fechar venda

import { useState } from 'react'
import Link from 'next/link'
import type { Registro, Valor } from '@/lib/erp/types'
import type { ResultadoContato } from '@/lib/erp/fluxos'
import { addDias, brl, dataBR, hoje } from '@/lib/erp/format'
import { editarVendaRebolo, fecharVendaRebolo, pedirDescontoRebolo, reabrirFichaRebolo, registrarContatoRebolo, salvarFichaRebolo, usePode } from '@/lib/erp/store'
import {
  buscarCep,
  comissaoDaVenda,
  EM_ABERTO,
  escolaFicha,
  faixaDaFicha,
  formaDaVenda,
  formatarCep,
  formatarTelefone,
  FORMAS_REBOLO,
  maxParcelas,
  mesesDesde,
  MOTIVOS_DESCARTE,
  nomeDaVenda,
  opcoesDaFaixa,
  precoVenda,
  produtoDaVenda,
  PRODUTOS_REBOLO,
  SEM_ESCOLA,
  TOM_FAIXA,
  UFS,
  type FormaRebolo,
  type OpcaoCompleto,
  type ProdutoRebolo,
} from '@/lib/erp/rebolo'
import { Badge, TONS, btnPrimario, inputCls, labelCls } from '@/components/erp/ui'
import { dataHoraCurta, FaixaBadge, QuadroFaixa, SituacaoBadge, Telefones, useRebolo } from './comum'

type Aba = 'contato' | 'venda' | 'desconto'

// Cores do atendimento (pedido de 06/10/2026: as vendedoras achavam tudo apagado e deixavam passar informação):
// cada aba e cada resultado com a sua cor; o que está escolhido fica preenchido com a cor.
type Cor = { texto: string; suave: string; borda: string; leve: string; anel: string; solido: string }
const AZUL: Cor = { texto: 'text-blue-400', suave: 'bg-blue-500/15', borda: 'border-blue-500/60', leve: 'border-blue-500/25', anel: 'ring-blue-500/40', solido: 'bg-blue-500' }
const VERDE: Cor = { texto: 'text-emerald-400', suave: 'bg-emerald-500/15', borda: 'border-emerald-500/60', leve: 'border-emerald-500/25', anel: 'ring-emerald-500/40', solido: 'bg-emerald-500' }
const AMARELO: Cor = { texto: 'text-yellow-400', suave: 'bg-yellow-500/15', borda: 'border-yellow-500/60', leve: 'border-yellow-500/25', anel: 'ring-yellow-500/40', solido: 'bg-yellow-500' }
const VERMELHO: Cor = { texto: 'text-red-400', suave: 'bg-red-500/15', borda: 'border-red-500/60', leve: 'border-red-500/25', anel: 'ring-red-500/40', solido: 'bg-red-500' }
const escolhido = (c: Cor) => `${c.suave} ${c.borda} ring-1 ${c.anel}`
const ABAS: { id: Aba; label: string; cor: Cor }[] = [
  { id: 'contato', label: 'Registrar contato', cor: AZUL },
  { id: 'venda', label: 'Fechar venda', cor: VERDE },
  { id: 'desconto', label: 'Pedir desconto', cor: AMARELO },
]
const btnVerde =
  'bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all active:scale-95 disabled:opacity-40 inline-flex items-center justify-center gap-2'
// linha do histórico: venda = verde • sem resposta = amarelo • descarte = vermelho • o resto = azul
const corDoContato = (r: string): Cor => (/^(Fechou venda|Venda editada)/.test(r) ? VERDE : /^Descarte/.test(r) ? VERMELHO : r === 'Sem resposta' ? AMARELO : AZUL)
const Obrigatorio = () => <span className="text-red-400">*</span>

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
            Ficha <strong className="text-white">{String(ficha.numeroFicha)}</strong>
            {escolaFicha(ficha) ? ` • ${escolaFicha(ficha)}` : ''}
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
                <li key={c.id} className={`text-xs border-l-2 pl-3 ${corDoContato(String(c.resultado)).borda}`}>
                  <p className={`font-black ${corDoContato(String(c.resultado)).texto}`}>{String(c.resultado)}</p>
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
          <SemAcao ficha={ficha} venda={venda} podeMexer={minha && podeFazer('rebolo', 'editar')} />
        ) : !podeAgir ? (
          <p className="text-sm text-zinc-400">Esta ficha é de {nome(ficha.vendedoraId)}. Só ela ou a supervisão registram os contatos.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 pb-3 border-b border-white/[0.05]">
              {ABAS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAba(a.id)}
                  className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${a.cor.texto} ${
                    aba === a.id ? escolhido(a.cor) : `${a.cor.leve} hover:bg-white/[0.03]`
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${a.cor.solido}`}></span>
                  {a.label}
                </button>
              ))}
            </div>
            {aba === 'contato' && <RegistrarContato ficha={ficha} onFeito={onFechar} />}
            {aba === 'venda' && <FecharVenda ficha={ficha} faixa={faixa} onFeito={onFechar} />}
            {aba === 'desconto' && <PedirDesconto ficha={ficha} faixa={faixa} />}
          </>
        )}
      </div>
    </div>
  )
}

// Descarte: a dona da ficha (ou a supervisão) reabre quando o cliente muda de ideia — volta para Em negociação
// ou Tentar de novo, com uma observação no histórico.
// Venda a efetivar ou devolvida: a dona (ou a supervisão) edita a venda sem cancelar.
function SemAcao({ ficha, venda, podeMexer }: { ficha: Registro; venda?: Registro; podeMexer: boolean }) {
  const { tabela } = useRebolo()
  const [reabrindo, setReabrindo] = useState(false)
  const [destino, setDestino] = useState<'Em negociação' | 'Tentar de novo'>('Em negociação')
  const [obs, setObs] = useState('')
  const [editando, setEditando] = useState(false)
  if (ficha.situacao === 'Descarte')
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-300">
          Descartada: <strong className="text-red-400">{String(ficha.motivoDescarte || '—')}</strong>. O álbum fica guardado na empresa.
        </p>
        {podeMexer && (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 space-y-3">
            <p className="text-sm font-black text-white">↺ Reabrir a ficha (o cliente mudou de ideia)</p>
            <div className="grid grid-cols-2 gap-2">
              {(['Em negociação', 'Tentar de novo'] as const).map((d) => {
                const cor = d === 'Em negociação' ? VERDE : AMARELO
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDestino(d)}
                    className={`p-3 rounded-xl border text-left transition-all ${cor.texto} ${destino === d ? escolhido(cor) : `${cor.leve} hover:bg-white/[0.03]`}`}
                  >
                    <p className="text-sm font-black">{destino === d ? '✓ ' : ''}{d}</p>
                    <p className="text-[11px] text-zinc-400">{d === 'Em negociação' ? 'o cliente quer conversar / voltou a ter interesse' : 'ligar de novo mais tarde'}</p>
                  </button>
                )
              })}
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Observação (fica no histórico)</label>
              <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: a mãe ligou de volta e quer o álbum" className={inputCls} />
            </div>
            <button
              disabled={reabrindo}
              onClick={async () => {
                setReabrindo(true)
                await reabrirFichaRebolo(ficha.id, destino, obs)
                setReabrindo(false)
              }}
              className={btnPrimario}
            >
              {reabrindo ? 'Reabrindo...' : `Reabrir → ${destino}`}
            </button>
          </div>
        )}
      </div>
    )
  const editavel = !!venda && podeMexer && (venda.conferencia === 'Aguardando contrato' || venda.conferencia === 'Devolvida')
  if (venda && editavel && editando)
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-black text-blue-400">✎ Editar a venda</p>
          <button onClick={() => setEditando(false)} className="text-xs font-bold text-zinc-400 hover:text-white">Voltar sem salvar</button>
        </div>
        <FecharVenda ficha={ficha} faixa={faixaDaFicha(String(ficha.dataVisita), tabela, String(venda.data || hoje()))} venda={venda} onFeito={() => setEditando(false)} />
      </div>
    )
  return (
    <div className="space-y-3 text-sm text-zinc-300">
      <p>
        Situação: <SituacaoBadge situacao={ficha.situacao} />
      </p>
      {venda && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-emerald-400">Venda</p>
            <Badge texto={String(venda.conferencia)} />
          </div>
          <p className="text-base font-black text-white">
            {String(venda.pacote)} • <span className="text-emerald-400">{brl(Number(venda.valor) || 0)}</span>
          </p>
          <p className="text-xs text-zinc-300">
            {[String(venda.formaPagamento || ''), String(venda.formaParcelamento || ''), venda.primeiroVencimento ? `1º venc. ${dataBR(String(venda.primeiroVencimento))}` : '', String(venda.responsavel || '')].filter(Boolean).join(' • ')}
          </p>
          {venda.conferencia === 'Devolvida' && venda.conferenciaMotivo ? <p className="text-xs font-bold text-red-400">Devolvida: {String(venda.conferenciaMotivo)}</p> : null}
          <div className="flex flex-wrap gap-2 pt-1">
            {editavel && (
              <button onClick={() => setEditando(true)} className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border border-blue-500/50 bg-blue-500/15 text-blue-400 hover:bg-blue-500/25">
                ✎ Editar venda
              </button>
            )}
            <Link href="/rebolo/vendas" className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-blue-400 hover:bg-white/[0.04]">
              Ver em Vendas →
            </Link>
          </div>
        </div>
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
  // sem resposta = amarelo • em negociação = verde • agendado = azul • descarte = vermelho
  const opcoes: { id: ResultadoContato; t: string; d: string; cor: Cor }[] = [
    { id: 'Sem resposta', t: '📵 Sem resposta', d: 'Fica em "Tentar de novo"', cor: AMARELO },
    { id: 'Em negociação', t: '💬 Em negociação', d: 'Conversando com a família', cor: VERDE },
    { id: 'Agendado', t: '📅 Agendado', d: 'Retornar em data e hora marcadas', cor: AZUL },
    { id: 'Descarte', t: '🗑 Descarte', d: 'Não vende: o álbum fica congelado', cor: VERMELHO },
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
            className={`text-left p-3 rounded-xl border transition-all ${o.cor.texto} ${resultado === o.id ? escolhido(o.cor) : `${o.cor.leve} hover:bg-white/[0.03]`}`}
          >
            <p className="text-sm font-black">
              {o.t}
              {resultado === o.id ? ' ✓' : ''}
            </p>
            <p className={`text-[11px] mt-0.5 ${resultado === o.id ? 'text-zinc-200' : 'text-zinc-400'}`}>{o.d}</p>
          </button>
        ))}
      </div>
      {resultado === 'Descarte' && (
        <div className="space-y-1.5">
          <label className={labelCls}>Motivo do descarte <Obrigatorio /></label>
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
          <label className={labelCls}>Data e hora do retorno <Obrigatorio /></label>
          <input type="datetime-local" value={agendado} onChange={(e) => setAgendado(e.target.value)} className={inputCls} />
        </div>
      )}
      <div className="space-y-1.5">
        <label className={labelCls}>Observação</label>
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} className={inputCls} placeholder="O que foi conversado" />
      </div>
      {erro && <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400">{erro}</p>}
      <button disabled={salvando} onClick={() => void salvar()} className={`${btnPrimario} w-full`}>
        {salvando ? 'Salvando...' : 'Registrar contato'}
      </button>
    </div>
  )
}

// Fechar venda — e editar a venda já fechada (venda = a venda a efetivar ou devolvida): o formulário abre com o que
// foi combinado e, enquanto o produto, as opções, a forma e o desconto forem os mesmos, o valor fica o da venda.
// campos da ficha que formam o endereço para entrega (os mesmos do cadastro da ficha)
const CAMPOS_ENTREGA = ['cep', 'rua', 'numero', 'apto', 'bairro', 'cidade', 'uf', 'fazenda', 'pontoReferencia'] as const
type Entrega = Record<(typeof CAMPOS_ENTREGA)[number], string>

export function FecharVenda({ ficha, faixa, venda, onFeito }: { ficha: Registro; faixa: 1 | 2 | 3; venda?: Registro; onFeito: () => void }) {
  const { tabela } = useRebolo()
  const disponiveis = PRODUTOS_REBOLO.filter((p) => FORMAS_REBOLO.some((f) => tabela.preco(faixa, p.id, f.id) > 0))
  const original = venda ? produtoDaVenda(String(venda.pacote || '')) : null
  const formaOriginal = venda ? formaDaVenda(String(venda.formaPagamento || '')) : 'boleto'
  const [produto, setProduto] = useState<ProdutoRebolo | ''>(original && disponiveis.some((p) => p.id === original.produto) ? original.produto : (disponiveis[0]?.id ?? ''))
  const [forma, setForma] = useState<FormaRebolo>(formaOriginal)
  // opções do Completo que a faixa tem (sem maleta, sem moldura, com pôster); podem ser marcadas juntas
  const opcoesFaixa = opcoesDaFaixa(tabela, faixa)
  const [marcadas, setMarcadas] = useState<OpcaoCompleto[]>(original?.opcoes ?? [])
  const opcoes = produto === 'completo' ? marcadas.filter((o) => opcoesFaixa.some((x) => x.id === o)) : []
  const alternar = (o: OpcaoCompleto) => setMarcadas((m) => (m.includes(o) ? m.filter((x) => x !== o) : [...m, o]))
  const precoTabela = produto ? precoVenda(tabela, faixa, produto, forma, opcoes) : 0
  const descontoOk = ficha.descontoStatus === 'Aprovado' && Number(ficha.descontoValor) > 0
  const usouDesconto = !!venda && descontoOk && Number(venda.valor) === Number(ficha.descontoValor)
  const [usarDesconto, setUsarDesconto] = useState(usouDesconto)
  const mesmoNegocio =
    !!venda &&
    !!original &&
    produto === original.produto &&
    forma === formaOriginal &&
    usarDesconto === usouDesconto &&
    opcoes.length === original.opcoes.length &&
    opcoes.every((o) => original.opcoes.includes(o))
  const valor = venda && mesmoNegocio ? Number(venda.valor) || 0 : usarDesconto && descontoOk ? Number(ficha.descontoValor) : precoTabela
  const pacote = venda && mesmoNegocio ? String(venda.pacote) : produto ? nomeDaVenda(produto, opcoes) : ''
  const max = produto ? maxParcelas(tabela, faixa, forma, valor) : 1
  const [parcelas, setParcelas] = useState(Number(venda?.parcelas) || 1)
  const n = Math.min(parcelas, max)
  const [d0] = useState(() =>
    venda
      ? {
          responsavel: String(venda.responsavel || ''),
          cpf: String(venda.cpf || ''),
          rg: String(venda.rg || ''),
          whatsapp: String(venda.whatsapp || venda.telefone || ''),
          primeiroVencimento: String(venda.primeiroVencimento || '') || addDias(hoje(), 30),
          // a nota do desconto é refeita ao salvar
          observacao: String(venda.observacao || '')
            .split(' • ')
            .filter((p) => p && !p.startsWith('Desconto aprovado'))
            .join(' • '),
        }
      : {
          responsavel: String(ficha.nomeMae || ficha.nomePai || '').toUpperCase(),
          cpf: '',
          rg: '',
          whatsapp: String(ficha.whatsapp1 || ''),
          primeiroVencimento: addDias(hoje(), 30),
          observacao: '',
        },
  )
  const [d, setD] = useState(d0)
  // 14/10: endereço para entrega — vem da ficha e pode ser preenchido/corrigido aqui; grava na ficha (Envios lê de lá)
  const [e0] = useState(() => {
    const x = Object.fromEntries(CAMPOS_ENTREGA.map((k) => [k, String(ficha[k] ?? '')])) as Entrega
    return { ...x, uf: x.uf.toUpperCase() }
  })
  const [ent, setEnt] = useState<Entrega>(e0)
  const [avisoCep, setAvisoCep] = useState('')
  const mudouEntrega = CAMPOS_ENTREGA.some((k) => ent[k].trim() !== e0[k].trim())
  const aoMudarCep = async (valor: string) => {
    setEnt((x) => ({ ...x, cep: formatarCep(valor) }))
    if (valor.replace(/\D/g, '').length !== 8) return setAvisoCep('')
    setAvisoCep('Buscando CEP...')
    const r = await buscarCep(valor)
    if (!r) return setAvisoCep('CEP não encontrado. Preencha o endereço à mão.')
    setAvisoCep(`CEP encontrado: ${r.cidade}/${r.uf}`)
    setEnt((x) => ({ ...x, rua: r.rua || x.rua, bairro: r.bairro || x.bairro, cidade: r.cidade || x.cidade, uf: r.uf || x.uf }))
  }
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const parcelamento = forma === 'pix' || n <= 1 ? 'À vista' : `${n}x ${brl(Math.round((valor / n) * 100) / 100)}`
  const precos = FORMAS_REBOLO.map((f) => ({ ...f, preco: produto ? precoVenda(tabela, faixa, produto, f.id, opcoes) : 0 }))
  const comissao = comissaoDaVenda(tabela, forma, valor)
  const nomeFormaAtual = FORMAS_REBOLO.find((f) => f.id === forma)!.nome
  // editando: o que mudou em relação à venda (sem mudança, não salva)
  const mudou =
    !!venda &&
    (!mesmoNegocio ||
      n !== (Number(venda.parcelas) || 1) ||
      (forma === 'boleto' && d.primeiroVencimento !== d0.primeiroVencimento) ||
      (['responsavel', 'cpf', 'rg', 'whatsapp', 'observacao'] as const).some((k) => d[k].trim() !== d0[k].trim()) ||
      mudouEntrega)

  const salvar = async () => {
    if (!produto) return setErro('Escolha o produto.')
    if (!(valor > 0)) return setErro('Este produto não tem preço nessa forma de pagamento (Tabela de Preços).')
    if (!d.responsavel.trim()) return setErro('Informe o nome do comprador.')
    if (d.cpf.replace(/\D/g, '').length !== 11) return setErro('Informe o CPF do comprador (11 dígitos).')
    if (forma === 'boleto' && !d.primeiroVencimento) return setErro('Informe o 1º vencimento do boleto.')
    if (!ent.rua.trim() && !ent.fazenda.trim()) return setErro('Informe o endereço para entrega (rua ou fazenda).')
    if (!ent.cidade.trim() || !ent.uf.trim()) return setErro('Informe a cidade e o estado da entrega.')
    setErro('')
    setSalvando(true)
    if (mudouEntrega) {
      const e = await salvarFichaRebolo(Object.fromEntries(CAMPOS_ENTREGA.map((k) => [k, ent[k].trim()])), ficha.id)
      if (e) {
        setSalvando(false)
        return setErro(e)
      }
    }
    const formaPagamento = FORMAS_REBOLO.find((f) => f.id === forma)!.formaPagamento
    const observacao = [d.observacao.trim(), usarDesconto && descontoOk ? `Desconto aprovado (tabela ${brl(precoTabela)})` : ''].filter(Boolean).join(' • ')
    if (venda) {
      const e = await editarVendaRebolo(venda.id, {
        pacote,
        valor,
        formaPagamento,
        parcelas: forma === 'pix' ? 1 : n,
        formaParcelamento: parcelamento,
        primeiroVencimento: forma === 'boleto' ? d.primeiroVencimento : '',
        responsavel: d.responsavel.trim().toUpperCase(),
        cpf: d.cpf.trim(),
        rg: d.rg.trim(),
        whatsapp: d.whatsapp.trim(),
        observacao,
      })
      setSalvando(false)
      if (e) return setErro(e)
      return onFeito()
    }
    const dados: Record<string, Valor> = {
      responsavel: d.responsavel.trim().toUpperCase(),
      aluno: '',
      modelo: String(ficha.aluno),
      numeroFicha: String(ficha.numeroFicha),
      escola: escolaFicha(ficha) || SEM_ESCOLA, // a venda exige a escola: sem escola vai "—"
      telefone: d.whatsapp,
      whatsapp: d.whatsapp,
      cpf: d.cpf,
      rg: d.rg,
      endereco: [ent.rua.trim() || ent.fazenda.trim(), ent.numero.trim()].filter(Boolean).join(', '),
      bairro: ent.bairro.trim(),
      cep: ent.cep.trim(),
      cidade: ent.cidade.trim(),
      uf: ent.uf.trim(),
      nomePai: String(ficha.nomePai || ''),
      nomeMae: String(ficha.nomeMae || ''),
      pacote,
      quantidade: 1,
      qtdFotos: Number(ficha.qtdFotos) || 0,
      valor,
      formaPagamento,
      parcelas: forma === 'pix' ? 1 : n,
      formaParcelamento: parcelamento,
      primeiroVencimento: forma === 'boleto' ? d.primeiroVencimento : '',
      observacao,
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
        <label className={labelCls}>
          Produto • <span className={TONS[TOM_FAIXA[faixa]].texto}>faixa {faixa}</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {disponiveis.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProduto(p.id)}
              className={`text-left p-3 rounded-xl border transition-all ${produto === p.id ? escolhido(VERDE) : 'border-white/[0.1] hover:bg-white/[0.03]'}`}
            >
              <p className={`text-sm font-black ${produto === p.id ? 'text-emerald-400' : 'text-white'}`}>
                {produto === p.id ? '✓ ' : ''}
                {p.nome}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {FORMAS_REBOLO.map((f, i) => (
                  <span key={f.id}>
                    {i ? ' • ' : ''}
                    {f.nome} <strong className="text-zinc-100">{brl(tabela.preco(faixa, p.id, f.id))}</strong>
                  </span>
                ))}
              </p>
            </button>
          ))}
        </div>
      </div>
      {produto === 'completo' && opcoesFaixa.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {opcoesFaixa.map((o) => (
            <label
              key={o.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold cursor-pointer transition-all ${opcoes.includes(o.id) ? `${escolhido(VERDE)} text-emerald-400` : 'border-white/[0.1] text-zinc-300'}`}
            >
              <input type="checkbox" className="accent-emerald-500" checked={opcoes.includes(o.id)} onChange={() => alternar(o.id)} />
              {o.nome} ({o.sinal < 0 ? '−' : '+'}
              {brl(tabela.opcao(faixa, o.id)).replace(/,00$/, '')})
            </label>
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        <label className={labelCls}>Forma de pagamento</label>
        <div className="grid grid-cols-3 gap-2">
          {precos.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={!(f.preco > 0)}
              onClick={() => setForma(f.id)}
              className={`p-3 rounded-xl border text-center transition-all disabled:opacity-30 ${forma === f.id ? escolhido(VERDE) : 'border-white/[0.1] hover:bg-white/[0.03]'}`}
            >
              <p className={`text-xs font-black uppercase tracking-widest ${forma === f.id ? 'text-emerald-400' : 'text-zinc-300'}`}>
                {forma === f.id ? '✓ ' : ''}
                {f.nome}
              </p>
              <p className="text-lg font-black text-white">{brl(f.preco)}</p>
            </button>
          ))}
        </div>
      </div>
      {descontoOk && (
        <label className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold cursor-pointer text-yellow-400 ${usarDesconto ? escolhido(AMARELO) : AMARELO.leve}`}>
          <input type="checkbox" className="accent-yellow-500" checked={usarDesconto} onChange={(e) => setUsarDesconto(e.target.checked)} />
          🏷 Usar desconto aprovado pela Gerência: {brl(Number(ficha.descontoValor))}
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelCls}>Parcelas (máx. {max}x)</label>
          <select value={n} disabled={forma === 'pix'} onChange={(e) => setParcelas(Number(e.target.value))} className={`${inputCls} appearance-none font-bold`}>
            {Array.from({ length: max }, (_, i) => i + 1).map((p) => (
              <option key={p} value={p}>
                {p === 1 ? `À vista • ${brl(valor)}` : `${p}x de ${brl(valor / p)}`}
              </option>
            ))}
          </select>
        </div>
        {forma === 'boleto' ? (
          <div className="space-y-1.5">
            <label className={labelCls}>
              1º vencimento <Obrigatorio />
            </label>
            <input type="date" value={d.primeiroVencimento} onChange={(e) => setD({ ...d, primeiroVencimento: e.target.value })} className={inputCls} />
          </div>
        ) : (
          <div />
        )}
      </div>
      {produto && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Resumo da venda</p>
              <p className="text-sm font-black text-white mt-1">{pacote}</p>
              <p className="text-xs text-zinc-300">
                {nomeFormaAtual} • {parcelamento} • sem entrada
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Total</p>
              <p className="text-3xl font-black text-emerald-400 leading-tight">{brl(valor)}</p>
            </div>
          </div>
          {valor > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-400">
              💰 Comissão da vendedora: {brl(comissao)} ({nomeFormaAtual} {tabela.comissao(forma)}%)
            </span>
          )}
        </div>
      )}
      <p className="text-sm font-black text-blue-400 pt-2 border-t border-white/[0.06]">👤 Comprador</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <label className={labelCls}>
            Nome completo <Obrigatorio />
          </label>
          <input value={d.responsavel} onChange={(e) => setD({ ...d, responsavel: e.target.value })} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>
            CPF <Obrigatorio />
          </label>
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
      <p className="text-sm font-black text-blue-400 pt-2 border-t border-white/[0.06]">📦 Endereço para entrega</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelCls}>CEP</label>
          <input value={ent.cep} onChange={(e) => void aoMudarCep(e.target.value)} inputMode="numeric" placeholder="00000-000" className={inputCls} />
        </div>
        <div className="flex items-end pb-2 text-[11px] text-zinc-400">{avisoCep}</div>
        <div className="space-y-1.5 col-span-2">
          <label className={labelCls}>
            Rua <Obrigatorio />
          </label>
          <input value={ent.rua} onChange={(e) => setEnt({ ...ent, rua: e.target.value })} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Número</label>
          <input value={ent.numero} onChange={(e) => setEnt({ ...ent, numero: e.target.value })} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Apto / complemento</label>
          <input value={ent.apto} onChange={(e) => setEnt({ ...ent, apto: e.target.value })} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Bairro</label>
          <input value={ent.bairro} onChange={(e) => setEnt({ ...ent, bairro: e.target.value })} className={inputCls} />
        </div>
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <div className="space-y-1.5">
            <label className={labelCls}>
              Cidade <Obrigatorio />
            </label>
            <input value={ent.cidade} onChange={(e) => setEnt({ ...ent, cidade: e.target.value })} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>
              UF <Obrigatorio />
            </label>
            <select value={ent.uf} onChange={(e) => setEnt({ ...ent, uf: e.target.value })} className={`${inputCls} appearance-none`}>
              <option value="">—</option>
              {UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Fazenda (zona rural)</label>
          <input value={ent.fazenda} onChange={(e) => setEnt({ ...ent, fazenda: e.target.value })} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Ponto de referência</label>
          <input value={ent.pontoReferencia} onChange={(e) => setEnt({ ...ent, pontoReferencia: e.target.value })} className={inputCls} />
        </div>
      </div>
      {venda && mudou && (
        <p className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-yellow-400">
          ⚠ Depois de salvar, gere o contrato (PDF) de novo e colete a assinatura outra vez: o contrato antigo fica com os dados velhos.
        </p>
      )}
      {erro && <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400">{erro}</p>}
      <button disabled={salvando || (!!venda && !mudou)} onClick={() => void salvar()} className={`${btnVerde} w-full`}>
        {salvando ? 'Salvando...' : venda ? (mudou ? `Salvar alterações • ${brl(valor)}` : 'Nada alterado') : `✓ Fechar venda • ${brl(valor)}`}
      </button>
      {!venda && <p className="text-[11px] text-zinc-500">Depois: em Vendas, gere o contrato, mande para o cliente assinar e anexe o PDF assinado para o Financeiro conferir.</p>}
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
        className="w-full px-6 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest border border-yellow-500/60 bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-all disabled:opacity-40"
      >
        {status === 'Pendente' ? 'Aguardando a Gerência...' : '🏷 Enviar para a Gerência aprovar'}
      </button>
      <p className="text-[11px] text-zinc-500">Aprovado, o valor aparece em &quot;Fechar venda&quot; para usar.</p>
    </div>
  )
}
