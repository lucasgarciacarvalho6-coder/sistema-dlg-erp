import type { Metadata } from 'next'

// App da Revelação: o app instalável é um só (DLG PHOTOS, layout de /app); aqui só o título da página
export const metadata: Metadata = {
  title: 'DLG Revelação',
  description: 'Soltar caixas e álbuns revelados',
}

export default function AppProducaoLayout({ children }: { children: React.ReactNode }) {
  return children
}
