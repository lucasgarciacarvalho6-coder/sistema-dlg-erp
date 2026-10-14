'use client'

import { useMemo, useState } from 'react'
import type { Setor, TipoLog, Tom } from '@/lib/erp/types'
import { SETORES } from '@/lib/erp/config'
import { useErp, usePode } from '@/lib/erp/store'
import { exportarCSV } from '@/lib/erp/export'
import Icon from '@/components/erp/Icon'
import { Badge, EmptyState, PageHeader, Panel, StatCard, btnSecundario } from '@/components/erp/ui'

const TIPOS: { id: TipoLog; label: string; tom: Tom }[] = [
  // cor só para alerta: login que falhou = vermelho; o resto neutro
  { id: 'LOGIN', label: 'Login', tom: 'zinc' },
  { id: 'LOGIN_FALHOU', label: 'Login falhou', tom: 'red' },
  { id: 'LOGOUT', label: 'Logout', tom: 'zinc' },
  { id: 'ACESSO', label: 'Acesso', tom: 'zinc' },
  { id: 'CRIAR', label: 'Criação', tom: 'zinc' },
  { id: 'EDITAR', label: 'Alteração', tom: 'zinc' },
  { id: 'EXCLUIR', label: 'Exclusão', tom: 'zinc' },
  { id: 'SENHA', label: 'Senha', tom: 'zinc' },
  { id: 'SISTEMA', label: 'Sistema', tom: 'zinc' },
]

const selectCls = 'bg-black/50 border border-white/[0.05] text-white text-[10px] font-bold uppercase tracking-widest rounded-xl px-4 py-2.5 outline-none focus:border-blue-500/50'

export default function AuditoriaPage() {
  const s = useErp()
  const podeFazer = usePode()
  const [tipo, setTipo] = useState<TipoLog | ''>('')
  const [setor, setSetor] = useState<Setor | ''>('')
  const [busca, setBusca] = useState('')

  const logs = useMemo(() => {
    const t = busca.toLowerCase()
    return s.auditoria.filter(
      (l) => (!tipo || l.tipo === tipo) && (!setor || l.setor === setor) && (!t || `${l.usuarioNome} ${l.descricao}`.toLowerCase().includes(t)),
    )
  }, [s.auditoria, tipo, setor, busca])

  const conta = (t: TipoLog) => s.auditoria.filter((l) => l.tipo === t).length

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader modulo="Auditoria e Segurança" titulo="Logs do Sistema" descricao="Registro de logins, logouts, acessos, alterações e exclusões, com usuário responsável, data/hora e IP." />

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-6">
        <StatCard label="Eventos registrados" valor={s.auditoria.length} />
        <StatCard label="Logins" valor={conta('LOGIN')} />
        <StatCard label="Logins falhos" valor={conta('LOGIN_FALHOU')} tom={conta('LOGIN_FALHOU') ? 'red' : 'zinc'} />
        <StatCard label="Alterações" valor={conta('EDITAR') + conta('CRIAR')} />
        <StatCard label="Exclusões" valor={conta('EXCLUIR')} />
      </div>

      <Panel
        semPadding
        titulo={`${logs.length} evento(s)`}
        acoes={
          <>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoLog | '')} className={selectCls}>
              <option value="">Todos os tipos</option>
              {TIPOS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <select value={setor} onChange={(e) => setSetor(e.target.value as Setor | '')} className={selectCls}>
              <option value="">Todos os setores</option>
              {(Object.keys(SETORES) as Setor[]).map((x) => (
                <option key={x} value={x}>{SETORES[x].nome}</option>
              ))}
            </select>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar usuário ou ação..." className="campo-busca bg-black/50 border border-white/[0.05] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 w-56" />
            {podeFazer('auditoria', 'exportar') && (
              <button
                onClick={() =>
                  exportarCSV(
                    'auditoria',
                    [
                      { chave: 'data', label: 'Data/Hora' },
                      { chave: 'tipo', label: 'Tipo' },
                      { chave: 'usuarioNome', label: 'Usuário' },
                      { chave: 'setor', label: 'Setor' },
                      { chave: 'descricao', label: 'Descrição' },
                      { chave: 'ip', label: 'IP' },
                    ],
                    logs.map((l) => ({ ...l, data: new Date(l.data).toLocaleString('pt-BR') })),
                  )
                }
                className={btnSecundario}
              >
                <Icon nome="download" className="w-4 h-4" /> CSV
              </button>
            )}
          </>
        }
      >
        {logs.length === 0 ? (
          <EmptyState titulo="Sem eventos" descricao="Os eventos aparecem aqui conforme os usuários utilizam o sistema." />
        ) : (
          <div className="overflow-x-auto custom-scrollbar max-h-[65vh]">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-[10px] uppercase tracking-[0.2em] bg-painel text-zinc-500 border-b border-white/[0.05] sticky top-0">
                <tr>
                  <th className="px-6 py-4 font-bold">Data / Hora</th>
                  <th className="px-6 py-4 font-bold">Tipo</th>
                  <th className="px-6 py-4 font-bold">Usuário</th>
                  <th className="px-6 py-4 font-bold">Setor</th>
                  <th className="px-6 py-4 font-bold">Descrição</th>
                  <th className="px-6 py-4 font-bold">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {logs.slice(0, 500).map((l) => {
                  const t = TIPOS.find((x) => x.id === l.tipo)
                  return (
                    <tr key={l.id} className="hover:bg-white/[0.02]">
                      <td className="px-6 py-3.5 text-xs font-mono text-zinc-400 whitespace-nowrap">{new Date(l.data).toLocaleString('pt-BR')}</td>
                      <td className="px-6 py-3.5"><Badge texto={t?.label ?? l.tipo} tom={t?.tom ?? 'zinc'} /></td>
                      <td className="px-6 py-3.5 text-white font-bold whitespace-nowrap">{l.usuarioNome}</td>
                      <td className="px-6 py-3.5 text-zinc-400">{l.setor ? SETORES[l.setor].nome : '—'}</td>
                      <td className="px-6 py-3.5 text-zinc-300 text-xs">{l.descricao}</td>
                      <td className="px-6 py-3.5 text-zinc-600 text-xs font-mono">{l.ip}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
