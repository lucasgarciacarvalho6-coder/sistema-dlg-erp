import type { Metadata } from 'next'

// App dos vendedores externos: o app instalável é um só (DLG PHOTOS, layout de /app); aqui só o título da página
export const metadata: Metadata = {
  title: 'DLG Vendedor',
  description: 'App dos vendedores externos da DLG Photos',
}

export default function AppVendedorLayout({ children }: { children: React.ReactNode }) {
  return children
}
