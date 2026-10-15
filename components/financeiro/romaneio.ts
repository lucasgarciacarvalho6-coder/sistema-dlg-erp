// Impressão da carga do vendedor de books (A4 em pé):
//  • ROMANEIO: o que saiu (escolas, caixas, álbuns e pôsteres/brindes), com as colunas "Vendidos" e "Voltaram" em branco
//    para anotar na volta, e as assinaturas do vendedor e do Financeiro;
//  • ACERTO: o mesmo, já com os vendidos, os que voltaram e a diferença de cada escola.
import { dataBR, num } from '@/lib/erp/format'
import { rotuloLote, type CargaResumo } from '@/lib/erp/estoque'

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
const n = (v: unknown) => Number(v) || 0

function documento(r: CargaResumo, acerto: boolean, empresa: string) {
  const c = r.carga
  const logo = `${location.origin}/logo.png`
  const linhas = r.escolas
    .map((e) => {
      const a = e.acerto
      const caixas = e.caixas.map((x) => String(x.numero)).join(', ')
      const celula = (v: unknown) => (acerto ? `<td class="num">${a ? num(n(v)) : '—'}</td>` : '<td class="num branco"></td>')
      return `<tr>
  <td><b>${esc(e.escola)}</b><br><span class="sub">${esc(e.cidade)}${e.uf ? `-${esc(e.uf)}` : ''}${rotuloLote(e) ? ` • ${esc(rotuloLote(e))}` : ''} • caixa(s) ${esc(caixas)}</span></td>
  <td class="num">${num(e.albuns)}</td>
  ${celula(a?.albunsVendidos)}
  ${celula(a?.albunsVoltaram)}
  ${acerto ? `<td class="num">${a ? num(n(a.albunsDiferenca)) : '—'}</td>` : ''}
  <td class="num">${num(e.posteres)}</td>
  ${celula(a?.posteresVendidos)}
  ${celula(a?.posteresVoltaram)}
  ${acerto ? `<td class="num">${a ? num(n(a.posteresDiferenca)) : '—'}</td>` : ''}
</tr>${acerto && (a?.observacao || a?.destino) ? `<tr class="obs"><td colspan="9">${[a?.destino === 'Estoque' ? 'O que voltou: voltou para o estoque' : a?.destino === 'Rebolo' ? 'O que voltou: enviado para o Rebolo' : '', a?.observacao ? `Obs.: ${esc(a.observacao)}` : ''].filter(Boolean).join(' • ')}</td></tr>` : ''}`
    })
    .join('\n')
  const total = (v: number) => `<td class="num"><b>${num(v)}</b></td>`
  const vazio = '<td class="num branco"></td>'
  return `<div class="folha">
  <div class="topo">
    <img src="${logo}" alt="">
    <div>
      <div class="empresa">${esc(empresa)}</div>
      <h1>${acerto ? 'Acerto da carga' : 'Romaneio da carga'} nº ${esc(c.numero)}</h1>
    </div>
  </div>
  <table class="dados">
    <tr><td>Vendedor</td><td><b>${esc(c.vendedor)}</b></td><td>Saída</td><td><b>${dataBR(String(c.dataSaida || ''))}</b></td></tr>
    <tr><td>Rota</td><td>${esc(c.rota || '—')}</td><td>${acerto ? 'Acerto' : 'Escolas'}</td><td><b>${acerto ? dataBR(String(c.acertoEm || '')) : num(r.escolas.length)}</b></td></tr>
  </table>
  <table class="itens">
    <thead>
      <tr><th rowspan="2">Escola</th><th colspan="${acerto ? 4 : 3}">Álbuns</th><th colspan="${acerto ? 4 : 3}">Pôsteres / brindes</th></tr>
      <tr><th>Levados</th><th>Vendidos</th><th>Voltaram</th>${acerto ? '<th>Diferença</th>' : ''}<th>Levados</th><th>Vendidos</th><th>Voltaram</th>${acerto ? '<th>Diferença</th>' : ''}</tr>
    </thead>
    <tbody>
${linhas}
      <tr class="total"><td><b>Total • ${num(r.caixas)} caixa(s)</b></td>${total(r.albuns)}${acerto ? total(r.vendidos.albuns) + total(r.voltaram.albuns) + total(r.diferenca.albuns) : vazio + vazio}${total(r.posteres)}${acerto ? total(r.vendidos.posteres) + total(r.voltaram.posteres) + total(r.diferenca.posteres) : vazio + vazio}</tr>
    </tbody>
  </table>
  ${c.observacao ? `<p class="nota"><b>Observação:</b> ${esc(c.observacao)}</p>` : ''}
  ${acerto && c.acertoObs ? `<p class="nota"><b>Observação do acerto:</b> ${esc(c.acertoObs)}</p>` : ''}
  ${acerto ? '<p class="nota">Diferença = levados − vendidos − voltaram (fica registrada). O que voltou vai para o estoque ou para o Rebolo, como escolhido em cada escola.</p>' : '<p class="nota">Na volta, anote em cada escola quantos foram vendidos e quantos voltaram.</p>'}
  <div class="assinaturas">
    <div><span></span>${esc(c.vendedor)} • vendedor</div>
    <div><span></span>Financeiro${acerto && c.acertoPor ? ` • ${esc(c.acertoPor)}` : ''}</div>
  </div>
</div>`
}

// Devolve false se o navegador bloqueou a janela
export function imprimirCarga(r: CargaResumo, tipo: 'romaneio' | 'acerto', empresa: string) {
  const janela = window.open('', '_blank', 'width=900,height=1000')
  if (!janela) {
    alert('O navegador bloqueou a janela de impressão. Libere as janelas (pop-ups) deste site e tente de novo.')
    return false
  }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${tipo === 'acerto' ? 'Acerto' : 'Romaneio'} • Carga ${esc(r.carga.numero)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11pt; }
  .topo { display: flex; align-items: center; gap: 5mm; border-bottom: 2px solid #111; padding-bottom: 4mm; }
  .topo img { width: 18mm; height: 18mm; object-fit: contain; }
  .empresa { font-size: 10pt; color: #555; text-transform: uppercase; letter-spacing: 1px; }
  h1 { margin: 1mm 0 0; font-size: 18pt; }
  table { width: 100%; border-collapse: collapse; }
  .dados { margin: 5mm 0; }
  .dados td { padding: 1.5mm 2mm; }
  .dados td:nth-child(odd) { color: #555; width: 18%; }
  .itens th, .itens td { border: 1px solid #999; padding: 2mm; }
  .itens th { background: #eee; font-size: 9pt; text-transform: uppercase; }
  .num { text-align: center; white-space: nowrap; }
  .branco { min-width: 18mm; }
  .sub { color: #555; font-size: 9pt; }
  .obs td { font-size: 9pt; color: #555; border-top: 0; }
  .total td { background: #f5f5f5; }
  .nota { font-size: 9.5pt; color: #333; margin: 3mm 0 0; }
  .assinaturas { display: flex; gap: 16mm; margin-top: 22mm; }
  .assinaturas div { flex: 1; text-align: center; font-size: 10pt; }
  .assinaturas span { display: block; border-top: 1px solid #111; margin-bottom: 2mm; }
</style></head><body>
${documento(r, tipo === 'acerto', empresa)}
<script>window.onload = function () { window.focus(); window.print(); };</script>
</body></html>`
  janela.document.open()
  janela.document.write(html)
  janela.document.close()
  return true
}
