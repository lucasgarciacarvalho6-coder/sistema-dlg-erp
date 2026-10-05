'use client'

import { useState } from 'react'
import type { Acao } from '@/lib/erp/types'
import { ACOES, MODULOS } from '@/lib/erp/permissions'
import { alternarPermissao, useErp, usePode } from '@/lib/erp/store'
import Icon from '@/components/erp/Icon'
import { PageHeader, Panel, Tabs } from '@/components/erp/ui'

type Aba = 'ADM' | 'GERENTE' | 'COLABORADOR'

function Celula({ ativo, editavel, onClick }: { ativo: boolean; editavel: boolean; onClick?: () => void }) {
  return (
    <button
      disabled={!editavel}
      onClick={onClick}
      className={`w-9 h-9 rounded-xl border flex items-center justify-center mx-auto transition-all ${
        ativo ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-white/[0.02] border-white/[0.05] text-zinc-700'
      } ${editavel ? 'hover:scale-110 cursor-pointer' : 'cursor-default'}`}
    >
      {ativo ? <Icon nome="check" className="w-4 h-4" /> : <Icon nome="x" className="w-3.5 h-3.5" />}
    </button>
  )
}

export default function PermissoesPage() {
  const s = useErp()
  const podeFazer = usePode()
  const [aba, setAba] = useState<Aba>('GERENTE')
  const editavel = podeFazer('permissoes', 'editar')

  const cabecalho = (
    <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
      <tr>
        <th className="px-6 py-4 font-bold">Módulo</th>
        {ACOES.map((a) => (
          <th key={a} className="px-4 py-4 font-bold text-center">{a}</th>
        ))}
      </tr>
    </thead>
  )

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Diretoria / Controle de Acesso"
        titulo="Matriz de Acesso"
        descricao="Permissões por módulo e por ação (visualizar, criar, editar, excluir, exportar). O ADM tem acesso total; o colaborador só atua no próprio setor."
      />

      <Tabs
        abas={[
          { id: 'ADM', label: 'Administrador' },
          { id: 'GERENTE', label: 'Gerência' },
          { id: 'COLABORADOR', label: 'Colaborador setorial' },
        ]}
        ativa={aba}
        onChange={setAba}
      />

      <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl">
        <Icon nome="lock" className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-200/80 leading-relaxed">
          Esconder um menu não protege um dado. Esta matriz controla a interface agora e deve ser replicada nas políticas RLS do Supabase
          (ver <code className="text-blue-300">docs/SUPABASE_PROMPT.md</code>) para que a API também bloqueie o acesso.
        </p>
      </div>

      <Panel semPadding titulo={aba === 'ADM' ? 'Acesso total (não editável)' : editavel ? 'Clique para conceder ou remover' : 'Somente leitura'}>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-zinc-300">
            {cabecalho}
            <tbody className="divide-y divide-white/[0.02]">
              {aba === 'COLABORADOR' ? (
                <tr>
                  <td className="px-6 py-4">
                    <p className="text-white font-bold">Módulo do próprio setor</p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Vendas só vê Vendas, Produção só vê Produção...</p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">As Operações também excluem dentro do próprio setor</p>
                  </td>
                  {ACOES.map((a: Acao) => (
                    <td key={a} className="px-4 py-4">
                      <Celula ativo={s.permissoes.COLABORADOR.setor_proprio.includes(a)} editavel={editavel} onClick={() => alternarPermissao('COLABORADOR', 'setor_proprio', a)} />
                    </td>
                  ))}
                </tr>
              ) : (
                MODULOS.map((m) => (
                  <tr key={m.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3.5 text-white font-bold">{m.label}</td>
                    {ACOES.map((a) => (
                      <td key={a} className="px-4 py-3">
                        {aba === 'ADM' ? (
                          <Celula ativo editavel={false} />
                        ) : (
                          <Celula ativo={s.permissoes.GERENTE[m.id]?.includes(a) ?? false} editavel={editavel} onClick={() => alternarPermissao('GERENTE', m.id, a)} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
