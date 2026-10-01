import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import RegistrarSW from '@/components/app/RegistrarSW'

// Página ABERTA (sem login) do app DLG PHOTOS: é o endereço que se coloca no PWABuilder para gerar o APK
// (o app em si pede login e o PWABuilder não passaria da tela de login). Um app só para todos os setores do celular.
export const metadata: Metadata = {
  title: 'DLG PHOTOS',
  description: 'App da equipe DLG Photos',
  manifest: '/manifest-app.webmanifest',
  appleWebApp: { capable: true, title: 'DLG PHOTOS', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icones/app-192.png', apple: '/icones/app-192.png' },
}

export const viewport: Viewport = { themeColor: '#000000', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function InstalarAppPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <RegistrarSW arquivo="/sw-app.js" escopo="/" />
      <div className="max-w-sm w-full text-center space-y-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icones/app-192.png" alt="DLG PHOTOS" className="w-24 h-24 mx-auto rounded-3xl" />
        <div>
          <h1 className="text-2xl font-black">DLG PHOTOS</h1>
          <p className="text-sm text-zinc-400 mt-2">App da equipe. Faça o login e o app abre direto no seu setor.</p>
        </div>
        <Link href="/app" className="block w-full rounded-2xl bg-blue-600 hover:bg-blue-500 py-4 text-sm font-bold uppercase tracking-widest">
          Abrir o app
        </Link>
      </div>
    </main>
  )
}
