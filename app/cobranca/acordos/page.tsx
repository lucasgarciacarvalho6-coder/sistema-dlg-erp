'use client'

import AcordosCobranca from '@/components/financeiro/AcordosCobranca'

// Cobrança › Acordos: os acordos fechados (SQL 047/048) e em que pé estão no Financeiro. Só o Financeiro age;
// a Cobrança consulta. (A tela antiga de "acordos para aprovação da Gerência" saiu: não existe aprovação na Cobrança.)
export default function AcordosPage() {
  return <AcordosCobranca modo="cobranca" />
}
