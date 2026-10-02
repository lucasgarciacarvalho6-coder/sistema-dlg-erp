'use client'

// ADM › Vendedores externos (PJ): cadastro dos dois tipos e o login do app de cada um.
//  • Vendedor de contrato: fecha parceria com as escolas (recebe R$ por aluno fotografado)
//  • Vendedor de books: vende os books aos pais
// O acesso criado aqui entra direto no app /app/vendedor (não vê o ERP).

import { useState } from 'react'
import type { Registro } from '@/lib/erp/types'
import CrudPage from '@/components/erp/CrudPage'
import { Modal, btnPrimario, btnSecundario, inputCls, labelCls } from '@/components/erp/ui'
import { criarAcessoVendedor, salvarColaborador, useErp } from '@/lib/erp/store'
import { colecao } from '@/lib/erp/metrics'
import { brl } from '@/lib/erp/format'

type Acao = { tipo: 'criar' | 'senha'; pj: Registro } | null

export default function VendedoresExternosPage() {
  const s = useErp()
  const [acao, setAcao] = useState<Acao>(null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const login = (pj: Registro) => s.colaboradores.find((c) => c.id === pj.usuarioId)
  const abrir = (tipo: 'criar' | 'senha', pj: Registro) => {
    setEmail(String(pj.email || ''))
    setSenha('')
    setErro('')
    setAcao({ tipo, pj })
  }

  // bloquear/liberar e trocar a senha usam o cadastro de colaborador ligado ao vendedor
  const atualizarLogin = async (pj: Registro, mudancas: { status?: 'ATIVO' | 'INATIVO'; senha?: string }) => {
    const c = login(pj)
    if (!c) return 'Login não encontrado.'
    return salvarColaborador(
      { nome: c.nome, email: c.email, senha: mudancas.senha ?? '', cpf: c.cpf, telefone: c.telefone, funcao: c.funcao, setor: c.setor, status: mudancas.status ?? c.status, dataAdmissao: c.dataAdmissao, foto: c.foto },
      c.id,
    )
  }

  const confirmar = async () => {
    if (!acao) return
    setSalvando(true)
    const falha = acao.tipo === 'criar' ? await criarAcessoVendedor(acao.pj.id, email, senha) : senha.length < 6 ? 'A senha precisa ter ao menos 6 caracteres.' : await atualizarLogin(acao.pj, { senha })
    setSalvando(false)
    if (falha) return setErro(falha)
    setAcao(null)
  }

  const vendas = colecao(s, 'vendas_ebooks')

  return (
    <>
      <CrudPage
        colecao="pj_vendedores"
        modulo="operacional"
        setor="adm"
        moduloLabel="Diretoria / Vendedores externos"
        titulo="Vendedores Externos"
        descricao="Vendedores PJ que usam o app no celular: vendedor de contrato (fecha com as escolas) e vendedor de books (vende aos pais). Crie o acesso ao app de cada um."
        rotuloNovo="Novo vendedor"
        campos={[
          { chave: 'nome', label: 'Nome', tipo: 'texto', obrigatorio: true },
          { chave: 'tipo', label: 'Tipo', tipo: 'select', opcoes: ['Contrato', 'Books'], obrigatorio: true, padrao: () => 'Contrato', exibir: (r) => (r.tipo === 'Books' ? 'Vendedor de books' : 'Vendedor de contrato') },
          { chave: 'telefone', label: 'Telefone', tipo: 'telefone', obrigatorio: true },
          { chave: 'cidade', label: 'Cidade', tipo: 'texto', tabela: false },
          { chave: 'uf', label: 'UF', tipo: 'texto', padrao: () => 'PR', tabela: false },
          { chave: 'status', label: 'Situação', tipo: 'select', opcoes: ['Ativo', 'Em negociação', 'Inativo'], obrigatorio: true, padrao: () => 'Ativo', tabela: false },
          { chave: 'valorPorFicha', label: 'R$ por aluno fotografado (vendedor de contrato)', tipo: 'moeda', tabela: false, padrao: () => 0 },
          {
            chave: 'acessoApp',
            label: 'Acesso ao app',
            tipo: 'texto',
            formulario: false,
            exibir: (r) => {
              const c = login(r)
              if (!c) return <span className="text-xs font-bold text-yellow-400">Sem acesso</span>
              return (
                <span className="text-xs">
                  <span className={`font-bold ${c.status === 'ATIVO' ? 'text-emerald-400' : 'text-red-400'}`}>{c.status === 'ATIVO' ? '✓ Liberado' : '✕ Bloqueado'}</span>
                  <span className="block text-zinc-500">{c.email}</span>
                </span>
              )
            },
          },
          {
            chave: 'resultadoMes',
            label: 'Resultado',
            tipo: 'texto',
            formulario: false,
            exibir: (r) => {
              if (r.tipo === 'Books') {
                const minhas = vendas.filter((v) => v.vendedorExternoId === r.id)
                return <span className="text-xs text-zinc-300">{minhas.length} venda(s) • {brl(minhas.reduce((a, v) => a + Number(v.valor || 0), 0))}</span>
              }
              const contratos = colecao(s, 'contratos_escola').filter((c) => c.vendedorId === r.id && c.status !== 'Cancelado')
              return <span className="text-xs text-zinc-300">{contratos.length} contrato(s) de escola</span>
            },
          },
          { chave: 'pixNome', label: 'PIX • nome de quem recebe', tipo: 'texto', tabela: false },
          { chave: 'pixChave', label: 'PIX • chave', tipo: 'texto', tabela: false },
          { chave: 'pixBanco', label: 'PIX • banco', tipo: 'texto', tabela: false },
          { chave: 'observacao', label: 'Observação', tipo: 'textarea', tabela: false },
        ]}
        status={{ campo: 'status', tons: {} }}
        acoes={[
          { label: 'Criar acesso', icone: 'key', tom: 'blue', visivel: (r) => !login(r), executar: (r) => abrir('criar', r) },
          { label: 'Nova senha', icone: 'lock', tom: 'blue', visivel: (r) => !!login(r), executar: (r) => abrir('senha', r) },
          { label: 'Bloquear', icone: 'x', tom: 'red', visivel: (r) => login(r)?.status === 'ATIVO', executar: (r) => void atualizarLogin(r, { status: 'INATIVO' }) },
          { label: 'Liberar', icone: 'check', tom: 'emerald', visivel: (r) => login(r)?.status === 'INATIVO', executar: (r) => void atualizarLogin(r, { status: 'ATIVO' }) },
        ]}
        kpis={(rs) => [
          { label: 'Vendedores de contrato', valor: rs.filter((r) => r.tipo !== 'Books').length, tom: 'blue' },
          { label: 'Vendedores de books', valor: rs.filter((r) => r.tipo === 'Books').length, tom: 'orange' },
          { label: 'Com acesso ao app', valor: rs.filter((r) => login(r)?.status === 'ATIVO').length, tom: 'emerald' },
          { label: 'Sem acesso', valor: rs.filter((r) => !login(r)).length, tom: 'yellow' },
        ]}
      />

      <Modal
        aberto={!!acao}
        titulo={acao?.tipo === 'criar' ? 'Criar acesso ao app' : 'Nova senha do app'}
        subtitulo={acao ? `${acao.pj.nome} • ${acao.pj.tipo === 'Books' ? 'Vendedor de books' : 'Vendedor de contrato'}` : ''}
        onFechar={() => setAcao(null)}
        largura="max-w-md"
        rodape={
          <>
            <button onClick={() => setAcao(null)} className={btnSecundario}>Cancelar</button>
            <button onClick={confirmar} disabled={salvando} className={btnPrimario}>{salvando ? 'Salvando...' : acao?.tipo === 'criar' ? 'Criar acesso' : 'Salvar senha'}</button>
          </>
        }
      >
        {acao?.tipo === 'criar' && (
          <div className="space-y-2">
            <label className={labelCls}>E-mail de acesso</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="email@exemplo.com" />
          </div>
        )}
        <div className="space-y-2">
          <label className={labelCls}>Senha (mínimo 6 caracteres)</label>
          <input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} className={inputCls} />
        </div>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Envie ao vendedor o endereço <strong className="text-zinc-300">{typeof window !== 'undefined' ? window.location.origin : ''}/login</strong>, o e-mail e a senha. Ao entrar, ele cai direto no app e pode instalá-lo na tela inicial do celular.
        </p>
        {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
      </Modal>
    </>
  )
}
