'use client'

// Cobrança › Configurações (Parte 2, etapa 2.1 — SQL 039): regras de negociação, categorias, escritórios externos e as
// situações/tipos de contato (fixos). ADM e Gerência alteram; a Cobrança (e o Financeiro) consultam.

import { useState } from 'react'
import { useErp, usePode } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { regrasCobranca, SITUACOES_COBRANCA, TIPOS_CONTATO } from '@/lib/erp/cobranca-config'
import { Badge, PageHeader, Panel, Tabs } from '@/components/erp/ui'
import RegrasCobranca from '@/components/cobranca/RegrasCobranca'
import CategoriasCobranca from '@/components/cobranca/CategoriasCobranca'
import EscritoriosCobranca from '@/components/cobranca/EscritoriosCobranca'

type Aba = 'regras' | 'categorias' | 'escritorios' | 'situacoes'

export default function ConfiguracoesCobrancaPage() {
  const s = useErp()
  const podeFazer = usePode()
  const editavel = podeFazer('cadastros', 'editar')
  const [aba, setAba] = useState<Aba>('regras')
  // quando as regras salvas mudam (salvou, ou chegou do servidor), os campos voltam a mostrar o valor salvo
  const assinaturaRegras = JSON.stringify(regrasCobranca(s))

  return (
    <div className="space-y-8 animate-fade-in-up">
      <PageHeader
        modulo="Cobrança / Configurações"
        titulo="Configurações da Cobrança"
        descricao="Regras de negociação, categorias das cobranças e escritórios externos. ADM e Gerência alteram; a equipe consulta."
      />
      {!editavel && <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-zinc-400">Somente leitura: ADM e Gerência alteram as configurações.</p>}
      <Tabs
        abas={[
          { id: 'regras' as Aba, label: 'Regras de negociação' },
          { id: 'categorias' as Aba, label: `Categorias (${colecao(s, 'cobranca_categorias').length})` },
          { id: 'escritorios' as Aba, label: `Escritórios (${colecao(s, 'cobranca_escritorios').length})` },
          { id: 'situacoes' as Aba, label: 'Situações e contatos' },
        ]}
        ativa={aba}
        onChange={setAba}
      />
      {aba === 'regras' && <RegrasCobranca key={assinaturaRegras} editavel={editavel} />}
      {aba === 'categorias' && <CategoriasCobranca editavel={editavel} />}
      {aba === 'escritorios' && <EscritoriosCobranca editavel={editavel} />}
      {aba === 'situacoes' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <Panel semPadding titulo="Situações da cobrança" subtitulo="Os 9 estados oficiais do manual e o que vem depois da entrada. Fixas no sistema.">
              <div className="divide-y divide-white/[0.03]">
                {SITUACOES_COBRANCA.map((x, i) => (
                  <div key={x.nome} className="px-6 py-3.5 flex flex-wrap items-center gap-3">
                    <span className="w-6 text-xs font-black text-zinc-500">{i + 1}</span>
                    <Badge texto={x.nome} tom={x.tom} />
                    <span className="text-sm text-zinc-400">{x.descricao}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <Panel titulo="Tipos de contato" subtitulo="Como a cobradora falou com o cliente">
            <div className="flex flex-wrap gap-2">
              {TIPOS_CONTATO.map((t) => (
                <Badge key={t} texto={t} tom="zinc" />
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
