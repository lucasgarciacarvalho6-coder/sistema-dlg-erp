'use client'

// Venda de book no app do vendedor, em etapas (cada uma com confirmação):
//  1. Foto do "Contrato de Compra" (papel preenchido à mão) → a IA lê e preenche
//  2. Revisão dos dados → confirma → o cliente ASSINA com o dedo
//  3. Documento do cliente (frente e verso)
//  4. Foto da promissória (recibo)
//  5. Envia ao Financeiro (conferência)
// Também serve para CORRIGIR uma venda devolvida pelo Financeiro (reenvio).

import { useMemo, useState } from 'react'
import type { Registro, Valor } from '@/lib/erp/types'
import { botaoApp, botaoSecApp, cardApp, inputApp, labelApp } from './AppShell'
import CapturaPaginas from './CapturaPaginas'
import AssinaturaPad from './AssinaturaPad'
import { enviarPaginasApp, registrarVendaExterna, reenviarVendaExterna } from '@/lib/erp/store'
import { lerContratoVenda } from '@/lib/erp/leitura-contrato'
import { FORMAS_PAGAMENTO, type CamposVenda, type Referencia } from '@/lib/erp/contrato-parser'
import { lerJSON } from '@/lib/erp/operacional'
import { addDias, brl, hoje } from '@/lib/erp/format'

const VAZIO: CamposVenda = {
  responsavel: '', cpf: '', rg: '', dataNascimento: '', whatsapp: '', endereco: '', bairro: '', cep: '', cidade: '', nomePai: '', nomeMae: '',
  qtdMaletas: '1', qtdFotos: '', qtdMolduras: '', modelo: '', numeroFicha: '', valor: '', entrada: '', formaParcelamento: '',
  formaPagamento: 'Boleto', parcelas: '1', primeiroVencimento: '',
}
const ETAPAS = ['Contrato', 'Revisão e assinatura', 'Documento', 'Promissória', 'Enviar']

interface Anexos {
  contrato?: string[]
  docFrente?: string
  docVerso?: string
  recibo?: string
}

const n = (v: string) => Number(String(v).replace(/\./g, '').replace(',', '.')) || 0

// Local da assinatura (espera até 8 s; sem sinal, segue sem a coordenada)
const posicaoAtual = () =>
  new Promise<{ lat: number; lng: number } | null>((ok) => {
    if (!navigator.geolocation) return ok(null)
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => ok(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 120_000 },
    )
  })
const dinheiro = (v: string) => Number(String(v).replace(',', '.')) || 0

function FotoUnica({ rotulo, arquivo, atual, onChange }: { rotulo: string; arquivo: File | null; atual?: string; onChange: (f: File | null) => void }) {
  const url = useMemo(() => (arquivo ? URL.createObjectURL(arquivo) : null), [arquivo])
  return (
    <div className="space-y-2">
      <p className={labelApp}>{rotulo}</p>
      {url ? (
        <div className="relative rounded-2xl overflow-hidden border border-white/[0.08]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={rotulo} className="w-full h-44 object-cover" />
          <button type="button" onClick={() => onChange(null)} className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-black/80 text-red-400 text-xs font-bold">
            Tirar de novo
          </button>
        </div>
      ) : (
        <label className="block w-full py-6 rounded-2xl border-2 border-dashed border-blue-500/40 bg-blue-500/[0.06] text-center cursor-pointer active:scale-[0.99]">
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (onChange(e.target.files?.[0] ?? null), (e.target.value = ''))} />
          <span className="text-2xl block" aria-hidden="true">📷</span>
          <span className="text-sm font-black uppercase tracking-widest text-blue-300">Fotografar {rotulo.toLowerCase()}</span>
          {atual && <span className="block text-[11px] text-emerald-400 mt-1">✓ Foto atual guardada (tire de novo só se precisar)</span>}
        </label>
      )}
    </div>
  )
}

export default function VendaWizard({
  escolas,
  devolvida,
  onConcluida,
  onAcao,
}: {
  escolas: [string, string][]
  devolvida?: Registro | null
  onConcluida: () => void
  onAcao: (descricao: string) => void
}) {
  const inicial = (): CamposVenda => {
    if (!devolvida) return { ...VAZIO, primeiroVencimento: addDias(hoje(), 30) }
    const g = (k: string) => (devolvida[k] === null || devolvida[k] === undefined ? '' : String(devolvida[k]))
    return {
      ...VAZIO,
      ...Object.fromEntries(Object.keys(VAZIO).map((k) => [k, g(k)])),
      whatsapp: g('whatsapp') || g('telefone'),
    } as CamposVenda
  }
  const [etapa, setEtapa] = useState(devolvida ? 1 : 0)
  const [f, setF] = useState<CamposVenda>(inicial)
  const [escola, setEscola] = useState(devolvida ? String(devolvida.escola || '') : '')
  const [observacao, setObservacao] = useState(devolvida ? String(devolvida.observacao || '') : '')
  const [refs, setRefs] = useState<Referencia[]>(() => {
    const r = devolvida ? lerJSON<Referencia[]>(devolvida.referencias, []) : []
    return [0, 1, 2].map((i) => r[i] ?? { nome: '', telefone: '' })
  })
  const anexosAtuais = devolvida ? lerJSON<Anexos>(devolvida.anexos, {}) : {}
  const [fotosContrato, setFotosContrato] = useState<File[]>([])
  const [docFrente, setDocFrente] = useState<File | null>(null)
  const [docVerso, setDocVerso] = useState<File | null>(null)
  const [recibo, setRecibo] = useState<File | null>(null)
  const [assinatura, setAssinatura] = useState<File | null>(null)
  const [assinadoEm, setAssinadoEm] = useState<{ quando: string; lat: number | null; lng: number | null } | null>(null)
  const [confirmado, setConfirmado] = useState(false)
  const [duvidas, setDuvidas] = useState<Set<string>>(new Set())
  const [lidos, setLidos] = useState<Set<string>>(new Set())
  const [leitura, setLeitura] = useState<{ estado: 'parado' | 'lendo' | 'ok' | 'erro'; msg?: string; progresso?: number }>({ estado: 'parado' })
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const set = (k: keyof CamposVenda, v: string) => {
    setF((x) => ({ ...x, [k]: v }))
    if (duvidas.has(k)) setDuvidas((d) => new Set([...d].filter((x) => x !== k)))
    setConfirmado(false)
  }
  const parcelavel = f.formaPagamento !== 'Cartão de débito'
  const saldo = Math.max(0, dinheiro(f.valor) - dinheiro(f.entrada))

  // ---------- 1. ler o contrato ----------
  const ler = async () => {
    if (!fotosContrato.length) return setErro('Fotografe o contrato.')
    setErro('')
    setLeitura({ estado: 'lendo', progresso: 0 })
    const r = await lerContratoVenda(fotosContrato, (p) => setLeitura({ estado: 'lendo', progresso: p }))
    if ('erro' in r) return setLeitura({ estado: 'erro', msg: r.erro })
    setF((x) => ({ ...x, ...r.campos }))
    if (r.referencias.length) setRefs([0, 1, 2].map((i) => r.referencias[i] ?? { nome: '', telefone: '' }))
    setLidos(new Set(Object.keys(r.campos)))
    setDuvidas(new Set(r.duvidas))
    setLeitura({ estado: 'ok', msg: r.aviso })
    onAcao('Contrato de venda lido')
    setEtapa(1)
  }

  // ---------- 2. confirmar dados → assinatura ----------
  const validarDados = () => {
    if (!escola.trim()) return 'Escolha a escola.'
    if (!f.numeroFicha.trim()) return 'Informe o nº da ficha.'
    if (!f.responsavel.trim()) return 'Informe o nome do comprador.'
    if (!f.whatsapp.trim()) return 'Informe o WhatsApp do comprador.'
    if (!(dinheiro(f.valor) > 0)) return 'Informe o valor total da compra.'
    if (dinheiro(f.entrada) > dinheiro(f.valor)) return 'A entrada não pode ser maior que o valor total.'
    if (saldo > 0 && f.formaPagamento === 'Boleto' && !f.primeiroVencimento) return 'Informe a data de vencimento.'
    return ''
  }
  const confirmarDados = () => {
    const e = validarDados()
    if (e) return setErro(e)
    setErro('')
    setConfirmado(true)
  }
  const registrarAssinatura = (arq: File | null) => {
    setAssinatura(arq)
    if (!arq) return setAssinadoEm(null)
    const quando = new Date().toISOString()
    setAssinadoEm((a) => ({ quando, lat: a?.lat ?? null, lng: a?.lng ?? null }))
    void posicaoAtual().then((pos) => pos && setAssinadoEm({ quando, lat: pos.lat, lng: pos.lng }))
  }

  // ---------- 5. enviar ----------
  const enviar = async () => {
    setErro('')
    setEnviando(true)
    const subir = async (arquivos: File[]) => {
      if (!arquivos.length) return [] as string[]
      const r = await enviarPaginasApp(arquivos)
      if ('erro' in r) throw new Error(r.erro)
      return r.caminhos
    }
    try {
      // assinatura feita agora sem coordenada ainda → tenta de novo antes de enviar
      const local = assinatura && assinadoEm && assinadoEm.lat === null ? await posicaoAtual() : null
      const contrato = fotosContrato.length ? await subir(fotosContrato) : (anexosAtuais.contrato ?? [])
      const [frente] = docFrente ? await subir([docFrente]) : [anexosAtuais.docFrente ?? '']
      const [verso] = docVerso ? await subir([docVerso]) : [anexosAtuais.docVerso ?? '']
      const [rec] = recibo ? await subir([recibo]) : [anexosAtuais.recibo ?? '']
      const [ass] = assinatura ? await subir([assinatura]) : [String(devolvida?.assinatura ?? '')]
      const dados: Record<string, Valor> = {
        escola: escola.trim(),
        aluno: '',
        numeroFicha: f.numeroFicha.trim(),
        responsavel: f.responsavel.trim(),
        cpf: f.cpf.trim(),
        rg: f.rg.trim(),
        dataNascimento: f.dataNascimento,
        whatsapp: f.whatsapp.trim(),
        telefone: f.whatsapp.trim(),
        referencias: JSON.stringify(refs.filter((r) => r.nome.trim() || r.telefone.trim())),
        endereco: f.endereco.trim(),
        bairro: f.bairro.trim(),
        cep: f.cep.trim(),
        cidade: f.cidade.trim(),
        nomePai: f.nomePai.trim(),
        nomeMae: f.nomeMae.trim(),
        qtdMaletas: n(f.qtdMaletas),
        qtdFotos: n(f.qtdFotos),
        qtdMolduras: n(f.qtdMolduras),
        quantidade: Math.max(1, n(f.qtdMaletas)),
        modelo: f.modelo.trim(),
        valor: dinheiro(f.valor),
        entrada: dinheiro(f.entrada),
        formaPagamento: f.formaPagamento,
        parcelas: parcelavel ? Math.min(24, Math.max(1, n(f.parcelas))) : 1,
        primeiroVencimento: saldo > 0 ? f.primeiroVencimento : '',
        formaParcelamento: f.formaParcelamento.trim(),
        observacao: observacao.trim(),
        anexos: JSON.stringify({ contrato, docFrente: frente, docVerso: verso, recibo: rec }),
        assinatura: ass,
        assinaturaEm: assinadoEm?.quando ?? String(devolvida?.assinaturaEm ?? ''),
        assinaturaLat: assinadoEm?.lat ?? local?.lat ?? (devolvida?.assinaturaLat === '' ? null : ((devolvida?.assinaturaLat as number | undefined) ?? null)),
        assinaturaLng: assinadoEm?.lng ?? local?.lng ?? (devolvida?.assinaturaLng === '' ? null : ((devolvida?.assinaturaLng as number | undefined) ?? null)),
        data: devolvida ? String(devolvida.data) : hoje(),
        cobradorId: '',
      }
      const falha = devolvida ? await reenviarVendaExterna(devolvida.id, dados) : await registrarVendaExterna(dados)
      if (falha) throw new Error(falha)
      onAcao(`${devolvida ? 'Venda reenviada' : 'Venda registrada'}: ${f.responsavel.trim()}`)
      onConcluida()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  const temContrato = fotosContrato.length > 0 || !!anexosAtuais.contrato?.length
  const podeAvancar = [
    temContrato,
    confirmado && (!!assinatura || !!devolvida?.assinatura),
    (!!docFrente || !!anexosAtuais.docFrente) && (!!docVerso || !!anexosAtuais.docVerso),
    !!recibo || !!anexosAtuais.recibo,
    true,
  ]

  const campo = (k: keyof CamposVenda, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <label className={`${labelApp} flex items-center gap-2`}>
        {rotulo}
        {duvidas.has(k) ? (
          <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-[9px] font-black">CONFIRA</span>
        ) : lidos.has(k) ? (
          <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[9px] font-black">LIDO</span>
        ) : null}
      </label>
      <input value={f[k]} onChange={(e) => set(k, e.target.value)} className={`${inputApp} ${duvidas.has(k) ? '!border-yellow-500/70' : ''}`} {...extra} />
    </div>
  )

  return (
    <div className="space-y-4">
      {devolvida && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-sm">
          <p className="font-black text-red-400">Devolvida pelo Financeiro</p>
          <p className="text-zinc-300 mt-1">{String(devolvida.conferenciaMotivo || 'Revise os dados e reenvie.')}</p>
        </div>
      )}

      {/* Etapas */}
      <div className="flex items-center gap-1.5">
        {ETAPAS.map((e, i) => (
          <button
            key={e}
            type="button"
            onClick={() => i < etapa && setEtapa(i)}
            className={`flex-1 h-1.5 rounded-full ${i < etapa ? 'bg-emerald-500' : i === etapa ? 'bg-blue-500' : 'bg-white/[0.08]'}`}
            aria-label={`Etapa ${i + 1}: ${e}`}
          />
        ))}
      </div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
        Etapa {etapa + 1} de {ETAPAS.length} • <span className="text-white">{ETAPAS[etapa]}</span>
      </p>

      {/* 1. Contrato */}
      {etapa === 0 && (
        <div className={`${cardApp} space-y-4`}>
          <p className="text-lg font-black">Foto do contrato de compra</p>
          <p className="text-sm text-zinc-400">Depois de preencher e o cliente assinar o papel, fotografe o contrato. O sistema lê e preenche a venda.</p>
          <CapturaPaginas paginas={fotosContrato} onChange={setFotosContrato} />
          {leitura.estado === 'lendo' && (
            <p className="text-sm font-bold text-blue-300 flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
              Lendo o contrato... {leitura.progresso && leitura.progresso > 0.2 ? `${Math.round(leitura.progresso * 100)}%` : ''}
            </p>
          )}
          {leitura.estado === 'erro' && <p className="text-sm font-bold text-red-400">{leitura.msg}</p>}
          <button onClick={ler} disabled={!fotosContrato.length || leitura.estado === 'lendo'} className={botaoApp}>
            {leitura.estado === 'lendo' ? 'Lendo...' : 'Ler contrato e continuar'}
          </button>
          {fotosContrato.length > 0 && leitura.estado !== 'lendo' && (
            <button onClick={() => setEtapa(1)} className={botaoSecApp}>
              Preencher à mão
            </button>
          )}
        </div>
      )}

      {/* 2. Revisão + assinatura */}
      {etapa === 1 && (
        <div className={`${cardApp} space-y-4`}>
          <p className="text-lg font-black">Revise os dados</p>
          {leitura.estado === 'ok' && (
            <p className="text-xs text-zinc-400">
              Preenchido pela leitura (<span className="text-blue-400 font-bold">LIDO</span>).{' '}
              {duvidas.size > 0 && <span className="text-yellow-400 font-bold">{duvidas.size} campo(s) em amarelo: confira com o papel.</span>}
              {leitura.msg && <span className="block text-yellow-400 mt-1">{leitura.msg}</span>}
            </p>
          )}
          <div className="space-y-1.5">
            <label className={labelApp}>Escola *</label>
            <select value={escola} onChange={(e) => (setEscola(e.target.value), setConfirmado(false))} className={`${inputApp} appearance-none`}>
              <option value="">Selecione a escola</option>
              {escolas.map(([e, local]) => (
                <option key={e} value={e}>
                  {e} ({local})
                </option>
              ))}
              {escola && !escolas.some(([e]) => e === escola) && <option value={escola}>{escola}</option>}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {campo('numeroFicha', 'Nº da ficha *', { inputMode: 'numeric' })}
            {campo('modelo', 'Modelo')}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {campo('qtdMaletas', 'Maletas', { type: 'number', inputMode: 'numeric', min: 0 })}
            {campo('qtdFotos', 'Fotos 20x25', { type: 'number', inputMode: 'numeric', min: 0 })}
            {campo('qtdMolduras', 'Molduras', { type: 'number', inputMode: 'numeric', min: 0 })}
          </div>

          <p className="text-sm font-black pt-2 border-t border-white/[0.06]">Comprador</p>
          {campo('responsavel', 'Nome *')}
          <div className="grid grid-cols-2 gap-3">
            {campo('cpf', 'CPF', { inputMode: 'numeric' })}
            {campo('rg', 'RG')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {campo('dataNascimento', 'Nascimento', { type: 'date' })}
            {campo('whatsapp', 'WhatsApp *', { inputMode: 'tel' })}
          </div>
          {refs.map((r, i) => (
            <div key={i} className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={labelApp}>Referência {i + 1}</label>
                <input value={r.nome} onChange={(e) => setRefs(refs.map((x, k) => (k === i ? { ...x, nome: e.target.value } : x)))} className={inputApp} />
              </div>
              <div className="space-y-1.5">
                <label className={labelApp}>Telefone</label>
                <input value={r.telefone} inputMode="tel" onChange={(e) => setRefs(refs.map((x, k) => (k === i ? { ...x, telefone: e.target.value } : x)))} className={inputApp} />
              </div>
            </div>
          ))}
          {campo('endereco', 'Rua e nº')}
          <div className="grid grid-cols-2 gap-3">
            {campo('bairro', 'Bairro')}
            {campo('cep', 'CEP', { inputMode: 'numeric' })}
          </div>
          {campo('cidade', 'Cidade')}
          {campo('nomePai', 'Nome do pai')}
          {campo('nomeMae', 'Nome da mãe')}

          <p className="text-sm font-black pt-2 border-t border-white/[0.06]">Pagamento</p>
          <div className="grid grid-cols-2 gap-3">
            {campo('valor', 'Valor total *', { type: 'number', inputMode: 'decimal', min: 0, step: '0.01' })}
            {campo('entrada', 'Entrada', { type: 'number', inputMode: 'decimal', min: 0, step: '0.01' })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {FORMAS_PAGAMENTO.map((fp) => (
              <button
                key={fp}
                type="button"
                onClick={() => set('formaPagamento', fp)}
                className={`py-3 rounded-2xl text-xs font-bold border ${f.formaPagamento === fp ? 'border-blue-500/60 bg-blue-500/15 text-blue-300' : 'border-white/[0.08] text-zinc-400'}`}
              >
                {fp}
              </button>
            ))}
          </div>
          {saldo > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {parcelavel ? (
                <div className="space-y-1.5">
                  <label className={labelApp}>Parcelas</label>
                  <select value={f.parcelas} onChange={(e) => set('parcelas', e.target.value)} className={`${inputApp} appearance-none`}>
                    {Array.from({ length: 24 }, (_, i) => String(i + 1)).map((p) => (
                      <option key={p} value={p}>
                        {p}x de {brl(saldo / Number(p))}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div />
              )}
              {campo('primeiroVencimento', 'Vencimento', { type: 'date' })}
            </div>
          )}
          {campo('formaParcelamento', 'Forma de parcelamento (como no papel)')}
          <div className="space-y-1.5">
            <label className={labelApp}>Observação</label>
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className={inputApp} />
          </div>

          {erro && <p className="text-sm font-bold text-red-400">{erro}</p>}
          {!confirmado ? (
            <button onClick={confirmarDados} className={botaoApp}>
              Confirmar dados{dinheiro(f.valor) > 0 ? ` • ${brl(dinheiro(f.valor))}` : ''}
            </button>
          ) : (
            <div className="space-y-3 pt-2 border-t border-white/[0.06]">
              <p className="text-sm font-black text-emerald-400">✓ Dados confirmados</p>
              <p className="text-sm text-zinc-300">
                Entregue o celular ao cliente para assinar. <span className="text-zinc-500">Registra data, hora e local.</span>
              </p>
              {devolvida?.assinatura && !assinatura && <p className="text-xs text-emerald-400">✓ Assinatura anterior guardada (assine de novo só se precisar)</p>}
              <AssinaturaPad onChange={registrarAssinatura} />
            </div>
          )}
        </div>
      )}

      {/* 3. Documento */}
      {etapa === 2 && (
        <div className={`${cardApp} space-y-4`}>
          <p className="text-lg font-black">Documento do cliente</p>
          <p className="text-sm text-zinc-400">RG ou CNH do comprador, frente e verso, com boa luz.</p>
          <FotoUnica rotulo="Frente do documento" arquivo={docFrente} atual={anexosAtuais.docFrente} onChange={setDocFrente} />
          <FotoUnica rotulo="Verso do documento" arquivo={docVerso} atual={anexosAtuais.docVerso} onChange={setDocVerso} />
        </div>
      )}

      {/* 4. Promissória */}
      {etapa === 3 && (
        <div className={`${cardApp} space-y-4`}>
          <p className="text-lg font-black">Promissória (recibo)</p>
          <p className="text-sm text-zinc-400">Foto da nota promissória assinada pelo cliente.</p>
          <FotoUnica rotulo="Promissória" arquivo={recibo} atual={anexosAtuais.recibo} onChange={setRecibo} />
        </div>
      )}

      {/* 5. Enviar */}
      {etapa === 4 && (
        <div className={`${cardApp} space-y-3`}>
          <p className="text-lg font-black">Tudo pronto</p>
          <div className="text-sm space-y-1.5">
            <p>
              <span className="text-zinc-500">Comprador:</span> <strong>{f.responsavel}</strong>
            </p>
            <p>
              <span className="text-zinc-500">Escola • ficha:</span> {escola} • nº {f.numeroFicha}
            </p>
            <p>
              <span className="text-zinc-500">Valor:</span> <strong>{brl(dinheiro(f.valor))}</strong>
              {dinheiro(f.entrada) > 0 && ` (entrada ${brl(dinheiro(f.entrada))})`} • {f.formaPagamento}
              {saldo > 0 && parcelavel && Number(f.parcelas) > 1 ? ` em ${f.parcelas}x` : ''}
            </p>
          </div>
          <ul className="text-sm space-y-1 text-emerald-400">
            <li>✓ Contrato ({fotosContrato.length || anexosAtuais.contrato?.length || 0} página(s))</li>
            <li>✓ Assinatura do cliente</li>
            <li>✓ Documento frente e verso</li>
            <li>✓ Promissória</li>
          </ul>
          <p className="text-xs text-zinc-500">O Financeiro confere e, se faltar algo, devolve para você corrigir aqui no app.</p>
        </div>
      )}

      {erro && etapa !== 1 && <p className="text-sm font-bold text-red-400">{erro}</p>}
      {etapa > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setEtapa(etapa - 1)} className={botaoSecApp}>
            ← Voltar
          </button>
          {etapa < 4 ? (
            <button onClick={() => podeAvancar[etapa] && setEtapa(etapa + 1)} disabled={!podeAvancar[etapa]} className={botaoApp}>
              Confirmar →
            </button>
          ) : (
            <button onClick={enviar} disabled={enviando} className={botaoApp}>
              {enviando ? 'Enviando...' : devolvida ? 'Reenviar' : 'Enviar ao Financeiro'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
