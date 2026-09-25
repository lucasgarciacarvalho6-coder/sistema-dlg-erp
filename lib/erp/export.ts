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
