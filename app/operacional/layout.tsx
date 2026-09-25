import SectorShell from '@/components/erp/SectorShell'

// Layout isolado: Sidebar e Header exclusivos do setor operacional
export default function OperacionalLayout({ children }: { children: React.ReactNode }) {
  return <SectorShell setor="operacional">{children}</SectorShell>
}
