import type { Metadata, Viewport } from 'next'

// App instalável (PWA) dos vendedores externos: "Adicionar à tela inicial" no celular
export const metadata: Metadata = {
  title: 'DLG Vendedor',
  description: 'App dos vendedores externos da DLG Photos',
  manifest: '/manifest-vendedor.webmanifest',
  appleWebApp: { capable: true, title: 'DLG Vendedor', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icones/app-192.png', apple: '/icones/app-192.png' },
}

export const viewport: Viewport = { themeColor: '#000000', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function AppVendedorLayout({ children }: { children: React.ReactNode }) {
  return children
}
