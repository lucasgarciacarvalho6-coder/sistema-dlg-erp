import type { Metadata, Viewport } from 'next'

// App instalável (PWA) da Produção: "Adicionar à tela inicial" no celular
export const metadata: Metadata = {
  title: 'DLG Produção',
  description: 'Lançamento diário de books produzidos',
  manifest: '/manifest-producao.webmanifest',
  appleWebApp: { capable: true, title: 'DLG Produção', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icones/app-192.png', apple: '/icones/app-192.png' },
}

export const viewport: Viewport = { themeColor: '#000000', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function AppProducaoLayout({ children }: { children: React.ReactNode }) {
  return children
}
