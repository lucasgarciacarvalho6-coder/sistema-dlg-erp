import type { Metadata, Viewport } from 'next'
import RegistrarSW from '@/components/app/RegistrarSW'

// App instalável DLG PHOTOS (PWA / APK): um app só para todos os setores do celular.
// Abre em /app e, depois do login, cada pessoa vai direto para o app do seu setor (Revelação, Vendedor...).
export const metadata: Metadata = {
  title: 'DLG PHOTOS',
  description: 'App da equipe DLG Photos',
  manifest: '/manifest-app.webmanifest',
  appleWebApp: { capable: true, title: 'DLG PHOTOS', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icones/app-192.png', apple: '/icones/app-192.png' },
}

export const viewport: Viewport = { themeColor: '#000000', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegistrarSW arquivo="/sw-app.js" escopo="/" />
      {children}
    </>
  )
}
