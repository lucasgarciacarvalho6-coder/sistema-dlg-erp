import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { SCRIPT_TEMA } from '@/lib/tema-script'
import PolyfillContainer from '@/components/erp/PolyfillContainer'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'DLG PHOTOS | Sistema ERP',
  description: 'Plataforma de gestão integrada para estúdios fotográficos e eventos.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // data-theme é definido pelo script antes da pintura (tema salvo no navegador)
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className={inter.className}>
        {children}
        {/* só carrega algo em navegador antigo (TV): ver PolyfillContainer */}
        <PolyfillContainer />
      </body>
    </html>
  )
}
