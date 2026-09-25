import SectorShell from '@/components/erp/SectorShell'

// Layout isolado: Sidebar e Header exclusivos do setor financeiro
export default function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  return <SectorShell setor="financeiro">{children}</SectorShell>
}
