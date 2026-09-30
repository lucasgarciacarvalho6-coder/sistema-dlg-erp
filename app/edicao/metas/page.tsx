'use client'

import SectorDashboard from '@/components/erp/SectorDashboard'

// PRODUÇÃO › Metas e bônus: meta individual de 1.000 álbuns no mês. Os álbuns entram sozinhos na conferência final
// (para quem aprovou a análise de qualidade), por isso não tem "Registrar produção".
export default function MetasProducaoPage() {
  return (
    <SectorDashboard
      setor="edicao"
      titulo="Metas e bônus"
      descricao="Cada colaboradora tem a meta de 1.000 álbuns no mês. Os álbuns contam no dia da conferência final, para quem aprovou a análise de qualidade. Bônus: R$ 300 aos 1.000 álbuns + R$ 30 a cada 100 completos acima."
      tituloEquipe="Produção • meta individual e bônus"
      registroManual={false}
    />
  )
}
