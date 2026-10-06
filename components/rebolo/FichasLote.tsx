'use client'

// Cadastro das fichas do pacote DE UMA VEZ (pedido de 06/10/2026): ao criar o pacote Padrão já aparecem os 10 álbuns.
//  • cada álbum tem a SUA data da visita, e com ela a faixa e o preço (tabela por tempo desde a visita);
//  • sem escola no cadastro (não é necessária): a ficha grava "—" e as telas não mostram;
//  • cada álbum: data da visita, nº da ficha, aluno, cidade/UF, fotos e WhatsApp 1–3;
//    "+ endereço, pais e outros dados" abre o resto;
//  • "Salvar fichas" grava os álbuns preenchidos e pula os vazios; álbum incompleto ou repetido fica em vermelho
//    com o motivo, e os outros são gravados. WhatsApp sem DDD ganha o DDD da cidade/UF do álbum.

import { useState } from 'react'
import type { Registro, Valor } from '@/lib/erp/types'
import { brl } from '@/lib/erp/format'
import { salvarFichasRebolo } from '@/lib/erp/store'
import { buscarCep, faixaDaFicha, formatarCep, formatarTelefone, FORMAS_REBOLO, mesesDesde, SEM_ESCOLA, soDigitos, sugerirDDD, UFS } from '@/lib/erp/rebolo'
import { btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import { QuadroFaixa, useRebolo } from './comum'

const CAMPOS = [
  'dataVisita', 'numeroFicha', 'aluno', 'serie', 'dataNascimento', 'qtdFotos', 'cep', 'rua', 'numero', 'apto', 'fazenda', 'proprietarioFazenda',
  'bairro', 'cidade', 'uf', 'pontoReferencia', 'whatsapp1', 'whatsapp2', 'whatsapp3', 'telefone', 'nomePai', 'nomeMae', 'horario', 'observacao',
] as const
type Campo = (typeof CAMPOS)[number]
type Album = Record<Campo, string>
const TELEFONES = ['whatsapp1', 'whatsapp2', 'whatsapp3', 'telefone'] as const

const novoAlbum = (): Album => ({ ...(Object.fromEntries(CAMPOS.map((c) => [c, ''])) as Album), qtdFotos: '26' })
const vazio = (a: Album) => !a.numeroFicha.trim() && !a.aluno.trim() && !a.dataVisita && TELEFONES.every((t) => !soDigitos(a[t]))
const chaveFicha = (numero: unknown, aluno: unknown) => `${String(numero ?? '').trim()}|${String(aluno ?? '').trim().toUpperCase()}`
const reais = (v: number) => brl(v).replace(/,00$/, '')

export default function FichasLote({ pacote, onFechar }: { pacote: Registro; onFechar: () => void }) {
  const { tabela, fichas } = useRebolo()
  const doPacote = fichas.filter((x) => x.pacoteId === pacote.id)
  const capacidade = pacote.tipo === 'Avulso' ? 1 : 10
  const [vagas] = useState(() => Math.max(0, capacidade - doPacote.length))
  const [primeiro] = useState(() => doPacote.length + 1) // nº do 1º álbum desta tela (continua a contagem do pacote)

  const [albuns, setAlbuns] = useState<Album[]>(() => Array.from({ length: vagas }, () => novoAlbum()))
  const [abertos, setAbertos] = useState<Set<number>>(new Set())
  const [tabelas, setTabelas] = useState<Set<number>>(new Set())
  const [erros, setErros] = useState<Record<number, string>>({})
  const [salvos, setSalvos] = useState<Set<number>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')

  const mudar = (i: number, k: Campo, v: string) => setAlbuns((l) => l.map((a, j) => (j === i ? { ...a, [k]: v } : a)))
  const alternarEm = (set: React.Dispatch<React.SetStateAction<Set<number>>>, i: number) =>
    set((x) => {
      const n = new Set(x)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })

  // telefone digitado sem DDD (8 ou 9 dígitos): coloca o DDD sugerido pela cidade/UF do álbum
  const completarDDD = (i: number, k: (typeof TELEFONES)[number]) => {
    const a = albuns[i]
    const d = soDigitos(a[k])
    const ddd = sugerirDDD(a.uf, a.cidade)
    if (ddd && (d.length === 8 || d.length === 9)) mudar(i, k, formatarTelefone(ddd + d))
  }
  const aoMudarCep = async (i: number, valor: string) => {
    mudar(i, 'cep', formatarCep(valor))
    if (soDigitos(valor).length !== 8) return
    const e = await buscarCep(valor)
    if (!e) return setErros((x) => ({ ...x, [i]: 'CEP não encontrado: preencha o endereço à mão.' }))
    setErros((x) => {
      const n = { ...x }
      delete n[i]
      return n
    })
    setAlbuns((l) => l.map((a, j) => (j === i ? { ...a, rua: e.rua || a.rua, bairro: e.bairro || a.bairro, cidade: e.cidade || a.cidade, uf: e.uf || a.uf } : a)))
  }
  const alternarHorario = (i: number, h: string) => {
    const lista = albuns[i].horario.split(',').map((x) => x.trim()).filter(Boolean)
    mudar(i, 'horario', (lista.includes(h) ? lista.filter((x) => x !== h) : [...lista, h]).join(', '))
  }

  const salvar = async () => {
    const novosErros: Record<number, string> = {}
    const fila: { i: number; dados: Record<string, Valor> }[] = []
    // ficha repetida = mesmo nº de ficha e mesmo aluno (já cadastrada ou repetida nesta tela)
    const chaves = new Set(fichas.map((x) => chaveFicha(x.numeroFicha, x.aluno)))
    albuns.forEach((a, i) => {
      if (salvos.has(i) || vazio(a)) return
      if (!a.dataVisita) return (novosErros[i] = 'Falta a data da visita.')
      if (!a.numeroFicha.trim() || !a.aluno.trim()) return (novosErros[i] = 'Falta o nº da ficha ou o nome do aluno.')
      if (soDigitos(a.whatsapp1).length < 10) return (novosErros[i] = 'Informe o WhatsApp 1 com DDD.')
      const chave = chaveFicha(a.numeroFicha, a.aluno)
      if (chaves.has(chave)) return (novosErros[i] = `A ficha ${a.numeroFicha.trim()} de ${a.aluno.trim().toUpperCase()} já está cadastrada.`)
      chaves.add(chave)
      const dados: Record<string, Valor> = Object.fromEntries(CAMPOS.map((c) => [c, a[c].trim()]))
      Object.assign(dados, { escola: SEM_ESCOLA, aluno: a.aluno.trim().toUpperCase(), qtdFotos: Number(a.qtdFotos) || 0, pacoteId: String(pacote.id) })
      fila.push({ i, dados })
    })
    if (!fila.length && !Object.keys(novosErros).length) return setAviso('Preencha pelo menos um álbum.')
    setAviso('')
    setSalvando(true)
    const resultado = fila.length ? await salvarFichasRebolo(fila.map((x) => x.dados)) : []
    setSalvando(false)
    const gravados = new Set(salvos)
    fila.forEach((x, k) => (resultado[k] ? (novosErros[x.i] = resultado[k]!) : gravados.add(x.i)))
    setSalvos(gravados)
    setErros(novosErros)
    // tudo certo: fecha (os álbuns em branco ficam como vagas para depois)
    if (!Object.keys(novosErros).length) onFechar()
    else setAviso(`${fila.filter((_, k) => !resultado[k]).length} ficha(s) gravada(s). Corrija os álbuns em vermelho e salve de novo.`)
  }

  const preenchidos = albuns.filter((a, i) => !salvos.has(i) && !vazio(a)).length
  const inp = (i: number, k: Campo, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, classe = '') => (
    <div className={`space-y-1 ${classe}`}>
      <label className={labelCls}>{rotulo}</label>
      <input value={albuns[i][k]} onChange={(e) => mudar(i, k, e.target.value)} className={inputCls} {...extra} />
    </div>
  )
  const tel = (i: number, k: (typeof TELEFONES)[number], rotulo: string, classe = '') => {
    const ddd = sugerirDDD(albuns[i].uf, albuns[i].cidade)
    return (
      <div className={`space-y-1 ${classe}`}>
        <label className={labelCls}>{rotulo}</label>
        <input value={albuns[i][k]} onChange={(e) => mudar(i, k, formatarTelefone(e.target.value))} onBlur={() => completarDDD(i, k)} inputMode="tel" placeholder={ddd ? `(${ddd}) 9____-____` : '(00) 00000-0000'} className={inputCls} />
      </div>
    )
  }

  if (vagas === 0) return <p className="text-sm text-zinc-400">O pacote P{String(pacote.numero)} já está completo ({capacidade} fichas).</p>

  return (
    <div className="space-y-5">
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl px-4 py-3">
        <p className="text-sm text-zinc-300">
          Pacote <strong className="text-white">P{String(pacote.numero)}</strong> • {vagas} álbum(ns) para cadastrar • cada álbum tem a sua data da visita: a faixa e o preço aparecem no álbum
        </p>
      </div>

      {albuns.map((a, i) => {
        const n = String(primeiro + i).padStart(2, '0')
        if (salvos.has(i))
          return (
            <div key={i} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3 text-sm text-emerald-300">
              ✓ Álbum {n} • ficha {a.numeroFicha} • {a.aluno.toUpperCase()} gravada
            </div>
          )
        const fx = a.dataVisita ? faixaDaFicha(a.dataVisita, tabela) : null
        return (
          <div key={i} className={`rounded-2xl border p-4 space-y-3 ${erros[i] ? 'border-red-500/40 bg-red-500/[0.04]' : 'border-white/[0.06] bg-white/[0.015]'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-white">Álbum {n}</p>
              {fx ? (
                <button type="button" onClick={() => alternarEm(setTabelas, i)} className="text-[11px] text-zinc-300 hover:text-white text-right" title="Ver a tabela de preços da faixa">
                  <strong className="text-white">Faixa {fx}</strong> • {mesesDesde(a.dataVisita)} meses • Completo {FORMAS_REBOLO.map((x) => `${x.nome} ${reais(tabela.preco(fx, 'completo', x.id))}`).join(' • ')}{' '}
                  <span className="text-blue-400 font-bold">{tabelas.has(i) ? '▾' : '▸ tabela'}</span>
                </button>
              ) : (
                <span className="text-[11px] text-zinc-500">Digite a data da visita: a faixa e o preço aparecem aqui</span>
              )}
            </div>
            {fx && tabelas.has(i) && <QuadroFaixa tabela={tabela} faixa={fx} meses={mesesDesde(a.dataVisita)} />}
            <div className="grid grid-cols-2 md:grid-cols-12 gap-3">
              {inp(i, 'dataVisita', 'Data da visita *', { type: 'date' }, 'md:col-span-2')}
              {inp(i, 'numeroFicha', 'Nº da ficha *', { inputMode: 'numeric' }, 'md:col-span-2')}
              {inp(i, 'aluno', 'Nome do aluno *', {}, 'col-span-2 md:col-span-4')}
              {inp(i, 'cidade', 'Cidade', {}, 'md:col-span-2')}
              <div className="space-y-1 md:col-span-1">
                <label className={labelCls}>UF</label>
                <select value={a.uf} onChange={(e) => mudar(i, 'uf', e.target.value)} className={`${inputCls} appearance-none`}>
                  <option value="">—</option>
                  {UFS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              {inp(i, 'qtdFotos', 'Fotos', { type: 'number', min: 0 }, 'md:col-span-1')}
              {tel(i, 'whatsapp1', 'WhatsApp 1 *', 'md:col-span-4')}
              {tel(i, 'whatsapp2', 'WhatsApp 2', 'md:col-span-4')}
              {tel(i, 'whatsapp3', 'WhatsApp 3', 'md:col-span-4')}
            </div>
            <button type="button" onClick={() => alternarEm(setAbertos, i)} className="text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">
              {abertos.has(i) ? '− esconder endereço, pais e outros dados' : '+ endereço, pais e outros dados'}
            </button>
            {abertos.has(i) && (
              <div className="grid grid-cols-2 md:grid-cols-12 gap-3 pt-1">
                <div className="space-y-1 md:col-span-2">
                  <label className={labelCls}>CEP</label>
                  <input value={a.cep} onChange={(e) => void aoMudarCep(i, e.target.value)} inputMode="numeric" placeholder="00000-000" className={inputCls} />
                </div>
                {inp(i, 'rua', 'Rua / Avenida', {}, 'col-span-2 md:col-span-5')}
                {inp(i, 'numero', 'Nº', {}, 'md:col-span-1')}
                {inp(i, 'apto', 'Apto', {}, 'md:col-span-1')}
                {inp(i, 'bairro', 'Bairro', {}, 'md:col-span-3')}
                {inp(i, 'pontoReferencia', 'Ponto de referência', {}, 'col-span-2 md:col-span-4')}
                {inp(i, 'fazenda', 'Fazenda', {}, 'md:col-span-4')}
                {inp(i, 'proprietarioFazenda', 'Proprietário da fazenda', {}, 'md:col-span-4')}
                {tel(i, 'telefone', 'Telefone fixo', 'md:col-span-3')}
                {inp(i, 'nomePai', 'Pai', {}, 'col-span-2 md:col-span-4')}
                {inp(i, 'nomeMae', 'Mãe', {}, 'col-span-2 md:col-span-5')}
                {inp(i, 'serie', 'Série', {}, 'md:col-span-2')}
                {inp(i, 'dataNascimento', 'Nascimento', { type: 'date' }, 'md:col-span-3')}
                <div className="space-y-1 col-span-2 md:col-span-4">
                  <label className={labelCls}>Horário para o contato</label>
                  <div className="flex gap-2">
                    {['Manhã', 'Tarde', 'Noite'].map((h) => (
                      <button key={h} type="button" onClick={() => alternarHorario(i, h)} className={`flex-1 py-3 rounded-xl text-xs font-bold border ${a.horario.includes(h) ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'border-white/[0.06] text-zinc-400'}`}>
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
                {inp(i, 'observacao', 'Observação', {}, 'col-span-2 md:col-span-3')}
              </div>
            )}
            {erros[i] && <p className="text-xs font-bold text-red-400">⚠ {erros[i]}</p>}
          </div>
        )
      })}

      {/* salvar: fica sempre à vista no pé da janela */}
      <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-painel/95 backdrop-blur border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-400">{aviso || `${preenchidos} álbum(ns) preenchido(s) • os vazios ficam como vagas para depois`}</p>
        <div className="flex gap-3">
          <button type="button" onClick={onFechar} className={btnSecundario}>
            Fechar
          </button>
          <button type="button" disabled={salvando} onClick={() => void salvar()} className={btnPrimario}>
            {salvando ? 'Salvando...' : `Salvar fichas${preenchidos ? ` (${preenchidos})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
