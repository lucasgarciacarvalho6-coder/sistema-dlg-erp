// Comprovante da caixa conferida (etiqueta que vai lacrada na caixa para o estoque), igual à etiqueta usada hoje:
// etiqueta na COR DA CIDADE (para achar no estoque físico), letras brancas grandes —
// cidade, escola, álbuns e pôster/brindes —, e no rodapé: caixa nº e data da conferência. A logo fica menor, no canto.
// Tamanho: 16,5 × 13,5 cm, 2 por folha A4 EM PÉ (1 em cima e 1 embaixo, para economizar a folha) — recortar e colar na caixa.
import { dataBR, num } from '@/lib/erp/format'

export type Comprovante = {
  escola: string
  cidade: string
  uf: string
  numero: number
  albuns: number
  posteres: number
  data: string
  cor: string
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

// letra do maior tamanho que cabe na largura (até 2 linhas para nomes compridos)
function tamanho(texto: string, maximo: number) {
  const largura = 140 // mm úteis da etiqueta
  const linhas = texto.length > 26 ? 2 : 1
  return Math.max(6, Math.min(maximo, (largura * linhas) / (texto.length * 0.6)))
}

function etiqueta(c: Comprovante, logo: string) {
  const cidade = `${c.cidade}${c.uf ? `-${c.uf}` : ''}`
  const albuns = `${num(c.albuns)} ${c.albuns === 1 ? 'ÁLBUM' : 'ÁLBUNS'}`
  const posteres = c.posteres > 0 ? `${num(c.posteres)} ${c.posteres === 1 ? 'PÔSTER/BRINDE' : 'PÔSTERES/BRINDES'}` : ''
  return `<div class="et" style="background: ${esc(c.cor)}">
  <img class="logo" src="${logo}" alt="DLG Photos">
  <div class="cidade" style="font-size: ${tamanho(cidade, 14).toFixed(1)}mm">${esc(cidade)}</div>
  <div class="escola" style="font-size: ${tamanho(c.escola, 12).toFixed(1)}mm">${esc(c.escola)}</div>
  <div class="albuns">${albuns}</div>
  ${posteres ? `<div class="posteres">${posteres}</div>` : ''}
  <div class="rodape">Caixa ${c.numero} • conferida em ${dataBR(c.data)}</div>
</div>`
}

// Imprime um ou vários comprovantes, 2 por folha (se for ímpar, o último sai sozinho no alto da folha).
// Devolve false se o navegador bloqueou a janela.
export function imprimirComprovantes(lista: Comprovante[]) {
  if (!lista.length) return false
  const janela = window.open('', '_blank', 'width=820,height=1000')
  if (!janela) {
    alert('O navegador bloqueou a janela do comprovante. Libere as janelas (pop-ups) deste site e tente de novo.')
    return false
  }
  const logo = `${location.origin}/logo.png`
  const folhas: string[] = []
  for (let i = 0; i < lista.length; i += 2) folhas.push(`<div class="folha">\n${lista.slice(i, i + 2).map((c) => etiqueta(c, logo)).join('\n')}\n</div>`)
  const titulo = lista.length === 1 ? `${esc(lista[0].escola)} • Caixa ${lista[0].numero}` : `${lista.length} caixas`
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Comprovante • ${titulo}</title>
<style>
  @page { size: A4 portrait; margin: 8mm 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .folha { display: flex; flex-direction: column; align-items: center; gap: 10mm; }
  .folha + .folha { break-before: page; }
  .et { position: relative; flex: none; width: 165mm; height: 135mm; color: #fff; font-family: Arial, Helvetica, sans-serif;
        font-weight: 700; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
        padding: 12mm; gap: 2.5mm; overflow: hidden; break-inside: avoid; }
  .logo { position: absolute; top: 5mm; left: 5mm; width: 16mm; height: 16mm; object-fit: contain; }
  .cidade { line-height: 1.1; }
  .escola { line-height: 1.1; margin-top: 3mm; }
  .albuns { font-size: 13mm; line-height: 1.1; margin-top: 3mm; }
  .posteres { font-size: 7.5mm; line-height: 1.1; }
  .rodape { position: absolute; bottom: 5mm; left: 0; right: 0; font-size: 8mm; font-weight: 700; }
</style></head><body>
${folhas.join('\n')}
<script>window.onload = function () { window.focus(); window.print(); };</script>
</body></html>`
  janela.document.open()
  janela.document.write(html)
  janela.document.close()
  return true
}
