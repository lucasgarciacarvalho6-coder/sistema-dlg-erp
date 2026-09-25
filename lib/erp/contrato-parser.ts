// Interpreta o TEXTO lido do contrato (OCR) e encontra os campos do formulário.
// Funciona por rótulos ("Escola:", "INEP", "Telefone", "Diretora", "Chave PIX"...) e,
// quando não há rótulo, por padrões (telefone, datas, "Rua ..."). Campos achados sem rótulo
// voltam em `duvidas` para a pessoa conferir. Sem dependências: roda no navegador e no Node.

export type CamposContrato = Partial<
  Record<
    | 'escola'
    | 'inep'
    | 'cidade'
    | 'uf'
    | 'endereco'
    | 'telefone'
    | 'responsavel'
    | 'vendedorNome'
    | 'fichasPrevistas'
    | 'dataPrevista'
    | 'bonificacaoPorFicha'
    | 'pixNome'
    | 'pixChave'
    | 'pixBanco',
    string
  >
>

export interface ResultadoInterpretacao {
  campos: CamposContrato
  duvidas: string[]
}

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// sem acento e minúsculo, mantendo o MESMO tamanho do texto original (para recortar valores)
const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (t: string) => sem(t).toLowerCase()

const limpar = (v: string) =>
  v
    .replace(/^[\s:;.,\-–—_=|>»*]+/, '')
    .replace(/[\s_.|]{2,}$/, '')
    .replace(/[\s:;,\-–—_|]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

// Rótulos que começam outro campo (para não pegar a linha seguinte errada nem "vazar" o valor)
const ROTULO_QUALQUER =
  /\b(escola|inep|cidade|municipio|uf|estado|endereco|bairro|telefone|fone|celular|whatsapp|diretora?|responsavel|alunos|fichas|data|bonificacao|doacao|pix|titular|favorecido|banco|vendedora?|representante|consultora?|cnpj|cpf|cep|e-?mail)\b\s*[:\-]/

interface Rotulo {
  re: RegExp
  // o valor pode ficar na linha de baixo quando a linha do rótulo não tem nada depois
  proximaLinha?: boolean
}

function porRotulo(linhas: string[], rotulos: Rotulo[]): string | null {
  for (const { re, proximaLinha = true } of rotulos) {
    for (let i = 0; i < linhas.length; i++) {
      const n = norm(linhas[i])
      const m = re.exec(n)
      if (!m) continue
      let valor = linhas[i].slice(m.index + m[0].length)
      // corta no próximo rótulo da mesma linha ("Cidade: X   UF: PR")
      const outro = ROTULO_QUALQUER.exec(norm(valor))
      if (outro && outro.index > 0) valor = valor.slice(0, outro.index)
      valor = limpar(valor)
      if (valor.length >= 2) return valor
      if (proximaLinha && linhas[i + 1] && !ROTULO_QUALQUER.test(norm(linhas[i + 1]))) {
        const prox = limpar(linhas[i + 1])
        if (prox.length >= 2) return prox
      }
    }
  }
  return null
}

const RE_TELEFONE = /\(?\b(\d{2})\)?\s*(9?\s?\d{4})\s*[-.\s]?\s*(\d{4})\b/

function formatarTelefone(t: string): string | null {
  const m = RE_TELEFONE.exec(t)
  if (!m) return null
  const meio = m[2].replace(/\s/g, '')
  return `(${m[1]}) ${meio}-${m[3]}`
}

function dataISO(t: string): string | null {
  const n = norm(t)
  let m = /\b(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})\b/.exec(n)
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3]
    const [d, me] = [Number(m[1]), Number(m[2])]
    if (d >= 1 && d <= 31 && me >= 1 && me <= 12) return `${ano}-${String(me).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  m = new RegExp(`\\b(\\d{1,2})\\s*de\\s*(${MESES.join('|')})\\s*(de\\s*)?(\\d{4})\\b`).exec(n)
  if (m) return `${m[4]}-${String(MESES.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

function numero(t: string): number | null {
  const m = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/.exec(t.replace(/R[$S]\s*/i, ''))
  if (!m) return null
  return Number(m[1].replace(/\./g, '') + (m[2] ? `.${m[2]}` : ''))
}

// "Umuarama - PR", "Umuarama/PR", "Umuarama (PR)"
function separarCidadeUF(v: string): { cidade: string; uf?: string } {
  const m = /^(.+?)\s*(?:[-/–(,]\s*)([A-Za-z]{2})\)?\s*$/.exec(v.trim())
  if (m && UFS.includes(m[2].toUpperCase())) return { cidade: limpar(m[1]), uf: m[2].toUpperCase() }
  return { cidade: v.trim() }
}

// Chave PIX: pega o formato reconhecível (e-mail, CNPJ, CPF, aleatória, telefone); senão o texto limpo
function extrairChavePix(v: string): string {
  const achado =
    /[\w.+-]+@[\w-]+\.[\w.]+/.exec(v) ??
    /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/.exec(v) ??
    /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.exec(v) ??
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.exec(v)
  if (achado) return achado[0]
  const tel = formatarTelefone(v)
  if (tel) return tel
  return limpar(v.replace(/^\s*\(?\s*(chave|cnpj|cpf|e-?mail|telefone|celular|aleatoria)\s*\)?\s*[:\-]?/i, ''))
}

const titulo = (t: string) =>
  t
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, e, l) => e + l.toUpperCase())
    .replace(/\s(De|Da|Do|Das|Dos|E)\s/g, (x) => x.toLowerCase())

export function interpretarContrato(texto: string, vendedores: string[] = []): ResultadoInterpretacao {
  const linhas = texto
    .normalize('NFC')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
  const campos: CamposContrato = {}
  const duvidas: string[] = []
  const todo = linhas.join('\n')

  // ---- Escola ----
  let escola = porRotulo(linhas, [
    { re: /\b(nome da escola|nome da instituicao|escola|instituicao de ensino|instituicao|unidade escolar|colegio|contratante)\b\s*[:\-]/ },
  ])
  if (!escola) {
    const l = linhas.find((x) => /^(escola|colegio|centro educacional|centro municipal|cmei|creche|instituto|e\.\s?m\.|emef|emei)\b/.test(norm(x)) && x.length <= 90)
    if (l) {
      escola = l
      duvidas.push('escola')
    }
  }
  if (escola) campos.escola = limpar(escola.replace(/,?\s*\b(cnpj|inep|inscrit\w*|com sede|situad\w*|localizad\w*|neste ato)\b.*$/i, '')).toUpperCase()

  // ---- INEP (8 dígitos) ----
  const linhaInep = linhas.findIndex((l) => /\binep\b/.test(norm(l)))
  if (linhaInep >= 0) {
    const m = /\b(\d{8})\b/.exec(`${linhas[linhaInep]} ${linhas[linhaInep + 1] ?? ''}`.replace(/(\d)[\s.](?=\d)/g, '$1'))
    if (m) campos.inep = m[1]
  }

  // ---- Cidade / UF ----
  const cidade = porRotulo(linhas, [{ re: /\b(cidade|municipio)\b\s*[:\-]?/ }])
  if (cidade) {
    const c = separarCidadeUF(cidade)
    campos.cidade = titulo(c.cidade)
    if (c.uf) campos.uf = c.uf
  }
  const uf = porRotulo(linhas, [{ re: /\b(uf|estado)\b\s*[:\-]/, proximaLinha: false }])
  if (uf) {
    const m = /\b([A-Za-z]{2})\b/.exec(uf)
    if (m && UFS.includes(m[1].toUpperCase())) campos.uf = m[1].toUpperCase()
  }
  if (!campos.cidade) {
    // linha de assinatura: "Umuarama - PR, 10 de março de 2026"
    const m = new RegExp(`(^|\\n)([A-ZÀ-Ú][A-Za-zÀ-ú' ]{2,40}?)\\s*[-/]\\s*(${UFS.join('|')})\\b`).exec(todo)
    if (m) {
      campos.cidade = titulo(m[2].trim())
      campos.uf = campos.uf ?? m[3]
      duvidas.push('cidade')
    }
  }

  // ---- Endereço (+ bairro) ----
  let endereco = porRotulo(linhas, [{ re: /\b(endereco|logradouro)\b\s*[:\-]?/ }])
  if (!endereco) {
    const l = linhas.find((x) => /^(rua|r\.|av\.?|avenida|travessa|rodovia|estrada|alameda|praca)\s/.test(norm(x)))
    if (l) {
      endereco = limpar(l)
      duvidas.push('endereco')
    }
  }
  const bairro = porRotulo(linhas, [{ re: /\bbairro\b\s*[:\-]/, proximaLinha: false }])
  if (endereco) campos.endereco = bairro && !norm(endereco).includes(norm(bairro)) ? `${endereco} - ${bairro}` : endereco

  // ---- Telefone ----
  const linhaTel = linhas.find((l) => /\b(telefone|tel|fone|celular|whats\s?app|contato)\b/.test(norm(l)) && RE_TELEFONE.test(l))
  let tel = linhaTel ? formatarTelefone(linhaTel.slice(norm(linhaTel).search(/\b(telefone|tel|fone|celular|whats\s?app|contato)\b/))) : null
  if (!tel) {
    tel = formatarTelefone(todo.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '')) // ignora CNPJ
    if (tel) duvidas.push('telefone')
  }
  if (tel) campos.telefone = tel

  // ---- Diretora / responsável ----
  const resp = porRotulo(linhas, [
    { re: /\b(diretor\(a\)|diretora|diretor|responsavel legal|responsavel pela escola|responsavel|coordenadora|coordenador|gestora|gestor)\b\s*[:\-]/ },
  ])
  if (resp) {
    const nome = limpar(resp.replace(/\b(cpf|rg|telefone|tel|fone)\b.*$/i, '').replace(/^(prof[aªº°]?|professora?|sra?|dona|dra?|diretora?)\.?\s+/i, ''))
    if (nome.length >= 3) campos.responsavel = titulo(nome)
  }

  // ---- Alunos / fichas previstas ----
  const alunos = porRotulo(linhas, [
    { re: /\b(n[o°º.]*\s*de alunos|numero de alunos|quantidade de alunos|qtd\.?\s*de alunos|qtde\.?\s*de alunos|total de alunos|alunos previstos|quantidade de fichas|fichas previstas|fichas)\b\s*[:\-]?/ },
    { re: /\balunos\b\s*[:\-]/ },
  ])
  const nAlunos = alunos ? numero(alunos) : null
  if (nAlunos && nAlunos > 0 && nAlunos <= 5000) campos.fichasPrevistas = String(Math.round(nAlunos))

  // ---- Data agendada das fotos ----
  const data = porRotulo(linhas, [
    { re: /\bdata\s*(da|das|de|do)?\s*(sessao|sessao fotografica|fotos?|fotografia|agendada|agendamento|prevista|visita|atendimento|realizacao)\b\s*[:\-]?/ },
    { re: /\b(agendad[ao] para|previst[ao] para)\b\s*[:\-]?/ },
  ])
  const iso = data ? dataISO(data) : null
  if (iso) campos.dataPrevista = iso

  // ---- Bonificação por aluno ----
  // o valor costuma vir na mesma frase ("bonificação de R$ 9,00 por aluno") ou na linha de baixo
  const reBon = /\b(bonificacao|doacao|repasse|contrapartida|valor por aluno|por aluno fotografado)\b/
  const iBon = linhas.findIndex((l) => reBon.test(norm(l)))
  let vBon: number | null = null
  if (iBon >= 0) {
    const trecho = `${linhas[iBon].slice(norm(linhas[iBon]).search(reBon))} ${linhas[iBon + 1] ?? ''}`
    const rs = /R[$S]\s*(\d{1,3}(?:,\d{1,2})?)/i.exec(trecho) // o OCR às vezes lê "R$" como "RS"
    vBon = rs ? Number(rs[1].replace(',', '.')) : numero(trecho)
  }
  if (vBon && vBon > 0 && vBon <= 100) campos.bonificacaoPorFicha = String(vBon)

  // ---- PIX ----
  const chave = porRotulo(linhas, [{ re: /\b(chave\s*pix|chave do pix|pix)\b\s*[:\-]?/ }])
  if (chave) campos.pixChave = extrairChavePix(chave)
  const titular = porRotulo(linhas, [{ re: /\b(titular|favorecido|beneficiario|nome do titular|em nome de)\b\s*[:\-]?/ }])
  if (titular) campos.pixNome = limpar(titular.replace(/\b(cnpj|cpf)\b.*$/i, '')).toUpperCase()
  const banco = porRotulo(linhas, [{ re: /\b(banco|instituicao financeira)\b\s*[:\-]/ }])
  if (banco) campos.pixBanco = titulo(limpar(banco.replace(/\b(agencia|ag\.?|conta|c\/c)\b.*$/i, '')))

  // ---- Vendedor (casado com a lista de vendedores cadastrados) ----
  const lista = vendedores.map((v) => ({ nome: v, n: norm(v).replace(/\s+/g, ' ').trim() }))
  const achar = (t: string) => {
    const nt = norm(t)
    return (
      lista.find((v) => nt.includes(v.n)) ??
      lista.find((v) => {
        const partes = v.n.split(' ').filter((p) => p.length > 2)
        return partes.length >= 2 && nt.includes(partes[0]) && nt.includes(partes[partes.length - 1])
      }) ??
      lista.find((v) => {
        const primeiro = v.n.split(' ')[0]
        return primeiro.length > 3 && new RegExp(`\\b${primeiro}\\b`).test(nt)
      })
    )
  }
  const vend = porRotulo(linhas, [{ re: /\b(vendedora|vendedor|representante comercial|representante|consultora|consultor|agente)\b\s*[:\-]?/ }])
  const v = (vend && achar(vend)) || null
  if (v) {
    campos.vendedorNome = v.nome
    if (vend && !norm(vend).includes(v.n.split(' ').filter((p) => p.length > 2).slice(-1)[0] ?? '')) duvidas.push('vendedorNome') // só o primeiro nome
  }
  else {
    const v2 = achar(todo)
    if (v2) {
      campos.vendedorNome = v2.nome
      duvidas.push('vendedorNome')
    }
  }

  return { campos, duvidas }
}
