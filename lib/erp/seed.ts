// Dados de demonstração. Gerados uma única vez por navegador (localStorage).
// Configurações → "Restaurar dados de demonstração" recria tudo.

import type { Colaborador, ErpState, Setor } from './types'
import { SETORES } from './config'
import { addDias, hoje, isoData } from './format'
import { MATRIZ_PADRAO } from './permissions'
import {
  APOS_CRIAR,
  avancarOrdem,
  baixarTitulo,
  col,
  confirmarContratoEscola,
  encerrarVisita,
  enviarFechamento,
  inserir,
  negociarTitulo,
  pagarConta,
  registrarHistoricoVisita,
  type Contexto,
} from './fluxos'
import { calcularFechamentoEscola } from './operacional'

export const VERSAO_DADOS = 2 // v2: processo operacional real (contratos de escola, agenda, fechamentos)
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
    ] as const
  ).map(([tipo, nome, cidade, nivel, diaria, status], i) =>
    inserir(s, 'freelancers', { tipo, nome, cidade, uf: 'PR', telefone: `(44) 9950${i}-11${i}${i}`, status, nivel, diaria, pixNome: nome, pixChave: `${nome.split(' ')[0].toLowerCase()}@pix.com`, pixBanco: 'Banco do Brasil' }),
  )
  const [thiago, lucas, jose] = freelancers

  // Contratos: [escola, cidade, endereço, telefone, diretora, vendedor, fichas, dias até a visita, bonificação, PIX?]
  const contratosEscola: [string, string, string, string, string, string, number, number, number, boolean][] = [
    ['PROJETO ESPAÇO CRIANÇA', 'Altônia', 'Rua Ouro Alto, 605 — Jardim Panorama', '(44) 99997-7391', 'Jasmin (Diretora)', ahmed.id, 140, -8, 10, true],
    ['ESCOLA MUNICIPAL SOL NASCENTE', 'Pérola', 'Av. Brasil, 1200 — Centro', '(44) 3636-1122', 'Marcos (Diretor)', ahmed.id, 120, -5, 8, true],
    ['CMEI PEQUENO PRÍNCIPE', 'Xambrê', 'Rua das Flores, 88', '(44) 3637-3344', 'Aline (Coord.)', rodrigo.id, 90, -3, 9, true],
    ['COLÉGIO DOM ATHAMAZIO MERKLE', 'Pérola', 'Rua Paraná, 455', '(44) 3636-9988', 'Irmã Lúcia', ahmed.id, 260, -1, 10, true],
    ['SANTA TEREZINHA C M E I', 'São José B. Vista', 'Rua São José, 30', '(46) 3232-4455', 'Rosângela (Diretora)', rodrigo.id, 95, 1, 8, true],
    ['MARIA MAYSRE M PESSUTI EF', 'Catanduvas', 'Av. Central, 900', '(45) 3234-7788', 'Cláudia (Coord.)', ahmed.id, 210, 4, 10, false],
    ['ESCOLA ESTADUAL VILA RICA', 'Umuarama', 'Rua Vila Rica, 12', '(44) 3622-1010', 'Helena (Diretora)', rodrigo.id, 180, 9, 9, true],
  ]
  for (const [escola, cidade, endereco, telefone, responsavel, vendedorId, fichas, dias, bonif, pix] of contratosEscola) {
    const c = inserir(s, 'contratos_escola', {
      escola,
      inep: '',
      cidade,
      uf: 'PR',
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
  const equipeCompleta = { equipe: 'E1', carro: 'Carro 01', fotografoIds: `${thiago.id},${lucas.id}`, motoristaId: jose.id }
  for (const [escola, confirmadas, fotografadas] of [
    ['PROJETO ESPAÇO CRIANÇA', 35, 39],
    ['ESCOLA MUNICIPAL SOL NASCENTE', 70, 74],
    ['CMEI PEQUENO PRÍNCIPE', 48, 52],
    ['COLÉGIO DOM ATHAMAZIO MERKLE', 150, 0],
    ['MARIA MAYSRE M PESSUTI EF', 90, 0],
    ['ESCOLA ESTADUAL VILA RICA', 0, 0],
  ] as [string, number, number][]) {
    const v = porEscola(escola)
    Object.assign(v, equipeCompleta)
    if (confirmadas > 0) {
      registrarHistoricoVisita(s, v.id, { tipo: 'Atualização de fichas', fichas: Math.round(confirmadas * 0.6), descricao: `Diretora informou ${Math.round(confirmadas * 0.6)} fichas retornadas até o momento.` }, ctxOp)
      registrarHistoricoVisita(s, v.id, { tipo: 'Atualização de fichas', fichas: confirmadas, descricao: `Coordenação confirmou ${confirmadas} fichas autorizadas pelos pais.` }, ctxOp)
    }
    if (fotografadas > 0) encerrarVisita(s, v.id, fotografadas, ctxOp)
  }
  registrarHistoricoVisita(s, porEscola('SANTA TEREZINHA C M E I').id, { tipo: 'Contato', descricao: 'Deixado recado com a secretaria; retornar amanhã cedo.' }, ctxOp)

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
  const ordemMaisAntiga = col(s, 'ordens_producao').find((o) => o.escola === 'PROJETO ESPAÇO CRIANÇA')
  if (ordemMaisAntiga) avancarOrdem(s, ordemMaisAntiga.id, ctxOp) // já em diagramação

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
