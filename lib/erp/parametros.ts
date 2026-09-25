// Parâmetros do negócio: padrão do config.ts + o que o ADM alterou em Configurações
import type { ErpState } from './types'
import { PARAMETROS } from './config'

export type ValoresParametros = {
  bonificacaoEscolaMin: number
  bonificacaoEscolaMax: number
  alimentacaoDiaria: number
  diariaFotografoMin: number
  diariaFotografoMax: number
  diariaMotorista: number
}

export function parametros(s: ErpState): ValoresParametros {
  const salvos = s.empresa.parametros ?? {}
  const v = Object.fromEntries(PARAMETROS.map((p) => [p.chave, Number.isFinite(salvos[p.chave]) ? Number(salvos[p.chave]) : p.padrao]))
  return v as ValoresParametros
}
