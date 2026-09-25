'use client'

import { useState } from 'react'

export default function ContratosPage() {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'scanning' | 'success'>('idle')

  const handleFileUpload = () => {
    setOcrStatus('scanning')
    setTimeout(() => {
      setOcrStatus('success')
    }, 3000)
  }

  const fecharModal = () => {
    setIsImportModalOpen(false)
    setOcrStatus('idle')
  }

  return (
    <div className="space-y-10 animate-fade-in-up">
      
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-4">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></span>
            <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">Módulo Operacional</span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">Contratos Fotográficos</h1>
          <p className="text-sm text-zinc-400 mt-2">Gestão, conferência via INEP e acompanhamento de escolas.</p>
        </div>

        <button 
          onClick={() => setIsImportModalOpen(true)}
          className="bg-white hover:bg-zinc-200 text-black px-8 py-3.5 rounded-2xl text-xs font-bold uppercase tracking-widest flex items-center gap-3 transition-all active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.15)]"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          Importar Contrato (IA)
        </button>
      </div>

      {/* KPI Stats - Cartões Glassmorphism de Luxo */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {[
          { label: 'Total Registos', value: '63', color: 'bg-white', text: 'text-white' },
          { label: 'Conferência', value: '05', color: 'bg-orange-500', text: 'text-orange-400' },
          { label: 'Aguardando', value: '00', color: 'bg-yellow-500', text: 'text-yellow-400' },
          { label: 'Agendamento', value: '22', color: 'bg-blue-500', text: 'text-blue-400' },
          { label: 'Finalizados', value: '16', color: 'bg-emerald-500', text: 'text-emerald-400' },
        ].map((stat, i) => (
          <div key={i} className="bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/[0.05] p-6 rounded-3xl relative overflow-hidden group hover:border-white/[0.1] transition-all duration-300 hover:-translate-y-1">
            <div className={`absolute top-0 left-0 w-full h-1 ${stat.color} opacity-30 group-hover:opacity-100 transition-opacity`}></div>
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/[0.02] rounded-full blur-2xl group-hover:bg-white/[0.04] transition-all"></div>
            
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500 mb-2 relative z-10">{stat.label}</p>
            <p className={`text-4xl font-black ${stat.text} relative z-10 tracking-tight`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabela de Contratos Premium */}
      <div className="bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/[0.05] rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/[0.05] flex justify-between items-center">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Base de Contratos</h2>
          <div className="relative group">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" placeholder="Filtrar..." className="bg-black/50 border border-white/[0.05] rounded-xl pl-12 pr-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 w-72 transition-all" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="text-[10px] uppercase tracking-[0.2em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
              <tr>
                <th className="px-8 py-5 font-bold">Localidade</th>
                <th className="px-8 py-5 font-bold">Instituição (Escola)</th>
                <th className="px-8 py-5 font-bold">Consultor</th>
                <th className="px-8 py-5 font-bold">INEP</th>
                <th className="px-8 py-5 font-bold text-right">Status Operacional</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.02]">
              <tr className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-8 py-5"><span className="text-zinc-500 text-xs font-mono font-medium">CATANDUVAS - PR</span></td>
                <td className="px-8 py-5 text-white font-bold tracking-wide">MARIA MAYSRE M PESSUTI EF</td>
                <td className="px-8 py-5 text-zinc-400">Ahmed Choucair</td>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="text-[10px] uppercase tracking-widest text-emerald-500/80 font-bold">Validado</span>
                  </div>
                </td>
                <td className="px-8 py-5 text-right">
                  <span className="inline-flex items-center gap-2 border border-orange-500/30 bg-orange-500/10 px-3.5 py-1.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                    <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Conferir Dados</span>
                  </span>
                </td>
              </tr>
              <tr className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-8 py-5"><span className="text-zinc-500 text-xs font-mono font-medium">SÃO JOSÉ B. VISTA - PR</span></td>
                <td className="px-8 py-5 text-white font-bold tracking-wide">SANTA TEREZINHA C M E I</td>
                <td className="px-8 py-5 text-zinc-400">Ahmed Choucair</td>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="text-[10px] uppercase tracking-widest text-emerald-500/80 font-bold">Validado</span>
                  </div>
                </td>
                <td className="px-8 py-5 text-right">
                  <span className="inline-flex items-center gap-2 border border-blue-500/30 bg-blue-500/10 px-3.5 py-1.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]"></span>
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Em Agendamento</span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Importação OCR */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-[#050505] border border-white/[0.05] rounded-[2rem] w-full max-w-2xl shadow-[0_0_80px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col relative">
            
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none"></div>

            <div className="px-8 py-8 border-b border-white/[0.05] flex justify-between items-start relative z-10 bg-white/[0.01]">
              <div>
                <h3 className="text-2xl font-black text-white tracking-tight">Leitura Inteligente</h3>
                <p className="text-xs text-zinc-500 uppercase tracking-widest mt-2 font-bold">Motor OCR • DLG Photos</p>
              </div>
              <button onClick={fecharModal} className="p-2.5 bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-white rounded-full transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-8 space-y-6 relative z-10">
              {ocrStatus === 'idle' && (
                <div onClick={handleFileUpload} className="border border-dashed border-white/[0.1] hover:border-blue-500/50 bg-white/[0.02] rounded-3xl p-14 text-center cursor-pointer transition-all group">
                  <div className="w-16 h-16 bg-white/[0.05] group-hover:bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4 transition-all">
                    <svg className="w-7 h-7 text-zinc-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  </div>
                  <p className="text-white font-bold text-base mb-1 uppercase tracking-widest">Anexar Contrato</p>
                  <p className="text-zinc-600 text-[10px] uppercase tracking-widest">PDF, JPG ou PNG (Máx 10MB)</p>
                </div>
              )}

              {ocrStatus === 'scanning' && (
                <div className="border border-white/[0.05] bg-white/[0.02] rounded-3xl p-14 text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 shadow-[0_0_20px_#3b82f6] animate-[scan_1.5s_ease-in-out_infinite]"></div>
                  <div className="w-12 h-12 mx-auto mb-6 relative">
                    <svg className="w-full h-full text-blue-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
                  </div>
                  <h4 className="text-sm font-bold text-white mb-2 uppercase tracking-widest">A analisar documento</h4>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-widest">Validando matriz INEP e Metadados</p>
                </div>
              )}

              {ocrStatus === 'success' && (
                <div className="space-y-6 animate-fade-in-up">
                  <div className="flex items-center gap-4 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Leitura Confirmada</h4>
                      <p className="text-xs text-emerald-500/60 mt-0.5">Precisão: 99.8%</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/[0.03] border border-white/[0.05] p-5 rounded-2xl">
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] mb-1">Instituição Detetada</p>
                      <p className="text-sm text-white font-bold">Colégio Dom Athamazio Merkle</p>
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.05] p-5 rounded-2xl">
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] mb-1">Código INEP</p>
                      <p className="text-sm text-blue-400 font-bold font-mono">41048810</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 border-t border-white/[0.05] bg-white/[0.01] flex justify-end gap-4 relative z-10">
              <button onClick={fecharModal} className="px-6 py-3.5 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">
                Cancelar
              </button>
              <button disabled={ocrStatus !== 'success'} className="px-8 py-3.5 text-xs font-bold uppercase tracking-widest text-black bg-white hover:bg-zinc-200 disabled:opacity-30 disabled:bg-white/[0.05] disabled:text-zinc-500 rounded-xl transition-all">
                Salvar Contrato
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}} />
    </div>
  )
}