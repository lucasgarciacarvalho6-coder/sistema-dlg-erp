'use client'

import { useState } from 'react'

export default function AgendaFotograficaPage() {
  const [mesAtual] = useState('Setembro 2026')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [escolaSelecionada, setEscolaSelecionada] = useState<any>(null)

  // Dados de exemplo para as escolas na agenda
  const escolasAgendadas = [
    {
      id: 1,
      escola: 'PROJETO ESPAÇO CRIANÇA',
      cidade: 'Altônia',
      uf: 'PR',
      endereco: 'Rua Ouro Alto 605 — Jardim Panorama',
      telefone: '44 99997 7391',
      responsavel: 'Jasmin (Diretora/Coord.)',
      data: '01/09/2026',
      previstas: 140,
      confirmadas: 35,
      fotografadas: 39,
      equipe: 'E2 • Carro 01',
      vendedor: 'Ahmed Choucair',
      status: 'Fotografado',
      historico: [
        { data: '31/08/2026', tipo: 'ATUALIZAÇÃO DE FICHAS', mudanca: '25 → 35 fichas', desc: 'Coordenadora Jasmin confirmou 35 fichas retornadas.', autor: 'financeiro.dlg.fotografias+flavia' },
        { data: '27/08/2026', tipo: 'ATUALIZAÇÃO DE FICHAS', mudanca: '0 → 25 fichas', desc: 'Falei com Jasmin coordenadora que me informou ter retornado 25 fichas até o momento.', autor: 'financeiro.dlg.fotografias+flavia' },
        { data: '26/08/2026', tipo: 'ATUALIZAÇÃO DE FICHAS', mudanca: '0 → 0 fichas', desc: 'Diretora já entregou as fichas. Deu prazo de amanhã quinta-feira para retorno.', autor: 'financeiro.dlg.fotografias+flavia' },
      ]
    }
  ]

  const abrirDetalhes = (escola: any) => {
    setEscolaSelecionada(escola)
    setIsModalOpen(true)
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      
      {/* Cabeçalho da Página */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></span>
            <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">Módulo / Operações</span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">Agenda Fotográfica</h1>
          <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
            Acompanhamento de contratos transformados em agendamentos de campo e histórico de fichas.
          </p>
        </div>

        {/* Responsável da Subaba / RMC */}
        <div className="bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/[0.05] px-5 py-3 rounded-2xl flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-black text-xs">
            FR
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Responsável • RMC</p>
            <p className="text-xs font-bold text-white">Flávia Alves Roquini</p>
          </div>
        </div>
      </div>

      {/* Barra de Controlo do Calendário e Indicadores */}
      <div className="bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/[0.05] rounded-3xl p-6 flex flex-col lg:flex-row items-center justify-between gap-6 shadow-2xl">
        
        <div className="flex items-center gap-4 w-full lg:w-auto">
          <div className="flex items-center gap-2 bg-black/50 border border-white/[0.05] rounded-xl p-1.5">
            <button className="p-2 hover:bg-white/[0.05] rounded-lg text-zinc-400 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="px-4 text-sm font-black text-white tracking-wide">{mesAtual}</span>
            <button className="p-2 hover:bg-white/[0.05] rounded-lg text-zinc-400 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 w-full lg:w-auto">
          <div className="bg-white/[0.02] border border-white/[0.05] px-5 py-3 rounded-2xl text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Previstas</p>
            <p className="text-xl font-black text-white">240</p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 px-5 py-3 rounded-2xl text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-blue-400 mb-1">Confirmadas</p>
            <p className="text-xl font-black text-blue-400">98</p>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/20 px-5 py-3 rounded-2xl text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-orange-400 mb-1">Faltam Confirmar</p>
            <p className="text-xl font-black text-orange-400">142</p>
          </div>
        </div>

      </div>

      {/* Grade do Calendário Semanal */}
      <div className="bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/[0.05] rounded-3xl p-6 shadow-2xl">
        
        <div className="flex justify-between items-center mb-6 border-b border-white/[0.05] pb-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-widest">Semana 1 (31/08 - 06/09)</h3>
          <span className="text-xs text-zinc-500">Clique em qualquer escola para ver o histórico e detalhes</span>
        </div>

        <div className="grid grid-cols-7 gap-3 mb-4 text-center">
          {['SEG 31', 'TER 01', 'QUA 02', 'QUI 03', 'SEX 04', 'SÁB 05', 'DOM 06'].map((dia, idx) => (
            <div key={idx} className="bg-white/[0.02] border border-white/[0.05] py-2.5 rounded-xl text-[11px] font-black text-zinc-400 uppercase tracking-widest">
              {dia}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-3 items-start">
          
          {/* Segunda 31 */}
          <div className="space-y-3">
            <div onClick={() => abrirDetalhes(escolasAgendadas[0])} className="bg-blue-950/20 border border-blue-500/20 rounded-2xl p-3.5 space-y-2 cursor-pointer hover:border-blue-500 transition-all group">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">ALTÔNIA - PR</span>
                <span className="text-[9px] font-bold text-blue-400">E2</span>
              </div>
              <p className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">PROJETO ESPAÇO CRIANÇA</p>
              <div className="text-[10px] text-zinc-400 space-y-0.5 pt-1 border-t border-white/[0.05]">
                <p className="text-blue-400 font-medium">👤 Ahmed Choucair</p>
                <p className="text-zinc-500">🚗 Carro 01</p>
              </div>
              <div className="flex justify-between items-center pt-2 text-[10px] font-bold">
                <span className="text-zinc-400">Fichas: 39</span>
                <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">Fotografado</span>
              </div>
            </div>
          </div>

          {/* Dias vazios para simulação do calendário */}
          {[...Array(6)].map((_, idx) => (
            <div key={idx} className="h-32 border border-dashed border-white/[0.03] rounded-2xl flex items-center justify-center text-[10px] text-zinc-700 uppercase">
              Livre
            </div>
          ))}

        </div>
      </div>

      {/* ================================================================= */}
      {/* MODAL DETALHES DA VISITA FOTOGRÁFICA (BASEADO NA IMAGEN DO UTILIZADOR) */}
      {/* ================================================================= */}
      {isModalOpen && escolaSelecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-[#0c0f17] border border-white/[0.1] rounded-[2rem] w-full max-w-2xl shadow-[0_0_80px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header Modal */}
            <div className="px-8 py-6 border-b border-white/[0.05] flex justify-between items-center bg-black/40">
              <div>
                <h3 className="text-xl font-black text-white tracking-tight">Visita Fotográfica Encerrada</h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase rounded-full">1. Confirmação de Fichas</span>
                  <span className="text-zinc-600">→</span>
                  <span className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase rounded-full">2. Sessão Fotografada</span>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2.5 bg-white/[0.05] hover:bg-red-500/20 text-zinc-400 hover:text-white rounded-full transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
              
              {/* Dados da Escola */}
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-widest">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                  Dados da Escola
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase font-bold">Escola</p>
                  <p className="text-base font-black text-white">{escolaSelecionada.escola}</p>
                </div>
                <div className="grid grid-cols-3 gap-4 pt-2 border-t border-white/[0.05]">
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase font-bold">Endereço</p>
                    <p className="text-xs text-zinc-300">{escolaSelecionada.endereco}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase font-bold">Cidade / UF</p>
                    <p className="text-xs text-zinc-300">{escolaSelecionada.cidade} - {escolaSelecionada.uf}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase font-bold">Telefone</p>
                    <p className="text-xs text-blue-400 font-mono font-bold">{escolaSelecionada.telefone}</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/[0.05]">
                  <p className="text-[10px] text-zinc-500 uppercase font-bold">Responsável (Diretora/Coord.)</p>
                  <p className="text-xs text-white font-bold">{escolaSelecionada.responsavel}</p>
                </div>
              </div>

              {/* Resumo da Visita Encerrada */}
              <div className="grid grid-cols-5 gap-3 bg-black/40 border border-white/[0.05] p-4 rounded-2xl text-center">
                <div>
                  <p className="text-[9px] text-zinc-500 uppercase font-bold">Data</p>
                  <p className="text-xs font-bold text-white mt-1">{escolaSelecionada.data}</p>
                </div>
                <div>
                  <p className="text-[9px] text-zinc-500 uppercase font-bold">Previstas</p>
                  <p className="text-xs font-bold text-white mt-1">{escolaSelecionada.previstas}</p>
                </div>
                <div>
                  <p className="text-[9px] text-zinc-500 uppercase font-bold">Confirmadas</p>
                  <p className="text-xs font-bold text-emerald-400 mt-1">{escolaSelecionada.confirmadas}</p>
                </div>
                <div>
                  <p className="text-[9px] text-zinc-500 uppercase font-bold">Fotografadas</p>
                  <p className="text-xs font-bold text-blue-400 mt-1">{escolaSelecionada.fotografadas}</p>
                </div>
                <div>
                  <p className="text-[9px] text-zinc-500 uppercase font-bold">Equipe</p>
                  <p className="text-xs font-bold text-white mt-1">{escolaSelecionada.equipe}</p>
                </div>
              </div>

              {/* Histórico Completo de Contatos e Fichas */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Histórico Completo • Contatos e Fichas</h4>
                  <span className="text-[10px] bg-white/[0.05] text-zinc-400 px-2.5 py-1 rounded-full">{escolaSelecionada.historico.length} registos</span>
                </div>

                <div className="space-y-3">
                  {escolaSelecionada.historico.map((h: any, idx: number) => (
                    <div key={idx} className="bg-black/50 border border-white/[0.05] p-4 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase rounded">
                          {h.tipo}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">{h.data} • <strong className="text-white">{h.mudanca}</strong></span>
                      </div>
                      <p className="text-xs text-zinc-200">{h.desc}</p>
                      <p className="text-[9px] text-zinc-500 pt-1 border-t border-white/[0.03]">Registo por: {h.autor}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Footer Modal */}
            <div className="px-8 py-5 border-t border-white/[0.05] bg-black/40 flex justify-end">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 bg-white/[0.05] hover:bg-white/[0.1] text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all">
                Fechar Detalhes
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}