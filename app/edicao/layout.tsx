import SectorShell from '@/components/erp/SectorShell'

// Layout isolado: Sidebar e Header exclusivos do setor Produção (id 'edicao')
export default function ProducaoLayout({ children }: { children: React.ReactNode }) {
  return <SectorShell setor="edicao">{children}</SectorShell>
}
