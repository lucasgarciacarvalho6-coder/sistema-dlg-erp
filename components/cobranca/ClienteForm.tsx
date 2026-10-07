'use client'

// Cadastro / edição de cliente (Cobrança + Financeiro): CPF/CNPJ conferido na hora, cidade com UF e DDD
// automáticos (a mesma lista do Rebolo) e CEP que preenche o endereço.

import { useState } from 'react'
import { ORIGENS_CLIENTE, salvarCliente, type Cliente, type DadosCliente } from '@/lib/erp/clientes'
import { documentoValido, formatarDocumento, soDigitos } from '@/lib/erp/documento'
import { buscarCep, formatarCep, formatarTelefone, UFS } from '@/lib/erp/rebolo'
import { btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import { CampoCidade } from '@/components/rebolo/comum'

const VAZIO: DadosCliente = {
  nome: '', documento: '', tipoPessoa: 'Física', telefone1: '', telefone2: '', telefone3: '', whatsapp: '', email: '',
  cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', origem: 'Cadastro manual',
  codigoContaAzul: '', codigoSistemaAntigo: '', observacao: '',
}

export default function ClienteForm({ cliente, onFechar }: { cliente: Cliente | null; onFechar: (salvou: boolean) => void }) {
  const [d, setD] = useState<DadosCliente>(() => (cliente ? { ...VAZIO, ...cliente, documento: formatarDocumento(cliente.documento) } : VAZIO))
  const [ddd, setDdd] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const mudar = (campo: keyof DadosCliente, valor: string) => setD((x) => ({ ...x, [campo]: valor }))

  const digitos = soDigitos(d.documento)
  const mesmoDocumento = !!cliente && digitos === soDigitos(cliente.documento)
  const avisoDocumento = !digitos
    ? 'Sem documento: o cliente fica como "documento a corrigir".'
    : digitos.length !== 11 && digitos.length !== 14
      ? 'O CPF tem 11 números e o CNPJ tem 14.'
      : documentoValido(digitos)
        ? ''
        : mesmoDocumento
          ? 'Documento inválido (veio assim do cadastro). Corrija quando tiver o certo.'
          : `${digitos.length === 11 ? 'CPF' : 'CNPJ'} inválido: confira os números.`
  const docOk = !!digitos && documentoValido(digitos)

  // telefone novo começa com o DDD da cidade escolhida
  const comDdd = (v: string) => (v ? v : ddd ? `(${ddd}) ` : '')

  const preencherCep = async (cep: string) => {
    mudar('cep', formatarCep(cep))
    if (soDigitos(cep).length !== 8) return
    const e = await buscarCep(cep)
    if (!e) return
    setD((x) => ({ ...x, rua: x.rua || e.rua, bairro: x.bairro || e.bairro, cidade: e.cidade || x.cidade, uf: e.uf || x.uf }))
    if (e.ddd) setDdd(e.ddd)
  }

  const salvar = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setErro('')
    setSalvando(true)
    const falha = await salvarCliente({ ...d, documento: digitos }, cliente?.id, cliente?.documento ?? '')
    setSalvando(false)
    if (falha) return setErro(falha)
    onFechar(true)
  }

  return (
    <form id="form-cliente" onSubmit={salvar} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="space-y-1 md:col-span-4">
          <label className={labelCls}>Nome completo *</label>
          <input value={d.nome} onChange={(e) => mudar('nome', e.target.value)} className={inputCls} autoFocus />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className={labelCls}>CPF ou CNPJ</label>
          <input value={d.documento} onChange={(e) => mudar('documento', formatarDocumento(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" className={inputCls} />
          {digitos && docOk ? (
            <p className="text-[11px] font-bold text-emerald-400">{digitos.length === 14 ? 'CNPJ' : 'CPF'} válido ✓</p>
          ) : (
            <p className="text-[11px] font-bold text-yellow-400">{avisoDocumento}</p>
          )}
        </div>
        {!digitos && (
          <div className="space-y-1 md:col-span-2">
            <label className={labelCls}>Tipo de pessoa</label>
            <select value={d.tipoPessoa} onChange={(e) => mudar('tipoPessoa', e.target.value)} className={`${inputCls} appearance-none`}>
              <option value="Física">Física</option>
              <option value="Jurídica">Jurídica</option>
            </select>
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-black text-white mb-3">Contato</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {(['whatsapp', 'telefone1', 'telefone2', 'telefone3'] as const).map((campo, i) => (
            <div key={campo} className="space-y-1">
              <label className={labelCls}>{i === 0 ? 'WhatsApp' : `Telefone ${i}`}</label>
              <input
                value={d[campo]}
                onFocus={() => mudar(campo, comDdd(d[campo]))}
                onBlur={() => soDigitos(d[campo]).length <= 2 && mudar(campo, '')}
                onChange={(e) => mudar(campo, formatarTelefone(e.target.value))}
                inputMode="tel"
                placeholder="(00) 00000-0000"
                className={inputCls}
              />
            </div>
          ))}
          <div className="space-y-1 md:col-span-2">
            <label className={labelCls}>E-mail</label>
            <input type="email" value={d.email} onChange={(e) => mudar('email', e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-black text-white mb-3">Endereço</p>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="space-y-1 md:col-span-2">
            <label className={labelCls}>CEP</label>
            <input value={d.cep} onChange={(e) => void preencherCep(e.target.value)} inputMode="numeric" placeholder="00000-000" className={inputCls} />
          </div>
          <div className="space-y-1 md:col-span-4">
            <label className={labelCls}>Rua</label>
            <input value={d.rua} onChange={(e) => mudar('rua', e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Número</label>
            <input value={d.numero} onChange={(e) => mudar('numero', e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className={labelCls}>Complemento</label>
            <input value={d.complemento} onChange={(e) => mudar('complemento', e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1 md:col-span-3">
            <label className={labelCls}>Bairro</label>
            <input value={d.bairro} onChange={(e) => mudar('bairro', e.target.value)} className={inputCls} />
          </div>
          <CampoCidade
            cidade={d.cidade}
            uf={d.uf}
            classe="md:col-span-4"
            onMudar={(cidade, uf, dddCidade) => {
              setD((x) => ({ ...x, cidade, uf: uf || x.uf }))
              if (dddCidade) setDdd(dddCidade)
            }}
          />
          <div className="space-y-1 md:col-span-2">
            <label className={labelCls}>UF</label>
            <select value={d.uf} onChange={(e) => mudar('uf', e.target.value)} className={`${inputCls} appearance-none`}>
              <option value="">—</option>
              {UFS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="space-y-1 md:col-span-2">
          <label className={labelCls}>Origem</label>
          <select value={d.origem} onChange={(e) => mudar('origem', e.target.value)} className={`${inputCls} appearance-none`}>
            {[...new Set([...ORIGENS_CLIENTE, d.origem])].filter(Boolean).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1 md:col-span-4">
          <label className={labelCls}>Observação</label>
          <input value={d.observacao} onChange={(e) => mudar('observacao', e.target.value)} className={inputCls} />
        </div>
      </div>

      {erro && <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400">{erro}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => onFechar(false)} className={btnSecundario}>Cancelar</button>
        <button type="submit" disabled={salvando} className={btnPrimario}>{salvando ? 'Salvando...' : cliente ? 'Salvar alterações' : 'Cadastrar cliente'}</button>
      </div>
    </form>
  )
}
