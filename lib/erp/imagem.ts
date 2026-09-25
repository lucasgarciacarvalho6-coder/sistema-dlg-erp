// Foto de perfil: recorta em quadrado (centro) e reduz para 320×320 JPEG no navegador.
// Uma foto de celular de ~4 MB vira ~25 KB — carrega rápido na Visão TV.

export const TAMANHO_MAX_FOTO_MB = 10

export function validarFoto(arquivo: File): string | null {
  if (!arquivo.type.startsWith('image/')) return 'Escolha um arquivo de imagem (JPG, PNG ou WEBP).'
  if (arquivo.size > TAMANHO_MAX_FOTO_MB * 1024 * 1024) return `A imagem precisa ter no máximo ${TAMANHO_MAX_FOTO_MB} MB.`
  return null
}

export async function prepararFoto(arquivo: File, lado = 320): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo)
  const escala = Math.max(lado / imagem.width, lado / imagem.height)
  const largura = imagem.width * escala
  const altura = imagem.height * escala
  const canvas = document.createElement('canvas')
  canvas.width = lado
  canvas.height = lado
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível processar a imagem.')
  ctx.drawImage(imagem, (lado - largura) / 2, (lado - altura) / 2, largura, altura)
  imagem.close()
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível processar a imagem.'))), 'image/jpeg', 0.85))
}

export function blobParaDataURL(blob: Blob): Promise<string> {
  return new Promise((ok, falha) => {
    const leitor = new FileReader()
    leitor.onload = () => ok(String(leitor.result))
    leitor.onerror = () => falha(leitor.error)
    leitor.readAsDataURL(blob)
  })
}
