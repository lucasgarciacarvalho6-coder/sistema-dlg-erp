import SectorShell from '@/components/erp/SectorShell'

// Layout isolado: Sidebar e Header exclusivos do setor Vendas Rebolo
export default function ReboloLayout({ children }: { children: React.ReactNode }) {
  return <SectorShell setor="rebolo">{children}</SectorShell>
}
