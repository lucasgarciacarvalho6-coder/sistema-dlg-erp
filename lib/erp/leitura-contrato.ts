// Leitura automática do contrato — GRÁTIS, no próprio navegador (sem IA paga, sem chave):
//   foto → OCR (Tesseract, português) → texto → interpretarContrato() → campos do formulário
//   PDF  → texto do próprio PDF (ou OCR das páginas, se for PDF escaneado)
// Na primeira leitura o navegador baixa o idioma português (~2 MB); depois fica em cache.

import { interpretarContrato, type ResultadoInterpretacao } from './contrato-parser'

export type LeituraContrato = (ResultadoInterpretacao & { texto: string }) | { erro: string }

const MAX_LADO = 2400 // px: suficiente para o OCR e bem mais rápido que a foto original

async function paraCanvas(fonte: ImageBitmap | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const escala = Math.min(1, MAX_LADO / Math.max(fonte.width, fonte.height))
  const c = document.createElement('canvas')
  c.width = Math.round(fonte.width * escala)
  c.height = Math.round(fonte.height * escala)
  const ctx = c.getContext('2d')!
  ctx.filter = 'grayscale(1) contrast(1.35)' // papel amarelado / sombra da foto atrapalham menos
  ctx.drawImage(fonte, 0, 0, c.width, c.height)
  return c
}

async function ocr(imagens: HTMLCanvasElement[], progresso: (p: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  let pagina = 0
  const worker = await createWorker('por', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') progresso((pagina + m.progress) / imagens.length)
    },
  })
  try {
    const textos: string[] = []
    for (; pagina < imagens.length; pagina++) {
      const { data } = await worker.recognize(imagens[pagina])
      textos.push(data.text)
    }
    return textos.join('\n')
  } finally {
    await worker.terminate()
  }
}

async function textoDoPdf(arquivo: File, progresso: (p: number) => void): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise
  const paginas = Math.min(doc.numPages, 3)
  const textos: string[] = []
  const escaneadas: HTMLCanvasElement[] = []
  for (let i = 1; i <= paginas; i++) {
    const pagina = await doc.getPage(i)
    const conteudo = await pagina.getTextContent()
    const texto = conteudo.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join('')
    if (texto.replace(/\s/g, '').length > 40) textos.push(texto)
    else {
      // PDF escaneado (só imagem): renderiza a página e passa no OCR
      const vp = pagina.getViewport({ scale: 2 })
      const c = document.createElement('canvas')
      c.width = vp.width
      c.height = vp.height
      await pagina.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
      escaneadas.push(await paraCanvas(c))
    }
  }
  if (escaneadas.length) textos.push(await ocr(escaneadas, progresso))
  return textos.join('\n')
}

export async function lerContratoLocal(arquivo: File, vendedores: string[], progresso: (p: number) => void = () => {}): Promise<LeituraContrato> {
  try {
    let texto: string
    if (arquivo.type === 'application/pdf') texto = await textoDoPdf(arquivo, progresso)
    else {
      let bitmap: ImageBitmap
      try {
        bitmap = await createImageBitmap(arquivo)
      } catch {
        return { erro: 'Não consegui abrir essa foto. Envie em JPG ou PNG.' }
      }
      const canvas = await paraCanvas(bitmap)
      bitmap.close()
      texto = await ocr([canvas], progresso)
    }
    if (texto.replace(/\s/g, '').length < 20) return { erro: 'Não encontrei texto legível. Tire a foto mais de perto, com boa luz e o papel reto.' }
    return { ...interpretarContrato(texto, vendedores), texto }
  } catch (e) {
    console.error('Leitura do contrato', e)
    return { erro: 'Não foi possível ler o arquivo agora (verifique a internet na primeira leitura). Preencha à mão ou tente de novo.' }
  }
}
