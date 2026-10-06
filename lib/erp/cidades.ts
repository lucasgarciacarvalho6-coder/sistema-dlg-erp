// Municípios do Brasil (IBGE, 5.571 cidades, baixado em 06/10/2026) para o cadastro das fichas do rebolo:
// digitou a cidade → descobre a UF. A lista fica em public/municipios.json ({ UF: [nomes] }) e só é baixada
// quando alguém abre o cadastro. Nome que existe em mais de um estado (ex.: Bom Jesus) não define a UF sozinho.

export interface Cidade {
  nome: string
  uf: string
  chave: string // nome sem acento e minúsculo
}
export interface Cidades {
  lista: Cidade[]
  porChave: Map<string, Cidade[]>
}

export const chaveCidade = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

let carga: Promise<Cidades | null> | null = null
export function carregarCidades(): Promise<Cidades | null> {
  if (!carga)
    carga = fetch('/municipios.json')
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, string[]>>) : Promise.reject(new Error('sem lista'))))
      .then((porUf) => {
        const lista: Cidade[] = []
        const porChave = new Map<string, Cidade[]>()
        for (const [uf, nomes] of Object.entries(porUf))
          for (const nome of nomes) {
            const c = { nome, uf, chave: chaveCidade(nome) }
            lista.push(c)
            porChave.set(c.chave, [...(porChave.get(c.chave) ?? []), c])
          }
        lista.sort((a, b) => a.chave.localeCompare(b.chave) || a.uf.localeCompare(b.uf))
        return { lista, porChave }
      })
      .catch(() => {
        carga = null // tenta de novo na próxima vez
        return null
      })
  return carga
}

// As cidades com esse nome (exato, sem acento): 1 = a UF é certa; várias = a vendedora escolhe
export const cidadesComNome = (c: Cidades, nome: string) => c.porChave.get(chaveCidade(nome)) ?? []

// Sugestões enquanto digita: primeiro as que começam com o texto, depois as que contêm
export function sugerirCidades(c: Cidades, texto: string, max = 12): Cidade[] {
  const t = chaveCidade(texto)
  if (t.length < 2) return []
  const comeca = c.lista.filter((x) => x.chave.startsWith(t))
  const contem = comeca.length >= max ? [] : c.lista.filter((x) => !x.chave.startsWith(t) && x.chave.includes(t))
  return [...comeca, ...contem].slice(0, max)
}
