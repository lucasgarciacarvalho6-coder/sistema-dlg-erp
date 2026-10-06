'use client'

// Cadastro manual da ficha (uma por álbum), feito no PC: Tab passa de campo em campo.
// CEP completa o endereço (e traz o DDD); o DDD também é sugerido pela cidade/UF.
// Data da visita → faixa e o quadro de preços da faixa na hora (igual à tabela da parede).
// Sem escola (06/10/2026: não é necessária): a ficha nova grava "—"; a ficha antiga mantém a escola que tinha.

import { useState } from 'react'
import type { Registro, Valor } from '@/lib/erp/types'
import { salvarFichaRebolo } from '@/lib/erp/store'
import {
  buscarCep,
  DDD_POR_UF,
  faixaDaFicha,
  formatarCep,
  formatarTelefone,
  mesesDesde,
  SEM_ESCOLA,
  soDigitos,
  sugerirDDD,
  UFS,
} from '@/lib/erp/rebolo'
import { btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import { CampoCidade, QuadroFaixa, useCidades, useRebolo } from './comum'
import { dddDaCidade } from '@/lib/erp/cidades'

const CAMPOS = [
  'escola', 'dataVisita', 'numeroFicha', 'aluno', 'serie', 'dataNascimento', 'qtdFotos', 'cep', 'rua', 'numero', 'apto', 'fazenda', 'proprietarioFazenda',
  'bairro', 'cidade', 'uf', 'pontoReferencia', 'whatsapp1', 'whatsapp2', 'whatsapp3', 'telefone', 'nomePai', 'nomeMae', 'horario', 'observacao',
] as const
type Campo = (typeof CAMPOS)[number]
type Form = Record<Campo, string>

const vazio = (base?: Partial<Form>): Form => ({ ...(Object.fromEntries(CAMPOS.map((c) => [c, ''])) as Form), qtdFotos: '26', ...base })
const TELEFONES = ['whatsapp1', 'whatsapp2', 'whatsapp3', 'telefone'] as const

export default function FichaForm({ pacote, ficha, onFechar }: { pacote: Registro; ficha?: Registro | null; onFechar: () => void }) {
  const { tabela, fichas } = useRebolo()
  const cidades = useCidades()
  const [f, setF] = useState<Form>(() => (ficha ? (Object.fromEntries(CAMPOS.map((c) => [c, String(ficha[c] ?? '')])) as Form) : vazio()))
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [dddCep, setDddCep] = useState('')
  const set = (k: Campo, v: string) => setF((x) => ({ ...x, [k]: v }))
  const doPacote = fichas.filter((x) => x.pacoteId === pacote.id)
  const capacidade = pacote.tipo === 'Avulso' ? 1 : 10

  const faixa = f.dataVisita ? faixaDaFicha(f.dataVisita, tabela) : null
  const ddd = dddCep || dddDaCidade(cidades, f.cidade, f.uf) || sugerirDDD(f.uf, f.cidade) || ''

  const aoMudarCep = async (valor: string) => {
    set('cep', formatarCep(valor))
    if (soDigitos(valor).length !== 8) return
    setAviso('Buscando CEP...')
    const e = await buscarCep(valor)
    if (!e) return setAviso('CEP não encontrado. Preencha o endereço à mão.')
    setAviso(`CEP encontrado: ${e.cidade}/${e.uf}${e.ddd ? ` • DDD ${e.ddd}` : ''}`)
    setDddCep(e.ddd)
    setF((x) => ({ ...x, rua: e.rua || x.rua, bairro: e.bairro || x.bairro, cidade: e.cidade || x.cidade, uf: e.uf || x.uf }))
  }

  // aplica o DDD nos telefones digitados sem DDD (8 ou 9 dígitos)
  const aplicarDDD = (codigo: string) =>
    setF((x) => {
      const n = { ...x }
      for (const k of TELEFONES) {
        const d = soDigitos(x[k])
        if (d.length === 8 || d.length === 9) n[k] = formatarTelefone(codigo + d)
      }
      return n
    })

  const alternarHorario = (h: string) => {
    const lista = f.horario.split(',').map((x) => x.trim()).filter(Boolean)
    set('horario', (lista.includes(h) ? lista.filter((x) => x !== h) : [...lista, h]).join(', '))
  }

  const salvar = async (proxima: boolean) => {
    if (!f.dataVisita || !f.numeroFicha.trim() || !f.aluno.trim()) return setErro('Preencha a data da visita, o nº da ficha e o nome do aluno.')
    if (soDigitos(f.whatsapp1).length < 10) return setErro('Informe o WhatsApp 1 com DDD.')
    // repetida = mesmo nº de ficha e mesmo aluno
    const repetida = fichas.find((x) => String(x.numeroFicha).trim() === f.numeroFicha.trim() && String(x.aluno).trim().toUpperCase() === f.aluno.trim().toUpperCase() && x.id !== ficha?.id)
    if (repetida) return setErro(`A ficha ${f.numeroFicha} de ${f.aluno.trim().toUpperCase()} já está cadastrada.`)
    setErro('')
    setSalvando(true)
    const dados: Record<string, Valor> = Object.fromEntries(CAMPOS.map((c) => [c, f[c].trim()]))
    dados.aluno = f.aluno.trim().toUpperCase()
    dados.escola = f.escola.trim() || SEM_ESCOLA
    dados.qtdFotos = Number(f.qtdFotos) || 0
    dados.pacoteId = String(pacote.id)
    const e = await salvarFichaRebolo(dados, ficha?.id)
    setSalvando(false)
    if (e) return setErro(e)
    if (proxima && !ficha && doPacote.length + 1 < capacidade) {
      // próxima ficha do mesmo pacote: mantém escola e data da visita
      setF(vazio({ dataVisita: f.dataVisita }))
      setDddCep('')
      setAviso(`Ficha ${f.numeroFicha} salva. Próxima: ${doPacote.length + 2} de ${capacidade}.`)
      return
    }
    onFechar()
  }

  const campo = (k: Campo, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, classe = '') => (
    <div className={`space-y-1.5 ${classe}`}>
      <label className={labelCls}>{rotulo}</label>
      <input value={f[k]} onChange={(e) => set(k, e.target.value)} className={inputCls} {...extra} />
    </div>
  )
  const telefone = (k: (typeof TELEFONES)[number], rotulo: string) => (
    <div className="space-y-1.5">
      <label className={labelCls}>{rotulo}</label>
      <input
        value={f[k]}
        onChange={(e) => set(k, formatarTelefone(e.target.value))}
        onBlur={() => {
          const d = soDigitos(f[k])
          if (ddd && (d.length === 8 || d.length === 9)) set(k, formatarTelefone(ddd + d)) // sem DDD: o da cidade
        }}
        inputMode="tel"
        placeholder={ddd ? `(${ddd}) 9____-____` : '(00) 00000-0000'}
        className={inputCls}
      />
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/[0.02] border border-white/[0.05] rounded-2xl px-4 py-3">
        <p className="text-sm text-zinc-300">
          Pacote <strong className="text-white">P{String(pacote.numero)}</strong> • {ficha ? 'editando ficha' : `ficha ${doPacote.length + 1} de ${capacidade}`}
        </p>
        {!faixa && <p className="text-xs text-zinc-500">Digite a data da visita: a faixa e a tabela de preços aparecem aqui.</p>}
      </div>
      {faixa && <QuadroFaixa tabela={tabela} faixa={faixa} meses={mesesDesde(f.dataVisita)} />}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <label className={labelCls}>Data da visita *</label>
          <input type="date" value={f.dataVisita} onChange={(e) => set('dataVisita', e.target.value)} className={inputCls} autoFocus />
        </div>
        {campo('numeroFicha', 'Nº da ficha *', { inputMode: 'numeric' })}
        {campo('aluno', 'Nome do aluno *', {}, 'md:col-span-2')}
        {campo('serie', 'Série')}
        {campo('dataNascimento', 'Nascimento', { type: 'date' })}
        {campo('qtdFotos', 'Qtd. de fotos', { type: 'number', min: 0 })}
      </div>

      <p className="text-sm font-black text-white pt-3 border-t border-white/[0.06]">Endereço</p>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="space-y-1.5">
          <label className={labelCls}>CEP</label>
          <input value={f.cep} onChange={(e) => void aoMudarCep(e.target.value)} inputMode="numeric" placeholder="00000-000" className={inputCls} />
        </div>
        {campo('rua', 'Rua / Avenida', {}, 'md:col-span-3')}
        {campo('numero', 'Nº')}
        {campo('apto', 'Apto')}
        {campo('bairro', 'Bairro', {}, 'md:col-span-2')}
        <CampoCidade
          cidade={f.cidade}
          uf={f.uf}
          onMudar={(cidade, uf, codigo) => {
            setF((x) => ({ ...x, cidade, uf }))
            if (codigo) aplicarDDD(codigo) // telefones já digitados sem DDD
          }}
          classe="md:col-span-2"
        />
        <div className="space-y-1.5">
          <label className={labelCls}>UF</label>
          <select value={f.uf} onChange={(e) => set('uf', e.target.value)} className={`${inputCls} appearance-none`}>
            <option value="">—</option>
            {UFS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        {campo('pontoReferencia', 'Ponto de referência', {}, 'md:col-span-1')}
        {campo('fazenda', 'Fazenda', {}, 'md:col-span-3')}
        {campo('proprietarioFazenda', 'Proprietário da fazenda', {}, 'md:col-span-3')}
      </div>
      {aviso && <p className="text-xs text-zinc-300">{aviso}</p>}

      <p className="text-sm font-black text-white pt-3 border-t border-white/[0.06]">Contato</p>
      {f.uf && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-400">DDD de {f.uf}:</span>
          {(DDD_POR_UF[f.uf] ?? []).map((r) => (
            <button
              key={r.ddd}
              type="button"
              onClick={() => aplicarDDD(r.ddd)}
              title={`${r.regiao} — clique para colocar nos telefones digitados sem DDD`}
              className={`px-2.5 py-1 rounded-lg border font-bold ${r.ddd === ddd ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]'}`}
            >
              {r.ddd} <span className="font-normal text-zinc-500">{r.regiao.split(',').slice(0, 2).join(',')}</span>
            </button>
          ))}
          {ddd && <span className="text-zinc-300">Sugerido: {ddd}</span>}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {telefone('whatsapp1', 'WhatsApp 1 *')}
        {telefone('whatsapp2', 'WhatsApp 2')}
        {telefone('whatsapp3', 'WhatsApp 3')}
        {telefone('telefone', 'Telefone fixo')}
        {campo('nomePai', 'Pai', {}, 'md:col-span-2')}
        {campo('nomeMae', 'Mãe', {}, 'md:col-span-2')}
        <div className="space-y-1.5 md:col-span-2">
          <label className={labelCls}>Horário para receber o contato</label>
          <div className="flex gap-2">
            {['Manhã', 'Tarde', 'Noite'].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => alternarHorario(h)}
                className={`flex-1 py-3 rounded-xl text-xs font-bold border ${f.horario.includes(h) ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'border-white/[0.06] text-zinc-400'}`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
        {campo('observacao', 'Observação', {}, 'md:col-span-2')}
      </div>

      {erro && <p className="text-sm font-bold text-red-400">{erro}</p>}
      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <button type="button" onClick={onFechar} className={btnSecundario}>
          Fechar
        </button>
        {!ficha && doPacote.length + 1 < capacidade && (
          <button type="button" disabled={salvando} onClick={() => void salvar(true)} className={btnSecundario}>
            Salvar e cadastrar a próxima
          </button>
        )}
        <button type="button" disabled={salvando} onClick={() => void salvar(false)} className={btnPrimario}>
          {salvando ? 'Salvando...' : 'Salvar ficha'}
        </button>
      </div>
    </div>
  )
}
