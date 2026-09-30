'use client'

import CrudPage from '@/components/erp/CrudPage'
import { num } from '@/lib/erp/format'
import { lotesProducao } from '@/lib/erp/producao'

// Editores (PJ): não usam o sistema. É só a lista da Produção para escolher a quem mandar as fotos de cada escola.
export default function EditoresPage() {
  return (
    <CrudPage
      colecao="editores"
      modulo="edicao"
      setor="edicao"
      moduloLabel="Produção / Editores"
      titulo="Editores"
      descricao="Quem faz a diagramação e a montagem dos álbuns. Os editores não entram no sistema: a Produção escolhe o editor ao enviar as fotos de cada escola."
      rotuloNovo="Novo editor"
      campos={[
        { chave: 'nome', label: 'Nome', tipo: 'texto', obrigatorio: true, exibir: (r) => <span className="font-bold text-white">{String(r.nome)}</span> },
        { chave: 'telefone', label: 'Telefone / WhatsApp', tipo: 'telefone' },
        {
          chave: 'comEle',
          label: 'Com ele agora',
          tipo: 'texto',
          formulario: false,
          exibir: (r, s) => {
            const lotes = lotesProducao(s).filter((l) => l.editorId === r.id && l.etapa === 'Em edição')
            if (!lotes.length) return <span className="text-xs text-zinc-500">—</span>
            return (
              <span className="text-xs">
                <strong className="text-white">{lotes.length} escola(s)</strong> <span className="text-zinc-400">• {num(lotes.reduce((a, l) => a + (Number(l.albuns) || 0), 0))} álbuns</span>
              </span>
            )
          },
        },
        { chave: 'status', label: 'Situação', tipo: 'select', opcoes: ['Ativo', 'Inativo'], obrigatorio: true, padrao: () => 'Ativo', tabela: false },
        { chave: 'observacao', label: 'Observação', tipo: 'textarea', tabela: false },
      ]}
      status={{ campo: 'status', tons: { Ativo: 'emerald', Inativo: 'zinc' } }}
    />
  )
}
