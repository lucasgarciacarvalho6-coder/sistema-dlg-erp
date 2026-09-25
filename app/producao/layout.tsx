import SectorShell from '@/components/erp/SectorShell'

// Layout isolado: Sidebar e Header exclusivos do setor producao
export default function ProducaoLayout({ children }: { children: React.ReactNode }) {
  return <SectorShell setor="producao">{children}</SectorShell>
}
