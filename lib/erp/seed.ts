// Dados de demonstração. Gerados uma única vez por navegador (localStorage).
// Configurações → "Restaurar dados de demonstração" recria tudo.

import type { Colaborador, ErpState, Setor } from './types'
import { SETORES } from './config'
import { addDias, hoje, isoData } from './format'
import { MATRIZ_PADRAO } from './permissions'
import { APOS_CRIAR, avancarOrdem, baixarTitulo, col, inserir, negociarTitulo, pagarConta, type Contexto } from './fluxos'

export const VERSAO_DADOS = 1
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
  ['u-pr1', 'Juliana Prado', 'producao@dlgphotos.com', 'producao', 'Editor(a) de imagens'],
  ['u-pr2', 'Marcos Vieira', 'marcos.producao@dlgphotos.com', 'producao', 'Diagramador(a)'],
  ['u-co1', 'Patrícia Gomes', 'cobranca@dlgphotos.com', 'cobranca', 'Cobrador(a)'],
  ['u-co2', 'Renata Alves', 'renata.cobranca@dlgphotos.com', 'cobranca', 'Atendente de vendas'],
  ['u-fi1', 'Eduardo Nunes', 'financeiro@dlgphotos.com', 'financeiro', 'Analista financeiro'],
]

// Contas de acesso rápido exibidas na tela de login
export const CONTAS_DEMO = [
  { setor: 'adm' as Setor, email: 'admin@dlgphotos.com' },
  { setor: 'gerencia' as Setor, email: 'gerente@dlgphotos.com' },
  { setor: 'vendas' as Setor, email: 'ana.vendas@dlgphotos.com' },
  { setor: 'operacional' as Setor, email: 'operacional@dlgphotos.com' },
  { setor: 'producao' as Setor, email: 'producao@dlgphotos.com' },
  { setor: 'financeiro' as Setor, email: 'financeiro@dlgphotos.com' },
  { setor: 'cobranca' as Setor, email: 'cobranca@dlgphotos.com' },
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
    metas: {},
    criadoEm: criado,
  }))

  const ctx: Contexto = { autorId: 'u-adm', autorNome: 'Sistema (seed)', autorSetor: 'adm', silencioso: true }

  // ---- Histórico de produção: do 1º dia do mês anterior até hoje ----
  const agora = new Date()
  const inicio = isoData(new Date(agora.getFullYear(), agora.getMonth() - 1, 1))
  for (let dia = inicio; dia <= hojeISO; dia = addDias(dia, 1)) {
    const [a, m, d] = dia.split('-').map(Number)
    if (new Date(a, m - 1, d).getDay() === 0) continue // domingo
    const fatorDia = dia === hojeISO ? 0.55 : 1
    for (const c of s.colaboradores) {
      for (const ind of SETORES[c.setor].indicadores) {
        const base = ind.metaPadrao.diaria * (0.45 + r() * 0.7) * fatorDia * (c.id === 'u-ven3' ? 1.2 : 1)
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
  // Coloca as ordens em etapas diferentes para a fila de produção ficar realista
  const ordens = col(s, 'ordens_producao')
  const avancos = [5, 3, 2, 1, 0]
  ordens.forEach((o, i) => {
    o.responsavelId = i % 2 === 0 ? 'u-pr1' : 'u-pr2'
    o.fotos = Number(o.alunos) * 3
    for (let k = 0; k < (avancos[ordens.length - 1 - i] ?? 0); k++) avancarOrdem(s, o.id, ctx)
  })
  s.lancamentos = s.lancamentos.filter((l) => l.origem !== 'automatico' || l.indicador !== 'ebooks_gerados')
  col(s, 'tarefas_operacionais').forEach((t, i) => {
    t.responsavelId = 'u-op1'
    t.status = i >= 2 ? 'Concluída' : i === 1 ? 'Em andamento' : 'Pendente'
  })
  inserir(s, 'tarefas_operacionais', { titulo: 'Revisão do Carro 01', escola: '—', cidade: '—', responsavelId: 'u-op2', prioridade: 'Média', prazo: addDias(hojeISO, 3), status: 'Pendente', contratoId: '' })

  // ---- Cobrança: vendas de e-books aos pais → títulos + comissões ----
  const pais: [string, string, string, number, number, string, number][] = [
    ['Fernanda Oliveira', 'Pedro', 'PROJETO ESPAÇO CRIANÇA', 189.9, 3, 'u-co1', -58],
    ['João Batista', 'Laura', 'PROJETO ESPAÇO CRIANÇA', 89.9, 1, 'u-co2', -40],
    ['Simone Ferreira', 'Miguel', 'MARIA MAYSRE M PESSUTI EF', 249.9, 3, 'u-co1', -35],
    ['Carlos Eduardo', 'Helena', 'MARIA MAYSRE M PESSUTI EF', 189.9, 2, 'u-co2', -20],
    ['Priscila Santos', 'Davi', 'SANTA TEREZINHA C M E I', 89.9, 1, 'u-co1', -12],
    ['Rodrigo Mendes', 'Alice', 'COLÉGIO DOM ATHAMAZIO MERKLE', 249.9, 3, 'u-co2', -6],
    ['Tatiane Lopes', 'Theo', 'COLÉGIO DOM ATHAMAZIO MERKLE', 189.9, 2, 'u-co1', -3],
    ['Marcelo Rocha', 'Sofia', 'PROJETO ESPAÇO CRIANÇA', 89.9, 1, 'u-co1', 0],
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
  col(s, 'comissoes').slice(-3).forEach((c) => pagarConta(s, 'comissoes', c.id, ctx, addDias(hojeISO, -2)))
  s.lancamentos = s.lancamentos.filter((l) => l.origem !== 'automatico')

  // ---- Produção: qualidade ----
  inserir(s, 'qualidade', { ordem: 'PROJETO ESPAÇO CRIANÇA', tipo: 'Retrabalho', descricao: 'Ajuste de cor em 12 fotos', quantidade: 12, responsavelId: 'u-pr1', data: addDias(hojeISO, -4) })
  inserir(s, 'qualidade', { ordem: 'MARIA MAYSRE M PESSUTI EF', tipo: 'Perda', descricao: 'Arquivos corrompidos no cartão 3', quantidade: 5, responsavelId: 'u-pr2', data: addDias(hojeISO, -2) })

  s.auditoria = []
  s.notificacoes = []
  s.notificacoes.push({
    id: 'n-boas-vindas',
    data: criado,
    setores: ['adm', 'gerencia', 'vendas', 'operacional', 'producao', 'financeiro', 'cobranca'],
    tipo: 'info',
    titulo: 'Bem-vindo ao DLG Photos ERP',
    descricao: 'Ambiente de demonstração com dados fictícios. Todos os setores estão integrados ao painel do ADM.',
    link: '',
    lidaPor: [],
  })
  return s
}
