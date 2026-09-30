'use client'

import { brl, num } from '@/lib/erp/format'
import { META_BONUS, bonusAlbuns, proximoBonus } from '@/lib/erp/producao'

// Bônus do mês de cada colaboradora da Produção (regra do dono): 1.000 álbuns → R$ 300; + R$ 30 a cada 100 completos acima.
// Usado nos cards do painel da Produção e no painel da pessoa.
export function LinhaBonus({ albuns, className = '' }: { albuns: number; className?: string }) {
  const valor = bonusAlbuns(albuns)
  const prox = proximoBonus(albuns)
  const reais = (v: number) => brl(v).replace(/,00$/, '')
  return valor > 0 ? (
    <p className={`text-[11px] font-bold text-emerald-400 ${className}`}>
      💰 Bônus do mês: <span className="text-white">{reais(valor)}</span> • faltam {num(prox.faltam)} álbuns para +{reais(prox.valor)}
    </p>
  ) : (
    <p className={`text-[11px] font-bold text-zinc-400 ${className}`}>
      💰 Bônus de <span className="text-white">{reais(prox.valor)}</span> aos {num(META_BONUS)} álbuns • faltam {num(prox.faltam)}
    </p>
  )
}
