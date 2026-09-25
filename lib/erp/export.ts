// Exportação de relatórios no navegador (CSV, Excel e PDF via impressão).

export interface Coluna {
  chave: string
  label: string
}

type Linha = Record<string, unknown>

function baixar(conteudo: BlobPart, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v))

// Separador ";" e BOM para o Excel em português abrir com acentos corretos
export function exportarCSV(nome: string, colunas: Coluna[], linhas: Linha[]) {
  const esc = (v: unknown) => `"${texto(v).replace(/"/g, '""')}"`
  const corpo = [colunas.map((c) => esc(c.label)).join(';'), ...linhas.map((l) => colunas.map((c) => esc(l[c.chave])).join(';'))]
  baixar('﻿' + corpo.join('\r\n'), `${nome}.csv`, 'text/csv;charset=utf-8')
}

const html = (v: unknown) => texto(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function tabelaHTML(titulo: string, colunas: Coluna[], linhas: Linha[]) {
  return `<h2>${html(titulo)}</h2><table border="1" cellspacing="0" cellpadding="4"><thead><tr>${colunas
    .map((c) => `<th>${html(c.label)}</th>`)
    .join('')}</tr></thead><tbody>${linhas.map((l) => `<tr>${colunas.map((c) => `<td>${html(l[c.chave])}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

export function exportarExcel(nome: string, colunas: Coluna[], linhas: Linha[]) {
  const doc = `<html><head><meta charset="utf-8"></head><body>${tabelaHTML(nome, colunas, linhas)}</body></html>`
  baixar('﻿' + doc, `${nome}.xls`, 'application/vnd.ms-excel')
}

// Abre uma janela limpa e aciona "Salvar como PDF" do navegador
export function exportarPDF(nome: string, colunas: Coluna[], linhas: Linha[]) {
  const janela = window.open('', '_blank')
  if (!janela) return
  janela.document.write(`<html><head><title>${html(nome)}</title><style>
    body{font-family:Arial,sans-serif;font-size:11px;padding:24px;color:#111}
    h2{font-size:16px;margin-bottom:4px} p{color:#666;margin-top:0}
    table{border-collapse:collapse;width:100%} th{background:#eee;text-align:left}
    th,td{border:1px solid #ccc;padding:4px 6px}
  </style></head><body>${tabelaHTML(nome, colunas, linhas)}<p>DLG Photos ERP • gerado em ${new Date().toLocaleString('pt-BR')}</p>
  <script>window.onload=()=>{window.print()}</script></body></html>`)
  janela.document.close()
}

// Recibos de pagamento (um por beneficiário), prontos para imprimir ou salvar em PDF
export function imprimirRecibos(
  titulo: string,
  empresa: string,
  itens: { nome: string; valor: number; descricao: string; pixChave: string; pixBanco: string }[],
) {
  const janela = window.open('', '_blank')
  if (!janela) return
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const data = new Date().toLocaleDateString('pt-BR')
  const recibos = itens
    .map(
      (i) => `<section class="recibo">
      <header><h2>RECIBO</h2><span class="valor">${html(brl(i.valor))}</span></header>
      <p>Recebi de <strong>${html(empresa)}</strong> a importância de <strong>${html(brl(i.valor))}</strong>, referente a:</p>
      <p class="ref">${html(i.descricao)}</p>
      <p>Pagamento via PIX • Chave: <strong>${html(i.pixChave || '—')}</strong> • Banco: ${html(i.pixBanco || '—')}</p>
      <div class="assinatura"><span>${html(i.nome)}</span></div>
      <footer>${html(data)}</footer>
    </section>`,
    )
    .join('')
  janela.document.write(`<html><head><title>${html(titulo)}</title><style>
    body{font-family:Arial,sans-serif;color:#111;padding:24px}
    h1{font-size:14px;color:#555;margin:0 0 16px}
    .recibo{border:1px solid #bbb;border-radius:8px;padding:20px 24px;margin-bottom:18px;page-break-inside:avoid}
    header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #ddd;padding-bottom:8px;margin-bottom:12px}
    h2{margin:0;font-size:18px;letter-spacing:2px} .valor{font-size:18px;font-weight:bold}
    p{font-size:13px;line-height:1.5;margin:6px 0} .ref{background:#f3f5f9;padding:8px 10px;border-radius:6px}
    .assinatura{margin-top:36px;text-align:center} .assinatura span{display:inline-block;border-top:1px solid #333;padding-top:4px;min-width:320px;font-size:12px}
    footer{text-align:right;font-size:11px;color:#666;margin-top:10px}
  </style></head><body><h1>${html(titulo)}</h1>${recibos}<script>window.onload=()=>{window.print()}</script></body></html>`)
  janela.document.close()
}
