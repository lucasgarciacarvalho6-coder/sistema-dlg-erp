import SectorShell from '@/components/erp/SectorShell'

// Layout isolado: Sidebar e Header exclusivos do setor gerencia
export default function GerenciaLayout({ children }: { children: React.ReactNode }) {
  return <SectorShell setor="gerencia">{children}</SectorShell>
}
