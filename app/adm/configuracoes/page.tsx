'use client'

import { useRef, useState } from 'react'
import { MODO, exportarBackup, importarBackup, restaurarDemo, salvarEmpresa, useErp, usePode } from '@/lib/erp/store'
import Icon from '@/components/erp/Icon'
import { Badge, Modal, PageHeader, Panel, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'

const INTEGRACOES = [
  { nome: 'Supabase (Banco, Auth, Realtime)', descricao: 'Backend oficial do ERP. Script em docs/supabase/schema.sql.', conectado: MODO === 'supabase' },
  { nome: 'WhatsApp (cobrança e avisos)', descricao: 'Envio de lembretes de vencimento aos pais.', conectado: false },
  { nome: 'E-mail transacional', descricao: 'Recuperação de senha (Supabase Auth) e notificações externas.', conectado: MODO === 'supabase' },
  { nome: 'Storage de arquivos', descricao: 'Buckets "contratos" e "ebooks" criados pelo schema; upload ainda não ligado às telas.', conectado: false },
]

export default function ConfiguracoesPage() {
  const s = useErp()
  const podeFazer = usePode()
  const editavel = podeFazer('configuracoes', 'editar')
  const [empresa, setEmpresa] = useState(s.empresa)
  const [salvo, setSalvo] = useState(false)
  const [confirmarReset, setConfirmarReset] = useState(false)
  const [msg, setMsg] = useState('')
  const arquivo = useRef<HTMLInputElement>(null)

  const baixarBackup = () => {
    const url = URL.createObjectURL(new Blob([exportarBackup()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `backup-dlg-erp-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importar = async (f: File | undefined) => {
    if (!f) return
    const erro = importarBackup(await f.text())
    setMsg(erro ?? 'Backup importado com sucesso.')
  }

  const campo = (chave: keyof typeof empresa, label: string) => (
    <div className="space-y-2">
      <label className={labelCls}>{label}</label>
      <input disabled={!editavel} value={empresa[chave]} onChange={(e) => setEmpresa({ ...empresa, [chave]: e.target.value })} className={`${inputCls} disabled:opacity-60`} />
    </div>
  )

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader modulo="Núcleo Central / Configurações" titulo="Configurações" descricao="Dados da empresa, backup, integrações e ambiente de demonstração." />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel titulo="Dados da empresa">
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (await salvarEmpresa(empresa)) return
              setSalvo(true)
              setTimeout(() => setSalvo(false), 2000)
            }}
            className="grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            {campo('nome', 'Razão social / Nome')}
            {campo('cnpj', 'CNPJ')}
            {campo('email', 'E-mail')}
            {campo('telefone', 'Telefone')}
            {campo('cidade', 'Cidade')}
            {campo('uf', 'UF')}
            {editavel && (
              <div className="md:col-span-2 flex justify-end">
                <button type="submit" className={btnPrimario}>{salvo ? 'Salvo ✓' : 'Salvar dados'}</button>
              </div>
            )}
          </form>
        </Panel>

        <div className="space-y-6">
          <Panel titulo="Backup" subtitulo="Cópia completa do núcleo de dados (JSON)">
            <div className="flex flex-wrap gap-3">
              <button onClick={baixarBackup} className={btnSecundario}>
                <Icon nome="download" className="w-4 h-4" /> Baixar backup
              </button>
              {editavel && MODO === 'demo' && (
                <>
                  <button onClick={() => arquivo.current?.click()} className={btnSecundario}>
                    <Icon nome="upload" className="w-4 h-4" /> Importar backup
                  </button>
                  <input ref={arquivo} type="file" accept="application/json" className="hidden" onChange={(e) => importar(e.target.files?.[0])} />
                </>
              )}
            </div>
            {msg && <p className="text-xs font-bold text-blue-400 mt-4">{msg}</p>}
          </Panel>

          {MODO === 'demo' ? (
          <Panel titulo="Ambiente de demonstração">
            <p className="text-sm text-zinc-400 mb-4">
              Os dados atuais ficam salvos neste navegador. Restaurar recria colaboradores, metas e histórico fictícios (senha padrão 123456).
            </p>
            {editavel && (
              <button onClick={() => setConfirmarReset(true)} className="px-5 py-3 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-xs font-bold uppercase tracking-widest rounded-xl transition-all">
                Restaurar dados de demonstração
              </button>
            )}
          </Panel>
          ) : (
            <Panel titulo="Banco de dados" subtitulo="Supabase conectado">
              <p className="text-sm text-zinc-400">
                Os dados ficam no Supabase, protegidos por RLS e atualizados em tempo real. Para backup completo, use o painel do Supabase
                (Database → Backups). O botão acima baixa uma cópia do que o seu perfil enxerga.
              </p>
            </Panel>
          )}
        </div>
      </div>

      <Panel titulo="Integrações externas" semPadding>
        <div className="divide-y divide-white/[0.03]">
          {INTEGRACOES.map((i) => (
            <div key={i.nome} className="px-6 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-white">{i.nome}</p>
                <p className="text-[11px] text-zinc-500">{i.descricao}</p>
              </div>
              <Badge texto={i.conectado ? 'Conectado' : 'Não configurado'} tom={i.conectado ? 'emerald' : 'orange'} />
            </div>
          ))}
        </div>
      </Panel>

      <Modal
        aberto={confirmarReset}
        titulo="Restaurar demonstração?"
        subtitulo="Todos os dados atuais deste navegador serão substituídos"
        onFechar={() => setConfirmarReset(false)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setConfirmarReset(false)} className={btnSecundario}>Cancelar</button>
            <button
              onClick={() => {
                restaurarDemo()
                setConfirmarReset(false)
                setMsg('Dados de demonstração restaurados.')
              }}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest rounded-xl"
            >
              Restaurar
            </button>
          </>
        }
      >
        <p className="text-sm text-zinc-300">Recomendado baixar um backup antes. Esta ação não pode ser desfeita.</p>
      </Modal>
    </div>
  )
}
