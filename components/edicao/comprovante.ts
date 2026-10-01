// Comprovante da caixa conferida (etiqueta que vai lacrada na caixa para o estoque), igual à etiqueta usada hoje:
// papel inteiro na COR DA CIDADE (para achar no estoque físico), letras brancas grandes —
// cidade, escola, álbuns e pôster/brindes —, o controle (total da escola e quantos faltam),
// e pequeno no rodapé: caixa nº e data da conferência. A logo fica menor, no canto.
// Tamanho: meia folha A4 (A5 deitada).
import { dataBR, num } from '@/lib/erp/format'

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

// letra do maior tamanho que cabe na largura (até 2 linhas para nomes compridos)
function tamanho(texto: string, maximo: number) {
  const largura = 180 // mm úteis
  const linhas = texto.length > 26 ? 2 : 1
  return Math.max(6, Math.min(maximo, (largura * linhas) / (texto.length * 0.6)))
}

export function imprimirComprovante(c: {
  escola: string
  cidade: string
  uf: string
  numero: number
  albuns: number
  posteres: number
  data: string
  cor: string
  total: number
  faltam: number
}) {
  const janela = window.open('', '_blank', 'width=900,height=700')
  if (!janela) {
    alert('O navegador bloqueou a janela do comprovante. Libere as janelas (pop-ups) deste site e tente de novo.')
    return
  }
  const cidade = `${c.cidade}${c.uf ? `-${c.uf}` : ''}`
  const albuns = `${num(c.albuns)} ${c.albuns === 1 ? 'ÁLBUM' : 'ÁLBUNS'}`
  const posteres = c.posteres > 0 ? `${num(c.posteres)} ${c.posteres === 1 ? 'PÔSTER/BRINDE' : 'PÔSTERES/BRINDES'}` : ''
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Comprovante • ${esc(c.escola)} • Caixa ${c.numero}</title>
<style>
  @page { size: A5 landscape; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .et { position: relative; width: 210mm; height: 148mm; background: ${c.cor}; color: #fff; font-family: Arial, Helvetica, sans-serif;
        font-weight: 700; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
        padding: 10mm 14mm; gap: 3mm; overflow: hidden; }
  .logo { position: absolute; top: 6mm; left: 7mm; width: 20mm; height: 20mm; object-fit: contain; }
  .cidade { font-size: ${tamanho(cidade, 17).toFixed(1)}mm; line-height: 1.1; }
  .escola { font-size: ${tamanho(c.escola, 15).toFixed(1)}mm; line-height: 1.1; margin-top: 4mm; }
  .albuns { font-size: 15mm; line-height: 1.1; margin-top: 3mm; }
  .posteres { font-size: 9mm; line-height: 1.1; }
  .controle { font-size: 5.5mm; margin-top: 5mm; padding: 1.5mm 5mm; border: 0.6mm solid rgba(255,255,255,.75); border-radius: 3mm; }
  .rodape { position: absolute; bottom: 5mm; left: 0; right: 0; font-size: 3.6mm; font-weight: 400; opacity: .9; }
</style></head><body>
<div class="et">
  <img class="logo" src="${location.origin}/logo.png" alt="DLG Photos">
  <div class="cidade">${esc(cidade)}</div>
  <div class="escola">${esc(c.escola)}</div>
  <div class="albuns">${albuns}</div>
  ${posteres ? `<div class="posteres">${posteres}</div>` : ''}
  <div class="controle">Total da escola: ${num(c.total)} álbuns • Faltam: ${num(c.faltam)}</div>
  <div class="rodape">Caixa ${c.numero} • conferida em ${dataBR(c.data)}</div>
</div>
<script>window.onload = function () { window.focus(); window.print(); };</script>
</body></html>`
  janela.document.open()
  janela.document.write(html)
  janela.document.close()
}
