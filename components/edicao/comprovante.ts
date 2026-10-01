// Comprovante da caixa conferida (etiqueta que vai lacrada na caixa para o estoque), igual à etiqueta usada hoje:
// etiqueta na COR DA CIDADE (para achar no estoque físico), letras brancas grandes —
// cidade, escola, álbuns e pôster/brindes —, o controle (total da escola e quantos faltam),
// e no rodapé: caixa nº e data da conferência. A logo fica menor, no canto.
// Tamanho: o do comprovante anterior (16,5 × 16 cm), no alto de uma folha A4 EM PÉ — para recortar e colar na caixa.
import { dataBR, num } from '@/lib/erp/format'

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

// letra do maior tamanho que cabe na largura (até 2 linhas para nomes compridos)
function tamanho(texto: string, maximo: number) {
  const largura = 140 // mm úteis da etiqueta
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
  const janela = window.open('', '_blank', 'width=820,height=1000')
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
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .et { position: relative; width: 165mm; height: 160mm; margin: 0 auto; background: ${c.cor}; color: #fff; font-family: Arial, Helvetica, sans-serif;
        font-weight: 700; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
        padding: 12mm 12mm; gap: 2.5mm; overflow: hidden; }
  .logo { position: absolute; top: 5mm; left: 5mm; width: 16mm; height: 16mm; object-fit: contain; }
  .cidade { font-size: ${tamanho(cidade, 14).toFixed(1)}mm; line-height: 1.1; }
  .escola { font-size: ${tamanho(c.escola, 12).toFixed(1)}mm; line-height: 1.1; margin-top: 3mm; }
  .albuns { font-size: 13mm; line-height: 1.1; margin-top: 3mm; }
  .posteres { font-size: 7.5mm; line-height: 1.1; }
  .controle { font-size: 4.6mm; margin-top: 4mm; padding: 1.3mm 4mm; border: 0.5mm solid rgba(255,255,255,.75); border-radius: 2.5mm; }
  .rodape { position: absolute; bottom: 5mm; left: 0; right: 0; font-size: 4.8mm; font-weight: 700; }
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
