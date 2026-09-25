// Edge Function (Deno) — gestão de acesso dos colaboradores pelo ADM.
// Operações que exigem a chave service_role (nunca exposta no navegador):
//   acao: 'criar'            → cria usuário no Auth + linha em colaboradores
//   acao: 'atualizar_acesso' → troca e-mail e/ou senha de um colaborador
//   acao: 'excluir'          → remove o usuário do Auth (colaboradores cai em cascata)
// Toda chamada confere a permissão de quem chamou com a função pode() do banco.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const chamador = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: auth } = await chamador.auth.getUser()
  if (!auth.user) return json({ erro: 'Sessão inválida' }, 401)

  let body: Record<string, string | undefined>
  try {
    body = await req.json()
  } catch {
    return json({ erro: 'Corpo inválido' }, 400)
  }

  const pode = async (acao: string) => {
    const { data } = await chamador.rpc('pode', { p_modulo: 'usuarios', p_acao: acao })
    return data === true
  }
  const { data: meuPerfil } = await chamador.rpc('meu_perfil')
  const souAdm = meuPerfil === 'ADM'

  // Só o ADM mexe em contas do setor ADM
  const alvoEhAdm = async (id?: string) => {
    if (!id) return false
    const { data } = await admin.from('colaboradores').select('setor').eq('id', id).maybeSingle()
    return data?.setor === 'adm'
  }

  if (body.acao === 'criar') {
    if (!(await pode('criar'))) return json({ erro: 'Sem permissão para criar colaboradores' }, 403)
    if (body.setor === 'adm' && !souAdm) return json({ erro: 'Somente o ADM cria usuários do setor ADM' }, 403)
    if (!body.email || !body.senha || body.senha.length < 6) return json({ erro: 'Informe e-mail e senha (mín. 6 caracteres)' }, 400)

    const { data, error } = await admin.auth.admin.createUser({ email: body.email, password: body.senha, email_confirm: true })
    if (error) return json({ erro: error.message.includes('already') ? 'E-mail já cadastrado no Auth' : error.message }, 400)

    const { error: erroColab } = await admin.from('colaboradores').insert({
      id: data.user.id,
      nome: body.nome,
      email: body.email,
      cpf: body.cpf || null,
      telefone: body.telefone || null,
      funcao: body.funcao,
      setor: body.setor,
      data_admissao: body.dataAdmissao || null,
    })
    if (erroColab) {
      await admin.auth.admin.deleteUser(data.user.id)
      return json({ erro: erroColab.message }, 400)
    }
    await admin.from('auditoria').insert({
      tipo: 'CRIAR',
      tabela: 'colaboradores',
      registro_id: data.user.id,
      usuario_id: auth.user.id,
      usuario_nome: auth.user.email,
      setor: 'adm',
      descricao: `Colaborador criado: ${body.nome} → setor ${body.setor}`,
    })
    await admin.from('notificacoes').insert({
      setores: [body.setor, 'adm'],
      tipo: 'info',
      titulo: 'Novo colaborador',
      descricao: `${body.nome} entrou para a equipe de ${body.setor}.`,
    })
    return json({ id: data.user.id })
  }

  if (body.acao === 'atualizar_acesso') {
    if (!(await pode('editar'))) return json({ erro: 'Sem permissão para editar colaboradores' }, 403)
    if ((await alvoEhAdm(body.id)) && !souAdm) return json({ erro: 'Somente o ADM altera contas do setor ADM' }, 403)
    const alteracoes: { email?: string; password?: string; email_confirm?: boolean } = {}
    if (body.email) Object.assign(alteracoes, { email: body.email, email_confirm: true })
    if (body.senha) {
      if (body.senha.length < 6) return json({ erro: 'A senha precisa ter ao menos 6 caracteres' }, 400)
      alteracoes.password = body.senha
    }
    const { error } = await admin.auth.admin.updateUserById(body.id!, alteracoes)
    if (error) return json({ erro: error.message }, 400)
    if (body.email) await admin.from('colaboradores').update({ email: body.email }).eq('id', body.id!)
    await admin.from('auditoria').insert({
      tipo: 'SENHA',
      tabela: 'colaboradores',
      registro_id: body.id,
      usuario_id: auth.user.id,
      usuario_nome: auth.user.email,
      setor: 'adm',
      descricao: `Acesso atualizado (${[body.email && 'e-mail', body.senha && 'senha'].filter(Boolean).join(' e ')})`,
    })
    return json({ ok: true })
  }

  if (body.acao === 'excluir') {
    if (!(await pode('excluir'))) return json({ erro: 'Sem permissão para excluir colaboradores' }, 403)
    if (body.id === auth.user.id) return json({ erro: 'Você não pode excluir a própria conta' }, 400)
    if ((await alvoEhAdm(body.id)) && !souAdm) return json({ erro: 'Somente o ADM exclui contas do setor ADM' }, 403)
    const { error } = await admin.auth.admin.deleteUser(body.id!)
    if (error) {
      // Contratos, títulos, tarefas etc. referenciam o colaborador: o banco protege o histórico
      const vinculado = /foreign key|Database error deleting user/i.test(error.message)
      return json({ erro: vinculado ? 'Colaborador possui histórico vinculado (contratos, títulos, tarefas). Use "Desativar" para bloquear o acesso.' : error.message }, 400)
    }
    await admin.from('auditoria').insert({
      tipo: 'EXCLUIR',
      tabela: 'colaboradores',
      registro_id: body.id,
      usuario_id: auth.user.id,
      usuario_nome: auth.user.email,
      setor: 'adm',
      descricao: 'Colaborador excluído (conta removida do Auth)',
    })
    return json({ ok: true })
  }

  return json({ erro: 'Ação desconhecida' }, 400)
})
