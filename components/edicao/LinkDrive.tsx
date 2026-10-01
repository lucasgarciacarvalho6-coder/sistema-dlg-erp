'use client'

// Drive do envio / do recebimento: o campo é texto livre — a Produção escreve "OneDrive" ou cola o LINK da pasta.
// Link vira um atalho curto e clicável (🔗 Google Drive / 🔗 OneDrive), para não estourar a tabela.

function rotuloLink(v: string): string | null {
  if (!/^https?:\/\//i.test(v)) return null
  if (/drive\.google|docs\.google/i.test(v)) return 'Google Drive'
  if (/onedrive|1drv\.ms|sharepoint/i.test(v)) return 'OneDrive'
  return 'link'
}

export function Drive({ valor }: { valor: unknown }) {
  const v = String(valor ?? '').trim()
  if (!v) return null
  const rotulo = rotuloLink(v)
  if (!rotulo) return <>{v}</>
  return (
    <a href={v} target="_blank" rel="noopener noreferrer" title={v} onClick={(e) => e.stopPropagation()} className="font-bold text-blue-400 hover:text-blue-300 underline underline-offset-2">
      🔗 {rotulo}
    </a>
  )
}

// Texto do histórico: cada link colado vira o atalho curto
export function TextoComLinks({ texto }: { texto: string }) {
  const partes = texto.split(/(https?:\/\/[^\s)]+)/g)
  return <>{partes.map((p, i) => (/^https?:\/\//i.test(p) ? <Drive key={i} valor={p} /> : <span key={i}>{p}</span>))}</>
}
