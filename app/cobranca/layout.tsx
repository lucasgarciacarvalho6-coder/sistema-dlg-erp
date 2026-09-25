import SectorShell from '@/components/erp/SectorShell'

// Layout isolado: Sidebar e Header exclusivos do setor cobranca
export default function CobrancaLayout({ children }: { children: React.ReactNode }) {
  return <SectorShell setor="cobranca">{children}</SectorShell>
}
