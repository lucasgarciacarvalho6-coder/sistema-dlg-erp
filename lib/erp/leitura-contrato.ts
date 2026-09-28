// Leitura automática do contrato de escola.
//   1º) IA do Google (Gemini, cota gratuita) pela Edge Function "ler-contrato": lê a LETRA À MÃO
//       do modelo de contrato da DLG (escola, endereço, celular, turmas, doação, data...).
//   2º) Se a IA não estiver disponível: leitura no próprio navegador (OCR Tesseract / texto do PDF)
//       + interpretador de rótulos. Bom para contrato digitado; letra à mão fica fraca.
// Na leitura do navegador, a primeira vez baixa o idioma português (~2 MB); depois fica em cache.

import { interpretarContrato, interpretarContratoVenda, normalizarLeituraIA, normalizarLeituraVenda, type CamposContrato, type LeituraVenda } from './contrato-parser'
import { lerContratoComIA } from './store'

export type LeituraContrato =
  | { campos: CamposContrato; duvidas: string[]; observacao: string; texto: string; fonte: 'ia' | 'local'; aviso?: string }
  | { erro: string }

export type Progresso = (p: number, etapa: string) => void

const MAX_LADO_OCR = 2400 // px: suficiente para o OCR e bem mais rápido que a foto original
const MAX_LADO_IA = 2000
const MODO_DEMO_IA = 'Modo demonstração' // no demo não há IA: não precisa avisar

function redimensionar(fonte: ImageBitmap | HTMLCanvasElement, maxLado: number, filtro = 'none'): HTMLCanvasElement {
  const escala = Math.min(1, maxLado / Math.max(fonte.width, fonte.height))
  const c = document.createElement('canvas')
  c.width = Math.round(fonte.width * escala)
  c.height = Math.round(fonte.height * escala)
  const ctx = c.getContext('2d')!
  ctx.filter = filtro
  ctx.drawImage(fonte, 0, 0, c.width, c.height)
  return c
}

// Páginas do arquivo como canvas coloridos (foto = 1 página; PDF = até 3 páginas renderizadas)
async function paginasDoArquivo(arquivo: File): Promise<HTMLCanvasElement[]> {
  if (arquivo.type === 'application/pdf') {
    const doc = await abrirPdf(arquivo)
    const paginas: HTMLCanvasElement[] = []
    for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
      const pagina = await doc.getPage(i)
      const vp = pagina.getViewport({ scale: 2 })
      const c = document.createElement('canvas')
      c.width = vp.width
      c.height = vp.height
      await pagina.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
      paginas.push(c)
    }
    return paginas
  }
  const bitmap = await createImageBitmap(arquivo)
  const c = redimensionar(bitmap, 4000)
  bitmap.close()
  return [c]
}

async function abrirPdf(arquivo: File) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  return pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise
}

// ---------------- Leitura com IA ----------------

// ---------------- Leitura no navegador (OCR) ----------------

// psm '4' = texto em colunas: lê bem formulários com tabela (ex.: o Contrato de Compra)
async function ocr(imagens: HTMLCanvasElement[], progresso: Progresso, psm?: string): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  let pagina = 0
  const worker = await createWorker('por', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') progresso((pagina + m.progress) / imagens.length, 'Lendo o texto')
    },
  })
  try {
    if (psm) await worker.setParameters({ tessedit_pageseg_mode: psm as never })
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

async function lerNoNavegador(arquivo: File, paginas: HTMLCanvasElement[], vendedores: string[], progresso: Progresso, psm?: string) {
  let texto = ''
  if (arquivo.type === 'application/pdf') {
    // PDF digital: usa o texto do próprio arquivo; escaneado: OCR das páginas
    const doc = await abrirPdf(arquivo)
    for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
      const conteudo = await (await doc.getPage(i)).getTextContent()
      texto += conteudo.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join('') + '\n'
    }
  }
  if (texto.replace(/\s/g, '').length < 40) {
    texto = await ocr(
      paginas.map((p) => redimensionar(p, MAX_LADO_OCR, 'grayscale(1) contrast(1.35)')),
      progresso,
      psm,
    )
  }
  return texto
}

// ---------------- Entrada única ----------------

// Aceita 1 arquivo (foto ou PDF) ou várias fotos (páginas enviadas pelo app do vendedor)
export async function lerContratoLocal(entrada: File | File[], vendedores: string[], progresso: Progresso = () => {}): Promise<LeituraContrato> {
  const arquivos = Array.isArray(entrada) ? entrada : [entrada]
  const arquivo = arquivos[0]
  if (!arquivo) return { erro: 'Nenhum arquivo para ler.' }
  try {
    let paginas: HTMLCanvasElement[] = []
    try {
      for (const a of arquivos) paginas = paginas.concat(await paginasDoArquivo(a))
    } catch {
      return { erro: 'Não consegui abrir esse arquivo. Envie a foto em JPG/PNG ou um PDF.' }
    }

    // 1º) IA (lê letra à mão)
    progresso(0.15, 'Lendo com IA')
    const jpegs = paginas.map((p) => redimensionar(p, MAX_LADO_IA).toDataURL('image/jpeg', 0.85).split(',')[1])
    const ia = await lerContratoComIA(jpegs, vendedores)
    if ('campos' in ia) {
      progresso(1, 'Pronto')
      return { ...normalizarLeituraIA(ia.campos, vendedores), fonte: 'ia' }
    }

    // 2º) navegador (OCR)
    progresso(0, 'Lendo o texto')
    const texto = await lerNoNavegador(arquivo, paginas, vendedores, progresso)
    const aviso = ia.indisponivel ? undefined : `Leitor com IA: ${ia.erro} Usei a leitura básica do navegador.`
    if (texto.replace(/\s/g, '').length < 20) return { erro: `${aviso ? `${aviso} ` : ''}Não encontrei texto legível. Tire a foto mais de perto, com boa luz e o papel reto.` }
    return { ...interpretarContrato(texto, vendedores), observacao: '', texto, fonte: 'local', aviso }
  } catch (e) {
    console.error('Leitura do contrato', e)
    return { erro: 'Não foi possível ler o arquivo agora (verifique a internet). Preencha à mão ou tente de novo.' }
  }
}

// ---------------- Contrato de Compra (venda de books, app do vendedor) ----------------

export type LeituraContratoVenda = (LeituraVenda & { fonte: 'ia' | 'local'; aviso?: string }) | { erro: string }

export async function lerContratoVenda(fotos: File[], progresso: Progresso = () => {}): Promise<LeituraContratoVenda> {
  if (!fotos.length) return { erro: 'Fotografe o contrato.' }
  try {
    let paginas: HTMLCanvasElement[] = []
    try {
      for (const f of fotos) paginas = paginas.concat(await paginasDoArquivo(f))
    } catch {
      return { erro: 'Não consegui abrir a foto. Tire de novo.' }
    }
    progresso(0.15, 'Lendo com IA')
    const jpegs = paginas.map((p) => redimensionar(p, MAX_LADO_IA).toDataURL('image/jpeg', 0.85).split(',')[1])
    const ia = await lerContratoComIA(jpegs, [], 'venda')
    if ('campos' in ia) {
      progresso(1, 'Pronto')
      return { ...normalizarLeituraVenda(ia.campos), fonte: 'ia' }
    }
    progresso(0, 'Lendo o texto')
    const texto = await lerNoNavegador(fotos[0], paginas, [], progresso, '4')
    // mostra sempre o motivo (no celular não há console): ajuda a descobrir por que a IA não leu
    const aviso = MODO_DEMO_IA === ia.erro ? undefined : `Leitor com IA: ${ia.erro} Usei a leitura básica.`
    if (texto.replace(/\s/g, '').length < 20) return { erro: `${aviso ? `${aviso} ` : ''}Não encontrei texto legível. Tire a foto mais de perto, com boa luz e o papel reto.` }
    return { ...interpretarContratoVenda(texto), fonte: 'local', aviso }
  } catch (e) {
    console.error('Leitura do contrato de venda', e)
    return { erro: 'Não foi possível ler agora (verifique a internet). Preencha à mão ou tente de novo.' }
  }
}
