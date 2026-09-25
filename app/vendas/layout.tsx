import SectorShell from '@/components/erp/SectorShell'

// Layout isolado: Sidebar e Header exclusivos do setor vendas
export default function VendasLayout({ children }: { children: React.ReactNode }) {
  return <SectorShell setor="vendas">{children}</SectorShell>
}
