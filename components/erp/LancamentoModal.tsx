'use client'

import { useState } from 'react'
import type { Setor } from '@/lib/erp/types'
import { SETORES } from '@/lib/erp/config'
import { registrarLancamento, useErp, useUsuario } from '@/lib/erp/store'
import { equipe } from '@/lib/erp/metrics'
import { hoje } from '@/lib/erp/format'
import { Modal, btnPrimario, btnSecundario, inputCls, labelCls } from './ui'

// Registro de produção. Ao salvar, o dado entra no núcleo e aparece na hora
// nos dashboards do setor, da Gerência e do ADM.
export default function LancamentoModal({ setor, aberto, onFechar }: { setor: Setor; aberto: boolean; onFechar: () => void }) {
  const s = useErp()
  const usuario = useUsuario()
  const indicadores = SETORES[setor].indicadores
  const time = equipe(s, setor)
  const padraoColab = usuario && usuario.setor === setor ? usuario.id : (time[0]?.id ?? '')

  const [indicadorId, setIndicadorId] = useState(indicadores[0]?.id ?? '')
  const [colaboradorId, setColaboradorId] = useState(padraoColab)
  const [quantidade, setQuantidade] = useState('')
  const [data, setData] = useState(hoje())
  const [descricao, setDescricao] = useState('')
  const [ok, setOk] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const ind = indicadores.find((i) => i.id === indicadorId)
  // Colaborador comum só lança a própria produção; supervisão/coordenação lança pela equipe
  const podeEscolherColab = !usuario || usuario.perfil !== 'COLABORADOR' || /supervis|rmc|coorden/i.test(usuario.funcao)

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = Number(quantidade.replace(',', '.'))
    if (!q || q <= 0) return
    setSalvando(true)
    const falha = await registrarLancamento({ setor, indicador: indicadorId, colaboradorId: podeEscolherColab ? colaboradorId : (usuario?.id ?? ''), quantidade: q, data, descricao })
    setSalvando(false)
    setErro(falha)
    if (falha) return
    setQuantidade('')
    setDescricao('')
    setOk(true)
    setTimeout(() => setOk(false), 2500)
  }

  return (
    <Modal
      aberto={aberto}
      titulo="Registrar produção"
      subtitulo={`${SETORES[setor].nome} • envia em tempo real ao painel do ADM`}
      onFechar={onFechar}
      largura="max-w-lg"
      rodape={
        <>
          <button onClick={onFechar} className={btnSecundario}>Fechar</button>
          <button form="form-lancamento" type="submit" disabled={salvando} className={btnPrimario}>{salvando ? 'Enviando...' : 'Registrar'}</button>
        </>
      }
    >
      <form id="form-lancamento" onSubmit={salvar} className="space-y-4">
        <div className="space-y-2">
          <label className={labelCls}>Indicador</label>
          <select value={indicadorId} onChange={(e) => setIndicadorId(e.target.value)} className={`${inputCls} appearance-none`}>
            {indicadores.map((i) => (
              <option key={i.id} value={i.id}>{i.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className={labelCls}>Colaborador</label>
          <select disabled={!podeEscolherColab} value={podeEscolherColab ? colaboradorId : usuario?.id} onChange={(e) => setColaboradorId(e.target.value)} className={`${inputCls} appearance-none disabled:opacity-60`}>
            {time.map((c) => (
              <option key={c.id} value={c.id}>{c.nome} — {c.funcao}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={labelCls}>{ind?.unidade === 'brl' ? 'Valor (R$)' : 'Quantidade'}</label>
            <input type="number" min="0" step={ind?.unidade === 'brl' ? '0.01' : '1'} required value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className={inputCls} placeholder="0" />
          </div>
          <div className="space-y-2">
            <label className={labelCls}>Data</label>
            <input type="date" required max={hoje()} value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="space-y-2">
          <label className={labelCls}>Descrição / Observação</label>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputCls} placeholder="Ex.: Escola Sol Nascente — turma manhã" />
        </div>
        {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
        {ok && (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Registrado e enviado ao ADM</p>
          </div>
        )}
      </form>
    </Modal>
  )
}
