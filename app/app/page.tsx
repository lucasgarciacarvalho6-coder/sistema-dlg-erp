'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStatus, useUsuario } from '@/lib/erp/store'
import { rotaInicial } from '@/lib/erp/permissions'
import { Carregando } from '@/components/erp/ui'

// Entrada do app DLG PHOTOS: o próprio app leva cada pessoa para o seu setor
// (Revelação → /app/producao, vendedor externo → /app/vendedor, demais → sua área). Sem login → /login.
export default function EntradaAppPage() {
  const router = useRouter()
  const pronto = useStatus() === 'pronto' // espera a sessão carregar (no Supabase ela chega depois)
  const usuario = useUsuario()
  useEffect(() => {
    if (!pronto) return
    router.replace(usuario ? rotaInicial(usuario) : '/login')
  }, [pronto, usuario, router])
  return <Carregando />
}
