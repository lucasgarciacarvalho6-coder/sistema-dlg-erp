import SectorShell from '@/components/erp/SectorShell'

// Layout isolado: Sidebar e Header exclusivos do setor adm
export default function AdmLayout({ children }: { children: React.ReactNode }) {
  return <SectorShell setor="adm">{children}</SectorShell>
}
