'use client'

// Cobrança / Financeiro › Clientes (Parte 1 da estrutura para a migração).
// Busca 50 clientes por vez no servidor: pesquisa por nome, CPF/CNPJ, telefone ou cidade (sem acento),
// filtros por UF, tipo de pessoa e "documento a corrigir"; ficha do cliente; cadastro e edição.

import { useEffect, useMemo, useState } from 'react'
import type { Modulo } from '@/lib/erp/types'
import { usePode } from '@/lib/erp/store'
import { FILTRO_VAZIO, POR_PAGINA, lerCliente, useClientes, useContadoresClientes, type Cliente, type FiltroClientes } from '@/lib/erp/clientes'
import { formatarDocumento, tipoDoDocumento } from '@/lib/erp/documento'
import { linkWhatsApp, UFS } from '@/lib/erp/rebolo'
import { num } from '@/lib/erp/format'
import Icon from '@/components/erp/Icon'
import { Badge, EmptyState, Modal, PageHeader, Panel, StatCard, btnBranco, btnSecundario } from '@/components/erp/ui'
import ClienteForm from './ClienteForm'

// campos dos filtros (sem a largura total do inputCls)
const campoFiltro = 'bg-black/50 border border-white/[0.05] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 placeholder:text-zinc-600 transition-all'

const telefones = (c: Cliente) => [c.whatsapp, c.telefone1, c.telefone2, c.telefone3].filter(Boolean)

function Documento({ c }: { c: Cliente }) {
  if (!c.documento) return <Badge texto="Sem documento" tom="yellow" />
  return (
    <span className="inline-flex flex-col">
      <span className="font-mono text-zinc-200">{formatarDocumento(c.documento)}</span>
      {!c.documentoOk && <span className="text-[10px] font-bold text-yellow-400">{tipoDoDocumento(c.documento) || 'Documento'} inválido</span>}
    </span>
  )
}

export default function ClientesPagina({ modulo }: { modulo: Extract<Modulo, 'cobranca' | 'financeiro'> }) {
  const podeFazer = usePode()
  const podeCriar = podeFazer(modulo, 'criar')
  const podeEditar = podeFazer(modulo, 'editar')
  const [digitado, setDigitado] = useState('')
  const [filtro, setFiltro] = useState<FiltroClientes>(FILTRO_VAZIO)
  const [pagina, setPagina] = useState(0)
  const [versao, setVersao] = useState(0)
  const [ficha, setFicha] = useState<Cliente | null>(null)
  const [form, setForm] = useState<{ cliente: Cliente | null } | null>(null)

  // a pesquisa vai ao servidor 300 ms depois de parar de digitar
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltro((f) => (f.termo === digitado ? f : { ...f, termo: digitado }))
      setPagina(0)
    }, 300)
    return () => clearTimeout(t)
  }, [digitado])
  const mudarFiltro = (parcial: Partial<FiltroClientes>) => {
    setFiltro((f) => ({ ...f, ...parcial }))
    setPagina(0)
  }

  const { linhas, total, carregando, erro } = useClientes(filtro, pagina, versao)
  const contadores = useContadoresClientes(versao)
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const filtrando = useMemo(() => !!(filtro.termo || filtro.uf || filtro.tipo || filtro.aCorrigir), [filtro])

  const abrirFicha = async (c: Cliente) => setFicha((await lerCliente(c.id)) ?? c)
  const fecharForm = async (salvou: boolean) => {
    const editado = form?.cliente
    setForm(null)
    if (!salvou) return
    setVersao((v) => v + 1)
    if (editado && ficha?.id === editado.id) setFicha(await lerCliente(editado.id))
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo={`${modulo === 'cobranca' ? 'Cobrança' : 'Financeiro'} / Clientes`}
        titulo="Clientes"
        descricao="Cadastro único de clientes da Cobrança e do Financeiro. Pesquise por nome, CPF/CNPJ, telefone ou cidade."
        acoes={
          podeCriar && (
            <button onClick={() => setForm({ cliente: null })} className={btnBranco}>
              <Icon nome="plus" className="w-5 h-5" /> Novo cliente
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatCard label="Clientes" valor={contadores ? num(contadores.total) : '…'} />
        <StatCard label="Documento a corrigir" valor={contadores ? num(contadores.aCorrigir) : '…'} tom={contadores?.aCorrigir ? 'yellow' : 'zinc'} detalhe="sem CPF/CNPJ ou com número inválido" />
        <StatCard label="Pessoas jurídicas" valor={contadores ? num(contadores.juridicas) : '…'} detalhe="com CNPJ" />
      </div>

      <Panel
        semPadding
        titulo={filtrando ? `${num(total)} cliente(s) encontrado(s)` : 'Todos os clientes'}
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Icon nome="search" className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={digitado}
                onChange={(e) => setDigitado(e.target.value)}
                placeholder="Nome, CPF/CNPJ, telefone ou cidade"
                aria-label="Pesquisar clientes"
                className={`${campoFiltro} pl-9 w-80`}
              />
            </div>
            <select value={filtro.uf} onChange={(e) => mudarFiltro({ uf: e.target.value })} aria-label="UF" className={`${campoFiltro} w-24 appearance-none`}>
              <option value="">UF</option>
              {UFS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <select value={filtro.tipo} onChange={(e) => mudarFiltro({ tipo: e.target.value as FiltroClientes['tipo'] })} aria-label="Tipo de pessoa" className={`${campoFiltro} w-44 appearance-none`}>
              <option value="">Física e jurídica</option>
              <option value="Física">Pessoa física</option>
              <option value="Jurídica">Pessoa jurídica</option>
            </select>
            <button
              onClick={() => mudarFiltro({ aCorrigir: !filtro.aCorrigir })}
              className={`px-3 py-2.5 rounded-xl text-[11px] font-bold border transition-all ${filtro.aCorrigir ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-400' : 'border-white/[0.08] text-zinc-400 hover:text-white'}`}
            >
              Só documento a corrigir
            </button>
          </div>
        }
      >
        {erro ? (
          <p className="p-6 text-sm font-bold text-red-400">{erro}</p>
        ) : !carregando && linhas.length === 0 ? (
          <EmptyState titulo={filtrando ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'} descricao={filtrando ? 'Confira a pesquisa ou os filtros.' : podeCriar ? 'Use "Novo cliente" para cadastrar.' : undefined} />
        ) : (
          <div className={`overflow-x-auto custom-scrollbar transition-opacity ${carregando ? 'opacity-50' : ''}`}>
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                <tr>
                  <th className="px-5 py-3 font-bold">Cliente</th>
                  <th className="px-5 py-3 font-bold">CPF / CNPJ</th>
                  <th className="px-5 py-3 font-bold">Telefone</th>
                  <th className="px-5 py-3 font-bold">Cidade</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {linhas.map((c) => {
                  const tel = telefones(c)[0]
                  return (
                    <tr key={c.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => void abrirFicha(c)}>
                      <td className="px-5 py-3">
                        <p className="font-black text-white">{c.nome}</p>
                        <p className="text-[10px] text-zinc-500">{[c.tipoPessoa === 'Jurídica' ? 'Pessoa jurídica' : '', c.origem].filter(Boolean).join(' • ')}</p>
                      </td>
                      <td className="px-5 py-3"><Documento c={c} /></td>
                      <td className="px-5 py-3 whitespace-nowrap">{tel || <span className="text-zinc-600">—</span>}</td>
                      <td className="px-5 py-3 whitespace-nowrap">{[c.cidade, c.uf].filter(Boolean).join('/') || <span className="text-zinc-600">—</span>}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Abrir →</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-white/[0.05] text-xs text-zinc-400">
            <span>
              Mostrando {num(pagina * POR_PAGINA + 1)}–{num(Math.min(total, (pagina + 1) * POR_PAGINA))} de {num(total)}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0 || carregando} className={`${btnSecundario} py-2`}>
                ← Anterior
              </button>
              <span className="px-2">
                Página {num(pagina + 1)} de {num(paginas)}
              </span>
              <button onClick={() => setPagina((p) => Math.min(paginas - 1, p + 1))} disabled={pagina >= paginas - 1 || carregando} className={`${btnSecundario} py-2`}>
                Próxima →
              </button>
            </div>
          </div>
        )}
      </Panel>

      <Modal
        aberto={!!ficha}
        titulo={ficha?.nome ?? ''}
        subtitulo={ficha ? [ficha.tipoPessoa === 'Jurídica' ? 'Pessoa jurídica' : 'Pessoa física', ficha.origem].join(' • ') : ''}
        onFechar={() => setFicha(null)}
        largura="max-w-3xl"
        rodape={
          <>
            <button onClick={() => setFicha(null)} className={btnSecundario}>Fechar</button>
            {podeEditar && ficha && (
              <button onClick={() => setForm({ cliente: ficha })} className={btnSecundario}>
                <Icon nome="edit" className="w-4 h-4" /> Editar
              </button>
            )}
          </>
        }
      >
        {ficha && <FichaCliente c={ficha} />}
      </Modal>

      <Modal
        aberto={!!form}
        titulo={form?.cliente ? `Editar • ${form.cliente.nome}` : 'Novo cliente'}
        subtitulo="Cadastro único de clientes da Cobrança e do Financeiro"
        onFechar={() => void fecharForm(false)}
        largura="max-w-4xl"
      >
        {form && <ClienteForm key={form.cliente?.id ?? 'novo'} cliente={form.cliente} onFechar={(salvou) => void fecharForm(salvou)} />}
      </Modal>
    </div>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5">
      <span className="w-32 shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-500 pt-0.5">{rotulo}</span>
      <span className="text-sm text-zinc-200 min-w-0">{children}</span>
    </div>
  )
}

function FichaCliente({ c }: { c: Cliente }) {
  const endereco = [[c.rua, c.numero].filter(Boolean).join(', '), c.complemento, c.bairro, [c.cidade, c.uf].filter(Boolean).join('/'), c.cep].filter(Boolean).join(' • ')
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-1">
        <p className="text-sm font-black text-white mb-2">Dados</p>
        <Linha rotulo={tipoDoDocumento(c.documento) || 'Documento'}>
          {c.documento ? (
            <>
              <span className="font-mono">{formatarDocumento(c.documento)}</span>{' '}
              {c.documentoOk ? <span className="text-emerald-400 font-bold">✓</span> : <span className="text-yellow-400 font-bold">inválido — corrigir</span>}
            </>
          ) : (
            <span className="text-yellow-400 font-bold">sem documento — corrigir</span>
          )}
        </Linha>
        <Linha rotulo="Telefones">
          {telefones(c).length ? (
            <span className="flex flex-col gap-1">
              {telefones(c).map((t) => (
                <span key={t}>
                  {t}{' '}
                  {linkWhatsApp(t) && (
                    <a href={linkWhatsApp(t)} target="_blank" rel="noreferrer" className="text-emerald-400 font-bold text-xs">
                      WhatsApp →
                    </a>
                  )}
                </span>
              ))}
            </span>
          ) : (
            '—'
          )}
        </Linha>
        <Linha rotulo="E-mail">{c.email || '—'}</Linha>
        <Linha rotulo="Endereço">{endereco || '—'}</Linha>
        {c.observacao && <Linha rotulo="Observação">{c.observacao}</Linha>}
        {(c.codigoContaAzul || c.codigoSistemaAntigo) && (
          <Linha rotulo="Códigos">
            <span className="text-xs text-zinc-400">
              {[c.codigoContaAzul && `Conta Azul ${c.codigoContaAzul}`, c.codigoSistemaAntigo && `sistema antigo ${c.codigoSistemaAntigo}`].filter(Boolean).join(' • ')}
            </span>
          </Linha>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-black text-white">Cobranças</p>
        <div className="rounded-2xl border border-dashed border-white/[0.1] p-5 text-sm text-zinc-500">
          As cobranças e parcelas deste cliente aparecem aqui quando a carteira de cobranças for criada (próxima parte).
        </div>
      </div>
    </div>
  )
}
