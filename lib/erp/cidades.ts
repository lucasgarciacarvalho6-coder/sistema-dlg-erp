// Municípios do Brasil para o cadastro das fichas do rebolo: digitou a cidade → UF e DDD.
// Lista do IBGE (5.571 cidades) com o DDD de cada uma (listas de DDD da Anatel via BrasilAPI + correções), montada em
// 06/10/2026. Fica em public/municipios.json ({ UF: [[nome, ddd]] }) e só é baixada quando alguém abre o cadastro.
// Nome que existe em mais de um estado (ex.: Bom Jesus) não define a UF sozinho: a vendedora escolhe.

import { UFS } from './rebolo'

export interface Cidade {
  nome: string
  uf: string
  ddd: string
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
    .replace(/[-'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

let carga: Promise<Cidades | null> | null = null
export function carregarCidades(): Promise<Cidades | null> {
  if (!carga)
    carga = fetch('/municipios.json')
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, [string, string][]>>) : Promise.reject(new Error('sem lista'))))
      .then((porUf) => {
        const lista: Cidade[] = []
        const porChave = new Map<string, Cidade[]>()
        for (const [uf, cidades] of Object.entries(porUf))
          for (const [nome, ddd] of cidades) {
            const c = { nome, uf, ddd, chave: chaveCidade(nome) }
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

// DDD da cidade (com a UF, quando o nome existe em mais de um estado)
export function dddDaCidade(c: Cidades | null, nome: string, uf: string): string {
  if (!c || !nome.trim()) return ''
  const mesmas = cidadesComNome(c, nome)
  const certa = mesmas.length === 1 ? mesmas[0] : mesmas.find((x) => x.uf === uf)
  return certa?.ddd ?? ''
}

// Sugestões enquanto digita (sem acento: "perdoes" acha Perdões). Aceita a UF no fim ("perdoes mg", "lavras/mg").
// Primeiro as que começam com o texto, depois as que contêm.
export function sugerirCidades(c: Cidades, texto: string, max = 8): Cidade[] {
  let t = chaveCidade(texto)
  let uf = ''
  const m = t.match(/^(.+?)[\s/,]+([a-z]{2})$/)
  if (m && UFS.includes(m[2].toUpperCase())) {
    t = m[1].trim()
    uf = m[2].toUpperCase()
  }
  if (t.length < 2) return []
  const daUf = (x: Cidade) => !uf || x.uf === uf
  const comeca = c.lista.filter((x) => daUf(x) && x.chave.startsWith(t))
  const contem = comeca.length >= max ? [] : c.lista.filter((x) => daUf(x) && !x.chave.startsWith(t) && x.chave.includes(t))
  return [...comeca, ...contem].slice(0, max)
}
