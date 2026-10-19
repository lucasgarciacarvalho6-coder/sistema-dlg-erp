// Lucro/Prejuízo de cada vendedora do Rebolo no mês — a conta da planilha "REBOLO - BASE PRINCIPAL"
// (conferida até os centavos em 07/10/2026):
//   vendido − reserva do boleto − frete − taxa do cartão − taxa do boleto − álbum − saquinho − comissão − salário com encargos
// • Vendas: as do Rebolo com o contrato assinado anexado (não esperam o Financeiro — SQL 044), pelo dia da assinatura —
//   o mesmo "vendido no mês" da meta e do card.
// • Frete: o real do envio (Rebolo › Envios); sem ele, a estimativa da Tabela de Preços ("estimado").
// • Taxa do cartão: 15% do valor total da venda; taxa do boleto: R$ 5 por boleto (cada parcela) — regras de 19/10/2026.
// • Álbum e saquinho: por álbum vendido (o Pôster com Moldura sozinho não leva álbum nem saquinho).
// • Salário: o do holerite (Financeiro › Custo do Rebolo) + encargos; sem ele, o estimado. O mês corrente conta o salário cheio.
// • Meses antes de a vendedora ter pacote ou venda no sistema ficam sem conta (não viram prejuízo falso).

import type { ErpState, Registro } from './types'
import { colecao } from './metrics'
import { diaLocal, mesAtual } from './format'
import { comissaoDaVenda, formaDaVenda, produtoDaVenda, tabelaRebolo } from './rebolo'

export interface CustosLucroRebolo {
  album: number // álbum + saquinho
  reserva: number // reserva de inadimplência do boleto
  frete: number
  taxas: number // taxa do cartão + taxa do boleto
  comissao: number
  salario: number // salário + encargos
}

export interface LucroRebolo {
  mes: string
  vendido: number
  vendas: number
  albuns: number
  custos: CustosLucroRebolo
  totalCustos: number
  lucro: number
  estimado: { fretes: number; taxas: number; salario: boolean } // o que ainda é estimativa
  // separado para o card de conferência do ADM (Dashboard Rebolo): lançado (real) × estimado
  detalhe: { freteLancado: number; freteEstimado: number; cartao: number; taxaBoleto: number; enviosLancados: number }
}

export const ROTULOS_CUSTOS: Record<keyof CustosLucroRebolo, string> = {
  album: 'Álbuns',
  reserva: 'Reserva boleto',
  frete: 'Frete',
  taxas: 'Taxas',
  comissao: 'Comissão',
  salario: 'Salário',
}

const centavos = (v: number) => Math.round(v * 100) / 100
const vazio = (v: unknown) => v === '' || v === null || v === undefined
const mesDe = (v: unknown) => String(v ?? '').slice(0, 7)

export function mesAnteriorDe(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// (SQL 044) a venda conta assim que o contrato assinado é anexado — no Financeiro, devolvida para correção ou conferida —
// e no MÊS DA ASSINATURA, igual à meta (venda sem data de assinatura — antiga ou importada — fica no dia da venda)
const ASSINADA = new Set(['Aguardando conferência', 'Devolvida', 'Conferida'])
export const diaDaVendaRebolo = (v: Registro) => (v.assinaturaEm ? diaLocal(String(v.assinaturaEm)) : String(v.data ?? ''))
const vendasDaVendedora = (s: ErpState, vendedoraId: string) =>
  colecao(s, 'vendas_ebooks').filter((v) => v.canal === 'Rebolo' && String(v.cobradorId) === vendedoraId && ASSINADA.has(String(v.conferencia)))

// 1º mês da vendedora no sistema: o do primeiro pacote ou da primeira venda
export function inicioNoRebolo(s: ErpState, vendedoraId: string): string | null {
  const meses = [
    ...colecao(s, 'rebolo_pacotes').filter((p) => String(p.vendedoraId) === vendedoraId).map((p) => mesDe(p.criadoEm)),
    ...vendasDaVendedora(s, vendedoraId).map((v) => mesDe(diaDaVendaRebolo(v))),
  ].filter((m) => /^\d{4}-\d{2}$/.test(m))
  return meses.length ? meses.sort()[0] : null
}

export function lucroReboloMes(s: ErpState, vendedoraId: string, mes: string, vendas: Registro[] = vendasDaVendedora(s, vendedoraId)): LucroRebolo | null {
  const inicio = inicioNoRebolo(s, vendedoraId)
  if (!inicio || mes < inicio || mes > mesAtual()) return null
  const t = tabelaRebolo(s)
  const k = t.custos
  const fichas = colecao(s, 'rebolo_fichas')
  const custos: CustosLucroRebolo = { album: 0, reserva: 0, frete: 0, taxas: 0, comissao: 0, salario: 0 }
  const estimado = { fretes: 0, taxas: 0, salario: false }
  const detalhe = { freteLancado: 0, freteEstimado: 0, cartao: 0, taxaBoleto: 0, enviosLancados: 0 }
  let vendido = 0
  let albuns = 0
  const doMes = vendas.filter((v) => mesDe(diaDaVendaRebolo(v)) === mes)
  for (const v of doMes) {
    const valor = Number(v.valor) || 0
    const forma = formaDaVenda(String(v.formaPagamento || ''))
    const ficha = fichas.find((f) => f.id === v.fichaReboloId)
    const qtd = produtoDaVenda(String(v.pacote || '')).produto === 'completo' ? Number(v.quantidade) || 1 : 0
    vendido += valor
    albuns += qtd
    custos.album += qtd * (k.custoAlbum + k.custoSaquinho)
    if (forma === 'boleto') {
      custos.reserva += (valor * k.reservaBoleto) / 100
      // R$ por boleto: cada parcela é um boleto (10x = 10 boletos)
      const boletos = Math.max(1, Number(v.parcelas) || 1)
      custos.taxas += k.taxaBoleto * boletos
      detalhe.taxaBoleto += k.taxaBoleto * boletos
    }
    if (ficha && !vazio(ficha.custoPostagem)) {
      custos.frete += Number(ficha.custoPostagem) || 0
      detalhe.freteLancado += Number(ficha.custoPostagem) || 0
      detalhe.enviosLancados++
    } else {
      custos.frete += k.freteEstimado
      detalhe.freteEstimado += k.freteEstimado
      estimado.fretes++
    }
    // cartão: % fixa sobre o valor total da venda (19/10/2026)
    if (forma === 'cartao') {
      custos.taxas += (valor * k.taxaCartao) / 100
      detalhe.cartao += (valor * k.taxaCartao) / 100
    }
    custos.comissao += comissaoDaVenda(t, forma, valor)
  }
  const holerite = colecao(s, 'rebolo_custos_mes').find((c) => String(c.vendedoraId) === vendedoraId && c.mes === mes)
  const salario = holerite ? Number(holerite.salario) || 0 : k.salarioEstimado
  estimado.salario = !holerite
  custos.salario = salario * (1 + k.encargos / 100)
  for (const chave of Object.keys(custos) as (keyof CustosLucroRebolo)[]) custos[chave] = centavos(custos[chave])
  const totalCustos = centavos(Object.values(custos).reduce((a, b) => a + b, 0))
  for (const chave of Object.keys(detalhe) as (keyof typeof detalhe)[]) if (chave !== 'enviosLancados') detalhe[chave] = centavos(detalhe[chave])
  return { mes, vendido: centavos(vendido), vendas: doMes.length, albuns, custos, totalCustos, lucro: centavos(vendido - totalCustos), estimado, detalhe }
}

// Os 12 meses do ano (null = antes de começar ou ainda não chegou)
export function lucroReboloAno(s: ErpState, vendedoraId: string, ano: string): (LucroRebolo | null)[] {
  const vendas = vendasDaVendedora(s, vendedoraId)
  return Array.from({ length: 12 }, (_, i) => lucroReboloMes(s, vendedoraId, `${ano}-${String(i + 1).padStart(2, '0')}`, vendas))
}

// variação contra o mês anterior, em % (null = sem mês anterior ou anterior zerado)
export function variacaoLucro(atual: number, anterior: number | null | undefined): number | null {
  if (anterior === null || anterior === undefined || anterior === 0) return null
  return ((atual - anterior) / Math.abs(anterior)) * 100
}
