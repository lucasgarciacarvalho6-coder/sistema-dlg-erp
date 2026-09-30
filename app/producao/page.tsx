'use client'

import SectorDashboard from '@/components/erp/SectorDashboard'
import { StatCard } from '@/components/erp/ui'
import { useErp } from '@/lib/erp/store'
import { equipe, resumo, situacaoResumo } from '@/lib/erp/metrics'
import { hoje, mesAtual, num } from '@/lib/erp/format'

// A equipe da Revelação só informa, pelo app, quantos álbuns revelou no dia.
// Aqui o dono acompanha o total do dia e do mês e quem está abaixo do piso.
export default function ProducaoDashboardPage() {
  const s = useErp()
  const mes = mesAtual()
  const r = resumo(s, 'producao', 'books', mes)
  const time = equipe(s, 'producao')
  const lancaramHoje = new Set(s.lancamentos.filter((l) => l.setor === 'producao' && l.indicador === 'books' && l.data === hoje()).map((l) => l.colaboradorId))
  const abaixoDoPiso = time.filter((c) => situacaoResumo(resumo(s, 'producao', 'books', mes, c.id), mes) === 'critico').length

  return (
    <SectorDashboard
      setor="producao"
      titulo="Álbuns revelados"
      descricao="A equipe lança pelo app a quantidade de álbuns revelados no dia. Metas diária e mensal e piso de cada pessoa."
      tituloEquipe="Revelação • metas diárias e mensais"
      antesDaEquipe={
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
          <StatCard tom="violet" label="Álbuns hoje" valor={num(r.hoje)} detalhe={`Meta do dia: ${num(Math.round(r.meta.diaria))}`} />
          <StatCard tom="blue" label="Álbuns no mês" valor={num(r.mes)} detalhe={`Meta: ${num(r.meta.mensal)} • projeção ${num(Math.round(r.projecao))}`} />
          <StatCard tom="emerald" label="Lançaram hoje" valor={`${lancaramHoje.size}/${time.length}`} detalhe="Pessoas que já informaram o dia" />
          <StatCard tom={abaixoDoPiso ? 'red' : 'emerald'} label="Abaixo do piso" valor={abaixoDoPiso} detalhe="No ritmo atual do mês" />
        </div>
      }
    />
  )
}
