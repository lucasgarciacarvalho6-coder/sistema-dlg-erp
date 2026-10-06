// Impressões do Rebolo (abrem numa janela e chamam a impressão do navegador — "Salvar como PDF" gera o arquivo):
//  • etiquetas do pacote: folha A4 comum, 10 etiquetas (2 × 5) com linha de corte e QR code;
//  • "Contrato de Compra Online": mesmo texto do contrato atual, já preenchido.

import QRCode from 'qrcode'
import type { Registro } from './types'
import { brl, dataBR } from './format'
import { EMPRESA_CONTRATO, escolaFicha } from './rebolo'

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function imprimir(titulo: string, css: string, corpo: string): string | null {
  const w = window.open('', '_blank')
  if (!w) return 'O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo.'
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${css}</style></head><body>${corpo}</body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 350)
  return null
}

// ---------------- Etiquetas ----------------
export async function imprimirEtiquetas(pacote: Registro, fichas: Registro[], vendedora: string): Promise<string | null> {
  if (!fichas.length) return 'Cadastre as fichas do pacote antes de imprimir as etiquetas.'
  const etiquetas = await Promise.all(
    fichas.map(async (f) => {
      const qr = await QRCode.toString(`DLG REBOLO | P${pacote.numero} | FICHA ${f.numeroFicha} | ${f.aluno}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      return `<div class="etq">
        <div class="qr">${qr}</div>
        <div class="txt">
          <p class="topo">P${esc(pacote.numero)} • FICHA <b>${esc(f.numeroFicha)}</b></p>
          <p class="aluno">${esc(f.aluno)}</p>
          ${escolaFicha(f) ? `<p>${esc(escolaFicha(f))}</p>` : ''}
          <p>${esc([f.cidade, f.uf].filter(Boolean).join(' / '))}${f.serie ? ` • ${esc(f.serie)}` : ''}</p>
          <p class="vend">Vendedora: ${esc(vendedora)}</p>
        </div>
      </div>`
    }),
  )
  const css = `
    @page { size: A4; margin: 6mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .folha { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 56mm; }
    .etq { border: 1px dashed #999; padding: 4mm; display: flex; gap: 4mm; align-items: center; break-inside: avoid; }
    .qr { width: 30mm; height: 30mm; flex: none; }
    .qr svg { width: 100%; height: 100%; }
    .txt p { margin: 0 0 1.2mm; font-size: 10pt; line-height: 1.2; }
    .txt .topo { font-size: 11pt; letter-spacing: .3px; }
    .txt .aluno { font-size: 13pt; font-weight: 700; text-transform: uppercase; }
    .txt .vend { font-size: 8.5pt; color: #555; }
  `
  return imprimir(`Etiquetas P${pacote.numero}`, css, `<div class="folha">${etiquetas.join('')}</div>`)
}

// ---------------- Contrato de Compra Online ----------------
export function imprimirContratoRebolo(v: Registro, ficha: Registro | undefined, vendedora: string): string | null {
  // marcas do item 3 pelo nome da venda ("Completo sem maleta + pôster"...); vendas antigas: Kit Completo / Kit Sem Moldura
  const produto = String(v.pacote ?? '')
  const marca = (re: RegExp) => (re.test(produto) ? 'X' : '&nbsp;&nbsp;')
  const linha = (a: string, b: unknown, c: string, d: unknown) =>
    `<tr><th>${a}</th><td>${esc(b)}</td><th>${c}</th><td>${esc(d)}</td></tr>`
  const hojeBR = dataBR(String(v.data || '').slice(0, 10))
  const boleto = v.formaPagamento === 'Boleto'
  const corpo = `
  <header>
    <div class="logo">DLG<small>PHOTO STUDIO E FORMATURA</small></div>
    <div>
      <p class="emp">${esc(EMPRESA_CONTRATO.nome)}</p>
      <p>Telefone: ${esc(EMPRESA_CONTRATO.telefone)}</p>
      <p>CNPJ: ${esc(EMPRESA_CONTRATO.cnpj)}</p>
      <p>${esc(EMPRESA_CONTRATO.endereco)}</p>
    </div>
  </header>
  <h1>CONTRATO DE COMPRA ONLINE</h1>
  <p><b>Vendedor:</b> ${esc(EMPRESA_CONTRATO.nome)}, representado pela colaboradora ${esc(vendedora)}</p>
  <p><b>Comprador:</b> ${esc(v.responsavel)}</p>
  <h2>1. Visualização do Produto</h2>
  <p>O comprador declara ter tido a oportunidade de revisar o álbum de fotos do produto objeto deste contrato por meio de vídeo enviado via WhatsApp pela colaboradora vendedora, estando ciente das características e qualidade do produto.</p>
  <h2>2. Cláusula de Inadimplência</h2>
  <p>Em caso de atraso no pagamento por mais de 5 (cinco) dias, o nome do comprador poderá ser registrado junto aos órgãos de proteção ao crédito (SPC/Serasa), conforme previsto em lei.</p>
  <h2>3. Objeto do Contrato</h2>
  <p>O presente contrato tem por objeto a venda de álbuns de fotos conforme detalhado abaixo:</p>
  <div class="caixa">
    <p><b>Modelo:</b> ${esc(v.modelo)}</p>
    <p><b>Quantidade de fotos:</b> ${esc(v.qtdFotos)}</p>
    <p class="op"><b>(${marca(/^(completo|kit )/i)}) COMPLETO (MALETA DE LUXO)</b> <b>(${marca(/sem maleta/i)}) SEM MALETA</b> <b>(${marca(/sem moldura/i)}) SEM MOLDURA</b> <b>(${marca(/\+ ?pôster|com pôster/i)}) COM PÔSTER</b> <b>(${marca(/^pôster com moldura/i)}) PÔSTER COM MOLDURA</b></p>
  </div>
  <h2>4. Envio</h2>
  <p>O álbum será enviado em até dois dias úteis após a assinatura do contrato, com informações de rastreio fornecidas via WhatsApp. A vendedora não se responsabiliza por atrasos dos Correios.</p>
  <h2>5. Trocas e Devoluções</h2>
  <p>Devido à natureza personalizada do produto, não são aceitas devoluções. A venda é considerada final após a visualização e aprovação do álbum. Em caso de defeito, o comprador poderá solicitar troca em até 7 (sete) dias após o recebimento.</p>
  <table>
    ${linha('Comprador', v.responsavel, 'RG', v.rg)}
    ${linha('CPF', v.cpf, 'Telefone WhatsApp', v.whatsapp)}
    ${linha('Telefone 2', ficha?.whatsapp2, 'Telefone 3', ficha?.whatsapp3 || ficha?.telefone)}
    ${linha('Nome do Pai', v.nomePai, 'Telefone', ficha?.nomePai ? ficha.whatsapp1 : '')}
    ${linha('Nome da Mãe', v.nomeMae, 'Telefone', ficha?.nomeMae ? ficha.whatsapp1 : '')}
    ${linha('Rua', ficha?.rua ?? v.endereco, 'Nº', ficha ? [ficha.numero, ficha.apto && `apto ${ficha.apto}`].filter(Boolean).join(' ') : '')}
    ${linha('Bairro', v.bairro, 'CEP', v.cep)}
    ${linha('Cidade', v.cidade, 'Estado', v.uf)}
  </table>
  <div class="total"><b>Valor total da compra: ${esc(brl(Number(v.valor) || 0))}</b><br><b>Forma de pagamento: ${esc(v.formaPagamento === 'Cartão de crédito' ? 'Cartão' : v.formaPagamento)}</b></div>
  <div class="total"><b>Forma de parcelamento: ${esc(v.formaParcelamento)}</b></div>
  ${boleto && v.primeiroVencimento ? `<div class="venc">⚠ Primeiro Vencimento do Boleto: ${esc(dataBR(String(v.primeiroVencimento)))}</div>` : ''}
  <p class="local">${esc(EMPRESA_CONTRATO.localAssinatura)}, ${esc(hojeBR)}</p>
  <div class="ass">
    <div><span></span><b>${esc(vendedora)}</b><small>Assinatura do Vendedor</small></div>
    <div><span></span><b>${esc(v.responsavel)}</b><small>Assinatura do Comprador</small></div>
  </div>`
  const css = `
    @page { size: A4; margin: 14mm 16mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #111; margin: 0; }
    header { display: flex; gap: 12px; align-items: center; border-bottom: 2px solid #111; padding-bottom: 8px; }
    header p { margin: 0; font-size: 8pt; } header .emp { font-size: 10.5pt; font-weight: 700; }
    .logo { width: 52px; height: 52px; border: 2px solid #111; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 900; font-size: 14pt; line-height: 1; }
    .logo small { font-size: 3.6pt; text-align: center; font-weight: 700; margin-top: 2px; }
    h1 { text-align: center; font-size: 13pt; margin: 14px 0 10px; }
    h2 { font-size: 9.5pt; margin: 9px 0 2px; }
    p { margin: 2px 0; line-height: 1.35; text-align: justify; }
    .caixa { border: 1px solid #111; padding: 6px 10px; margin: 6px 0; }
    .caixa .op b { margin-right: 18px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #111; padding: 4px 6px; text-align: left; font-size: 9pt; }
    th { width: 17%; } td { width: 33%; }
    .total { border: 1.5px solid #111; text-align: center; padding: 5px; margin-top: 6px; }
    .venc { border: 1.5px solid #e0b000; text-align: center; padding: 5px; margin-top: 6px; font-weight: 700; }
    .local { text-align: center; margin: 12px 0 34px; }
    .ass { display: flex; gap: 40px; } .ass div { flex: 1; text-align: center; }
    .ass span { display: block; border-top: 1.5px solid #111; margin-bottom: 16px; }
    .ass small { display: block; color: #666; font-size: 7.5pt; }
  `
  return imprimir(`Contrato de Compra - ${v.responsavel}`, css, corpo)
}
