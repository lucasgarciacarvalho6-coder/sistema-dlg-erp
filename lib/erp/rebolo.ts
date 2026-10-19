// Regras do setor Vendas Rebolo: revenda, por telefone/WhatsApp, dos books que o vendedor externo
// não vendeu. Cada caixa (pacote) tem 10 álbuns com a ficha de cadastro da escola; a vendedora
// cadastra as fichas à mão, imprime as etiquetas e contata cada família até vender ou descartar.

import type { ErpState, Registro } from './types'
import { hoje } from './format'

// Produtos (tabela de 06/10/2026): o Completo (maleta de luxo), com as opções sem maleta / sem moldura / com pôster,
// e o Pôster com Moldura vendido sozinho. (Kit Completo, Kit Sem Moldura e Álbum Simples saíram; as vendas antigas
// continuam com o nome que tinham.)
export const PRODUTOS_REBOLO = [
  { id: 'completo', nome: 'Completo (maleta de luxo)' },
  { id: 'poster_moldura', nome: 'Pôster com Moldura' }, // o pôster sozinho só é vendido com moldura
] as const
export type ProdutoRebolo = (typeof PRODUTOS_REBOLO)[number]['id']

// Opções do Completo: valor em R$ por faixa (o mesmo nas 3 formas de pagamento); 0 = a faixa não tem a opção.
// Podem ser marcadas juntas (ex.: sem maleta + sem moldura = −R$ 400).
export const OPCOES_COMPLETO = [
  { id: 'sem_maleta', nome: 'Sem maleta', sinal: -1 },
  { id: 'sem_moldura', nome: 'Sem moldura', sinal: -1 },
  { id: 'com_poster', nome: 'Com pôster', sinal: 1 }, // alguns books vêm com pôster (faixa 3)
] as const
export type OpcaoCompleto = (typeof OPCOES_COMPLETO)[number]['id']

// Cartão = crédito (parcelado); PIX à vista
export const FORMAS_REBOLO = [
  { id: 'pix', nome: 'PIX', formaPagamento: 'PIX' },
  { id: 'cartao', nome: 'Cartão', formaPagamento: 'Cartão de crédito' },
  { id: 'boleto', nome: 'Boleto', formaPagamento: 'Boleto' },
] as const
export type FormaRebolo = (typeof FORMAS_REBOLO)[number]['id']

export const FAIXAS = [1, 2, 3] as const
export type Faixa = (typeof FAIXAS)[number]
// cor da faixa no cadastro das fichas (pedido de 06/10/2026): 1 = verde • 2 = amarelo • 3 = vermelho
export const TOM_FAIXA: Record<Faixa, 'emerald' | 'yellow' | 'red'> = { 1: 'emerald', 2: 'yellow', 3: 'red' }

// ---- Tabela de preços (padrão = tabela da parede de 06/10/2026; o que vale é o que está salvo em Tabela de Preços) ----
// [PIX, Cartão, Boleto]. 0 = sem preço definido (produto não aparece para venda nessa faixa)
const PRECOS_PADRAO: Record<Faixa, Record<ProdutoRebolo, [number, number, number]>> = {
  1: { completo: [1800, 1900, 2400], poster_moldura: [350, 350, 350] },
  2: { completo: [900, 1000, 1500], poster_moldura: [350, 350, 350] },
  3: { completo: [500, 600, 800], poster_moldura: [350, 350, 350] },
}
const OPCOES_PADRAO: Record<Faixa, Record<OpcaoCompleto, number>> = {
  1: { sem_maleta: 200, sem_moldura: 200, com_poster: 0 },
  2: { sem_maleta: 200, sem_moldura: 200, com_poster: 0 },
  3: { sem_maleta: 200, sem_moldura: 0, com_poster: 200 },
}
const PARCELAS_PADRAO: Record<Faixa, { cartao: number; boleto: number }> = { 1: { cartao: 12, boleto: 15 }, 2: { cartao: 10, boleto: 15 }, 3: { cartao: 8, boleto: 10 } }

export const chavePreco = (f: Faixa, p: ProdutoRebolo, forma: FormaRebolo) => `rebolo_f${f}_${p}_${forma}`
export const chaveParcelas = (f: Faixa, forma: 'cartao' | 'boleto') => `rebolo_f${f}_parc_${forma}`
export const chaveOpcao = (f: Faixa, o: OpcaoCompleto) => `rebolo_f${f}_op_${o}`
export const chaveComissao = (forma: FormaRebolo) => `rebolo_comissao_${forma}`
export const REGRAS_REBOLO = [
  { chave: 'rebolo_faixa1_ate', label: 'Faixa 1 vai até (meses desde a visita)', padrao: 12 },
  { chave: 'rebolo_faixa2_ate', label: 'Faixa 2 vai até (meses desde a visita)', padrao: 18 },
  { chave: 'rebolo_parcela_minima', label: 'Valor mínimo por parcela (R$)', padrao: 100 },
  { chave: 'rebolo_parcelas_max', label: 'Máximo de parcelas (qualquer forma)', padrao: 15 },
  // comissão da vendedora sobre o valor da venda, pela forma de pagamento
  { chave: 'rebolo_comissao_pix', label: 'Comissão da vendedora • PIX (%)', padrao: 10 },
  { chave: 'rebolo_comissao_cartao', label: 'Comissão da vendedora • Cartão (%)', padrao: 5 },
  { chave: 'rebolo_comissao_boleto', label: 'Comissão da vendedora • Boleto (%)', padrao: 3 },
] as const

// Custos do Lucro/Prejuízo de cada vendedora (planilha "REBOLO - BASE PRINCIPAL", 07/10/2026):
// vendido − reserva do boleto − frete − taxa do cartão − taxa do boleto − álbum − saquinho − comissão − salário com encargos.
// O frete real o Rebolo lança no envio; o salário, o Financeiro (holerite). Sem o real, vale a estimativa.
// (19/10/2026) Taxa do boleto = R$ 5 por boleto (10x = 10 boletos); taxa do cartão = 15% do valor total da venda (regra fixa).
export const CUSTOS_REBOLO = [
  { chave: 'rebolo_reserva_boleto', label: 'Reserva de inadimplência do boleto (% da venda)', padrao: 35 },
  { chave: 'rebolo_custo_album', label: 'Custo do álbum (R$ por álbum)', padrao: 200 },
  { chave: 'rebolo_custo_saquinho', label: 'Saquinho (R$ por álbum)', padrao: 5 },
  { chave: 'rebolo_taxa_boleto_parcela', label: 'Taxa do boleto (R$ por boleto: 10x = 10 boletos)', padrao: 5 },
  { chave: 'rebolo_frete_estimado', label: 'Frete estimado (R$, até lançar o real)', padrao: 101.2 },
  { chave: 'rebolo_taxa_cartao', label: 'Taxa do cartão (% do valor total da venda)', padrao: 15 },
  { chave: 'rebolo_salario_estimado', label: 'Salário estimado (R$, até o Financeiro lançar)', padrao: 1925 },
  { chave: 'rebolo_encargos', label: 'Encargos sobre o salário (%)', padrao: 35 },
] as const

export interface CustosRebolo {
  reservaBoleto: number // %
  custoAlbum: number
  custoSaquinho: number
  taxaBoleto: number // R$ por boleto (parcela)
  freteEstimado: number
  taxaCartao: number // % do valor total da venda no cartão
  salarioEstimado: number
  encargos: number // %
}

export function valoresPadraoRebolo(): Record<string, number> {
  const v: Record<string, number> = Object.fromEntries([...REGRAS_REBOLO, ...CUSTOS_REBOLO].map((r) => [r.chave, r.padrao]))
  for (const f of FAIXAS) {
    for (const p of PRODUTOS_REBOLO) FORMAS_REBOLO.forEach((forma, i) => (v[chavePreco(f, p.id, forma.id)] = PRECOS_PADRAO[f][p.id][i]))
    for (const o of OPCOES_COMPLETO) v[chaveOpcao(f, o.id)] = OPCOES_PADRAO[f][o.id]
    v[chaveParcelas(f, 'cartao')] = PARCELAS_PADRAO[f].cartao
    v[chaveParcelas(f, 'boleto')] = PARCELAS_PADRAO[f].boleto
  }
  return v
}

export interface TabelaRebolo {
  faixa1Ate: number
  faixa2Ate: number
  parcelaMinima: number
  parcelasMax: number
  preco: (f: Faixa, p: ProdutoRebolo, forma: FormaRebolo) => number
  opcao: (f: Faixa, o: OpcaoCompleto) => number // R$ da opção do Completo (0 = a faixa não tem)
  comissao: (forma: FormaRebolo) => number // % da vendedora
  parcelas: (f: Faixa, forma: 'cartao' | 'boleto') => number
  custos: CustosRebolo
  valores: Record<string, number>
}

// Tabela a partir dos valores (os salvos ou os que estão sendo editados na Tabela de Preços)
export function tabelaDeValores(v: Record<string, number>): TabelaRebolo {
  return {
    faixa1Ate: v.rebolo_faixa1_ate,
    faixa2Ate: v.rebolo_faixa2_ate,
    parcelaMinima: v.rebolo_parcela_minima,
    parcelasMax: v.rebolo_parcelas_max,
    preco: (f, p, forma) => v[chavePreco(f, p, forma)] ?? 0,
    opcao: (f, o) => Math.max(0, v[chaveOpcao(f, o)] ?? 0),
    comissao: (forma) => Math.max(0, v[chaveComissao(forma)] ?? 0),
    parcelas: (f, forma) => v[chaveParcelas(f, forma)] ?? 1,
    custos: {
      reservaBoleto: Math.max(0, v.rebolo_reserva_boleto ?? 0),
      custoAlbum: Math.max(0, v.rebolo_custo_album ?? 0),
      custoSaquinho: Math.max(0, v.rebolo_custo_saquinho ?? 0),
      taxaBoleto: Math.max(0, v.rebolo_taxa_boleto_parcela ?? 0),
      freteEstimado: Math.max(0, v.rebolo_frete_estimado ?? 0),
      taxaCartao: Math.max(0, v.rebolo_taxa_cartao ?? 0),
      salarioEstimado: Math.max(0, v.rebolo_salario_estimado ?? 0),
      encargos: Math.max(0, v.rebolo_encargos ?? 0),
    },
    valores: v,
  }
}

export function tabelaRebolo(s: ErpState): TabelaRebolo {
  const salvos = s.empresa.parametros ?? {}
  const padrao = valoresPadraoRebolo()
  return tabelaDeValores(Object.fromEntries(Object.entries(padrao).map(([k, p]) => [k, Number.isFinite(salvos[k]) ? Number(salvos[k]) : p])))
}

// Opções do Completo que a faixa tem (valor > 0)
export const opcoesDaFaixa = (t: TabelaRebolo, f: Faixa) => OPCOES_COMPLETO.filter((o) => t.opcao(f, o.id) > 0)

// Preço da venda: produto da faixa + opções marcadas (só no Completo; opção que a faixa não tem é ignorada)
export function precoVenda(t: TabelaRebolo, f: Faixa, produto: ProdutoRebolo, forma: FormaRebolo, opcoes: readonly OpcaoCompleto[] = []): number {
  const base = t.preco(f, produto, forma)
  if (!(base > 0) || produto !== 'completo') return base > 0 ? base : 0
  const ajuste = OPCOES_COMPLETO.filter((o) => opcoes.includes(o.id)).reduce((a, o) => a + o.sinal * t.opcao(f, o.id), 0)
  return Math.max(0, base + ajuste)
}

// Nome que vai na venda e no contrato: "Completo (maleta de luxo)", "Completo sem maleta e sem moldura", "Completo + pôster"...
export function nomeDaVenda(produto: ProdutoRebolo, opcoes: readonly OpcaoCompleto[] = []): string {
  if (produto !== 'completo') return PRODUTOS_REBOLO.find((p) => p.id === produto)?.nome ?? produto
  const sem = (['sem_maleta', 'sem_moldura'] as const).filter((o) => opcoes.includes(o)).map((o) => (o === 'sem_maleta' ? 'sem maleta' : 'sem moldura'))
  return `${sem.length ? `Completo ${sem.join(' e ')}` : 'Completo (maleta de luxo)'}${opcoes.includes('com_poster') ? ' + pôster' : ''}`
}

// O contrário de nomeDaVenda, para editar a venda fechada: "Completo sem maleta + pôster" → completo + opções.
// Vendas antigas ("Kit Completo", "Kit Sem Moldura"...) abrem como Completo.
export function produtoDaVenda(pacote: string): { produto: ProdutoRebolo; opcoes: OpcaoCompleto[] } {
  const t = pacote.toLowerCase()
  if (/^p[ôo]ster/.test(t)) return { produto: 'poster_moldura', opcoes: [] }
  const opcoes: OpcaoCompleto[] = []
  if (t.includes('sem maleta')) opcoes.push('sem_maleta')
  if (t.includes('sem moldura')) opcoes.push('sem_moldura')
  if (/p[ôo]ster/.test(t)) opcoes.push('com_poster')
  return { produto: 'completo', opcoes }
}
export const formaDaVenda = (formaPagamento: string): FormaRebolo => FORMAS_REBOLO.find((f) => f.formaPagamento === formaPagamento)?.id ?? 'boleto'

// Combinações do Completo que a faixa tem (colunas do quadro de preços): Completo, Sem maleta, Sem moldura...
export function combinacoesDaFaixa(t: TabelaRebolo, f: Faixa): { opcoes: OpcaoCompleto[]; rotulo: string }[] {
  const tem = new Set(opcoesDaFaixa(t, f).map((o) => o.id))
  const todas: { opcoes: OpcaoCompleto[]; rotulo: string }[] = [
    { opcoes: [], rotulo: 'Completo' },
    { opcoes: ['sem_maleta'], rotulo: 'Sem maleta' },
    { opcoes: ['sem_moldura'], rotulo: 'Sem moldura' },
    { opcoes: ['sem_maleta', 'sem_moldura'], rotulo: 'Sem maleta e moldura' },
    { opcoes: ['com_poster'], rotulo: 'Com pôster' },
    { opcoes: ['sem_maleta', 'com_poster'], rotulo: 'Sem maleta + pôster' },
    { opcoes: ['sem_moldura', 'com_poster'], rotulo: 'Sem moldura + pôster' },
    { opcoes: ['sem_maleta', 'sem_moldura', 'com_poster'], rotulo: 'Sem maleta e moldura + pôster' },
  ]
  return todas.filter((c) => c.opcoes.every((o) => tem.has(o)))
}

export const comissaoDaVenda = (t: TabelaRebolo, forma: FormaRebolo, valor: number) => Math.round(valor * t.comissao(forma)) / 100

// Meses completos desde a visita da escola (data da ficha)
export function mesesDesde(dataISO: string, ref: string = hoje()): number {
  if (!dataISO) return 0
  const [a1, m1, d1] = dataISO.slice(0, 10).split('-').map(Number)
  const [a2, m2, d2] = ref.slice(0, 10).split('-').map(Number)
  return Math.max(0, (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0))
}

export function faixaDaFicha(dataVisita: string, t: TabelaRebolo, ref: string = hoje()): Faixa {
  const m = mesesDesde(dataVisita, ref)
  return m <= t.faixa1Ate ? 1 : m <= t.faixa2Ate ? 2 : 3
}

// Parcelas permitidas: regra da faixa, teto geral (15x) e valor mínimo por parcela (R$ 100). PIX é à vista.
export function maxParcelas(t: TabelaRebolo, f: Faixa, forma: FormaRebolo, valor: number): number {
  if (forma === 'pix') return 1
  const porMinimo = t.parcelaMinima > 0 ? Math.floor(valor / t.parcelaMinima) : t.parcelasMax
  return Math.max(1, Math.min(t.parcelas(f, forma), t.parcelasMax, porMinimo))
}

export const nomeProduto = (id: string) => PRODUTOS_REBOLO.find((p) => p.id === id)?.nome ?? id
export const nomeForma = (id: string) => FORMAS_REBOLO.find((f) => f.id === id)?.nome ?? id

// ---- Situações da ficha (fila de contatos) ----
export const SITUACOES_FICHA = ['Aguardando contato', 'Tentar de novo', 'Em negociação', 'Agendado', 'Venda a efetivar', 'Vendida', 'Descarte', 'Cancelada'] as const
export type SituacaoFicha = (typeof SITUACOES_FICHA)[number]
// fichas "finalizadas": o pacote com todas elas assim sai de "Em andamento"
export const FINALIZADAS: readonly string[] = ['Vendida', 'Descarte', 'Cancelada']
export const EM_ABERTO: readonly string[] = ['Aguardando contato', 'Tentar de novo', 'Em negociação', 'Agendado']
export const MOTIVOS_DESCARTE = ['Sem interesse', 'Sem retorno', 'Não localizado', 'Sem condição financeira', 'Restrição nos nomes'] as const
// cores das situações: vendida = verde • aguardando / em andamento = amarelo • descarte e cancelada = vermelho
export const TOM_SITUACAO: Record<string, 'emerald' | 'red' | 'yellow' | 'zinc'> = {
  'Aguardando contato': 'yellow',
  'Tentar de novo': 'yellow',
  'Em negociação': 'yellow',
  Agendado: 'yellow',
  'Venda a efetivar': 'yellow',
  Vendida: 'emerald',
  Descarte: 'red',
  Cancelada: 'red',
}

// ---- Envio pelo Correio (SQL 037): situação da entrega, com as cores dos selos ----
export const SITUACOES_ENTREGA = ['Pendente', 'Cliente recebeu', 'Não recebeu'] as const
export type SituacaoEntrega = (typeof SITUACOES_ENTREGA)[number]
export const TOM_ENTREGA: Record<string, 'emerald' | 'red' | 'yellow'> = { Pendente: 'yellow', 'Cliente recebeu': 'emerald', 'Não recebeu': 'red' }
// a página dos Correios não recebe o código pelo endereço: a tela copia o código e abre a página
export const LINK_RASTREIO_CORREIOS = 'https://rastreamento.correios.com.br/app/index.php'

// Escola da ficha: o cadastro não pede mais a escola (06/10/2026: cada álbum tem só a sua data da visita).
// O banco exige o campo: a ficha nova grava "—" e as telas não mostram (as fichas antigas mantêm a escola).
export const SEM_ESCOLA = '—'
export const escolaFicha = (f: Registro | undefined) => {
  const e = String(f?.escola ?? '').trim()
  return e === SEM_ESCOLA ? '' : e
}

export const pacoteFinalizado = (fichas: Registro[]) => fichas.length > 0 && fichas.every((f) => FINALIZADAS.includes(String(f.situacao)))

// Abrir pacote novo NÃO tem trava (pedido de 06/10/2026, SQL 033): a vendedora abre um Padrão (10) ou Avulso (1)
// a qualquer momento, mesmo com outros em andamento.
export const capacidadePacote = (p: Registro | undefined) => (p?.tipo === 'Avulso' ? 1 : 10)

// Número do pacote POR VENDEDORA (pedido de 06/10/2026, SQL 034): cada uma tem a sua sequência e o número pode
// repetir entre elas. Próximo = o informado pela supervisão (rebolo_numeracao); sem ele, o último dela + 1
// (vendedora nova começa no 1); número que ela já usou é pulado.
export function proximoPacote(numeracao: Registro | undefined, pacotesDela: Registro[]): number {
  const usados = new Set(pacotesDela.map((p) => Number(p.numero) || 0))
  let n = Number(numeracao?.proximo) || Math.max(0, ...usados) + 1
  while (usados.has(n)) n++
  return n
}
export const rotuloPacote = (p: Registro | undefined) => (p ? `P${p.numero}` : '—')

// ---- Telefones ----
export const soDigitos = (v: string) => String(v ?? '').replace(/\D/g, '')

export function formatarTelefone(v: string) {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export const formatarCep = (v: string) => {
  const d = soDigitos(v).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

// Link do WhatsApp (Brasil) para abrir a conversa com o número
export const linkWhatsApp = (tel: string) => {
  const d = soDigitos(tel)
  return d.length >= 10 ? `https://wa.me/55${d}` : ''
}

// ---- CEP → endereço (ViaCEP: serviço público e gratuito; só o CEP é enviado) ----
export interface Endereco {
  rua: string
  bairro: string
  cidade: string
  uf: string
  ddd: string
}
export async function buscarCep(cep: string): Promise<Endereco | null> {
  const d = soDigitos(cep)
  if (d.length !== 8) return null
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`)
    if (!r.ok) return null
    const j = (await r.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string; ddd?: string }
    if (j.erro) return null
    return { rua: j.logradouro ?? '', bairro: j.bairro ?? '', cidade: j.localidade ?? '', uf: j.uf ?? '', ddd: j.ddd ?? '' }
  } catch {
    return null
  }
}

// ---- DDD por estado e região (principais cidades de cada DDD) ----
export const DDD_POR_UF: Record<string, { ddd: string; regiao: string }[]> = {
  AC: [{ ddd: '68', regiao: 'Todo o Acre' }],
  AL: [{ ddd: '82', regiao: 'Todo Alagoas' }],
  AM: [
    { ddd: '92', regiao: 'Manaus, Itacoatiara, Manacapuru, Parintins' },
    { ddd: '97', regiao: 'Tefé, Coari, Tabatinga, Lábrea' },
  ],
  AP: [{ ddd: '96', regiao: 'Todo o Amapá' }],
  BA: [
    { ddd: '71', regiao: 'Salvador, Camaçari, Lauro de Freitas, Simões Filho' },
    { ddd: '73', regiao: 'Ilhéus, Itabuna, Porto Seguro, Teixeira de Freitas, Eunápolis, Jequié' },
    { ddd: '74', regiao: 'Juazeiro, Senhor do Bonfim, Irecê, Jacobina' },
    { ddd: '75', regiao: 'Feira de Santana, Alagoinhas, Santo Antônio de Jesus, Paulo Afonso, Cruz das Almas' },
    { ddd: '77', regiao: 'Vitória da Conquista, Barreiras, Luís Eduardo Magalhães, Guanambi, Bom Jesus da Lapa, Brumado' },
  ],
  CE: [
    { ddd: '85', regiao: 'Fortaleza, Caucaia, Maracanaú, Maranguape' },
    { ddd: '88', regiao: 'Juazeiro do Norte, Sobral, Crato, Iguatu, Quixadá' },
  ],
  DF: [{ ddd: '61', regiao: 'Brasília e todo o DF' }],
  ES: [
    { ddd: '27', regiao: 'Vitória, Vila Velha, Serra, Cariacica, Linhares, Colatina, Guarapari' },
    { ddd: '28', regiao: 'Cachoeiro de Itapemirim, Alegre, Castelo, Marataízes' },
  ],
  GO: [
    { ddd: '62', regiao: 'Goiânia, Aparecida de Goiânia, Anápolis, Goianésia, Ceres' },
    { ddd: '64', regiao: 'Rio Verde, Jataí, Itumbiara, Caldas Novas, Catalão, Mineiros' },
    { ddd: '61', regiao: 'Entorno do DF: Luziânia, Formosa, Valparaíso de Goiás, Águas Lindas de Goiás' },
  ],
  MA: [
    { ddd: '98', regiao: 'São Luís, São José de Ribamar, Paço do Lumiar, Pinheiro, Chapadinha' },
    { ddd: '99', regiao: 'Imperatriz, Caxias, Timon, Bacabal, Codó, Balsas, Açailândia' },
  ],
  MG: [
    { ddd: '31', regiao: 'Belo Horizonte, Contagem, Betim, Sete Lagoas, Ouro Preto' },
    { ddd: '32', regiao: 'Juiz de Fora, Barbacena, Muriaé, Ubá, Cataguases' },
    { ddd: '33', regiao: 'Governador Valadares, Teófilo Otoni, Caratinga, Manhuaçu' },
    { ddd: '34', regiao: 'Uberlândia, Uberaba, Patos de Minas, Araguari, Ituiutaba, Araxá' },
    { ddd: '35', regiao: 'Poços de Caldas, Pouso Alegre, Varginha, Lavras, Passos, Itajubá, Cássia' },
    { ddd: '37', regiao: 'Divinópolis, Itaúna, Formiga, Pará de Minas, Bom Despacho' },
    { ddd: '38', regiao: 'Montes Claros, Paracatu, Unaí, Pirapora, Janaúba' },
  ],
  MS: [{ ddd: '67', regiao: 'Todo o Mato Grosso do Sul' }],
  MT: [
    { ddd: '65', regiao: 'Cuiabá, Várzea Grande, Diamantino, Cáceres, Tangará da Serra, Denise' },
    { ddd: '66', regiao: 'Rondonópolis, Sinop, Sorriso, Lucas do Rio Verde, Primavera do Leste, Barra do Garças, Alta Floresta' },
  ],
  PA: [
    { ddd: '91', regiao: 'Belém, Ananindeua, Castanhal, Abaetetuba' },
    { ddd: '93', regiao: 'Santarém, Altamira, Itaituba' },
    { ddd: '94', regiao: 'Marabá, Parauapebas, Redenção, Tucuruí' },
  ],
  PB: [{ ddd: '83', regiao: 'Toda a Paraíba' }],
  PE: [
    { ddd: '81', regiao: 'Recife, Jaboatão dos Guararapes, Olinda, Caruaru' },
    { ddd: '87', regiao: 'Petrolina, Garanhuns, Serra Talhada, Arcoverde, Salgueiro' },
  ],
  PI: [
    { ddd: '86', regiao: 'Teresina, Parnaíba, Piripiri, Campo Maior' },
    { ddd: '89', regiao: 'Picos, Floriano, São Raimundo Nonato, Corrente' },
  ],
  PR: [
    { ddd: '41', regiao: 'Curitiba, São José dos Pinhais, Colombo, Paranaguá' },
    { ddd: '42', regiao: 'Ponta Grossa, Guarapuava, União da Vitória, Irati' },
    { ddd: '43', regiao: 'Londrina, Apucarana, Arapongas, Cornélio Procópio, Ibiporã' },
    { ddd: '44', regiao: 'Maringá, Umuarama, Campo Mourão, Paranavaí, Cianorte, Altônia, Pérola, Xambrê, Iporã' },
    { ddd: '45', regiao: 'Cascavel, Foz do Iguaçu, Toledo, Marechal Cândido Rondon, Catanduvas' },
    { ddd: '46', regiao: 'Francisco Beltrão, Pato Branco, Dois Vizinhos' },
  ],
  RJ: [
    { ddd: '21', regiao: 'Rio de Janeiro, Niterói, São Gonçalo, Duque de Caxias, Nova Iguaçu' },
    { ddd: '22', regiao: 'Campos dos Goytacazes, Macaé, Cabo Frio, Nova Friburgo, Itaperuna' },
    { ddd: '24', regiao: 'Petrópolis, Volta Redonda, Barra Mansa, Resende, Teresópolis, Angra dos Reis' },
  ],
  RN: [{ ddd: '84', regiao: 'Todo o Rio Grande do Norte' }],
  RO: [{ ddd: '69', regiao: 'Todo Rondônia' }],
  RR: [{ ddd: '95', regiao: 'Todo Roraima' }],
  RS: [
    { ddd: '51', regiao: 'Porto Alegre, Canoas, Novo Hamburgo, São Leopoldo, Gravataí' },
    { ddd: '53', regiao: 'Pelotas, Rio Grande, Bagé, Camaquã' },
    { ddd: '54', regiao: 'Caxias do Sul, Passo Fundo, Bento Gonçalves, Erechim, Vacaria' },
    { ddd: '55', regiao: 'Santa Maria, Santo Ângelo, Uruguaiana, Ijuí, Santa Rosa, Cruz Alta' },
  ],
  SC: [
    { ddd: '47', regiao: 'Joinville, Blumenau, Itajaí, Balneário Camboriú, Jaraguá do Sul, Brusque' },
    { ddd: '48', regiao: 'Florianópolis, São José, Palhoça, Tubarão, Criciúma' },
    { ddd: '49', regiao: 'Chapecó, Lages, Joaçaba, Caçador, Concórdia, São Miguel do Oeste' },
  ],
  SE: [{ ddd: '79', regiao: 'Todo Sergipe' }],
  SP: [
    { ddd: '11', regiao: 'São Paulo, Guarulhos, Osasco, Santo André, São Bernardo do Campo, Mogi das Cruzes, Jundiaí' },
    { ddd: '12', regiao: 'São José dos Campos, Taubaté, Jacareí, Caraguatatuba, Guaratinguetá' },
    { ddd: '13', regiao: 'Santos, São Vicente, Guarujá, Praia Grande, Registro' },
    { ddd: '14', regiao: 'Bauru, Marília, Jaú, Botucatu, Ourinhos' },
    { ddd: '15', regiao: 'Sorocaba, Itapetininga, Itu, Tatuí, Itapeva' },
    { ddd: '16', regiao: 'Ribeirão Preto, Franca, São Carlos, Araraquara, Sertãozinho' },
    { ddd: '17', regiao: 'São José do Rio Preto, Catanduva, Votuporanga, Barretos, Fernandópolis' },
    { ddd: '18', regiao: 'Presidente Prudente, Araçatuba, Assis, Birigui, Andradina' },
    { ddd: '19', regiao: 'Campinas, Piracicaba, Limeira, Americana, Rio Claro, Sumaré' },
  ],
  TO: [{ ddd: '63', regiao: 'Todo o Tocantins' }],
}
export const UFS = Object.keys(DDD_POR_UF).sort()

const semAcento = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Sugestão de DDD: estado com um só DDD, ou cidade listada na região. Sem certeza → null (a vendedora escolhe).
export function sugerirDDD(uf: string, cidade: string): string | null {
  const lista = DDD_POR_UF[uf.toUpperCase()]
  if (!lista) return null
  if (lista.length === 1) return lista[0].ddd
  const c = semAcento(cidade)
  if (!c) return null
  const achado = lista.find((r) => r.regiao.split(',').some((x) => semAcento(x) === c))
  return achado?.ddd ?? null
}

// ---- Dados da empresa no "Contrato de Compra Online" (iguais ao contrato atual) ----
export const EMPRESA_CONTRATO = {
  nome: 'DLG PHOTO STUDIO E FORMATURA',
  telefone: '(35)99168-0175',
  cnpj: '11.658.279/0001-11',
  endereco: 'Rua Rio Solimões, 375 - Novo Agua Limpa - CEP 37208-267 - Lavras MG',
  localAssinatura: 'LAVRAS, MG',
}
