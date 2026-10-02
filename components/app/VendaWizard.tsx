'use client'

// Venda de book no app do vendedor, em etapas (cada uma com confirmação):
//  1. Foto do "Contrato de Compra" → a IA lê e preenche (ou o vendedor preenche à mão) → revisa
//  2. Documento do cliente (frente e verso)
//  3. Ficha de reconhecimento
//  4. Comprovante de residência
//  5. Promissória (recibo)
//  6. Foto do cliente segurando o contrato
//  7. Assinatura do cliente em tela cheia (data, hora e local)
//  8. Envia ao Financeiro (conferência)
// Todas as fotos são obrigatórias.
// Também serve para CORRIGIR uma venda devolvida pelo Financeiro (reenvio).

import { useEffect, useMemo, useState } from 'react'
import { apagarRascunho, lerRascunho, salvarRascunho } from '@/lib/erp/rascunho'
import type { Registro, Valor } from '@/lib/erp/types'
import { botaoApp, botaoSecApp, cardApp, inputApp, labelApp } from './AppShell'
import CapturaPaginas from './CapturaPaginas'
import AssinaturaPad, { entrarTelaCheia } from './AssinaturaPad'
import { enviarPaginasApp, registrarVendaExterna, reenviarVendaExterna } from '@/lib/erp/store'
import { lerContratoVenda } from '@/lib/erp/leitura-contrato'
import { FORMAS_PAGAMENTO, MAX_PARCELAS, type CamposVenda, type Referencia } from '@/lib/erp/contrato-parser'
import { lerJSON } from '@/lib/erp/operacional'
import { addDias, brl, hoje } from '@/lib/erp/format'

const VAZIO: CamposVenda = {
  responsavel: '', cpf: '', rg: '', dataNascimento: '', whatsapp: '', endereco: '', bairro: '', cep: '', cidade: '', nomePai: '', nomeMae: '',
  qtdMaletas: '1', qtdFotos: '', qtdMolduras: '', modelo: '', numeroFicha: '', valor: '', entrada: '', formaParcelamento: '',
  formaPagamento: 'Boleto', parcelas: '1', primeiroVencimento: '',
}
const ETAPAS = ['Contrato', 'Contrato • revisão', 'Documento', 'Ficha de reconhecimento', 'Comprovante de residência', 'Promissória', 'Cliente com o contrato', 'Assinatura', 'Enviar']
// índices das etapas
const E = { contrato: 0, revisao: 1, documento: 2, ficha: 3, comprovante: 4, promissoria: 5, cliente: 6, assinatura: 7, enviar: 8 } as const

interface Anexos {
  contrato?: string[]
  docFrente?: string
  docVerso?: string
  recibo?: string
  ficha?: string
  comprovante?: string
  clienteContrato?: string
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

function ImagemArquivo({ arquivo }: { arquivo: File }) {
  const url = useMemo(() => URL.createObjectURL(arquivo), [arquivo])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Assinatura do cliente" className="w-full h-40 object-contain" />
}

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

// O que vai para o rascunho no celular (IndexedDB guarda as fotos como arquivos)
interface Rascunho {
  etapa: number
  f: CamposVenda
  escola: string
  observacao: string
  refs: Referencia[]
  fotosContrato: File[]
  docFrente: File | null
  docVerso: File | null
  recibo: File | null
  ficha: File | null
  comprovante: File | null
  clienteContrato: File | null
  assinatura: File | null
  assinadoEm: { quando: string; lat: number | null; lng: number | null } | null
  duvidas: string[]
  lidos: string[]
  salvoEm: string
}

export default function VendaWizard({
  escolas,
  devolvida,
  chaveRascunho,
  onConcluida,
  onDescartar,
  onAcao,
}: {
  escolas: [string, string][]
  devolvida?: Registro | null
  chaveRascunho: string
  onConcluida: () => void
  onDescartar: () => void
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
  const [etapa, setEtapa] = useState<number>(devolvida ? E.revisao : E.contrato)
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
  const [ficha, setFicha] = useState<File | null>(null)
  const [comprovante, setComprovante] = useState<File | null>(null)
  const [clienteContrato, setClienteContrato] = useState<File | null>(null)
  const [assinatura, setAssinatura] = useState<File | null>(null)
  const [assinadoEm, setAssinadoEm] = useState<{ quando: string; lat: number | null; lng: number | null } | null>(null)
  const [duvidas, setDuvidas] = useState<Set<string>>(new Set())
  const [lidos, setLidos] = useState<Set<string>>(new Set())
  const [leitura, setLeitura] = useState<{ estado: 'parado' | 'lendo' | 'ok' | 'erro'; msg?: string; progresso?: number }>({ estado: 'parado' })
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [assinando, setAssinando] = useState(false)
  // rascunho no celular: carrega ao abrir e salva a cada mudança (sai do app sem perder nada)
  const [rascunhoPronto, setRascunhoPronto] = useState(false)
  const [retomado, setRetomado] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void lerRascunho<Rascunho>(chaveRascunho).then((r) => {
      if (!vivo) return
      if (r) {
        setEtapa(r.etapa)
        setF(r.f)
        setEscola(r.escola)
        setObservacao(r.observacao)
        setRefs(r.refs)
        setFotosContrato(r.fotosContrato ?? [])
        setDocFrente(r.docFrente)
        setDocVerso(r.docVerso)
        setRecibo(r.recibo)
        setFicha(r.ficha ?? null)
        setComprovante(r.comprovante ?? null)
        setClienteContrato(r.clienteContrato ?? null)
        setAssinatura(r.assinatura)
        setAssinadoEm(r.assinadoEm)
        setDuvidas(new Set(r.duvidas))
        setLidos(new Set(r.lidos))
        if (r.lidos.length) setLeitura({ estado: 'ok' })
        setRetomado(r.salvoEm)
      }
      setRascunhoPronto(true)
    })
    return () => {
      vivo = false
    }
  }, [chaveRascunho])

  useEffect(() => {
    if (!rascunhoPronto) return
    const vazio = !fotosContrato.length && !f.responsavel && !docFrente && !recibo && etapa === (devolvida ? E.revisao : E.contrato)
    const t = setTimeout(() => {
      if (vazio) return
      const r: Rascunho = {
        etapa, f, escola, observacao, refs, fotosContrato, docFrente, docVerso, recibo, ficha, comprovante, clienteContrato, assinatura, assinadoEm,
        duvidas: [...duvidas], lidos: [...lidos], salvoEm: new Date().toISOString(),
      }
      void salvarRascunho(chaveRascunho, r)
    }, 400)
    return () => clearTimeout(t)
  }, [rascunhoPronto, chaveRascunho, devolvida, etapa, f, escola, observacao, refs, fotosContrato, docFrente, docVerso, recibo, ficha, comprovante, clienteContrato, assinatura, assinadoEm, duvidas, lidos])

  const descartar = async () => {
    await apagarRascunho(chaveRascunho)
    onDescartar()
  }

  const set = (k: keyof CamposVenda, v: string) => {
    setF((x) => ({ ...x, [k]: v }))
    if (duvidas.has(k)) setDuvidas((d) => new Set([...d].filter((x) => x !== k)))
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
    setErro('')
    onAcao('Contrato de venda lido')
    setEtapa(E.revisao)
  }

  // ---------- revisão: confere os dados antes de seguir ----------
  const validarDados = () => {
    if (!fotosContrato.length && !anexosAtuais.contrato?.length) return 'Volte à etapa 1 e fotografe o contrato (obrigatório, mesmo preenchendo à mão).'
    if (!escola.trim()) return 'Escolha a escola.'
    if (!f.numeroFicha.trim()) return 'Informe o nº da ficha.'
    if (!f.responsavel.trim()) return 'Informe o nome do comprador.'
    if (!f.whatsapp.trim()) return 'Informe o WhatsApp do comprador.'
    if (!(dinheiro(f.valor) > 0)) return 'Informe o valor total da compra.'
    if (dinheiro(f.entrada) > dinheiro(f.valor)) return 'A entrada não pode ser maior que o valor total.'
    if (saldo > 0 && f.formaPagamento === 'Boleto' && !f.primeiroVencimento) return 'Informe a data de vencimento.'
    return ''
  }
  const registrarAssinatura = (arq: File | null) => {
    setAssinatura(arq)
    if (!arq) return setAssinadoEm(null)
    const quando = new Date().toISOString()
    setAssinadoEm((a) => ({ quando, lat: a?.lat ?? null, lng: a?.lng ?? null }))
    void posicaoAtual().then((pos) => pos && setAssinadoEm({ quando, lat: pos.lat, lng: pos.lng }))
  }

  // ---------- 8. enviar ----------
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
      const [fic] = ficha ? await subir([ficha]) : [anexosAtuais.ficha ?? '']
      const [comp] = comprovante ? await subir([comprovante]) : [anexosAtuais.comprovante ?? '']
      const [cli] = clienteContrato ? await subir([clienteContrato]) : [anexosAtuais.clienteContrato ?? '']
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
        parcelas: parcelavel ? Math.min(MAX_PARCELAS, Math.max(1, n(f.parcelas))) : 1,
        primeiroVencimento: saldo > 0 ? f.primeiroVencimento : '',
        formaParcelamento: f.formaParcelamento.trim(),
        observacao: observacao.trim(),
        anexos: JSON.stringify({ contrato, docFrente: frente, docVerso: verso, recibo: rec, ficha: fic, comprovante: comp, clienteContrato: cli }),
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
      await apagarRascunho(chaveRascunho)
      onConcluida()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  const podeAvancar: Record<number, boolean> = {
    [E.revisao]: true, // confere os campos ao tocar em Confirmar
    [E.documento]: (!!docFrente || !!anexosAtuais.docFrente) && (!!docVerso || !!anexosAtuais.docVerso),
    [E.ficha]: !!ficha || !!anexosAtuais.ficha,
    [E.comprovante]: !!comprovante || !!anexosAtuais.comprovante,
    [E.promissoria]: !!recibo || !!anexosAtuais.recibo,
    [E.cliente]: !!clienteContrato || !!anexosAtuais.clienteContrato,
    [E.assinatura]: !!assinatura || !!devolvida?.assinatura,
  }
  const avancar = () => {
    if (etapa === E.revisao) {
      const e = validarDados()
      if (e) return setErro(e)
    }
    if (!podeAvancar[etapa]) return
    setErro('')
    setEtapa(etapa + 1)
  }

  const campo = (k: keyof CamposVenda, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <label className={`${labelApp} flex items-center gap-2`}>
        {rotulo}
        {duvidas.has(k) ? (
          <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-[9px] font-black">CONFIRA</span>
        ) : lidos.has(k) ? (
          <span className="px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-300 text-[9px] font-black">LIDO</span>
        ) : null}
      </label>
      <input value={f[k]} onChange={(e) => set(k, e.target.value)} className={`${inputApp} ${duvidas.has(k) ? '!border-yellow-500/70' : ''}`} {...extra} />
    </div>
  )

  return (
    <div className="space-y-4">
      {retomado && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 text-sm flex items-center justify-between gap-3">
          <span className="text-blue-200">↺ Venda retomada de onde você parou.</span>
          <button type="button" onClick={descartar} className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-red-400">
            Descartar e começar de novo
          </button>
        </div>
      )}
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
            className={`flex-1 h-1.5 rounded-full ${i < etapa ? 'bg-zinc-400' : i === etapa ? 'bg-blue-500' : 'bg-white/[0.08]'}`}
            aria-label={`Etapa ${i + 1}: ${e}`}
          />
        ))}
      </div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
        Etapa {Math.max(1, etapa)} de {ETAPAS.length - 1} • <span className="text-white">{ETAPAS[etapa]}</span>
      </p>

      {/* 1. Contrato */}
      {etapa === E.contrato && (
        <div className={`${cardApp} space-y-4`}>
          <p className="text-lg font-black">Foto do contrato de compra</p>
          <p className="text-sm text-zinc-400">Fotografe o contrato preenchido. O sistema lê e preenche a venda, ou preencha você mesmo.</p>
          <CapturaPaginas paginas={fotosContrato} onChange={setFotosContrato} />
          {leitura.estado === 'lendo' && (
            <p className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
              Lendo o contrato... {leitura.progresso && leitura.progresso > 0.2 ? `${Math.round(leitura.progresso * 100)}%` : ''}
            </p>
          )}
          {leitura.estado === 'erro' && <p className="text-sm font-bold text-red-400">{leitura.msg}</p>}
          <button onClick={ler} disabled={!fotosContrato.length || leitura.estado === 'lendo'} className={botaoApp}>
            {leitura.estado === 'lendo' ? 'Lendo...' : 'Ler contrato e continuar'}
          </button>
          {leitura.estado !== 'lendo' && (
            <button onClick={() => (setErro(''), setEtapa(E.revisao))} className={botaoSecApp}>
              ✎ Preencher à mão
            </button>
          )}
          {!fotosContrato.length && !anexosAtuais.contrato?.length && <p className="text-[11px] text-zinc-500 text-center">A foto do contrato é obrigatória para enviar, mesmo preenchendo à mão.</p>}
        </div>
      )}

      {/* 1b. Revisão */}
      {etapa === E.revisao && (
        <div className={`${cardApp} space-y-4`}>
          <p className="text-lg font-black">Revise os dados</p>
          {leitura.estado !== 'ok' && <p className="text-xs text-zinc-400">Preencha com os dados do contrato de papel.</p>}
          {leitura.estado === 'ok' && (
            <p className="text-xs text-zinc-400">
              Preenchido pela leitura (<span className="text-zinc-200 font-bold">LIDO</span>).{' '}
              {duvidas.size > 0 && <span className="text-yellow-400 font-bold">{duvidas.size} campo(s) em amarelo: confira com o papel.</span>}
              {leitura.msg && <span className="block text-yellow-400 mt-1">{leitura.msg}</span>}
            </p>
          )}
          <div className="space-y-1.5">
            <label className={labelApp}>Escola *</label>
            <select value={escola} onChange={(e) => setEscola(e.target.value)} className={`${inputApp} appearance-none`}>
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
                  <label className={labelApp}>Parcelas{n(f.entrada) > 0 ? ' (além da entrada)' : ''}</label>
                  <select value={f.parcelas} onChange={(e) => set('parcelas', e.target.value)} className={`${inputApp} appearance-none`}>
                    {Array.from({ length: MAX_PARCELAS }, (_, i) => String(i + 1)).map((p) => (
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

        </div>
      )}

      {/* 2. Documento */}
      {etapa === E.documento && (
        <div className={`${cardApp} space-y-4`}>
          <p className="text-lg font-black">Documento do cliente</p>
          <p className="text-sm text-zinc-400">RG ou CNH do comprador, frente e verso, com boa luz.</p>
          <FotoUnica rotulo="Frente do documento" arquivo={docFrente} atual={anexosAtuais.docFrente} onChange={setDocFrente} />
          <FotoUnica rotulo="Verso do documento" arquivo={docVerso} atual={anexosAtuais.docVerso} onChange={setDocVerso} />
        </div>
      )}

      {/* 3. Ficha de reconhecimento */}
      {etapa === E.ficha && (
        <div className={`${cardApp} space-y-4`}>
          <p className="text-lg font-black">Ficha de reconhecimento</p>
          <p className="text-sm text-zinc-400">Foto da ficha de reconhecimento, inteira e legível.</p>
          <FotoUnica rotulo="Ficha de reconhecimento" arquivo={ficha} atual={anexosAtuais.ficha} onChange={setFicha} />
        </div>
      )}

      {/* 4. Comprovante de residência */}
      {etapa === E.comprovante && (
        <div className={`${cardApp} space-y-4`}>
          <p className="text-lg font-black">Comprovante de residência</p>
          <p className="text-sm text-zinc-400">Conta de luz, água, telefone ou similar, com o endereço visível.</p>
          <FotoUnica rotulo="Comprovante de residência" arquivo={comprovante} atual={anexosAtuais.comprovante} onChange={setComprovante} />
        </div>
      )}

      {/* 5. Promissória */}
      {etapa === E.promissoria && (
        <div className={`${cardApp} space-y-4`}>
          <p className="text-lg font-black">Promissória (recibo)</p>
          <p className="text-sm text-zinc-400">Foto da nota promissória assinada pelo cliente.</p>
          <FotoUnica rotulo="Promissória" arquivo={recibo} atual={anexosAtuais.recibo} onChange={setRecibo} />
        </div>
      )}

      {/* 6. Cliente segurando o contrato */}
      {etapa === E.cliente && (
        <div className={`${cardApp} space-y-4`}>
          <p className="text-lg font-black">Cliente com o contrato</p>
          <p className="text-sm text-zinc-400">Foto do cliente segurando o contrato, com o rosto visível.</p>
          <FotoUnica rotulo="Cliente com o contrato" arquivo={clienteContrato} atual={anexosAtuais.clienteContrato} onChange={setClienteContrato} />
        </div>
      )}

      {/* 7. Assinatura em tela cheia */}
      {etapa === E.assinatura && (
        <div className={`${cardApp} space-y-4`}>
          <p className="text-lg font-black">Assinatura do cliente</p>
          <p className="text-sm text-zinc-400">
            Entregue o celular ao cliente. A tela inteira vira o quadro de assinatura: vire o celular deitado. <span className="text-zinc-500">Registra data, hora e local.</span>
          </p>
          {devolvida?.assinatura && !assinatura && <p className="text-xs text-emerald-400">✓ Assinatura anterior guardada (assine de novo só se precisar)</p>}
          {assinatura && (
            <div className="rounded-2xl overflow-hidden border border-white/[0.2] bg-white">
              <ImagemArquivo arquivo={assinatura} />
            </div>
          )}
          <button type="button" onClick={() => (entrarTelaCheia(), setAssinando(true))} className={assinatura ? botaoSecApp : botaoApp}>
            {assinatura ? '↺ Assinar de novo' : '✍ Abrir assinatura em tela cheia'}
          </button>
        </div>
      )}
      {assinando && <AssinaturaPad nome={f.responsavel.trim()} onConcluir={(a) => (registrarAssinatura(a), setAssinando(false))} onCancelar={() => setAssinando(false)} />}

      {/* 8. Enviar */}
      {etapa === E.enviar && (
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
            <li>✓ Documento frente e verso</li>
            <li>✓ Ficha de reconhecimento</li>
            <li>✓ Comprovante de residência</li>
            <li>✓ Promissória</li>
            <li>✓ Cliente com o contrato</li>
            <li>✓ Assinatura do cliente</li>
          </ul>
          <p className="text-xs text-zinc-500">O Financeiro confere e, se faltar algo, devolve para você corrigir aqui no app.</p>
        </div>
      )}

      {erro && <p className="text-sm font-bold text-red-400">{erro}</p>}
      {etapa > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setEtapa(etapa - 1)} className={botaoSecApp}>
            ← Voltar
          </button>
          {etapa < E.enviar ? (
            <button onClick={avancar} disabled={!podeAvancar[etapa]} className={botaoApp}>
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
