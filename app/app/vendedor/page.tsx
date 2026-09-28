'use client'

// App do Vendedor Externo (celular). Dois tipos, cadastrados pelo ADM:
//  • Vendedor de CONTRATO: fotografa o contrato da escola → Operações › Contratos (Em conferência)
//  • Vendedor de BOOKS: registra as vendas aos pais, envia documentos e informa os books devolvidos
// A localização é obrigatória e registrada só para monitoramento (o vendedor não vê mapa nem rota).

import { useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import AppShell, { botaoApp, cardApp, inputApp, labelApp } from '@/components/app/AppShell'
import CapturaPaginas from '@/components/app/CapturaPaginas'
import VendaWizard from '@/components/app/VendaWizard'
import { useGps } from '@/components/app/useGps'
import {
  aceitarMonitoramentoGps,
  enviarContratoApp,
  enviarDocumentoApp,
  enviarPaginasApp,
  meuVendedorExterno,
  registrarDevolucaoBooks,
  useErp,
  useUsuario,
} from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { brl, dataBR, hoje, mesAtual, num } from '@/lib/erp/format'

type ErpState = ReturnType<typeof useErp>

const TIPOS_DOC = ['Contrato de venda', 'Comprovante', 'Outro'] as const

export default function AppVendedorPage() {
  const s = useErp()
  const usuario = useUsuario()
  const vend = meuVendedorExterno(s, usuario?.id)
  const [aceitouAgora, setAceitouAgora] = useState(false)
  const aceitou = !!vend?.gpsAceiteEm || aceitouAgora
  const gps = useGps(!!vend && aceitou)
  const livros = vend?.tipo === 'Books'
  const [aba, setAba] = useState('inicio')
  // venda: nova (a chave reinicia o assistente) ou correção de uma devolvida pelo Financeiro
  const [corrigir, setCorrigir] = useState<Registro | null>(null)
  const [vendaOk, setVendaOk] = useState(false)
  const [novaVenda, setNovaVenda] = useState(0)

  const nav = livros
    ? [
        { id: 'inicio', label: 'Início', icone: '🏠' },
        { id: 'venda', label: 'Venda', icone: '💰' },
        { id: 'documento', label: 'Documento', icone: '📄' },
        { id: 'devolucao', label: 'Devolução', icone: '↩️' },
      ]
    : [
        { id: 'inicio', label: 'Início', icone: '🏠' },
        { id: 'contrato', label: 'Contrato', icone: '📷' },
        { id: 'escolas', label: 'Escolas', icone: '🏫' },
      ]

  const titulo = usuario ? `Olá, ${usuario.nome.split(' ')[0]}` : 'Vendedor'
  const subtitulo = livros ? 'Vendedor de books' : 'Vendedor de contrato'

  // login sem cadastro PJ ligado (ex.: ADM abrindo o app para conferir)
  if (!vend) {
    return (
      <AppShell setor="externo" titulo="App do Vendedor" subtitulo="Pré-visualização">
        <div className={`${cardApp} text-sm text-zinc-300 leading-relaxed`}>
          Este app é usado pelos vendedores externos. O acesso de cada um é criado em <strong className="text-white">ADM › Vendedores externos</strong>.
        </div>
      </AppShell>
    )
  }

  // aviso de monitoramento (LGPD) na primeira vez
  if (!aceitou) {
    return (
      <AppShell setor="externo" titulo={titulo} subtitulo={subtitulo}>
        <div className={`${cardApp} space-y-4`}>
          <p className="text-3xl" aria-hidden="true">📍</p>
          <p className="text-lg font-black">Localização durante o trabalho</p>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Enquanto este app estiver aberto, a DLG Photos registra a sua localização para acompanhar as rotas de trabalho e dar suporte em campo. Os dados são usados só pela empresa, ficam guardados por 90 dias e não aparecem para outras pessoas.
          </p>
          <p className="text-sm text-zinc-400">Para usar o app é preciso permitir a localização quando o celular perguntar.</p>
          <button
            onClick={async () => {
              await aceitarMonitoramentoGps()
              setAceitouAgora(true)
            }}
            className={botaoApp}
          >
            Concordo e continuar
          </button>
        </div>
      </AppShell>
    )
  }

  if (gps.estado !== 'ativo') {
    return (
      <AppShell setor="externo" titulo={titulo} subtitulo={subtitulo}>
        {gps.estado === 'verificando' || gps.estado === 'pedindo' ? (
          <div className={`${cardApp} text-center space-y-3 py-10`}>
            <span className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
            <p className="text-sm font-bold">Ativando a localização...</p>
            <p className="text-xs text-zinc-500">Se o celular perguntar, toque em Permitir.</p>
          </div>
        ) : (
          <div className={`${cardApp} space-y-4`}>
            <p className="text-3xl" aria-hidden="true">⚠️</p>
            <p className="text-lg font-black">{gps.estado === 'negado' ? 'Localização bloqueada' : 'Não consegui ler a localização'}</p>
            <p className="text-sm text-zinc-300 leading-relaxed">O app só funciona com a localização ligada. Para liberar:</p>
            <ul className="text-sm text-zinc-300 space-y-2 list-disc pl-5">
              <li>Ligue a <strong className="text-white">Localização / GPS</strong> do celular.</li>
              <li>
                <strong className="text-white">Android (Chrome):</strong> toque no cadeado ao lado do endereço → Permissões → Localização → Permitir.
              </li>
              <li>
                <strong className="text-white">iPhone:</strong> Ajustes → Privacidade → Serviços de Localização → Safari → Durante o uso.
              </li>
            </ul>
            <button onClick={gps.tentarDeNovo} className={botaoApp}>
              Tentar de novo
            </button>
          </div>
        )}
      </AppShell>
    )
  }

  const irPara = (id: string) => {
    if (id === 'venda' && aba !== 'venda') {
      setCorrigir(null)
      setVendaOk(false)
      setNovaVenda((k) => k + 1)
    }
    setAba(id)
  }

  return (
    <AppShell setor="externo" titulo={titulo} subtitulo={subtitulo} nav={nav} ativa={aba} onNav={irPara}>
      {aba === 'inicio' &&
        (livros ? (
          <InicioBooks
            s={s}
            vend={vend}
            onCorrigir={(v) => {
              setCorrigir(v)
              setVendaOk(false)
              setAba('venda')
            }}
          />
        ) : (
          <InicioContrato s={s} vend={vend} onEnviar={() => setAba('contrato')} />
        ))}
      {aba === 'contrato' && <EnviarContrato onEnviado={(escola) => gps.registrarAcao(`Contrato enviado: ${escola}`)} />}
      {aba === 'escolas' && <MinhasEscolas s={s} vend={vend} />}
      {aba === 'venda' &&
        (vendaOk ? (
          <Sucesso
            titulo="Venda enviada!"
            texto="O Financeiro vai conferir o contrato, a assinatura, o documento e a promissória. Se faltar algo, a venda volta para você corrigir."
            rotulo="Registrar outra venda"
            onNovo={() => {
              setVendaOk(false)
              setCorrigir(null)
              setNovaVenda((k) => k + 1)
            }}
          />
        ) : (
          <VendaWizard
            key={corrigir ? `c-${corrigir.id}` : `n-${novaVenda}`}
            escolas={escolasFotografadas(s)}
            devolvida={corrigir}
            onAcao={gps.registrarAcao}
            onConcluida={() => {
              setVendaOk(true)
              setCorrigir(null)
            }}
          />
        ))}
      {aba === 'documento' && <EnviarDocumento s={s} onEnviado={(tipo) => gps.registrarAcao(`Documento enviado: ${tipo}`)} />}
      {aba === 'devolucao' && <Devolucao s={s} vend={vend} onRegistrada={(escola) => gps.registrarAcao(`Devolução: ${escola}`)} />}
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Escolas já fotografadas (o vendedor de books escolhe onde vendeu)
function escolasFotografadas(s: ErpState) {
  const mapa = new Map<string, string>()
  for (const v of colecao(s, 'agenda_visitas')) {
    if (v.status === 'Fotografada' || v.status === 'Fechamento enviado') mapa.set(String(v.escola), `${v.cidade}-${v.uf}`)
  }
  return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

function Kpi({ rotulo, valor, detalhe }: { rotulo: string; valor: string | number; detalhe?: string }) {
  return (
    <div className="bg-black/40 border border-white/[0.05] rounded-2xl p-4">
      <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{rotulo}</p>
      <p className="text-2xl font-black mt-1">{valor}</p>
      {detalhe && <p className="text-[10px] text-zinc-500 mt-0.5">{detalhe}</p>}
    </div>
  )
}

function Sucesso({ titulo, texto, onNovo, rotulo }: { titulo: string; texto: string; onNovo: () => void; rotulo: string }) {
  return (
    <div className={`${cardApp} text-center space-y-4 py-8`}>
      <p className="text-5xl" aria-hidden="true">✅</p>
      <p className="text-xl font-black">{titulo}</p>
      <p className="text-sm text-zinc-400">{texto}</p>
      <button onClick={onNovo} className={botaoApp}>
        {rotulo}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// VENDEDOR DE CONTRATO
function InicioContrato({ s, vend, onEnviar }: { s: ErpState; vend: Registro; onEnviar: () => void }) {
  const mes = mesAtual()
  const meus = colecao(s, 'contratos_escola').filter((c) => c.vendedorId === vend.id)
  const doMes = meus.filter((c) => String(c.criadoEm).startsWith(mes))
  const visitas = colecao(s, 'agenda_visitas').filter((v) => v.vendedorId === vend.id)
  const fotografadasMes = visitas.filter((v) => v.status !== 'Agendada' && v.status !== 'Cancelada' && String(v.data).startsWith(mes))
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Kpi rotulo="Contratos no mês" valor={doMes.length} detalhe="enviados por você" />
        <Kpi rotulo="Em conferência" valor={meus.filter((c) => c.status === 'Em conferência').length} detalhe="Operações conferindo" />
        <Kpi rotulo="Na agenda" valor={meus.filter((c) => c.status === 'Na agenda').length} detalhe="já confirmados" />
        <Kpi rotulo="Fichas fotografadas" valor={num(fotografadasMes.reduce((a, v) => a + Number(v.fichasFotografadas || 0), 0))} detalhe="suas escolas no mês" />
      </div>
      <button onClick={onEnviar} className={botaoApp}>
        📷 Enviar contrato de escola
      </button>
    </>
  )
}

function EnviarContrato({ onEnviado }: { onEnviado: (escola: string) => void }) {
  const [paginas, setPaginas] = useState<File[]>([])
  const [escola, setEscola] = useState('')
  const [cidade, setCidade] = useState('')
  const [observacao, setObservacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)

  if (ok) {
    return (
      <Sucesso
        titulo="Contrato enviado!"
        texto="Operações vai conferir os dados e confirmar a data com a diretora. Você acompanha em Escolas."
        rotulo="Enviar outro contrato"
        onNovo={() => {
          setOk(false)
          setPaginas([])
          setEscola('')
          setCidade('')
          setObservacao('')
        }}
      />
    )
  }

  const enviar = async () => {
    if (!paginas.length) return setErro('Fotografe o contrato.')
    if (!escola.trim()) return setErro('Informe o nome da escola.')
    setErro('')
    setEnviando(true)
    const r = await enviarPaginasApp(paginas)
    if ('erro' in r) {
      setEnviando(false)
      return setErro(r.erro)
    }
    const falha = await enviarContratoApp({ escola, cidade, observacao }, r.caminhos)
    setEnviando(false)
    if (falha) return setErro(falha)
    onEnviado(escola.trim().toUpperCase())
    setOk(true)
  }

  return (
    <div className={`${cardApp} space-y-4`}>
      <p className="text-lg font-black">Contrato da escola</p>
      <CapturaPaginas paginas={paginas} onChange={setPaginas} />
      <div className="space-y-2">
        <label className={labelApp}>Nome da escola *</label>
        <input value={escola} onChange={(e) => setEscola(e.target.value)} placeholder="Como está no contrato" className={inputApp} />
      </div>
      <div className="space-y-2">
        <label className={labelApp}>Cidade</label>
        <input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex.: Itaporanga-SP" className={inputApp} />
      </div>
      <div className="space-y-2">
        <label className={labelApp}>Observação</label>
        <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} placeholder="Algo que Operações precisa saber" className={inputApp} />
      </div>
      {erro && <p className="text-sm font-bold text-red-400">{erro}</p>}
      <button onClick={enviar} disabled={enviando} className={botaoApp}>
        {enviando ? 'Enviando...' : 'Enviar para Operações'}
      </button>
    </div>
  )
}

function MinhasEscolas({ s, vend }: { s: ErpState; vend: Registro }) {
  const contratos = colecao(s, 'contratos_escola')
    .filter((c) => c.vendedorId === vend.id)
    .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))
  const visitas = colecao(s, 'agenda_visitas')
  if (!contratos.length) return <div className={`${cardApp} text-sm text-zinc-400`}>Nenhum contrato enviado ainda.</div>
  return (
    <div className="space-y-3">
      {contratos.map((c) => {
        const v = visitas.filter((x) => x.contratoId === c.id && x.status !== 'Cancelada').sort((a, b) => String(b.data).localeCompare(String(a.data)))[0]
        const etapa =
          c.status === 'Cancelado'
            ? { texto: 'Cancelado', cor: 'text-red-400' }
            : c.status === 'Em conferência'
              ? { texto: 'Em conferência', cor: 'text-orange-400' }
              : v && v.status !== 'Agendada'
                ? { texto: `Fotografada • ${num(Number(v.fichasFotografadas || 0))} fichas`, cor: 'text-emerald-400' }
                : { texto: `Agendada • ${dataBR(String(v?.data || c.dataPrevista || ''))}`, cor: 'text-blue-400' }
        return (
          <div key={c.id} className={`${cardApp} py-4`}>
            <p className="text-sm font-black">{String(c.escola)}</p>
            <p className="text-xs text-zinc-500">{[c.cidade, c.uf].filter(Boolean).join('-') || '—'} • enviado em {dataBR(String(c.criadoEm).slice(0, 10))}</p>
            <p className={`text-xs font-bold uppercase tracking-wider mt-2 ${etapa.cor}`}>● {etapa.texto}</p>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// VENDEDOR DE BOOKS
const SITUACAO_VENDA: Record<string, { texto: string; cor: string }> = {
  'Aguardando conferência': { texto: 'No Financeiro', cor: 'text-orange-400' },
  Conferida: { texto: 'Conferida', cor: 'text-emerald-400' },
  Devolvida: { texto: 'Devolvida', cor: 'text-red-400' },
}

function InicioBooks({ s, vend, onCorrigir }: { s: ErpState; vend: Registro; onCorrigir: (v: Registro) => void }) {
  const mes = mesAtual()
  const devolvidas = colecao(s, 'vendas_ebooks').filter((v) => v.vendedorExternoId === vend.id && v.conferencia === 'Devolvida')
  const vendas = colecao(s, 'vendas_ebooks')
    .filter((v) => v.vendedorExternoId === vend.id)
    .sort((a, b) => `${b.data}${b.criadoEm}`.localeCompare(`${a.data}${a.criadoEm}`))
  const doMes = vendas.filter((v) => String(v.data).startsWith(mes))
  const valorMes = doMes.reduce((a, v) => a + Number(v.valor || 0), 0)
  const hojeV = vendas.filter((v) => v.data === hoje())
  const devolvidos = colecao(s, 'devolucoes_books')
    .filter((d) => d.vendedorId === vend.id && String(d.data).startsWith(mes))
    .reduce((a, d) => a + Number(d.quantidade || 0), 0)
  return (
    <>
      {devolvidas.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-3xl p-4 space-y-3">
          <p className="text-sm font-black text-red-400">⚠ {devolvidas.length} venda(s) devolvida(s) pelo Financeiro</p>
          {devolvidas.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{String(v.responsavel)}</p>
                <p className="text-[11px] text-zinc-300">{String(v.conferenciaMotivo || 'Revise e reenvie')}</p>
              </div>
              <button onClick={() => onCorrigir(v)} className="shrink-0 px-4 py-2.5 rounded-xl bg-red-500/20 text-red-300 text-xs font-black uppercase tracking-widest">
                Corrigir
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Kpi rotulo="Vendas hoje" valor={hojeV.length} detalhe={brl(hojeV.reduce((a, v) => a + Number(v.valor || 0), 0))} />
        <Kpi rotulo="Vendas no mês" valor={doMes.length} detalhe={brl(valorMes)} />
        <Kpi rotulo="Books vendidos (mês)" valor={num(doMes.reduce((a, v) => a + Number(v.quantidade || 1), 0))} />
        <Kpi rotulo="Devolvidos (mês)" valor={num(devolvidos)} detalhe="voltaram para a empresa" />
      </div>
      <div className={`${cardApp} space-y-3`}>
        <p className="text-sm font-black">Últimas vendas</p>
        {vendas.length === 0 && <p className="text-sm text-zinc-500">Nenhuma venda registrada ainda.</p>}
        {vendas.slice(0, 8).map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-3 border-b border-white/[0.04] pb-2 last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{String(v.responsavel)}</p>
              <p className="text-[11px] text-zinc-500 truncate">
                {v.numeroFicha ? `Ficha ${String(v.numeroFicha)}` : String(v.aluno || '')} • {String(v.escola)} • {dataBR(String(v.data))}
              </p>
              {SITUACAO_VENDA[String(v.conferencia)] && (
                <p className={`text-[10px] font-black uppercase tracking-wider ${SITUACAO_VENDA[String(v.conferencia)].cor}`}>● {SITUACAO_VENDA[String(v.conferencia)].texto}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-black">{brl(Number(v.valor || 0))}</p>
              <p className="text-[10px] text-zinc-500">
                {String(v.formaPagamento)}
                {Number(v.parcelas) > 1 ? ` • ${String(v.parcelas)}x` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function SeletorEscola({ s, valor, onChange }: { s: ErpState; valor: string; onChange: (v: string) => void }) {
  const escolas = escolasFotografadas(s)
  const [outra, setOutra] = useState(!!valor && !escolas.some(([e]) => e === valor))
  return (
    <div className="space-y-2">
      <label className={labelApp}>Escola *</label>
      {outra ? (
        <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder="Nome da escola" className={inputApp} />
      ) : (
        <select value={valor} onChange={(e) => (e.target.value === '__outra__' ? (setOutra(true), onChange('')) : onChange(e.target.value))} className={`${inputApp} appearance-none`}>
          <option value="">Selecione a escola</option>
          {escolas.map(([e, local]) => (
            <option key={e} value={e}>
              {e} ({local})
            </option>
          ))}
          <option value="__outra__">Outra escola (digitar)</option>
        </select>
      )}
    </div>
  )
}

function EnviarDocumento({ s, onEnviado }: { s: ErpState; onEnviado: (tipo: string) => void }) {
  const [tipo, setTipo] = useState<string>(TIPOS_DOC[0])
  const [escola, setEscola] = useState('')
  const [descricao, setDescricao] = useState('')
  const [paginas, setPaginas] = useState<File[]>([])
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk] = useState(false)

  if (ok) {
    return (
      <Sucesso
        titulo="Documento enviado!"
        texto="Operações já recebeu as fotos."
        rotulo="Enviar outro documento"
        onNovo={() => {
          setOk(false)
          setPaginas([])
          setDescricao('')
        }}
      />
    )
  }

  const enviar = async () => {
    if (!paginas.length) return setErro('Fotografe o documento.')
    setErro('')
    setEnviando(true)
    const r = await enviarPaginasApp(paginas)
    if ('erro' in r) {
      setEnviando(false)
      return setErro(r.erro)
    }
    const falha = await enviarDocumentoApp({ tipo, escola: escola.trim(), descricao: descricao.trim() }, r.caminhos)
    setEnviando(false)
    if (falha) return setErro(falha)
    onEnviado(tipo)
    setOk(true)
  }

  return (
    <div className={`${cardApp} space-y-4`}>
      <p className="text-lg font-black">Enviar documento</p>
      <div className="grid grid-cols-3 gap-2">
        {TIPOS_DOC.map((t) => (
          <button key={t} type="button" onClick={() => setTipo(t)} className={`py-3 rounded-2xl text-[11px] font-bold border ${tipo === t ? 'border-blue-500/60 bg-blue-500/15 text-blue-300' : 'border-white/[0.08] text-zinc-400'}`}>
            {t}
          </button>
        ))}
      </div>
      <CapturaPaginas paginas={paginas} onChange={setPaginas} />
      <SeletorEscola s={s} valor={escola} onChange={setEscola} />
      <div className="space-y-2">
        <label className={labelApp}>Descrição</label>
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: comprovante do PIX da venda da Ana" className={inputApp} />
      </div>
      {erro && <p className="text-sm font-bold text-red-400">{erro}</p>}
      <button onClick={enviar} disabled={enviando} className={botaoApp}>
        {enviando ? 'Enviando...' : 'Enviar para Operações'}
      </button>
    </div>
  )
}

function Devolucao({ s, vend, onRegistrada }: { s: ErpState; vend: Registro; onRegistrada: (escola: string) => void }) {
  const [escola, setEscola] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const historico = colecao(s, 'devolucoes_books')
    .filter((d) => d.vendedorId === vend.id)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))
    .slice(0, 6)

  const salvar = async () => {
    if (!escola.trim()) return setErro('Escolha a escola.')
    if (!(Number(quantidade) > 0)) return setErro('Informe quantos books voltaram.')
    setErro('')
    setEnviando(true)
    const falha = await registrarDevolucaoBooks({ escola: escola.trim(), quantidade: Math.round(Number(quantidade)), observacao: observacao.trim() })
    setEnviando(false)
    if (falha) return setErro(falha)
    onRegistrada(escola.trim())
    setQuantidade('')
    setObservacao('')
  }

  return (
    <>
      <div className={`${cardApp} space-y-4`}>
        <p className="text-lg font-black">Books devolvidos</p>
        <p className="text-sm text-zinc-400">Books que não foram vendidos e voltam para a empresa (seguem para as vendas internas).</p>
        <SeletorEscola s={s} valor={escola} onChange={setEscola} />
        <div className="space-y-2">
          <label className={labelApp}>Quantidade *</label>
          <input type="number" inputMode="numeric" min={1} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className={inputApp} />
        </div>
        <div className="space-y-2">
          <label className={labelApp}>Observação</label>
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: pais não estavam em casa" className={inputApp} />
        </div>
        {erro && <p className="text-sm font-bold text-red-400">{erro}</p>}
        <button onClick={salvar} disabled={enviando} className={botaoApp}>
          {enviando ? 'Salvando...' : 'Registrar devolução'}
        </button>
      </div>
      {historico.length > 0 && (
        <div className={`${cardApp} space-y-2`}>
          <p className={labelApp}>Últimas devoluções</p>
          {historico.map((d) => (
            <p key={d.id} className="text-sm">
              <strong>{num(Number(d.quantidade))} books</strong> <span className="text-zinc-500">• {String(d.escola)} • {dataBR(String(d.data))}</span>
            </p>
          ))}
        </div>
      )}
    </>
  )
}
