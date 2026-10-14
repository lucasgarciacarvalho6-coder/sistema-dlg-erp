// SPC da Cobrança (SQL 050), igual ao sistema antigo: a fila de elegíveis e o fluxo de cada cobrança
// (Inclusão marcada → Enviado → Registrado → Retirada solicitada → Removido; Divergência), as regras em memória
// para o modo demonstração e a leitura da planilha oficial do SPC (Excel, aba BASE_CONSOLIDADA) sem biblioteca de fora.

import type { ErpState, Registro } from './types'
import { colecao } from './metrics'
import { hoje } from './format'
import { calcularCarteira } from './carteira'
import { soDigitos } from './documento'

export const ESTADOS_SPC = ['Inclusão marcada', 'Enviado', 'Registrado', 'Divergência', 'Retirada solicitada', 'Removido'] as const

export interface LinhaSpc {
  cobrancaId: string
  clienteId: string
  cliente: string
  documento: string
  documentoOk: boolean
  telefone: string
  codigoVenda: string
  conta: string
  categoria: string
  grupo: string
  carteira: string
  parcelasVencidas: number
  vencido: number
  atualizado: number
  totalDivida: number
  diasAtraso: number
  podeIrSpc: boolean
  situacao: string
  spcEstado: string
  spcMarcadoEm: string
  spcEnviadoEm: string
  spcRegistradoEm: string
  regularizada: boolean
  parcelaMaisAntiga: string
}

const t = (v: unknown) => (v == null ? '' : String(v))
const n = (v: unknown) => Number(v) || 0
export function linhaSpcDoBanco(l: Record<string, unknown>): LinhaSpc {
  return {
    cobrancaId: t(l.cobranca_id), clienteId: t(l.cliente_id), cliente: t(l.cliente), documento: t(l.documento), documentoOk: !!l.documento_ok, telefone: t(l.telefone),
    codigoVenda: t(l.codigo_venda), conta: t(l.conta), categoria: t(l.categoria), grupo: t(l.grupo), carteira: t(l.carteira), parcelasVencidas: n(l.parcelas_vencidas),
    vencido: n(l.vencido), atualizado: n(l.atualizado), totalDivida: n(l.total_divida), diasAtraso: n(l.dias_atraso), podeIrSpc: !!l.pode_ir_spc,
    situacao: t(l.situacao), spcEstado: t(l.spc_estado), spcMarcadoEm: t(l.spc_marcado_em), spcEnviadoEm: t(l.spc_enviado_em), spcRegistradoEm: t(l.spc_registrado_em),
    regularizada: !!l.regularizada, parcelaMaisAntiga: t(l.parcela_mais_antiga),
  }
}

// ---------------- modo demonstração ----------------
export function filaSpcDaCarteira(s: ErpState, hj = hoje()): LinhaSpc[] {
  const { cobrancas, parcelas } = calcularCarteira(s, hj)
  const brutas = new Map(colecao(s, 'cobrancas').map((x) => [String(x.id), x]))
  return cobrancas
    .map((c) => ({ c, x: brutas.get(c.id) ?? ({} as Registro) }))
    .filter(({ c, x }) => (c.podeIrSpc && !x.spcEstado) || !!x.spcEstado || c.situacao === 'Ficha não encontrada SPC')
    .map(({ c, x }) => ({
      cobrancaId: c.id, clienteId: c.clienteId, cliente: c.cliente, documento: c.documento, documentoOk: c.documentoOk, telefone: c.telefone, codigoVenda: c.codigoVenda,
      conta: c.conta, categoria: c.categoria, grupo: c.grupo, carteira: c.carteira, parcelasVencidas: c.parcelasVencidas, vencido: c.vencido, atualizado: c.atualizado,
      totalDivida: c.totalDivida, diasAtraso: c.diasAtraso, podeIrSpc: c.podeIrSpc, situacao: c.situacao, spcEstado: t(x.spcEstado), spcMarcadoEm: t(x.spcMarcadoEm),
      spcEnviadoEm: t(x.spcEnviadoEm), spcRegistradoEm: t(x.spcRegistradoEm), regularizada: c.parcelasAbertas === 0 || c.vencido <= 0,
      parcelaMaisAntiga: parcelas.filter((p) => p.cobrancaId === c.id && p.vencida).map((p) => p.vencimento).sort()[0] ?? '',
    }))
}

export interface ResultadoPlanilha {
  documento: string
  contrato: string
  cobrancaId: string
  cliente: string
  codigoVenda: string
  conta: string
  grupo: string
  spcEstado: string
  vencido: number
  contratoOk: boolean
  resultado: string
}
export function resultadoDoBanco(l: Record<string, unknown>): ResultadoPlanilha {
  return {
    documento: t(l.documento), contrato: t(l.contrato), cobrancaId: t(l.cobranca_id), cliente: t(l.cliente), codigoVenda: t(l.codigo_venda), conta: t(l.conta),
    grupo: t(l.grupo), spcEstado: t(l.spc_estado), vencido: n(l.vencido), contratoOk: !!l.contrato_ok, resultado: t(l.resultado),
  }
}

// mesma regra do conferir_planilha_spc
export function conferirPlanilhaDemo(s: ErpState, linhas: { documento: string; contrato: string }[]) {
  const { cobrancas } = calcularCarteira(s)
  const brutas = new Map(colecao(s, 'cobrancas').map((x) => [String(x.id), x]))
  const docs = new Set(linhas.map((l) => soDigitos(l.documento)))
  const na = [...new Map(linhas.map((l) => [`${soDigitos(l.documento)}|${l.contrato.trim()}`, { doc: soDigitos(l.documento), contrato: l.contrato.trim() }])).values()].map(({ doc, contrato }) => {
    const achados = cobrancas.filter((c) => c.documento === doc).sort((a, b) => Number(b.codigoVenda === contrato) - Number(a.codigoVenda === contrato) || b.vencido - a.vencido)
    const c = achados[0]
    const est = c ? t(brutas.get(c.id)?.spcEstado) : ''
    const resultado = !c ? 'Não encontrado no sistema'
      : c.vencido <= 0 ? 'No SPC, mas sem dívida em atraso (pendência de retirada)'
      : c.grupo === 'Registro SPC' || est === 'Registrado' ? 'SPC OK'
      : ['Terceirizada', 'Advogado', 'Fundo perdido'].includes(c.grupo) ? 'SPC OK (herdado)'
      : est === 'Enviado' || est === 'Divergência' ? 'Confirmar registro'
      : est === 'Retirada solicitada' ? 'Retirada solicitada, ainda no SPC' : 'Divergência: no SPC com categoria normal'
    return { documento: doc, contrato, cobrancaId: c?.id ?? '', cliente: c?.cliente ?? '', codigoVenda: c?.codigoVenda ?? '', conta: c?.conta ?? '', grupo: c?.grupo ?? '', spcEstado: est, vencido: c?.vencido ?? 0, contratoOk: !!c && contrato !== '' && c.codigoVenda === contrato, resultado }
  })
  const fora = cobrancas
    .filter((c) => (c.grupo === 'Registro SPC' || ['Registrado', 'Retirada solicitada'].includes(t(brutas.get(c.id)?.spcEstado))) && c.documento && !docs.has(c.documento))
    .map((c) => {
      const est = t(brutas.get(c.id)?.spcEstado)
      return { documento: c.documento, contrato: '', cobrancaId: c.id, cliente: c.cliente, codigoVenda: c.codigoVenda, conta: c.conta, grupo: c.grupo, spcEstado: est, vencido: c.vencido, contratoOk: false,
        resultado: est === 'Retirada solicitada' ? 'Saiu do SPC: confirmar retirada' : c.vencido <= 0 ? 'Fora da planilha: pagou/renegociou (conferir retirada)' : 'Divergência: registrado no sistema, mas fora da planilha' }
    })
  return { naPlanilha: na, foraDaPlanilha: fora }
}

// ---------------- planilha oficial do SPC (Excel .xlsx) ----------------
const COLS_DOC = ['CPF/CNPJ SOMENTE NÚMEROS', 'CPF/CNPJ', 'CPF', 'CNPJ', 'DOCUMENTO', 'DOCUMENTO SOMENTE NÚMEROS', 'CPFCNPJ', 'CPF_CNPJ', 'NR_CPF', 'NU_CPF', 'DOC', 'DOCUMENTO CLIENTE', 'CPF CLIENTE', 'CPF/CNPJ CLIENTE', 'CPF CONTRATO', 'CPF_CONTRATO', 'DOCUMENTO CPF']
const COLS_CONTRATO = ['CONTRATO', 'VENDA', 'SALE CODE', 'CODIGO', 'NR_CONTRATO', 'NU_CONTRATO', 'CONTRATO NUMERO', 'NUMERO CONTRATO', 'ID VENDA', 'VENDA ID', 'SALE_CODE', 'SALE ID', 'CODIGO VENDA', 'CONTRATO VENDA']
const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()

async function inflar(dados: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const blob = new Blob([dados as BlobPart]).stream().pipeThrough(ds)
  return new Uint8Array(await new Response(blob).arrayBuffer())
}

// lê o .zip do Excel: nome do arquivo → conteúdo (texto)
async function abrirZip(buf: ArrayBuffer): Promise<Map<string, string>> {
  const v = new DataView(buf)
  const b = new Uint8Array(buf)
  let fim = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { fim = i; break }
  if (fim < 0) throw new Error('O arquivo não é uma planilha Excel (.xlsx).')
  const total = v.getUint16(fim + 10, true)
  let p = v.getUint32(fim + 16, true)
  const dec = new TextDecoder()
  const arquivos = new Map<string, string>()
  for (let k = 0; k < total; k++) {
    const metodo = v.getUint16(p + 10, true)
    const tam = v.getUint32(p + 20, true)
    const nNome = v.getUint16(p + 28, true), nExtra = v.getUint16(p + 30, true), nCom = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const nome = dec.decode(b.subarray(p + 46, p + 46 + nNome))
    p += 46 + nNome + nExtra + nCom
    if (!/^xl\/(workbook\.xml|sharedStrings\.xml|worksheets\/sheet\d+\.xml|_rels\/workbook\.xml\.rels)$/.test(nome)) continue
    const ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const bruto = b.subarray(ini, ini + tam)
    arquivos.set(nome, dec.decode(metodo === 8 ? await inflar(bruto) : bruto))
  }
  return arquivos
}

const col = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1

export async function lerPlanilhaSpc(arquivo: File): Promise<{ linhas: { documento: string; contrato: string }[]; aba: string }> {
  const zip = await abrirZip(await arquivo.arrayBuffer())
  const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml')
  const wb = xml(zip.get('xl/workbook.xml') ?? '')
  const rels = xml(zip.get('xl/_rels/workbook.xml.rels') ?? '')
  const abas = [...wb.getElementsByTagName('sheet')].map((s) => ({ nome: s.getAttribute('name') ?? '', rid: s.getAttribute('r:id') ?? s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? '' }))
  const aba = abas.find((a) => norm(a.nome) === 'BASE_CONSOLIDADA') ?? abas[0]
  if (!aba) throw new Error('A planilha não tem abas.')
  const alvo = [...rels.getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === aba.rid)?.getAttribute('Target') ?? 'worksheets/sheet1.xml'
  const folha = zip.get(`xl/${alvo.replace(/^\/?xl\//, '')}`)
  if (!folha) throw new Error(`Não achei a aba ${aba.nome} na planilha.`)
  const ss = [...xml(zip.get('xl/sharedStrings.xml') ?? '<sst/>').getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((x) => x.textContent ?? '').join(''))
  const linhas: string[][] = []
  for (const row of xml(folha).getElementsByTagName('row')) {
    const l: string[] = []
    for (const c of row.getElementsByTagName('c')) {
      const tipo = c.getAttribute('t')
      const v = c.getElementsByTagName('v')[0]?.textContent ?? c.getElementsByTagName('t')[0]?.textContent ?? ''
      l[col(c.getAttribute('r') ?? 'A1')] = tipo === 's' ? ss[Number(v)] ?? '' : v
    }
    linhas.push([...l].map((x) => x ?? ''))
  }
  const iCab = linhas.findIndex((l) => l.some((x) => COLS_DOC.includes(norm(x))))
  if (iCab < 0) throw new Error(`A aba ${aba.nome} não tem a coluna de CPF/CNPJ.`)
  const cab = linhas[iCab].map(norm)
  const iDoc = COLS_DOC.map((c) => cab.indexOf(c)).find((i) => i >= 0)!
  const iCont = COLS_CONTRATO.map((c) => cab.indexOf(c)).find((i) => i >= 0) ?? -1
  return {
    aba: aba.nome,
    // CPF/CNPJ gravado como número no Excel perde os zeros da frente: completa
    linhas: linhas
      .slice(iCab + 1)
      .map((l) => ({ d: soDigitos(l[iDoc] ?? ''), contrato: iCont >= 0 ? String(l[iCont] ?? '').trim() : '' }))
      .filter((l) => l.d.length >= 8)
      .map((l) => ({ documento: l.d.length <= 11 ? l.d.padStart(11, '0') : l.d.padStart(14, '0'), contrato: l.contrato })),
  }
}
