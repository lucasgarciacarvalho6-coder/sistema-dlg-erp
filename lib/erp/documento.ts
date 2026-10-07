// CPF/CNPJ (mesma conta do banco: public.documento_valido) e texto de busca sem acento (public.texto_busca)

export const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

function cpfValido(d: string) {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  for (const t of [9, 10]) {
    let s = 0
    for (let i = 0; i < t; i++) s += Number(d[i]) * (t + 1 - i)
    const r = ((s * 10) % 11) % 10
    if (r !== Number(d[t])) return false
  }
  return true
}

function cnpjValido(d: string) {
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  for (const t of [12, 13]) {
    let s = 0
    for (let i = 0; i < t; i++) s += Number(d[i]) * pesos[i + 13 - t]
    const r = s % 11 < 2 ? 0 : 11 - (s % 11)
    if (r !== Number(d[t])) return false
  }
  return true
}

export const documentoValido = (v: unknown) => {
  const d = soDigitos(v)
  return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false
}

export function formatarDocumento(v: unknown) {
  const d = soDigitos(v).slice(0, 14)
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, '$1.$2.$3/$4-$5')
}

export const tipoDoDocumento = (v: unknown): 'CPF' | 'CNPJ' | '' => (soDigitos(v).length === 14 ? 'CNPJ' : soDigitos(v).length === 11 ? 'CPF' : '')

// texto sem acento e em minúsculas (o hífen vira espaço), igual ao public.texto_busca do banco
export const textoBusca = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/-/g, ' ')

// o que a pessoa digitou na pesquisa → pedaços procurados no campo "busca" (todos precisam aparecer).
// Pedaço só com números e pontuação (CPF, telefone) vira só os números.
export function termosBusca(termo: string): string[] {
  return termo
    .trim()
    .split(/\s+/)
    .flatMap((t) => {
      if (/\d/.test(t) && !/[a-zà-ÿ@]/i.test(t)) {
        const d = soDigitos(t)
        return d ? [d] : []
      }
      return textoBusca(t)
        .replace(/[%_*,()]/g, '')
        .split(/\s+/)
        .filter(Boolean)
    })
}
