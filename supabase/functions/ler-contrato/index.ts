// Edge Function (Deno) — leitura do contrato de escola com IA do Google (Gemini), na cota GRATUITA.
// Recebe as páginas do contrato como imagens JPEG (base64, já comprimidas no navegador) e devolve
// os campos do formulário + turmas, CNPJ da escola, data da assinatura e os campos a conferir.
//
// Segredos (Supabase → Edge Functions → Secrets):
//   GEMINI_API_KEY → chave grátis criada em aistudio.google.com (NUNCA vai para o navegador)
//   GEMINI_MODEL   → opcional; se não informado tenta gemini-2.5-flash e depois gemini-flash-latest
// Só quem pode CRIAR no Operacional consegue usar (confere com a função pode() do banco).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MAX_PAGINAS = 4
const MAX_BYTES_PAGINA = 4 * 1024 * 1024

const texto = (descricao: string) => ({ type: 'STRING', description: descricao })
const numero = (descricao: string) => ({ type: 'NUMBER', description: descricao })

// Formato da resposta (o Gemini devolve JSON exatamente neste formato)
const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    escola: texto('Nome da escola (linha "Escola:" ou carimbo), em MAIÚSCULAS'),
    inep: texto('Código INEP (8 dígitos), se aparecer'),
    cnpjEscola: texto('CNPJ da ESCOLA (geralmente no carimbo perto da assinatura). NÃO é o CNPJ da empresa de fotografia'),
    endereco: texto('Rua/avenida e número (linhas "Endereço:" e "Nº:"), ex.: "Rua Mato Grosso, 698"'),
    bairro: texto('Linha "Bairro:"'),
    cidade: texto('Só o nome da cidade da escola (linha "Cidade:")'),
    uf: texto('Sigla do estado com 2 letras (ex.: SP)'),
    responsavel: texto('Nome de quem representa a escola (linha "Representado por:" ou nome escrito no topo, ex.: "Profª Sandra Regina Pires"), sem o título Prof/Profª'),
    telefone: texto('Celular/telefone da escola ou da responsável (linha "Celular:"), formato (DD) NNNNN-NNNN'),
    telefone2: texto('Outro telefone, se houver'),
    email: texto('E-mail, se houver'),
    bonificacaoPorFicha: numero('Valor em reais da doação/bonificação por aluno ("doação de R$ ___ por aluno"). Só o número, ex.: 5'),
    turmas: {
      type: 'ARRAY',
      description: 'Linhas da tabela PERÍODO / SÉRIE / QUANTIDADE que estiverem preenchidas ou marcadas',
      items: {
        type: 'OBJECT',
        properties: {
          periodo: texto('Manhã, Tarde ou Noite (o que estiver marcado com X/✓)'),
          serie: texto('Série/turma escrita (ex.: "Semi-integral", "1º ao 5º ano")'),
          quantidade: numero('Quantidade de alunos daquela linha'),
        },
      },
    },
    fichasPrevistas: numero('Total de alunos (soma da coluna QUANTIDADE)'),
    dataPrevista: texto('Data em que as fotos serão realizadas ("As fotos serão realizadas na data ___"), formato AAAA-MM-DD. Ano com 2 dígitos: "26" = 2026'),
    vendedorNome: texto('Vendedor/representante da DLG. É a EMPRESA citada no 1º parágrafo ("acordo ... entre a empresa X") ou o "Representante Comercial" da assinatura. Responda EXATAMENTE um nome da lista de vendedores informada (ex.: empresa "A.H. ALI CHOUCAIR" → vendedor "Ahmed ... Choucair"), ou vazio'),
    empresaContratada: texto('Nome da empresa de fotografia citada no 1º parágrafo, como escrito'),
    localAssinatura: texto('Cidade escrita no campo "Cidade e Data" do rodapé'),
    dataAssinatura: texto('Data do campo "Cidade e Data" no formato AAAA-MM-DD'),
    pixNome: texto('Titular do PIX da escola, se houver'),
    pixChave: texto('Chave PIX da escola, se houver'),
    pixBanco: texto('Banco do PIX da escola, se houver'),
    outrasInformacoes: texto('Qualquer outra anotação escrita à mão que não coube nos campos acima (curta)'),
    duvidas: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Nomes dos campos acima (ex.: "telefone", "escola") com letra difícil, rasura ou incerteza',
    },
  },
  required: ['escola', 'duvidas'],
}

const INSTRUCAO = (vendedores: string[]) => `Você lê contratos da DLG Photos (fotografia escolar / formaturas). O modelo padrão é a folha
"PRESTAÇÃO DE SERVIÇOS — RECORDAÇÃO ESCOLAR (BOOK)": texto IMPRESSO com lacunas preenchidas À MÃO (caneta azul).
Onde fica cada dado no modelo:
- 1º parágrafo: "acordo ... entre a empresa <EMPRESA DO VENDEDOR>, inscrita no CNPJ ..., localizada em ... e a instituição escolar:".
- Linhas manuscritas: "Escola:", "Endereço:" + "Nº:", "Bairro:", "Cidade:", "Representado por:", "Celular:".
- "Será afixado gratuitamente ... e a doação de R$ ___ por aluno" → valor da bonificação por aluno.
- Tabela "PERÍODO / SÉRIE / QUANTIDADE" com caixas MANHÃ, TARDE, NOITE (marcadas com X ou ✓).
- "As fotos serão realizadas na data ___" → data das fotos.
- Rodapé: assinatura da escola (muitas vezes com CARIMBO com nome e CNPJ da escola), "Representante Comercial" e "Cidade e Data".
- Às vezes o nome da diretora vem escrito no topo da folha.
Leia com MUITA atenção a letra à mão: prefira o que está escrito a suposições, confira nomes de cidades brasileiras,
e liste em "duvidas" o que ficou incerto. Não invente: campo que não aparece fica vazio (ou 0).
Vendedores cadastrados na DLG: ${vendedores.length ? vendedores.join('; ') : '(nenhum)'}.`

async function chamarGemini(chave: string, modelo: string, partes: unknown[]) {
  return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': chave, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: partes }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: ESQUEMA },
    }),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405)

  const chave = Deno.env.get('GEMINI_API_KEY')
  if (!chave) return json({ erro: 'Leitor com IA não configurado (falta o segredo GEMINI_API_KEY).', codigo: 'nao_configurado' }, 503)

  const chamador = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await chamador.auth.getUser()
  if (!auth.user) return json({ erro: 'Sessão inválida' }, 401)
  const { data: pode } = await chamador.rpc('pode', { p_modulo: 'operacional', p_acao: 'criar' })
  if (pode !== true) return json({ erro: 'Sem permissão para importar contratos' }, 403)

  let body: { paginas?: string[]; vendedores?: string[] }
  try {
    body = await req.json()
  } catch {
    return json({ erro: 'Corpo inválido' }, 400)
  }
  const paginas = (body.paginas ?? []).slice(0, MAX_PAGINAS)
  if (!paginas.length) return json({ erro: 'Envie a imagem do contrato.' }, 400)
  if (paginas.some((p) => typeof p !== 'string' || p.length * 0.75 > MAX_BYTES_PAGINA)) return json({ erro: 'Imagem muito grande.' }, 400)

  const partes = [
    ...paginas.map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } })),
    { text: INSTRUCAO((body.vendedores ?? []).slice(0, 200)) },
  ]

  const modelos = [Deno.env.get('GEMINI_MODEL'), 'gemini-2.5-flash', 'gemini-flash-latest'].filter((m, i, a): m is string => !!m && a.indexOf(m) === i)
  let ultimoErro = ''
  for (const modelo of modelos) {
    const r = await chamarGemini(chave, modelo, partes)
    if (r.status === 404) {
      ultimoErro = `Modelo ${modelo} indisponível`
      continue // modelo descontinuado → tenta o próximo
    }
    if (!r.ok) {
      const detalhe = await r.text()
      console.error('Gemini', modelo, r.status, detalhe)
      if (r.status === 429) return json({ erro: 'Limite gratuito da IA atingido agora. Espere 1 minuto e clique em "Ler novamente".' }, 429)
      if (r.status === 400 && /api key|API_KEY/i.test(detalhe)) return json({ erro: 'Chave do Gemini inválida (GEMINI_API_KEY).' }, 502)
      if (r.status === 403) return json({ erro: 'A chave do Gemini não tem permissão (confira em aistudio.google.com).' }, 502)
      return json({ erro: 'A IA não conseguiu ler agora. Tente "Ler novamente".' }, 502)
    }
    const saida = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const bruto = saida.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    try {
      return json({ campos: JSON.parse(bruto), modelo })
    } catch {
      console.error('Resposta sem JSON', bruto.slice(0, 500))
      return json({ erro: 'A IA respondeu fora do formato. Tente "Ler novamente".' }, 502)
    }
  }
  return json({ erro: `${ultimoErro}. Defina o segredo GEMINI_MODEL com um modelo atual (ex.: gemini-2.5-flash).` }, 502)
})
