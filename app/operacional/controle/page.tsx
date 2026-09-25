'use client'

import { useState } from 'react'

export default function ControleOperacionalPage() {
  // A aba padrão volta a ser o Dashboard do próprio setor
  const [activeTab, setActiveTab] = useState('dashboard')

  // Estrutura das Abas do Setor de Operações
  const tabs = [
    { id: 'dashboard', label: 'Dashboard Operacional' },
    { id: 'rota', label: 'Controle de Rota' },
    { id: 'vendedores', label: 'Vendedores de Contrato' },
    { id: 'fotografos', label: 'Fotógrafos' },
    { id: 'motoristas', label: 'Motoristas' },
    { id: 'veiculos', label: 'Controle de Veículos' },
    { id: 'almoxarifado', label: 'Almoxarifado' },
  ]

  // Dados do Dashboard Operacional
  const chartData = [39, 57, 65, 32, 89, 33, 31, 31, 23, 22, 50, 31, 35, 26, 34, 68]

  // Dados da Aba de Rotas
  const rotasData = [
    { cidade: 'Xambrê', data: '26/08/2026', fechamento: 'NÃO', motivo: 'Direção não aceitou', obs: 'Já tinham feito fotos.', contratos: 0, status: 'Visitada' },
    { cidade: 'Pérola', data: '26/08/2026', fechamento: 'SIM', motivo: '-', obs: 'Diretora fechou contrato para turmas da manhã.', contratos: 4, status: 'Visitada' },
    { cidade: 'Altônia', data: '26/08/2026', fechamento: 'NÃO', motivo: 'Direção não aceitou', obs: 'Fizeram fotos recentemente.', contratos: 1, status: 'Visitada' },
    { cidade: 'Ibiporã', data: '26/08/2026', fechamento: 'NÃO', motivo: 'Direção não aceitou', obs: 'Já havia fechado fotos no mês.', contratos: 0, status: 'Visitada' },
  ]

  return (
    <div className="space-y-8 animate-fade-in-up">
      
      {/* Cabeçalho do Setor Operacional */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></span>
            <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">Módulo / Operações</span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">Controle Operacional</h1>
          <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
            Gestão do setor: Dashboard de metas, rotas, equipas de campo e frota.
          </p>
        </div>
      </div>

      {/* Navegação por Abas do Setor */}
      <div className="flex overflow-x-auto custom-scrollbar pb-2 border-b border-white/[0.05] space-x-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
              activeTab === tab.id
                ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.5)]'
                : 'text-zinc-500 hover:text-white hover:bg-white/[0.02] border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* =========================================
          ABA 1: DASHBOARD OPERACIONAL (EXCLUSIVO DO SETOR)
          ========================================= */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Filtros de Mês */}
          <div className="flex gap-4">
            <select className="bg-black/50 border border-white/[0.05] text-white text-xs font-bold uppercase tracking-widest rounded-xl px-4 py-3 outline-none focus:border-blue-500/50 appearance-none shadow-lg">
              <option>Setembro / 2026</option>
              <option>Outubro / 2026</option>
            </select>
          </div>

          {/* KPIs Operacionais */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-[#050505]/80 backdrop-blur-xl border border-blue-500/30 p-6 rounded-3xl relative overflow-hidden group hover:-translate-y-1 transition-transform">
              <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 opacity-80 shadow-[0_0_15px_#3b82f6]"></div>
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-blue-500/20 blur-3xl rounded-full"></div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400 mb-2 relative z-10">Fichas Produzidas</p>
              <p className="text-5xl font-black text-white tracking-tighter relative z-10">666</p>
              <p className="text-[10px] text-zinc-400 mt-3 uppercase tracking-widest relative z-10">Total Realizado</p>
            </div>

            <div className="bg-[#050505]/80 backdrop-blur-xl border border-emerald-500/20 p-6 rounded-3xl relative overflow-hidden group hover:-translate-y-1 transition-transform">
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 opacity-50 shadow-[0_0_10px_#10b981]"></div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-400 mb-2 relative z-10">Meta Operacional</p>
              <p className="text-4xl font-black text-white tracking-tight mt-3">80.2%</p>
              <div className="w-full bg-white/[0.05] h-1.5 rounded-full mt-5 overflow-hidden relative z-10">
                <div className="bg-emerald-500 w-[80.2%] h-full rounded-full shadow-[0_0_10px_#10b981]"></div>
              </div>
            </div>

            <div className="bg-[#050505]/80 backdrop-blur-xl border border-white/[0.05] p-6 rounded-3xl relative overflow-hidden group hover:-translate-y-1 transition-transform">
              <div className="absolute top-0 left-0 w-full h-1 bg-zinc-600 opacity-30"></div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400 mb-2 relative z-10">Projeção Mês</p>
              <p className="text-4xl font-black text-white tracking-tight mt-3">823</p>
              <p className="text-[10px] text-zinc-500 mt-3 uppercase tracking-widest font-bold">Baseado no ritmo atual</p>
            </div>

            <div className="bg-[#050505]/80 backdrop-blur-xl border border-orange-500/20 p-6 rounded-3xl relative overflow-hidden group hover:-translate-y-1 transition-transform">
              <div className="absolute top-0 left-0 w-full h-1 bg-orange-500 opacity-50 shadow-[0_0_15px_#f97316]"></div>
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-orange-500/10 blur-3xl rounded-full"></div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-400 mb-2 relative z-10">Necessário / Dia</p>
              <p className="text-4xl font-black text-white tracking-tight mt-3">18</p>
              <p className="text-[10px] text-orange-500/60 mt-3 uppercase tracking-widest font-bold relative z-10">Faltam 164 fichas</p>
            </div>
          </div>

          {/* Gráfico do Setor */}
          <div className="bg-[#050505]/80 backdrop-blur-xl border border-white/[0.05] rounded-3xl p-8 relative shadow-2xl">
            <div className="flex justify-between items-end mb-8 border-b border-white/[0.05] pb-4">
              <div>
                <h3 className="text-xl font-black text-white tracking-wide">Desempenho Diário das Equipas</h3>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Evolução do mês em curso</p>
              </div>
              <div className="flex items-center gap-5 text-[10px] uppercase font-bold tracking-widest">
                <div className="flex items-center gap-2 text-zinc-400"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]"></span> Acima do Piso</div>
                <div className="flex items-center gap-2 text-zinc-400"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> Abaixo do Piso</div>
              </div>
            </div>

            <div className="h-72 w-full flex items-end gap-2 sm:gap-4 relative pt-10">
              <div className="absolute top-[40%] left-0 w-full border-t border-dashed border-white/[0.15] z-0">
                <span className="absolute -top-3 -left-2 text-[9px] text-zinc-400 font-bold tracking-widest bg-[#050505] px-2 rounded">PISO DIÁRIO: 35</span>
              </div>

              {chartData.map((val, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 z-10 group h-full justify-end">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-black text-[11px] font-bold px-3 py-1.5 rounded absolute -mt-10 pointer-events-none shadow-xl z-20">
                    {val} fichas
                  </div>
                  <div 
                    className={`w-full rounded-t-md relative transition-all duration-300 hover:brightness-125 ${val >= 35 ? 'bg-gradient-to-t from-blue-600/40 to-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.15)]' : 'bg-gradient-to-t from-orange-600/40 to-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.15)]'}`}
                    style={{ height: `${(val / 90) * 100}%` }}
                  >
                    <div className="absolute top-0 left-0 w-full h-1 bg-white/30 rounded-t-md"></div>
                  </div>
                  <span className="text-[10px] font-bold text-zinc-500 group-hover:text-white transition-colors">{idx + 1}</span>
                </div>
              ))}
              
              {[...Array(5)].map((_, idx) => (
                <div key={'empty-'+idx} className="flex-1 flex flex-col items-center gap-2 z-10 h-full justify-end opacity-40">
                  <div className="w-full h-2 bg-white/[0.05] rounded-t-md border-b border-white/[0.1]"></div>
                  <span className="text-[10px] font-bold text-zinc-600">{chartData.length + idx + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =========================================
          ABA 2: CONTROLE DE ROTA (FERRAMENTAS)
          ========================================= */}
      {activeTab === 'rota' && (
        <div className="space-y-6 animate-fade-in">
          
          <div className="bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/[0.05] rounded-3xl p-6 lg:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center border border-white/[0.1]">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-wide">Nova Rota Operacional</h3>
                <p className="text-[10px] text-zinc-400 uppercase tracking-widest mt-0.5">Orienta as cidades e a ordem de visitação do vendedor</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Estado / UF</label>
                <select className="w-full bg-black/50 border border-white/[0.05] rounded-xl px-4 py-3.5 text-sm text-white outline-none focus:border-blue-500/50 appearance-none">
                  <option>Paraná (PR)</option>
                  <option>Minas Gerais (MG)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Vendedor de Contrato</label>
                <select className="w-full bg-black/50 border border-white/[0.05] rounded-xl px-4 py-3.5 text-sm text-white outline-none focus:border-blue-500/50 appearance-none">
                  <option>Ahmed Husni Ali Choucair</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Adicionar Cidade</label>
                <div className="flex gap-2">
                  <input type="text" placeholder="Selecione a cidade..." className="w-full bg-black/50 border border-white/[0.05] rounded-xl px-4 py-3.5 text-sm text-white outline-none focus:border-blue-500/50" />
                  <button className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-3.5 rounded-xl transition-all shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-widest shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all active:scale-95">
                Salvar Nova Rota
              </button>
            </div>
          </div>

          <div className="bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/[0.05] rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/[0.05] flex justify-between items-center bg-white/[0.01]">
              <div>
                <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest">PARANÁ - PR</span>
                <h2 className="text-lg font-black text-white mt-1">Ahmed Husni Ali Choucair</h2>
              </div>
              <button className="text-zinc-500 hover:text-red-400 bg-white/[0.02] hover:bg-red-500/10 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 border border-transparent hover:border-red-500/20 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Arquivar Rota
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-zinc-300">
                <thead className="text-[10px] uppercase tracking-[0.15em] bg-white/[0.02] text-zinc-500 border-b border-white/[0.05]">
                  <tr>
                    <th className="px-6 py-4 font-bold">Cidade</th>
                    <th className="px-6 py-4 font-bold">Data Visita</th>
                    <th className="px-6 py-4 font-bold">Fechou?</th>
                    <th className="px-6 py-4 font-bold">Motivo (Se Não)</th>
                    <th className="px-6 py-4 font-bold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {rotasData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4">
                        <span className="text-white font-bold tracking-wide block">{row.cidade}</span>
                      </td>
                      <td className="px-6 py-4 text-zinc-400">
                        <span className="bg-black/50 border border-white/[0.05] rounded-lg px-3 py-1.5">{row.data}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-bold border ${row.fechamento === 'SIM' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                          {row.fechamento}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-zinc-500 text-xs">{row.motivo}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center gap-1.5 bg-white/[0.05] border border-white/[0.1] px-3 py-1 rounded text-xs font-medium text-zinc-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Outras Abas */}
      {activeTab !== 'dashboard' && activeTab !== 'rota' && (
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
          <div className="w-20 h-20 bg-white/[0.02] rounded-full flex items-center justify-center mb-6 border border-white/[0.05]">
            <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
          </div>
          <h2 className="text-xl font-bold text-white tracking-widest uppercase mb-2">Módulo de Trabalho</h2>
          <p className="text-sm text-zinc-500">Ferramentas de "{tabs.find((t) => t.id === activeTab)?.label}".</p>
        </div>
      )}
    </div>
  )
}