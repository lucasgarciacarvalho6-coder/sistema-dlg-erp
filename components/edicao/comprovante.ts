// Comprovante da caixa conferida (vai lacrado junto com a caixa para o estoque):
// logo do sistema, cidade, escola, número da caixa, álbuns dentro da caixa e data em que foi confirmada.
import { dataBR, num } from '@/lib/erp/format'

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

export function imprimirComprovante(c: { escola: string; cidade: string; numero: number; albuns: number; data: string }) {
  const janela = window.open('', '_blank', 'width=720,height=900')
  if (!janela) {
    alert('O navegador bloqueou a janela do comprovante. Libere as janelas (pop-ups) deste site e tente de novo.')
    return
  }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Comprovante • ${esc(c.escola)} • Caixa ${c.numero}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
  .c { max-width: 165mm; margin: 0 auto; border: 3px solid #000; border-radius: 14px; padding: 26px 30px; text-align: center; }
  .logo { width: 130px; height: 130px; object-fit: contain; }
  .tit { font-size: 13px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin-top: 6px; }
  .rot { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #555; margin-top: 18px; }
  .v { font-size: 24px; font-weight: 800; margin-top: 4px; }
  .caixa { display: inline-block; margin-top: 16px; padding: 6px 18px; border: 2px solid #000; border-radius: 999px; font-size: 20px; font-weight: 900; }
  .num { font-size: 72px; font-weight: 900; line-height: 1; margin-top: 4px; }
  .linha { border-top: 1px dashed #999; margin: 20px 0 0; }
</style></head><body>
<div class="c">
  <img class="logo" src="${location.origin}/logo.png" alt="DLG Photos">
  <div class="tit">Comprovante de conferência</div>
  <div class="caixa">Caixa ${c.numero}</div>
  <div class="rot">Cidade</div><div class="v">${esc(c.cidade)}</div>
  <div class="rot">Escola</div><div class="v">${esc(c.escola)}</div>
  <div class="linha"></div>
  <div class="rot">Álbuns dentro da caixa</div><div class="num">${num(c.albuns)}</div>
  <div class="rot">Conferida e confirmada em</div><div class="v">${dataBR(c.data)}</div>
</div>
<script>window.onload = function () { window.focus(); window.print(); };</script>
</body></html>`
  janela.document.open()
  janela.document.write(html)
  janela.document.close()
}
