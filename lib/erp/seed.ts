// Dados de demonstração. Gerados uma única vez por navegador (localStorage).
// Configurações → "Restaurar dados de demonstração" recria tudo.

import type { Colaborador, ErpState, Registro, Setor } from './types'
import { SETORES } from './config'
import { addDias, hoje, isoData, uid } from './format'
import { MATRIZ_PADRAO } from './permissions'
import {
  APOS_CRIAR,
  acertarCarga,
  atualizarVendaRebolo,
  criarCarga,
  enviarRebolo,
  baixarTitulo,
  col,
  conferirVendaBook,
  criarLoteProducao,
  confirmarContratoEscola,
  encerrarVisita,
  enviarFechamento,
  inserir,
  corDaCidadeDemo,
  lancar,
  negociarTitulo,
  pagarConta,
  registrarContatoRebolo,
  registrarHistoricoVisita,
  registrarEscolaDemo,
  type Contexto,
} from './fluxos'
import { calcularFechamentoEscola } from './operacional'
import { ehDiaUtil } from './calendario'
import { metaColaborador } from './metrics'
import { REGRAS_COBRANCA } from './cobranca-config'

export const VERSAO_DADOS = 19 // v19: configurações da cobrança (regras, categorias e escritórios de exemplo)
export const SENHA_DEMO = '123456'

// PRNG determinístico (mulberry32) para os números ficarem estáveis entre recargas
function gerador(semente: number) {
  let a = semente
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COLABORADORES: [string, string, string, Setor, string][] = [
  ['u-adm', 'Lucas W. Garcia', 'admin@dlgphotos.com', 'adm', 'Diretor(a)'],
  ['u-ger', 'Mariana Duarte', 'gerente@dlgphotos.com', 'gerencia', 'Gerente geral'],
  ['u-ven1', 'Ana Paula Ribeiro', 'ana.vendas@dlgphotos.com', 'vendas', 'Vendedor(a)'],
  ['u-ven2', 'Bruna Martins', 'bruna.vendas@dlgphotos.com', 'vendas', 'Vendedor(a)'],
  ['u-ven3', 'Carla Souza', 'carla.vendas@dlgphotos.com', 'vendas', 'Vendedor(a)'],
  ['u-ven4', 'Ahmed Choucair', 'ahmed.vendas@dlgphotos.com', 'vendas', 'Vendedor(a)'],
  ['u-op1', 'Flávia Alves Roquini', 'operacional@dlgphotos.com', 'operacional', 'Coordenação / RMC'],
  ['u-op2', 'Diego Lima', 'diego.foto@dlgphotos.com', 'operacional', 'Fotógrafo(a)'],
  ['u-op3', 'Rafael Costa', 'rafael.foto@dlgphotos.com', 'operacional', 'Fotógrafo(a)'],
  // Produção (id 'edicao'): recebe as fotos, manda ao editor e faz a análise de qualidade
  ['u-ed1', 'Aline Castro', 'fotos@dlgphotos.com', 'edicao', 'Análise de qualidade'],
  ['u-ed2', 'Marina Lopes', 'marina.fotos@dlgphotos.com', 'edicao', 'Análise de qualidade'],
  // Revelação (id 'producao', a antiga Produção): informa os álbuns revelados pelo app
  ['u-pr1', 'Juliana Prado', 'producao@dlgphotos.com', 'producao', 'Revelação'],
  ['u-pr2', 'Marcos Vieira', 'marcos.producao@dlgphotos.com', 'producao', 'Revelação'],
  ['u-co1', 'Patrícia Gomes', 'cobranca@dlgphotos.com', 'cobranca', 'Cobrador(a)'],
  ['u-co2', 'Renata Alves', 'renata.cobranca@dlgphotos.com', 'cobranca', 'Atendente de vendas'],
  ['u-fi1', 'Eduardo Nunes', 'financeiro@dlgphotos.com', 'financeiro', 'Analista financeiro'],
  // Vendas Rebolo: revendem por telefone/WhatsApp os books que o externo não vendeu
  ['u-re0', 'Luana Ferraz', 'supervisao.rebolo@dlgphotos.com', 'rebolo', 'Supervisor(a) rebolo'],
  ['u-re1', 'Bianca Rocha', 'rebolo@dlgphotos.com', 'rebolo', 'Vendedor(a) rebolo'],
  ['u-re2', 'Tainá Moreira', 'taina.rebolo@dlgphotos.com', 'rebolo', 'Vendedor(a) rebolo'],
  ['u-re3', 'Yasmin Prado', 'yasmin.rebolo@dlgphotos.com', 'rebolo', 'Vendedor(a) rebolo'],
  // Vendedores externos (PJ) com acesso ao app do vendedor
  ['u-ext1', 'Ahmed Husni Ali Choucair', 'contrato@dlgphotos.com', 'externo', 'Vendedor de contrato'],
  ['u-ext2', 'Rafaela Moura', 'books@dlgphotos.com', 'externo', 'Vendedor de books'],
]

// Contas de acesso rápido exibidas na tela de login
export const CONTAS_DEMO = [
  { setor: 'adm' as Setor, email: 'admin@dlgphotos.com' },
  { setor: 'gerencia' as Setor, email: 'gerente@dlgphotos.com' },
  { setor: 'vendas' as Setor, email: 'ana.vendas@dlgphotos.com' },
  { setor: 'operacional' as Setor, email: 'operacional@dlgphotos.com' },
  { setor: 'edicao' as Setor, email: 'fotos@dlgphotos.com' },
  { setor: 'producao' as Setor, email: 'producao@dlgphotos.com' },
  { setor: 'financeiro' as Setor, email: 'financeiro@dlgphotos.com' },
  { setor: 'cobranca' as Setor, email: 'cobranca@dlgphotos.com' },
  { setor: 'rebolo' as Setor, email: 'rebolo@dlgphotos.com' },
  { setor: 'externo' as Setor, email: 'contrato@dlgphotos.com', rotulo: 'App • Vendedor de contrato' },
  { setor: 'externo' as Setor, email: 'books@dlgphotos.com', rotulo: 'App • Vendedor de books' },
]

export function estadoVazio(): ErpState {
  return {
    versao: VERSAO_DADOS,
    empresa: { nome: 'DLG Photos', cnpj: '00.000.000/0001-00', email: 'contato@dlgphotos.com', telefone: '(44) 0000-0000', cidade: '—', uf: 'PR' },
    colaboradores: [],
    lancamentos: [],
    colecoes: {},
    permissoes: MATRIZ_PADRAO,
    auditoria: [],
    notificacoes: [],
  }
}

// Clientes fictícios da Cobrança/Financeiro: CPFs válidos gerados, alguns sem documento ou com dígito errado,
// e algumas empresas (CNPJ), para testar a pesquisa e o filtro "documento a corrigir"
function clientesDemo(r: () => number): Omit<Registro, 'id' | 'criadoEm'>[] {
  const nomes = ['MARIA', 'JOSE', 'ANA', 'JOAO', 'FRANCISCA', 'ANTONIO', 'ADRIANA', 'CARLOS', 'JULIANA', 'PAULO', 'LUCIANA', 'MARCOS', 'PATRICIA', 'RAFAEL', 'CAMILA']
  const sobrenomes = ['DA SILVA', 'DOS SANTOS', 'PEREIRA', 'ALVES', 'FERREIRA', 'RODRIGUES', 'GOMES', 'RIBEIRO', 'MARTINS', 'CARVALHO', 'SOUZA', 'OLIVEIRA']
  const cidades: [string, string, string][] = [
    ['Lavras', 'MG', '35'], ['São João del-Rei', 'MG', '32'], ['Campo Belo', 'MG', '35'], ['Nepomuceno', 'MG', '35'], ['Perdões', 'MG', '35'],
    ['Campo Grande', 'MS', '67'], ['Dourados', 'MS', '67'], ['Cuiabá', 'MT', '65'], ['Rondonópolis', 'MT', '66'], ['Maringá', 'PR', '44'], ['Goiânia', 'GO', '62'],
  ]
  const digito = (base: number[], pesoInicial: number) => {
    const s = base.reduce((a, n, i) => a + n * (pesoInicial - i), 0)
    return ((s * 10) % 11) % 10
  }
  const cpf = () => {
    const b = Array.from({ length: 9 }, () => Math.floor(r() * 10))
    const d1 = digito(b, 10)
    const d2 = digito([...b, d1], 11)
    return [...b, d1, d2].join('')
  }
  const cnpj = () => {
    const b = [...Array.from({ length: 8 }, () => Math.floor(r() * 10)), 0, 0, 0, 1]
    const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const dv = (n: number[]) => {
      const s = n.reduce((a, x, i) => a + x * pesos[i + 13 - n.length], 0)
      return s % 11 < 2 ? 0 : 11 - (s % 11)
    }
    const d1 = dv(b)
    return [...b, d1, dv([...b, d1])].join('')
  }
  const origens = ['Conta Azul', 'Conta Azul', 'Conta Azul', 'Rebolo', 'Vendedor externo', 'Cadastro manual']
  return Array.from({ length: 140 }, (_, i) => {
    const [cidade, uf, ddd] = cidades[i % cidades.length]
    const empresa = i % 17 === 0
    const semDoc = i % 13 === 5
    let documento = empresa ? cnpj() : cpf()
    if (i % 23 === 7) documento = documento.slice(0, -1) + ((Number(documento.at(-1)) + 1) % 10) // dígito errado
    const tel = `(${ddd}) 9${String(Math.floor(r() * 9000) + 1000)}-${String(Math.floor(r() * 9000) + 1000)}`
    return {
      nome: empresa ? `ESCOLA ${sobrenomes[i % sobrenomes.length].replace(/^D[AO]S? /, '')} LTDA` : `${nomes[i % nomes.length]} ${sobrenomes[Math.floor(i / nomes.length) % sobrenomes.length]} ${sobrenomes[(i * 7) % sobrenomes.length]}`,
      documento: semDoc ? '' : documento,
      tipoPessoa: empresa ? 'Jurídica' : 'Física',
      whatsapp: tel,
      telefone1: i % 4 === 0 ? `(${ddd}) 3${String(Math.floor(r() * 900) + 100)}-${String(Math.floor(r() * 9000) + 1000)}` : '',
      telefone2: '',
      telefone3: '',
      email: i % 3 === 0 ? `cliente${i}@email.com` : '',
      cep: '',
      rua: i % 2 === 0 ? `Rua ${sobrenomes[i % sobrenomes.length].replace(/^D[AO]S? /, '')}` : '',
      numero: i % 2 === 0 ? String(10 + i) : '',
      complemento: '',
      bairro: i % 2 === 0 ? 'Centro' : '',
      cidade,
      uf,
      origem: origens[i % origens.length],
      codigoContaAzul: '',
      codigoSistemaAntigo: '',
      observacao: '',
    }
  })
}

export function gerarSeed(): ErpState {
  const r = gerador(20260924)
  const s = estadoVazio()
  const hojeISO = hoje()
  const criado = new Date().toISOString()

  s.colaboradores = COLABORADORES.map(([id, nome, email, setor, funcao], i): Colaborador => ({
    id,
    nome,
    email,
    senha: SENHA_DEMO,
    cpf: `000.000.${String(100 + i).padStart(3, '0')}-00`,
    telefone: `(44) 9${String(9000 + i * 37).padStart(4, '0')}-${String(1000 + i * 91).slice(-4)}`,
    funcao,
    setor,
    perfil: setor === 'adm' ? 'ADM' : setor === 'gerencia' ? 'GERENTE' : 'COLABORADOR',
    status: 'ATIVO',
    dataAdmissao: '2025-02-01',
    // Meta padrão com PISO (mínimo p/ não dar prejuízo) = 80% da meta. Operacional: meta de fichas
    // toda da coordenação (RMC, 1.200 com piso 1.000); fotógrafos não têm meta
    metas:
      setor === 'operacional'
        ? { fichas: id === 'u-op1' ? { mensal: 1200, diaria: 0, piso: 1000 } : { mensal: 0, diaria: 0, piso: 0 } }
        : setor === 'rebolo'
          ? // meta do time R$ 15.000 (piso R$ 10.000) dividida entre as vendedoras; supervisora sem meta
            id === 'u-re0'
            ? {}
            : { valor_vendido: { mensal: 5000, diaria: 0, piso: 3334 }, books_vendidos: { mensal: 6, diaria: 0, piso: 4 } }
          : setor === 'edicao'
            ? { albuns_entregues: { mensal: 1000, diaria: 0, piso: 0 } } // meta do bônus (1.000 álbuns); sem piso
            : Object.fromEntries(SETORES[setor].indicadores.map((ind) => [ind.id, { mensal: ind.metaPadrao.mensal, diaria: 0, piso: Math.round(ind.metaPadrao.mensal * 0.8) }])),
    semMeta: setor === 'financeiro' || setor === 'gerencia' || id === 'u-re0',
    criadoEm: criado,
  }))

  const ctx: Contexto = { autorId: 'u-adm', autorNome: 'Sistema (seed)', autorSetor: 'adm', silencioso: true }

  // ---- Histórico de produção: do 1º dia do mês anterior até hoje ----
  const agora = new Date()
  const inicio = isoData(new Date(agora.getFullYear(), agora.getMonth() - 1, 1))
  for (let dia = inicio; dia <= hojeISO; dia = addDias(dia, 1)) {
    if (!ehDiaUtil(dia)) continue // fim de semana / feriado
    const fatorDia = dia === hojeISO ? 0.55 : 1
    for (const c of s.colaboradores) {
      for (const ind of SETORES[c.setor].indicadores) {
        const diaria = metaColaborador(c, ind.id, dia.slice(0, 7)).diaria
        if (diaria <= 0) continue // sem meta nesse indicador (ex.: fotógrafos)
        const base = diaria * (0.45 + r() * 0.7) * fatorDia * (c.id === 'u-ven3' ? 1.2 : 1)
        let qtd = base < 3 ? Math.floor(base + r()) : Math.round(base)
        if (ind.unidade === 'brl') qtd = Math.round(base / 10) * 10
        if (qtd > 0) {
          s.lancamentos.push({
            id: `seed-${c.id}-${ind.id}-${dia}`,
            setor: c.setor,
            indicador: ind.id,
            colaboradorId: c.id,
            quantidade: qtd,
            descricao: 'Histórico importado',
            data: dia,
            criadoEm: criado,
            origem: 'manual',
            autorId: c.id,
          })
        }
      }
    }
  }

  // ---- Núcleo central: cadastros ----
  const escolas: [string, string, string, string, string][] = [
    ['PROJETO ESPAÇO CRIANÇA', 'Altônia', 'PR', '41000101', 'Jasmin (Diretora)'],
    ['MARIA MAYSRE M PESSUTI EF', 'Catanduvas', 'PR', '41000102', 'Cláudia (Coord.)'],
    ['SANTA TEREZINHA C M E I', 'São José B. Vista', 'PR', '41000103', 'Rosângela (Diretora)'],
    ['COLÉGIO DOM ATHAMAZIO MERKLE', 'Pérola', 'PR', '41048810', 'Irmã Lúcia'],
    ['ESCOLA MUNICIPAL SOL NASCENTE', 'Ibiporã', 'PR', '41000105', 'Marcos (Diretor)'],
    ['CMEI PEQUENO PRÍNCIPE', 'Xambrê', 'PR', '41000106', 'Aline (Coord.)'],
  ]
  escolas.forEach(([nome, cidade, uf, inep, responsavel]) =>
    inserir(s, 'escolas', { nome, cidade, uf, inep, responsavel, telefone: '(44) 3000-0000', status: 'Ativa' }),
  )
  inserir(s, 'filiais', { nome: 'DLG Photos — Matriz', tipo: 'Matriz', cidade: '—', uf: 'PR', cnpj: '00.000.000/0001-00', status: 'Ativa' })
  inserir(s, 'filiais', { nome: 'Base Operacional Norte', tipo: 'Filial', cidade: '—', uf: 'PR', cnpj: '00.000.000/0002-00', status: 'Ativa' })
  ;[
    ['E-book Digital', 'E-book', 89.9],
    ['E-book + Álbum Impresso', 'Combo', 189.9],
    ['Pacote Completo (E-book + Álbum + Quadro)', 'Combo', 249.9],
    ['Foto Avulsa 20x25', 'Impresso', 19.9],
  ].forEach(([nome, categoria, preco]) => inserir(s, 'produtos', { nome, categoria, preco, status: 'Ativo' }))
  ;[
    ['Gráfica Print Max', 'Impressão de álbuns', '(44) 3011-2233'],
    ['Papelaria Central', 'Materiais de escritório', '(44) 3022-4455'],
    ['Auto Posto Estrada', 'Combustível da frota', '(44) 3033-6677'],
  ].forEach(([nome, categoria, telefone]) => inserir(s, 'fornecedores', { nome, categoria, telefone, status: 'Ativo' }))
  ;[
    ['Papel fotográfico A4', 'Pacote', 120, 50],
    ['Capa de álbum premium', 'Unidade', 38, 60],
    ['Cartão SD 128GB', 'Unidade', 9, 5],
    ['Moldura 20x25', 'Unidade', 70, 30],
  ].forEach(([item, unidade, quantidade, minimo]) => inserir(s, 'estoque', { item, unidade, quantidade, minimo }))

  // ---- Vendas: leads e contratos (contratos disparam o fluxo entre setores) ----
  ;[
    ['ESCOLA ESTADUAL VILA RICA', 'Umuarama', 'Sra. Helena', 'u-ven1', 'Proposta', 180],
    ['CMEI GENTE MIÚDA', 'Cianorte', 'Sr. Paulo', 'u-ven2', 'Visita agendada', 90],
    ['COLÉGIO NOVO SABER', 'Maringá', 'Sra. Débora', 'u-ven3', 'Negociação', 320],
    ['ESCOLA RURAL BOA VISTA', 'Iporã', 'Sr. Anselmo', 'u-ven4', 'Novo', 60],
    ['CENTRO EDUCACIONAL ARCO-ÍRIS', 'Toledo', 'Sra. Márcia', 'u-ven1', 'Contato feito', 150],
    ['ESCOLA MUNICIPAL CASTELO', 'Cascavel', 'Sra. Joana', 'u-ven2', 'Perdido', 110],
  ].forEach(([escola, cidade, contato, vendedoraId, etapa, alunos], i) =>
    inserir(s, 'leads', { escola, cidade, uf: 'PR', contato, telefone: '(44) 99999-000' + i, vendedoraId, etapa, alunos, observacao: '' }),
  )

  const contratos: [string, string, string, number, number][] = [
    ['PROJETO ESPAÇO CRIANÇA', 'Altônia', 'u-ven4', 140, -22],
    ['MARIA MAYSRE M PESSUTI EF', 'Catanduvas', 'u-ven1', 210, -16],
    ['SANTA TEREZINHA C M E I', 'São José B. Vista', 'u-ven2', 95, -10],
    ['COLÉGIO DOM ATHAMAZIO MERKLE', 'Pérola', 'u-ven3', 260, -5],
    ['ESCOLA MUNICIPAL SOL NASCENTE', 'Ibiporã', 'u-ven3', 120, -1],
  ]
  // Os lançamentos de "contratos" já estão no histórico acima; aqui só criamos os registros
  // e deixamos o fluxo gerar ordens/tarefas (removemos o lançamento duplicado em seguida).
  for (const [escola, cidade, vendedoraId, alunos, dias] of contratos) {
    const reg = inserir(s, 'contratos', { escola, cidade, uf: 'PR', vendedoraId, alunos, comissaoPct: 10, data: addDias(hojeISO, dias), status: 'Ativo', observacao: '' })
    const antes = s.lancamentos.length
    APOS_CRIAR.contratos(s, reg, ctx)
    s.lancamentos.splice(antes, s.lancamentos.length - antes)
  }
  col(s, 'tarefas_operacionais').forEach((t, i) => {
    t.responsavelId = 'u-op1'
    t.status = i >= 2 ? 'Concluída' : i === 1 ? 'Em andamento' : 'Pendente'
  })
  inserir(s, 'tarefas_operacionais', { titulo: 'Revisão do Carro 01', escola: '—', cidade: '—', responsavelId: 'u-op2', prioridade: 'Média', prazo: addDias(hojeISO, 3), status: 'Pendente', contratoId: '' })

  // ---- Cobrança: vendas de e-books aos pais → títulos + comissões ----
  const pais: [string, string, string, number, number, string, number][] = [
    ['Fernanda Oliveira', 'Pedro', 'PROJETO ESPAÇO CRIANÇA', 189.9, 3, 'u-re1', -58],
    ['João Batista', 'Laura', 'PROJETO ESPAÇO CRIANÇA', 89.9, 1, 'u-re2', -40],
    ['Simone Ferreira', 'Miguel', 'MARIA MAYSRE M PESSUTI EF', 249.9, 3, 'u-re1', -35],
    ['Carlos Eduardo', 'Helena', 'MARIA MAYSRE M PESSUTI EF', 189.9, 2, 'u-re2', -20],
    ['Priscila Santos', 'Davi', 'SANTA TEREZINHA C M E I', 89.9, 1, 'u-re3', -12],
    ['Rodrigo Mendes', 'Alice', 'COLÉGIO DOM ATHAMAZIO MERKLE', 249.9, 3, 'u-re2', -6],
    ['Tatiane Lopes', 'Theo', 'COLÉGIO DOM ATHAMAZIO MERKLE', 189.9, 2, 'u-re1', -3],
    ['Marcelo Rocha', 'Sofia', 'PROJETO ESPAÇO CRIANÇA', 89.9, 1, 'u-re3', 0],
  ]
  for (const [responsavel, aluno, escola, valor, parcelas, cobradorId, dias] of pais) {
    const pacote = valor === 89.9 ? 'E-book Digital' : valor === 189.9 ? 'E-book + Álbum Impresso' : 'Pacote Completo (E-book + Álbum + Quadro)'
    const venda = inserir(s, 'vendas_ebooks', { responsavel, aluno, escola, telefone: '(44) 98888-0000', pacote, valor, parcelas, cobradorId, data: addDias(hojeISO, dias) })
    APOS_CRIAR.vendas_ebooks(s, venda, ctx)
  }
  s.lancamentos = s.lancamentos.filter((l) => l.origem !== 'automatico')
  // Paga a maior parte dos títulos vencidos, deixa alguns em atraso (inadimplência)
  const titulos = col(s, 'titulos')
  titulos.forEach((t, i) => {
    if (String(t.vencimento) < hojeISO && i % 4 !== 1) baixarTitulo(s, t.id, ctx, String(t.vencimento))
  })
  s.lancamentos = s.lancamentos.filter((l) => l.origem !== 'automatico')
  const atrasado = titulos.find((t) => t.status === 'Aberto' && String(t.vencimento) < hojeISO)
  if (atrasado) negociarTitulo(s, atrasado.id, 3, ctx)

  // ---- Financeiro ----
  ;[
    ['Impressão de álbuns — lote agosto', 'Gráfica Print Max', 'Produção', 3850, -3],
    ['Combustível frota', 'Auto Posto Estrada', 'Operacional', 1240.5, 2],
    ['Materiais de escritório', 'Papelaria Central', 'Administrativo', 380, 5],
    ['Manutenção Carro 01', 'Oficina do Zé', 'Operacional', 890, 9],
  ].forEach(([descricao, fornecedor, categoria, valor, dias]) =>
    inserir(s, 'contas_pagar', { descricao, fornecedor, categoria, valor, vencimento: addDias(hojeISO, Number(dias)), status: 'A pagar', dataPagamento: '' }),
  )
  const grande = inserir(s, 'contas_pagar', { descricao: 'Equipamento fotográfico (2 câmeras)', fornecedor: 'Foto Import', categoria: 'Investimento', valor: 12800, vencimento: addDias(hojeISO, 12), status: 'A pagar', dataPagamento: '' })
  APOS_CRIAR.contas_pagar(s, grande, ctx)
  const pago = col(s, 'contas_pagar').find((c) => c.descricao === 'Impressão de álbuns — lote agosto')
  if (pago) pagarConta(s, 'contas_pagar', pago.id, ctx, addDias(hojeISO, -3))
  s.lancamentos = s.lancamentos.filter((l) => l.origem !== 'automatico')

  // ---- Operacional: processo real de campo ----
  const ctxOp: Contexto = { autorId: 'u-op1', autorNome: 'Flávia Alves Roquini', autorSetor: 'operacional', silencioso: true }
  const vendedoresPJ = (
    [
      ['Ahmed Husni Ali Choucair', '(44) 99911-2233', 'Umuarama', 'Ativo', 60, -2],
      ['Rodrigo Pereira', '(44) 99822-4455', 'Cianorte', 'Ativo', 55, -10],
      ['Luciana Farias', '(45) 99733-6677', 'Toledo', 'Em negociação', 50, -4],
      ['Carlos Mendes', '(43) 99644-8899', 'Londrina', 'Inativo', 50, -40],
    ] as const
  ).map(([nome, telefone, cidade, status, valorPorFicha, contato]) =>
    inserir(s, 'pj_vendedores', {
      nome,
      telefone,
      cidade,
      uf: 'PR',
      status,
      valorPorFicha,
      pixNome: nome,
      pixChave: telefone.replace(/\D/g, ''),
      pixBanco: 'Nubank',
      ultimoContato: addDias(hojeISO, contato),
      observacao: '',
    }),
  )
  const [ahmed, rodrigo] = vendedoresPJ
  inserir(s, 'historico_contatos', { pessoaId: ahmed.id, data: addDias(hojeISO, -2), assunto: 'Confirmou 2 escolas novas em Pérola para a próxima semana.', autor: 'Flávia Alves Roquini' })
  inserir(s, 'historico_contatos', { pessoaId: ahmed.id, data: addDias(hojeISO, -9), assunto: 'Alinhada a rota do Noroeste do PR.', autor: 'Flávia Alves Roquini' })
  inserir(s, 'historico_contatos', { pessoaId: rodrigo.id, data: addDias(hojeISO, -10), assunto: 'Aguardando retorno de 3 diretoras em Toledo.', autor: 'Flávia Alves Roquini' })

  const freelancers = (
    [
      ['Fotógrafo', 'Thiago Martins', 'Umuarama', 'Profissional', 200, 'Ativo'],
      ['Fotógrafo', 'Lucas Andrade', 'Cianorte', 'Iniciante', 150, 'Ativo'],
      ['Motorista', 'José Carlos Lima', 'Umuarama', '', 200, 'Ativo'],
      ['Motorista', 'Márcio Souza', 'Maringá', '', 200, 'Inativo'],
      ['Fotógrafo', 'Ana Paula Souza', 'Presidente Prudente', 'Profissional', 200, 'Ativo'],
      ['Fotógrafo', 'Bruno Lima', 'Presidente Prudente', 'Iniciante', 150, 'Ativo'],
      ['Fotógrafo', 'Carla Dias', 'Assis', 'Profissional', 190, 'Ativo'],
      ['Motorista', 'Paulo Ribeiro', 'Presidente Prudente', '', 200, 'Ativo'],
      ['Fotógrafo', 'Diego Matos', 'Naviraí', 'Profissional', 200, 'Ativo'],
      ['Motorista', 'Renato Alves', 'Naviraí', '', 200, 'Ativo'],
    ] as const
  ).map(([tipo, nome, cidade, nivel, diaria, status], i) =>
    inserir(s, 'freelancers', { tipo, nome, cidade, uf: i >= 8 ? 'MS' : i >= 4 ? 'SP' : 'PR', telefone: `(44) 9950${i}-11${i}${i}`, status, nivel, diaria, pixNome: nome, pixChave: `${nome.split(' ')[0].toLowerCase()}@pix.com`, pixBanco: 'Banco do Brasil' }),
  )
  const [thiago, lucas, jose, , ana, bruno, carla, paulo, diego, renato] = freelancers

  // Veículos da operação
  const [doblo, master, spin] = (
    [
      ['Fiat Doblò', 'BCA2E45', 2021, 'Branco', 7, 'Disponível'],
      ['Renault Master', 'QWE7H12', 2022, 'Prata', 12, 'Disponível'],
      ['Chevrolet Spin', 'PRT3J88', 2019, 'Cinza', 7, 'Disponível'],
      ['Fiat Strada', 'MNB4K21', 2018, 'Vermelho', 2, 'Em manutenção'],
    ] as const
  ).map(([modelo, placa, ano, cor, lugares, status]) =>
    // gasto fixo por dia de viagem (tudo incluso), vigente desde 4 meses atrás
    inserir(s, 'veiculos', { modelo, placa, ano, cor, lugares, status, observacao: '', gastoFixoMes: JSON.stringify({ [isoData(new Date(agora.getFullYear(), agora.getMonth() - 4, 1)).slice(0, 7)]: 2500 }) }),
  )
  // Equipes de viagem: cada uma roda um estado (podem estar no mesmo dia em lugares diferentes)
  const EQUIPES: Record<string, Record<string, string>> = {
    PR: { equipe: 'Equipe 1', veiculoId: doblo.id, carro: 'Fiat Doblò • BCA2E45', fotografoIds: `${thiago.id},${lucas.id}`, motoristaId: jose.id },
    SP: { equipe: 'Equipe 2', veiculoId: master.id, carro: 'Renault Master • QWE7H12', fotografoIds: `${ana.id},${bruno.id},${carla.id}`, motoristaId: paulo.id },
    MS: { equipe: 'Equipe 3', veiculoId: spin.id, carro: 'Chevrolet Spin • PRT3J88', fotografoIds: diego.id, motoristaId: renato.id },
  }

  // Contratos: [escola, cidade, endereço, telefone, diretora, vendedor, fichas, dias até a visita, bonificação, PIX?]
  const contratosEscola: [string, string, string, string, string, string, number, number, number, boolean, string?][] = [
    ['PROJETO ESPAÇO CRIANÇA', 'Altônia', 'Rua Ouro Alto, 605 — Jardim Panorama', '(44) 99997-7391', 'Jasmin (Diretora)', ahmed.id, 140, -8, 10, true],
    ['ESCOLA MUNICIPAL SOL NASCENTE', 'Pérola', 'Av. Brasil, 1200 — Centro', '(44) 3636-1122', 'Marcos (Diretor)', ahmed.id, 120, -5, 8, true],
    ['CMEI PEQUENO PRÍNCIPE', 'Xambrê', 'Rua das Flores, 88', '(44) 3637-3344', 'Aline (Coord.)', rodrigo.id, 90, -3, 9, true],
    ['COLÉGIO DOM ATHAMAZIO MERKLE', 'Pérola', 'Rua Paraná, 455', '(44) 3636-9988', 'Irmã Lúcia', ahmed.id, 260, -1, 10, true],
    ['SANTA TEREZINHA C M E I', 'São José B. Vista', 'Rua São José, 30', '(46) 3232-4455', 'Rosângela (Diretora)', rodrigo.id, 95, 1, 8, true],
    ['MARIA MAYSRE M PESSUTI EF', 'Catanduvas', 'Av. Central, 900', '(45) 3234-7788', 'Cláudia (Coord.)', ahmed.id, 210, 4, 10, false],
    ['ESCOLA ESTADUAL VILA RICA', 'Umuarama', 'Rua Vila Rica, 12', '(44) 3622-1010', 'Helena (Diretora)', rodrigo.id, 180, 9, 9, true],
    ['EMEF MONTEIRO LOBATO', 'Presidente Prudente', 'Rua Tenente Nicolau Maffei, 410', '(18) 3221-4400', 'Sandra (Diretora)', ahmed.id, 230, 1, 9, true, 'SP'],
    ['ESCOLA MUNICIPAL PANTANAL', 'Naviraí', 'Av. Weimar Gonçalves Torres, 800', '(67) 3461-2200', 'Regina (Coord.)', rodrigo.id, 110, 1, 8, true, 'MS'],
    ['COLÉGIO NOVO HORIZONTE', 'Assis', 'Rua Floriano Peixoto, 95', '(18) 3322-7788', 'Paulo (Diretor)', ahmed.id, 160, 4, 10, false, 'SP'],
  ]
  for (const [escola, cidade, endereco, telefone, responsavel, vendedorId, fichas, dias, bonif, pix, uf = 'PR'] of contratosEscola) {
    const c = inserir(s, 'contratos_escola', {
      escola,
      inep: '',
      cidade,
      uf,
      endereco,
      telefone,
      responsavel,
      vendedorId,
      fichasPrevistas: fichas,
      dataPrevista: addDias(hojeISO, dias),
      bonificacaoPorFicha: bonif,
      pixNome: pix ? `APM ${escola}` : '',
      pixChave: pix ? `${fichas}${dias < 0 ? 1 : 2}.apm@escola.pr.gov.br` : '',
      pixBanco: pix ? 'Banco do Brasil' : '',
      arquivo: `contrato-${escola.toLowerCase().replace(/\W+/g, '-')}.pdf`,
      observacao: '',
      status: 'Em conferência',
    })
    confirmarContratoEscola(s, c.id, ctxOp)
  }
  // Ainda em conferência (um completo aguardando a diretora, um faltando dados)
  inserir(s, 'contratos_escola', { escola: 'CENTRO EDUCACIONAL ARCO-ÍRIS', inep: '41000110', cidade: 'Toledo', uf: 'PR', endereco: 'Rua Arco-Íris, 77', telefone: '(45) 3252-6600', responsavel: 'Márcia (Diretora)', vendedorId: rodrigo.id, fichasPrevistas: 150, dataPrevista: addDias(hojeISO, 12), bonificacaoPorFicha: 9, pixNome: '', pixChave: '', pixBanco: '', arquivo: 'contrato-arco-iris.jpg', observacao: '', status: 'Em conferência' })
  inserir(s, 'contratos_escola', { escola: 'ESCOLA RURAL BOA VISTA', inep: '', cidade: 'Iporã', uf: 'PR', endereco: '', telefone: '', responsavel: '', vendedorId: ahmed.id, fichasPrevistas: 60, dataPrevista: '', bonificacaoPorFicha: 0, pixNome: '', pixChave: '', pixBanco: '', arquivo: 'contrato-boa-vista.jpg', observacao: 'Contrato com rasura na data.', status: 'Em conferência' })

  // Equipes, fichas autorizadas (histórico) e visitas já realizadas
  const visitas = col(s, 'agenda_visitas')
  const porEscola = (nome: string) => visitas.find((v) => v.escola === nome)!
  for (const [escola, confirmadas, fotografadas] of [
    ['PROJETO ESPAÇO CRIANÇA', 35, 39],
    ['ESCOLA MUNICIPAL SOL NASCENTE', 70, 74],
    ['CMEI PEQUENO PRÍNCIPE', 48, 52],
    ['COLÉGIO DOM ATHAMAZIO MERKLE', 150, 0],
    ['MARIA MAYSRE M PESSUTI EF', 90, 0],
    ['ESCOLA ESTADUAL VILA RICA', 0, 0],
  ] as [string, number, number][]) {
    const v = porEscola(escola)
    Object.assign(v, EQUIPES[String(v.uf)] ?? EQUIPES.PR)
    if (confirmadas > 0) {
      registrarHistoricoVisita(s, v.id, { tipo: 'Atualização de fichas', fichas: Math.round(confirmadas * 0.6), descricao: `Diretora informou ${Math.round(confirmadas * 0.6)} fichas retornadas até o momento.` }, ctxOp)
      registrarHistoricoVisita(s, v.id, { tipo: 'Atualização de fichas', fichas: confirmadas, descricao: `Coordenação confirmou ${confirmadas} fichas autorizadas pelos pais.` }, ctxOp)
    }
    if (fotografadas > 0) encerrarVisita(s, v.id, fotografadas, ctxOp)
  }
  // demais visitas agendadas recebem a equipe do estado; Vila Rica fica sem equipe (aparece em "Montar equipe")
  for (const v of visitas) if (!v.equipe && v.status === 'Agendada') Object.assign(v, EQUIPES[String(v.uf)] ?? EQUIPES.PR)
  Object.assign(porEscola('ESCOLA ESTADUAL VILA RICA'), { equipe: '', veiculoId: '', carro: '', fotografoIds: '', motoristaId: '' })
  registrarHistoricoVisita(s, porEscola('SANTA TEREZINHA C M E I').id, { tipo: 'Contato', descricao: 'Deixado recado com a secretaria; retornar amanhã cedo.' }, ctxOp)

  // Histórico de viagens: as fichas já lançadas da coordenação viram visitas realizadas, com carro e vendedor
  // (o painel do dinheiro de Operações calcula gasto fixo, vendedor e escola a partir delas)
  const escolasHist = ['EMEI RAIO DE SOL', 'ESCOLA MUNICIPAL SÃO JOSÉ', 'CMEI CRIANÇA FELIZ', 'COLÉGIO SANTA RITA', 'ESCOLA ESTADUAL RUI BARBOSA', 'CMEI GIRASSOL', 'ESCOLA MUNICIPAL TIRADENTES']
  const carrosHist: Record<string, string>[] = [
    { ...EQUIPES.PR, uf: 'PR', cidade: 'Umuarama' },
    { ...EQUIPES.SP, uf: 'SP', cidade: 'Presidente Prudente' },
    { ...EQUIPES.MS, uf: 'MS', cidade: 'Naviraí' },
  ]
  const diasHist = new Map<string, number>()
  for (const l of s.lancamentos) {
    if (l.setor !== 'operacional' || l.indicador !== 'fichas' || l.colaboradorId !== 'u-op1' || l.origem !== 'manual' || l.data > hojeISO) continue
    diasHist.set(l.data, (diasHist.get(l.data) ?? 0) + l.quantidade)
  }
  let k = 0
  for (const [dia, fichas] of [...diasHist.entries()].sort()) {
    // 1 a 3 carros no dia, dividindo as fichas
    const qtdCarros = fichas > 70 ? 3 : fichas > 35 ? 2 : 1
    let resto = fichas
    for (let c = 0; c < qtdCarros; c++) {
      const parte = c === qtdCarros - 1 ? resto : Math.round(fichas / qtdCarros)
      resto -= parte
      const eq = carrosHist[(k + c) % carrosHist.length]
      inserir(s, 'agenda_visitas', {
        contratoId: '', escola: escolasHist[k % escolasHist.length], cidade: eq.cidade, uf: eq.uf, endereco: '', telefone: '', responsavel: '',
        vendedorId: k % 3 === 2 ? rodrigo.id : ahmed.id, data: dia, fichasPrevistas: parte + 10, fichasConfirmadas: parte, fichasFotografadas: parte,
        equipe: eq.equipe, carro: eq.carro, veiculoId: eq.veiculoId, fotografoIds: eq.fotografoIds, motoristaId: eq.motoristaId, status: 'Fechamento enviado',
      })
      k++
    }
  }

  // ---- PRODUÇÃO (setor 'edicao'): editores (não usam o sistema) e as escolas em cada etapa ----
  const editores = ['Estúdio Luz', 'Carol Dias', 'Pedro Alves', 'Arte & Foto', 'Bia Montagens', 'Rafa Edições'].map((nome, i) =>
    inserir(s, 'editores', { nome, telefone: `(44) 9981${i}-22${i}${i}`, observacao: '', status: 'Ativo' }),
  )
  const recentes = col(s, 'agenda_visitas')
    .filter((v) => v.status === 'Fechamento enviado')
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))
    .slice(0, 14)
  // da mais nova para a mais antiga: quanto mais antiga a foto, mais adiante está na produção
  const etapasDemo = ['Aguardando fotos', 'Em edição', 'Em edição', 'Em edição', 'Análise de qualidade', 'Pronto para conferência Beatriz', 'Conferência final', 'Aguardando revelação', 'Aguardando revelação', 'Revelando', 'Na caixa', 'Na caixa', 'Na caixa', 'Na caixa']
  recentes.forEach((v, i) => {
    const l = criarLoteProducao(s, v, ctxOp, 'Chegou das Operações')
    if (!l) return
    const etapa = etapasDemo[i]
    const ordem = ['Aguardando fotos', 'Em edição', 'Análise de qualidade', 'Pronto para conferência Beatriz', 'Conferência final', 'Aguardando revelação', 'Revelando', 'Na caixa'].indexOf(etapa)
    const d0 = String(v.data)
    const ate = (n: number) => (addDias(d0, n) > hoje() ? hoje() : addDias(d0, n)) // nenhuma data depois de hoje
    const passou = (n: number) => ordem >= n
    const quem = i % 2 ? 'u-ed2' : 'u-ed1'
    Object.assign(l, {
      etapa,
      fotosRecebidasEm: passou(1) || i === 0 ? ate(1) : '',
      editorId: passou(1) ? editores[i % editores.length].id : '',
      enviadoEditorEm: passou(1) ? ate(2) : '',
      devolvidoEditorEm: passou(2) ? ate(8) : '',
      voltas: i === 5 || i === 11 ? 1 : 0,
      reprovados: i === 5 ? 4 : i === 11 ? 2 : 0,
      aprovadoQualidadeEm: passou(3) ? ate(9) : '',
      aprovadoQualidadePor: passou(3) ? quem : '',
      enviadoConferenciaEm: passou(4) ? ate(9) : '',
      driveConferencia: passou(4) ? 'Google Drive' : '',
      confirmadoEm: passou(5) ? ate(10) : '',
      confirmadoPor: passou(5) ? 'u-adm' : '',
      revelandoEm: passou(6) ? ate(12) : '',
      naCaixaEm: passou(7) ? ate(15) : '',
      posteres: i === 7 ? 2 : 0,
      albuns: Number(l.alunos) - (i === 7 ? 2 : 0),
      // prazo do editor e drives (a 1ª escola com o editor fica atrasada, para mostrar o aviso)
      entregaPrevista: !passou(1) ? '' : etapa === 'Em edição' ? (i === 1 ? addDias(hoje(), -2) : addDias(hoje(), i + 2)) : ate(7),
      driveEnvio: passou(1) ? (i % 2 ? 'Google Drive' : 'OneDrive') : '',
      driveDevolucao: passou(2) ? 'Google Drive' : '',
      atrasoAvisado: '',
    })
    if (etapa === 'Em edição' && i === 1) l.enviadoEditorEm = addDias(hoje(), -6)
    // histórico com as datas de verdade (a Visão TV calcula a variação do dia por ele):
    // entrou no dia da foto e chegou na etapa atual no dia da última data preenchida
    const meioDia = (dia: string) => new Date(`${dia}T12:00:00`).toISOString()
    for (const h of col(s, 'producao_historico').filter((x) => x.loteId === l.id)) h.data = meioDia(d0)
    const diaEtapa = [l.fotosRecebidasEm || d0, l.enviadoEditorEm, l.devolvidoEditorEm, l.aprovadoQualidadeEm, l.enviadoConferenciaEm, l.confirmadoEm, l.revelandoEm, l.naCaixaEm][ordem]
    if (ordem > 0) inserir(s, 'producao_historico', { loteId: l.id, data: meioDia(String(diaEtapa || d0)), etapa, acao: etapa, quantidade: null, descricao: `Chegou em "${etapa}".`, autor: 'Sistema' })
    // conferência final feita: os álbuns entraram na meta de quem aprovou a qualidade (1 vez por escola)
    if (passou(5)) {
      lancar(s, ctx, { setor: 'edicao', indicador: 'albuns_entregues', colaboradorId: quem, quantidade: Number(l.albuns), descricao: `Álbuns entregues: ${l.escola}`, data: String(l.confirmadoEm) })
      l.albunsContados = Number(l.albuns)
    }
    // estoque (demo): caixas soltas pela Revelação — na caixa = 2 caixas (uma ainda para conferir); revelando = 1 caixa
    if (etapa === 'Revelando' || etapa === 'Na caixa') {
      corDaCidadeDemo(s, l.cidade, l.uf)
      const total = Number(l.albuns)
      const partes = etapa === 'Revelando' ? [Math.ceil(total / 2)] : [Math.ceil(total * 0.6), total - Math.ceil(total * 0.6)]
      partes.forEach((albuns, k) => {
        const conferida = etapa === 'Na caixa' && !(i === 10 && k === 1)
        inserir(s, 'producao_caixas', {
          loteId: l.id,
          numero: k + 1,
          data: ate(13 + k),
          albuns,
          posteres: 0,
          observacao: '',
          registradoPor: 'u-pr1',
          lancamentoId: '',
          status: conferida ? 'Em estoque' : 'Aguardando conferência',
          conferidoAlbuns: conferida ? albuns : null,
          conferidoPosteres: conferida ? 0 : null,
          conferenciaObs: '',
          conferidoPor: conferida ? quem : '',
          conferidoEm: conferida ? ate(14 + k) : '',
        })
      })
    }
    // fichas (demo): alguns alunos cadastrados em uma escola
    if (i === 10)
      ['Ana Clara Souza', 'Bernardo Lima', 'Cecília Rocha', 'Davi Martins', 'Elisa Ferreira', 'Felipe Costa'].forEach((nome, k) =>
        inserir(s, 'producao_fichas', { loteId: l.id, codigo: String(1001 + k), nome, qtdFotos: 2 + (k % 3) }),
      )
  })

  // Fechamento diário: um já enviado ao financeiro, um em rascunho (o terceiro fica pendente)
  const montarFechamento = (escola: string, ajudantes: { nome: string; valor: number; pixChave: string; pixBanco: string }[]) => {
    const v = porEscola(escola)
    const c = col(s, 'contratos_escola').find((x) => x.id === v.contratoId)!
    const calc = calcularFechamentoEscola({
      escola,
      data: String(v.data),
      fichasBonificadas: Number(v.fichasFotografadas),
      valorUnitario: Number(c.bonificacaoPorFicha),
      pixNome: String(c.pixNome),
      pixChave: String(c.pixChave),
      pixBanco: String(c.pixBanco),
      ajudantes,
    })
    return inserir(s, 'fechamentos', {
      tipo: 'escola',
      refId: v.id,
      periodo: String(v.data),
      referencia: escola,
      data: v.data,
      quantidade: v.fichasFotografadas,
      valorUnitario: c.bonificacaoPorFicha,
      subtotal: calc.totalEscola,
      ajudantes: JSON.stringify(ajudantes),
      beneficiarios: JSON.stringify(calc.beneficiarios),
      total: calc.total,
      pixNome: c.pixNome,
      pixChave: c.pixChave,
      pixBanco: c.pixBanco,
      observacao: '',
      status: 'Rascunho',
      enviadoEm: '',
    })
  }
  const f1 = montarFechamento('PROJETO ESPAÇO CRIANÇA', [{ nome: 'Débora Silva (ajudante)', valor: 80, pixChave: '44999887766', pixBanco: 'Caixa' }])
  enviarFechamento(s, f1.id, ctxOp)
  montarFechamento('ESCOLA MUNICIPAL SOL NASCENTE', [])

  // Produção e tarefas vêm do processo real (contratos de escola do Operacional)
  s.colecoes.ordens_producao = col(s, 'ordens_producao').filter((o) => col(s, 'contratos_escola').some((c) => c.id === o.contratoId))
  s.colecoes.tarefas_operacionais = col(s, 'tarefas_operacionais').filter((t) => !t.contratoId)
  col(s, 'ordens_producao').forEach((o) => {
    o.responsavelId = o.etapa === 'Tratamento' ? 'u-pr1' : ''
  })

  // Rotas dos vendedores
  const rotaAhmed = inserir(s, 'rotas', { vendedorId: ahmed.id, uf: 'PR', nome: 'Rota Noroeste', status: 'Ativa' })
  ;[
    ['Xambrê', -12, 'Sim', 'NÃO', 0, 'Direção não aceitou', 'Já tinham feito fotos.'],
    ['Pérola', -12, 'Sim', 'SIM', 2, '', 'Diretora fechou para as turmas da manhã.'],
    ['Altônia', -11, 'Sim', 'SIM', 1, '', ''],
    ['Ibiporã', -11, 'Sim', 'NÃO', 0, 'Já havia fechado fotos no mês', ''],
    ['Cianorte', 2, 'Não', '', 0, '', ''],
    ['Umuarama', 3, 'Não', '', 0, '', ''],
  ].forEach(([cidade, dias, visitada, fechou, contratos, motivo, observacao], i) =>
    inserir(s, 'rota_cidades', { rotaId: rotaAhmed.id, cidade, ordem: i + 1, dataVisita: addDias(hojeISO, Number(dias)), visitada, fechou, contratos, motivo, observacao }),
  )
  const rotaRodrigo = inserir(s, 'rotas', { vendedorId: rodrigo.id, uf: 'PR', nome: 'Rota Oeste', status: 'Ativa' })
  ;[
    ['Toledo', -6, 'Sim', 'SIM', 1, '', 'Retornar para mais 2 escolas.'],
    ['Cascavel', -5, 'Sim', 'NÃO', 0, 'Diretora de férias', ''],
    ['Marechal Cândido Rondon', 5, 'Não', '', 0, '', ''],
  ].forEach(([cidade, dias, visitada, fechou, contratos, motivo, observacao], i) =>
    inserir(s, 'rota_cidades', { rotaId: rotaRodrigo.id, cidade, ordem: i + 1, dataVisita: addDias(hojeISO, Number(dias)), visitada, fechou, contratos, motivo, observacao }),
  )

  // ---- App dos vendedores externos: tipos, logins, vendas de books, documentos, devoluções e GPS ----
  col(s, 'pj_vendedores').forEach((v) => (v.tipo = 'Contrato'))
  Object.assign(ahmed, { usuarioId: 'u-ext1', email: 'contrato@dlgphotos.com', gpsAceiteEm: criado })
  const rafaela = inserir(s, 'pj_vendedores', {
    nome: 'Rafaela Moura', telefone: '(44) 99877-1020', cidade: 'Umuarama', uf: 'PR', status: 'Ativo', valorPorFicha: 0, tipo: 'Books',
    usuarioId: 'u-ext2', email: 'books@dlgphotos.com', gpsAceiteEm: criado, pixNome: 'Rafaela Moura', pixChave: '44998771020', pixBanco: 'Nubank', ultimoContato: hojeISO, observacao: '',
  })
  inserir(s, 'pj_vendedores', {
    nome: 'Sérgio Almeida', telefone: '(18) 99654-3321', cidade: 'Presidente Prudente', uf: 'SP', status: 'Ativo', valorPorFicha: 0, tipo: 'Books',
    usuarioId: '', email: '', gpsAceiteEm: '', pixNome: 'Sérgio Almeida', pixChave: '18996543321', pixBanco: 'Caixa', ultimoContato: addDias(hojeISO, -3), observacao: '',
  })
  const ctxExt: Contexto = { autorId: 'u-ext2', autorNome: 'Rafaela Moura', autorSetor: 'externo', silencioso: true }
  ;(
    [
      ['PROJETO ESPAÇO CRIANÇA', 'Luiza Martins', 'Carla Martins', 'PIX', 1, 180, -2],
      ['PROJETO ESPAÇO CRIANÇA', 'Pedro Henrique', 'José Carlos Souza', 'Boleto', 3, 240, -2],
      ['ESCOLA MUNICIPAL SOL NASCENTE', 'Ana Beatriz', 'Mariana Lopes', 'Cartão de crédito', 4, 260, -1],
      ['ESCOLA MUNICIPAL SOL NASCENTE', 'Miguel Santos', 'Fernanda Santos', 'Dinheiro', 1, 150, 0],
      ['ESCOLA MUNICIPAL SOL NASCENTE', 'Helena Costa', 'Ricardo Costa', 'Boleto', 2, 200, 0],
    ] as [string, string, string, string, number, number, number][]
  ).forEach(([escola, aluno, responsavel, forma, parcelas, valor, dias], i) => {
    const v = inserir(s, 'vendas_ebooks', {
      responsavel, aluno: '', numeroFicha: String(1040 + i), escola, telefone: '(44) 99900-0000', whatsapp: '(44) 99900-0000', pacote: 'Book', valor, parcelas, cobradorId: '', data: addDias(hojeISO, dias),
      canal: 'Externo', vendedorExternoId: rafaela.id, formaPagamento: forma, cpf: '', email: '', endereco: '', quantidade: 1, qtdMaletas: 1, qtdFotos: 10, qtdMolduras: 1,
      primeiroVencimento: forma === 'Boleto' ? addDias(hojeISO, dias + 30) : '', observacao: `Criança: ${aluno}`, anexos: '{}', referencias: '[]',
    })
    APOS_CRIAR.vendas_ebooks(s, v, ctxExt)
    // as 3 primeiras já foram conferidas pelo Financeiro; as outras aguardam a conferência
    if (i < 3) conferirVendaBook(s, v.id, 'conferir', '', { ...ctx, autorId: 'u-fi1', autorNome: 'Eduardo Nunes', autorSetor: 'financeiro' })
  })
  inserir(s, 'devolucoes_books', { vendedorId: rafaela.id, escola: 'PROJETO ESPAÇO CRIANÇA', quantidade: 12, data: addDias(hojeISO, -1), observacao: 'Pais não estavam em casa em 5 endereços.', status: 'Devolvido' })
  inserir(s, 'documentos_externos', { vendedorId: rafaela.id, tipo: 'Comprovante', escola: 'ESCOLA MUNICIPAL SOL NASCENTE', descricao: 'Comprovante PIX da venda da Ana Beatriz', paginas: '[]', status: 'Recebido' })
  // GPS: rotas de exemplo de hoje e de ontem (enquanto o app esteve aberto)
  const rota = (vendedorId: string, dia: number, pontos: [number, number, string?][], horaInicio: number) =>
    pontos.forEach(([lat, lng, acao], k) => {
      const t = new Date()
      t.setDate(t.getDate() + dia)
      t.setHours(horaInicio, 0, 0, 0)
      t.setMinutes(k * 17)
      if (t.getTime() > Date.now()) return
      ;(s.colecoes.localizacoes ??= []).push({ id: uid(), criadoEm: t.toISOString(), vendedorId, lat, lng, precisao: 12 + (k % 5) * 6, origem: acao ? 'acao' : k === 0 ? 'abertura' : 'periodico', descricao: acao ?? '' })
    })
  rota(ahmed.id, -1, [[-23.7657, -53.325], [-23.771, -53.39], [-23.776, -53.47], [-23.7355, -53.4883, 'Contrato enviado: CMEI Pequeno Príncipe'], [-23.76, -53.56], [-23.8039, -53.6836], [-23.81, -53.69, 'Contrato enviado: Col. Dom Athamazio']], 8)
  rota(ahmed.id, 0, [[-23.8039, -53.6836], [-23.83, -53.75], [-23.85, -53.82], [-23.8745, -53.9016, 'Contrato enviado'], [-23.9, -53.8], [-24.0033, -53.7058]], 7)
  rota(rafaela.id, 0, [[-23.7657, -53.325], [-23.78, -53.4], [-23.8, -53.5], [-23.82, -53.6], [-23.8039, -53.6836, 'Venda registrada: Helena Costa'], [-23.806, -53.688], [-23.809, -53.692, 'Venda registrada: Miguel Santos']], 8)

  // ---- Vendas Rebolo: pacotes (caixas de 10 álbuns) com fichas em várias situações ----
  const ctxRe = (id: string, nome: string): Contexto => ({ autorId: id, autorNome: nome, autorSetor: 'rebolo', silencioso: true })
  const cidadesMT: [string, string, string, string][] = [
    ['Diamantino', 'MT', '78400-000', '65'],
    ['Denise', 'MT', '78380-000', '65'],
    ['Cássia', 'MG', '37980-000', '35'],
    ['Umuarama', 'PR', '87501-000', '44'],
  ]
  const fichasDemo: [string, string, number, string][] = [
    // aluno, responsável, meses desde a visita, situação final
    ['Maria Gabrielly Souza', 'Adriana Souza', 1, 'Aguardando contato'],
    ['Isabela Rodrigues', 'Paulo Rodrigues', 1, 'Aguardando contato'],
    ['Henzo Correia', 'Juliana Correia', 2, 'Tentar de novo'],
    ['Celine Justeira', 'Marta Justeira', 2, 'Em negociação'],
    ['Emilly Maria da Silva', 'José da Silva', 14, 'Agendado'],
    ['Isabela Sophia Cecília', 'Roberta Cecília', 14, 'Descarte'],
    ['Alice Vitória Santos', 'Edinaldo Santos', 20, 'Venda a efetivar'],
    ['Theo Nascimento', 'Carla Nascimento', 20, 'Vendida'],
    ['Lorena Batista', 'Sandra Batista', 3, 'Aguardando contato'],
    ['Davi Lucas Pereira', 'Rosana Pereira', 3, 'Aguardando contato'],
  ]
  const mesesAtras = (n: number) => {
    const d = new Date()
    d.setMonth(d.getMonth() - n)
    return isoData(d)
  }
  const criarPacote = (vendedoraId: string, numero: number, tipo: 'Padrão' | 'Avulso') => inserir(s, 'rebolo_pacotes', { numero, tipo, vendedoraId, observacao: '' })
  const criarFicha = (pacoteId: string, vendedoraId: string, i: number, aluno: string, resp: string, meses: number, escola: string) => {
    const [cidade, uf, cep, ddd] = cidadesMT[i % cidadesMT.length]
    return inserir(s, 'rebolo_fichas', {
      pacoteId, vendedoraId, escola, dataVisita: mesesAtras(meses), numeroFicha: String(37530 + i + (vendedoraId === 'u-re1' ? 0 : 40)), aluno, serie: `${1 + (i % 5)}º ano`,
      dataNascimento: `201${6 + (i % 3)}-0${1 + (i % 9)}-1${i % 9}`, qtdFotos: 26, cep, rua: 'Rua das Flores', numero: String(10 + i * 7), apto: '', fazenda: '', proprietarioFazenda: '',
      bairro: 'Centro', cidade, uf, pontoReferencia: '', whatsapp1: `(${ddd}) 9${9900 + i}-${String(1000 + i * 37).slice(-4)}`, whatsapp2: '', whatsapp3: '', telefone: '',
      nomePai: '', nomeMae: resp, horario: i % 2 ? 'Tarde' : 'Manhã', observacao: '', situacao: 'Aguardando contato', tentativas: 0, motivoDescarte: '',
      agendadoPara: '', ultimoContato: '', vendaId: '', descontoValor: '', descontoStatus: '', descontoMotivo: '', rastreio: '', enviadoEm: '',
      custoPostagem: '', previsaoEntrega: '', situacaoEntrega: '', entregaEm: '', boletoEnviadoEm: '', taxaCartao: '',
    })
  }
  // P245: pacote anterior da Bianca, já finalizado (vendas enviadas e descartes)
  const p245 = criarPacote('u-re1', 245, 'Padrão')
  ;['Laura Mendes', 'Enzo Gabriel'].forEach((aluno, i) => {
    const f = criarFicha(p245.id, 'u-re1', 20 + i, aluno, `Responsável de ${aluno.split(' ')[0]}`, 13, 'PROJETO ESPAÇO CRIANÇA')
    f.situacao = i === 0 ? 'Vendida' : 'Descarte'
    f.motivoDescarte = i === 0 ? '' : 'Sem condição financeira'
    if (i === 0) Object.assign(f, { rastreio: 'AA123456789BR', enviadoEm: addDias(hojeISO, -2), custoPostagem: 101.2, previsaoEntrega: addDias(hojeISO, 3), situacaoEntrega: 'Pendente' })
  })
  // P246: pacote aberto da Bianca com as 10 fichas em várias etapas
  const p246 = criarPacote('u-re1', 246, 'Padrão')
  const cBianca = ctxRe('u-re1', 'Bianca Rocha')
  fichasDemo.forEach(([aluno, resp, meses, situacao], i) => {
    const f = criarFicha(p246.id, 'u-re1', i, aluno, resp, meses, i < 5 ? 'ESCOLA MUNICIPAL SOL NASCENTE' : 'CMEI PEQUENO PRÍNCIPE')
    if (situacao === 'Tentar de novo') registrarContatoRebolo(s, f.id, { resultado: 'Sem resposta', observacao: 'Chamou e não atendeu' }, cBianca)
    if (situacao === 'Em negociação') registrarContatoRebolo(s, f.id, { resultado: 'Em negociação', observacao: 'Mãe gostou do vídeo, vai falar com o marido' }, cBianca)
    if (situacao === 'Agendado') registrarContatoRebolo(s, f.id, { resultado: 'Agendado', observacao: 'Pediu para ligar depois do almoço', agendadoPara: `${hojeISO}T14:00` }, cBianca)
    if (situacao === 'Descarte') {
      registrarContatoRebolo(s, f.id, { resultado: 'Sem resposta', observacao: '' }, cBianca)
      registrarContatoRebolo(s, f.id, { resultado: 'Descarte', observacao: 'Não quis', motivo: 'Sem interesse' }, cBianca)
    }
    if (situacao === 'Venda a efetivar' || situacao === 'Vendida') {
      registrarContatoRebolo(s, f.id, { resultado: 'Em negociação', observacao: '' }, cBianca)
      const venda = inserir(s, 'vendas_ebooks', {
        canal: 'Rebolo', fichaReboloId: f.id, cobradorId: 'u-re1', responsavel: resp.toUpperCase(), aluno: '', modelo: aluno.toUpperCase(), numeroFicha: f.numeroFicha, escola: f.escola,
        telefone: f.whatsapp1, whatsapp: f.whatsapp1, cpf: '069.905.156-86', rg: '', endereco: `${f.rua}, ${f.numero}`, bairro: f.bairro, cep: f.cep, cidade: f.cidade, uf: f.uf,
        nomePai: '', nomeMae: resp, pacote: 'Completo (maleta de luxo)', quantidade: 1, qtdFotos: 26, valor: 800, entrada: 0, formaPagamento: 'Boleto', parcelas: 8,
        formaParcelamento: '8x R$ 100,00', primeiroVencimento: addDias(hojeISO, 20), data: addDias(hojeISO, -1), observacao: '', anexos: '{}', referencias: '[]',
      })
      APOS_CRIAR.vendas_ebooks(s, venda, cBianca)
      if (situacao === 'Vendida') {
        atualizarVendaRebolo(s, venda.id, 'enviar', { contrato: 'rebolo/u-re1/contrato-theo.pdf' }, cBianca)
        conferirVendaBook(s, venda.id, 'conferir', '', { ...ctx, autorId: 'u-fi1', autorNome: 'Eduardo Nunes', autorSetor: 'financeiro' })
      }
    }
  })
  // P247 da Tainá (3 fichas cadastradas) e P248 avulso da Yasmin
  const p247 = criarPacote('u-re2', 247, 'Padrão')
  ;['Gabriel Moura', 'Sophia Lima', 'Arthur Alves'].forEach((aluno, i) => criarFicha(p247.id, 'u-re2', 30 + i, aluno, `Responsável de ${aluno.split(' ')[0]}`, 4 + i * 8, 'COLÉGIO DOM ATHAMAZIO MERKLE'))
  const p248 = criarPacote('u-re3', 248, 'Avulso')
  criarFicha(p248.id, 'u-re3', 40, 'Valentina Rocha', 'Patrícia Rocha', 22, 'SANTA TEREZINHA C M E I')
  // custo mensal das vendedoras (salário do holerite que o Financeiro lança): o mês passado das três e este mês só da Bianca
  const mesPassado = (() => {
    const d = new Date(`${hojeISO}T12:00:00`)
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    return isoData(d).slice(0, 7)
  })()
  inserir(s, 'rebolo_custos_mes', { vendedoraId: 'u-re1', mes: mesPassado, salario: 1925, observacao: '' })
  inserir(s, 'rebolo_custos_mes', { vendedoraId: 'u-re2', mes: mesPassado, salario: 1925, observacao: '' })
  inserir(s, 'rebolo_custos_mes', { vendedoraId: 'u-re3', mes: mesPassado, salario: 1100, observacao: 'Mês incompleto (entrou no dia 12)' })
  inserir(s, 'rebolo_custos_mes', { vendedoraId: 'u-re1', mes: hojeISO.slice(0, 7), salario: 1925, observacao: '' })
  inserir(s, 'aprovacoes', {
    tipo: 'Desconto rebolo', setorOrigem: 'rebolo', descricao: 'Exemplo de pedido de desconto (demonstração)', valor: 0, refColecao: 'rebolo_fichas', refId: '',
    solicitante: 'Tainá Moreira', status: 'Rejeitado', decididoPor: 'Mariana Duarte', decididoEm: addDias(hojeISO, -5),
  })

  // Estoque e cargas (demo do SQL 029): uma carga já acertada (o que voltou foi em parte para o Rebolo) e uma em venda
  const ctxFin: Contexto = { autorId: 'u-fi1', autorNome: 'Eduardo Nunes', autorSetor: 'financeiro', silencioso: true }
  const livros = col(s, 'pj_vendedores').filter((v) => v.tipo === 'Books')
  const noEstoque = (loteId: string) => col(s, 'producao_caixas').filter((c) => c.loteId === loteId && c.status === 'Em estoque').map((c) => c.id)
  const lotesComCaixa = [...new Set(col(s, 'producao_caixas').filter((c) => c.status === 'Em estoque').map((c) => String(c.loteId)))]
  // datas da demonstração: a carga sai no dia em que a Produção conferiu a última caixa dela (nunca antes)
  const saidaDe = (ids: string[]) =>
    col(s, 'producao_caixas')
      .filter((c) => ids.includes(c.id))
      .map((c) => String(c.conferidoEm || hojeISO))
      .sort()
      .at(-1) ?? hojeISO
  const as = (dia: string, hora: number) => `${dia}T${String(hora).padStart(2, '0')}:00:00.000Z`
  if (livros.length >= 2 && lotesComCaixa.length >= 3) {
    const [la, lb, lc] = lotesComCaixa
    const ids1 = noEstoque(la)
    const c1 = criarCarga(s, livros[1].id, ids1, 'Oeste do Paraná', '', ctxFin)
    if ('id' in c1) {
      const carga = col(s, 'estoque_cargas').find((x) => x.id === c1.id)!
      const levados = col(s, 'estoque_carga_caixas')
        .filter((k) => k.cargaId === c1.id)
        .reduce((a, k) => a + (Number(k.albuns) || 0), 0)
      const vendidos = Math.round(levados * 0.7)
      const voltaram = Math.max(0, levados - vendidos - 1)
      acertarCarga(s, c1.id, [{ loteId: la, albunsVendidos: vendidos, albunsVoltaram: voltaram, posteresVendidos: 0, posteresVoltaram: 0, observacao: '1 álbum danificado na viagem' }], '', ctxFin)
      enviarRebolo(s, la, Math.min(voltaram, 10), 0, '', ctxFin)
      const saida = saidaDe(ids1)
      carga.dataSaida = saida
      for (const m of col(s, 'estoque_movimentos').filter((x) => x.loteId === la)) m.criadoEm = m.tipo === 'Saiu na carga' ? as(saida, 10) : as(hojeISO, m.tipo === 'Enviado ao Rebolo' ? 15 : 11)
    }
    const ids2 = [...noEstoque(lb), ...noEstoque(lc).slice(0, 1)]
    const c2 = criarCarga(s, livros[0].id, ids2, 'Noroeste do PR e interior de SP', '', ctxFin)
    if ('id' in c2) {
      const saida = saidaDe(ids2)
      col(s, 'estoque_cargas').find((x) => x.id === c2.id)!.dataSaida = saida
      for (const m of col(s, 'estoque_movimentos').filter((x) => x.cargaId === c2.id)) m.criadoEm = as(saida, 10)
    }
  }

  // escolas dos contratos entram no cadastro de escolas (como o SQL 027 faz no banco)
  for (const c of col(s, 'contratos_escola')) registrarEscolaDemo(s, c)
  for (const v of col(s, 'agenda_visitas')) if (!v.contratoId && v.status !== 'Cancelada') registrarEscolaDemo(s, v)

  s.auditoria = []
  // Atividade da equipe (demo do gerente virtual): cada pessoa registrou algo nos dias úteis anteriores.
  // A Tainá está há 2 dias úteis sem registrar (amarelo) e o Marcos há 4 (vermelho).
  const diasUteisAtras = (n: number) => {
    let d = hojeISO
    for (let k = 0; k < n; ) {
      d = addDias(d, -1)
      if (ehDiaUtil(d)) k++
    }
    return d
  }
  for (const [id, nome, , setor] of COLABORADORES) {
    if (id === 'u-adm' || setor === 'externo') continue
    const parou = id === 'u-re2' ? 3 : id === 'u-pr2' ? 5 : 0
    for (let k = parou; k < parou + 10; k++)
      s.auditoria.push({
        id: uid(),
        data: new Date(`${diasUteisAtras(k)}T${String(8 + (k % 9)).padStart(2, '0')}:00:00`).toISOString(),
        tipo: 'EDITAR',
        usuarioId: id,
        usuarioNome: nome,
        setor,
        descricao: 'Registro do dia (demonstração)',
        ip: 'local (mock)',
      })
  }
  s.auditoria.sort((x, y) => y.data.localeCompare(x.data))
  s.notificacoes = []
  s.notificacoes.push({
    id: 'n-boas-vindas',
    data: criado,
    setores: ['adm', 'gerencia', 'vendas', 'operacional', 'edicao', 'producao', 'rebolo', 'financeiro', 'cobranca'],
    tipo: 'info',
    titulo: 'Bem-vindo ao DLG Photos ERP',
    descricao: 'Ambiente de demonstração com dados fictícios. Todos os setores estão integrados ao painel do ADM.',
    link: '',
    lidaPor: [],
  })
  s.colecoes.clientes = clientesDemo(gerador(20261007)).map((c, i) => ({ ...c, id: `cli-${i + 1}`, criadoEm: criado }) as Registro)
  // Cobrança › Configurações (demo do SQL 039): as regras com os valores do manual + categorias e escritórios de EXEMPLO
  // (os reais entram pelo arquivo de importação, fora do Git)
  s.colecoes.cobranca_regras = REGRAS_COBRANCA.map((r, i) => ({ id: `rg-${i + 1}`, chave: r.chave, valor: r.padrao, atualizadoPor: '', criadoEm: criado }) as Registro)
  s.colecoes.cobranca_regras_historico = []
  s.colecoes.cobranca_escritorios = [
    { id: 'esc-1', nome: 'Cobranças Alfa (exemplo)', tipo: 'Terceirizada', contato: 'Atendimento', telefone: '(44) 3000-0000', email: 'contato@exemplo.com', observacao: '', ativo: true, criadoEm: criado },
    { id: 'esc-2', nome: 'Advocacia Exemplo', tipo: 'Advogado', contato: 'Escritório', telefone: '', email: '', observacao: 'Cobrança judicial', ativo: true, criadoEm: criado },
  ] as Registro[]
  const cat = (id: string, nome: string, grupo: string, inad: boolean, spc: boolean, antigos: string[], escritorioId = '') =>
    ({ id, nome, grupo, contaInadimplencia: inad, podeSpc: spc, escritorioId, nomesAntigos: JSON.stringify(antigos), ativa: true, observacao: '', criadoEm: criado }) as Registro
  s.colecoes.cobranca_categorias = [
    cat('cat-1', 'Receita de Recordação Escolar', 'Cobrança DLG', true, true, ['RECEITA DE RECORDAÇÃO ESCOLAR', 'RECEITA RECORDAÇÃO ESCOLAR']),
    cat('cat-3', 'Receita de Vendas Online (Rebolo)', 'Cobrança DLG', true, true, ['RECEITA DE VENDAS ONLINE (REBOLO)']),
    cat('cat-4', 'Registro SPC', 'Registro SPC', true, true, ['REGISTRO SPC', 'SPC']),
    cat('cat-5', 'Cobranças Alfa – Terceirizada (exemplo)', 'Terceirizada', false, false, ['COBRANÇAS ALFA - TERCEIRIZADA'], 'esc-1'),
    cat('cat-6', 'Advocacia Exemplo', 'Advogado', false, false, ['ADVOCACIA EXEMPLO'], 'esc-2'),
    cat('cat-7', 'Clientes enviados para fundo perdido', 'Fundo perdido', false, false, ['CLIENTES ENVIADOS PARA FUNDO PERDIDO']),
    cat('cat-8', 'Receita de empréstimos bancários', 'Fora da cobrança', false, false, ['RECEITA DE EMPRÉSTIMOS BANCÁRIOS']),
  ]
  return s
}
