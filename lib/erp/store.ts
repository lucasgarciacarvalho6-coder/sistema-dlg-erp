// Núcleo ERP. Dois modos, escolhidos automaticamente por src/.env.local:
//
//  • DEMO (Supabase não configurado): estado salvo no localStorage do navegador;
//    o evento `storage` sincroniza as abas em tempo real.
//  • SUPABASE: estado carregado do banco (RLS decide o que cada um vê), gravações
//    via API e atualização em tempo real pelo Supabase Realtime. As regras entre
//    setores rodam nos triggers do banco (docs/supabase/schema.sql).
//
// As telas usam só os hooks e as ações exportadas daqui, sem saber qual modo está ativo.

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { FunctionsHttpError, type RealtimeChannel } from '@supabase/supabase-js'
import type { Acao, Colaborador, ErpState, Lancamento, Meta, Modulo, Registro, Sessao, Setor, Valor } from './types'
import * as F from './fluxos'
import { VERSAO_DADOS, estadoVazio, gerarSeed } from './seed'
import { pode } from './permissions'
import { ETAPAS_PRODUCAO, perfilDoSetor } from './config'
import { addDias, hoje, uid } from './format'
import { colaboradorDoBanco, registroParaBanco } from './adaptador'
import { carregarDoSupabase, traduzirErro } from './supabase-sync'
import { blobParaDataURL, prepararFoto, validarFoto } from './imagem'
import { lerJSON } from './operacional'
import { supabaseConfigurado } from '@/lib/supabase/config'
import { sb } from '@/lib/supabase/client'

export const MODO: 'demo' | 'supabase' = supabaseConfigurado ? 'supabase' : 'demo'

const CHAVE_DADOS = 'dlg-erp:dados'
const CHAVE_SESSAO = 'dlg-erp:sessao' // demo: sessionStorage → cada aba pode ter um usuário
const DURACAO_SESSAO_H = 8
const noNavegador = typeof window !== 'undefined'

const ESTADO_SERVIDOR = estadoVazio()
let cache: ErpState | null = null
const ouvintes = new Set<() => void>()
const emitir = () => ouvintes.forEach((o) => o())

function assinar(cb: () => void) {
  ouvintes.add(cb)
  return () => {
    ouvintes.delete(cb)
  }
}

// ---------------- Status de carregamento e avisos ----------------

type Status = 'iniciando' | 'pronto'
let status: Status = 'iniciando'

export interface Aviso {
  id: number
  texto: string
  tipo: 'erro' | 'ok'
}
let aviso: Aviso | null = null
let timerAviso: ReturnType<typeof setTimeout> | undefined

export function avisar(texto: string, tipo: Aviso['tipo'] = 'erro') {
  aviso = { id: Date.now(), texto, tipo }
  emitir()
  clearTimeout(timerAviso)
  timerAviso = setTimeout(() => {
    aviso = null
    emitir()
  }, 6000)
}

export function useAviso() {
  return useSyncExternalStore(assinar, () => aviso, () => null)
}

// 'pronto' = já sabemos se há sessão e os dados do usuário foram carregados
export function useStatus(): Status {
  return useSyncExternalStore(assinar, () => (MODO === 'demo' ? 'pronto' : status), () => 'iniciando')
}

// ---------------- Estado (leitura) ----------------

function carregar(): ErpState {
  if (cache) return cache
  if (!noNavegador || MODO === 'supabase') return ESTADO_SERVIDOR
  try {
    const bruto = localStorage.getItem(CHAVE_DADOS)
    if (bruto) {
      const salvo = JSON.parse(bruto) as ErpState
      if (salvo.versao === VERSAO_DADOS) {
        cache = salvo
        return salvo
      }
    }
  } catch {
    // dados corrompidos → recria
  }
  cache = gerarSeed()
  persistir(cache)
  return cache
}

function persistir(s: ErpState) {
  try {
    localStorage.setItem(CHAVE_DADOS, JSON.stringify(s))
  } catch {
    // armazenamento cheio/bloqueado: mantém só em memória
  }
}

export const lerEstado = carregar

export function useErp(): ErpState {
  return useSyncExternalStore(assinar, carregar, () => ESTADO_SERVIDOR)
}

// Demo: aplica uma regra de fluxos.ts no rascunho e persiste
function mutar(fn: (d: ErpState, ctx: F.Contexto) => void) {
  const rascunho = structuredClone(carregar())
  fn(rascunho, contextoAtual(rascunho))
  cache = rascunho
  persistir(rascunho)
  emitir()
}

function contextoAtual(s: ErpState): F.Contexto {
  const sessao = lerSessao()
  const u = sessao ? s.colaboradores.find((c) => c.id === sessao.colaboradorId) : undefined
  return u ? { autorId: u.id, autorNome: u.nome, autorSetor: u.setor } : { autorId: '', autorNome: 'Anônimo', autorSetor: '' }
}

// ---------------- Sessão ----------------

let sessaoDemo: { bruto: string | null; valor: Sessao | null } = { bruto: null, valor: null }
let sessaoSb: Sessao | null = null

function lerSessao(): Sessao | null {
  if (!noNavegador) return null
  if (MODO === 'supabase') return sessaoSb
  const bruto = sessionStorage.getItem(CHAVE_SESSAO)
  if (bruto !== sessaoDemo.bruto) {
    let valor: Sessao | null = null
    try {
      valor = bruto ? (JSON.parse(bruto) as Sessao) : null
    } catch {
      valor = null
    }
    sessaoDemo = { bruto, valor }
  }
  const s = sessaoDemo.valor
  if (s && s.expira < new Date().toISOString()) return null
  return s
}

function gravarSessaoDemo(s: Sessao | null) {
  if (s) sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(s))
  else sessionStorage.removeItem(CHAVE_SESSAO)
  emitir()
}

export function useSessao() {
  return useSyncExternalStore(assinar, lerSessao, () => null)
}

const nunca = () => () => {}
export function useHidratado() {
  return useSyncExternalStore(nunca, () => true, () => false)
}

export function useUsuario(): Colaborador | null {
  const s = useErp()
  const sessao = useSessao()
  return useMemo(
    () => (sessao ? (s.colaboradores.find((c) => c.id === sessao.colaboradorId && c.status === 'ATIVO') ?? null) : null),
    [s, sessao],
  )
}

export function usePode() {
  const s = useErp()
  const usuario = useUsuario()
  return useCallback((modulo: Modulo, acao: Acao) => pode(usuario, s.permissoes, modulo, acao), [usuario, s.permissoes])
}

// ---------------- Supabase: carga, realtime e gravação ----------------

let empresaId: string | null = null
let canal: RealtimeChannel | null = null
let recarregando = false
let recargaPendente = false
let timerRecarga: ReturnType<typeof setTimeout> | undefined

async function recarregar() {
  const sessao = sessaoSb
  if (!sessao) return
  if (recarregando) {
    recargaPendente = true
    return
  }
  recarregando = true
  try {
    const r = await carregarDoSupabase(sessao.colaboradorId)
    if (sessaoSb?.colaboradorId !== sessao.colaboradorId) return // trocou de usuário no meio
    cache = r.estado
    empresaId = r.empresaId
    if (r.erros.length) avisar(`Falha ao carregar parte dos dados: ${r.erros[0]}`)
  } catch (e) {
    avisar(`Não foi possível carregar os dados: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    recarregando = false
    status = 'pronto'
    emitir()
    if (recargaPendente) {
      recargaPendente = false
      void recarregar()
    }
  }
}

function agendarRecarga(ms = 350) {
  clearTimeout(timerRecarga)
  timerRecarga = setTimeout(() => void recarregar(), ms)
}

function assinarRealtime() {
  pararRealtime()
  // Qualquer mudança nas tabelas publicadas (outro setor lançou produção, aprovou algo...) → recarrega
  canal = sb()
    .channel('erp-nucleo')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => agendarRecarga())
    .subscribe()
}

function pararRealtime() {
  if (canal) void sb().removeChannel(canal)
  canal = null
}

// Ativa a sessão do usuário: marca "carregando" na hora (evita que a área do setor
// redirecione para o login antes dos dados chegarem) e busca tudo do banco.
function ativarSessaoSb(usuarioId: string, expiraEm: number | undefined) {
  const trocou = sessaoSb?.colaboradorId !== usuarioId
  sessaoSb = {
    colaboradorId: usuarioId,
    inicio: trocou ? new Date().toISOString() : (sessaoSb?.inicio ?? new Date().toISOString()),
    expira: new Date((expiraEm ?? 0) * 1000).toISOString(),
  }
  if (trocou) {
    cache = null
    status = 'iniciando'
    emitir()
    void recarregar()
    assinarRealtime()
  }
}

if (noNavegador && MODO === 'supabase') {
  sb().auth.onAuthStateChange((_evento, session) => {
    // Não aguardar chamadas ao Supabase dentro deste callback (recomendação da biblioteca)
    setTimeout(() => {
      if (session?.user) {
        ativarSessaoSb(session.user.id, session.expires_at)
      } else {
        sessaoSb = null
        cache = null
        empresaId = null
        pararRealtime()
        status = 'pronto'
        emitir()
      }
    }, 0)
  })
}

type Resposta = PromiseLike<{ error: { message: string; code?: string } | null }>

// Executa uma gravação no Supabase: erro vira aviso na tela; sucesso agenda recarga
async function gravar(op: () => Resposta, sucesso?: string): Promise<string | null> {
  try {
    const { error } = await op()
    if (error) {
      const msg = traduzirErro(error)
      avisar(msg)
      return msg
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    avisar(msg)
    return msg
  }
  if (sucesso) avisar(sucesso, 'ok')
  agendarRecarga(150)
  return null
}

const evento = (tipo: string, descricao: string, setor?: Setor) =>
  sb()
    .rpc('registrar_evento', { p_tipo: tipo, p_descricao: descricao, p_setor: setor ?? null })
    .then(
      () => undefined,
      () => undefined,
    )

async function funcaoAdmin(corpo: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await sb().functions.invoke('admin-colaboradores', { body: corpo })
  let msg: string | null = null
  if (error) {
    msg = error.message
    if (error instanceof FunctionsHttpError) {
      try {
        msg = ((await error.context.json()) as { erro?: string }).erro ?? msg
      } catch {
        // mantém a mensagem genérica
      }
    }
    if (/Failed to send|not found|404/i.test(msg ?? '')) msg = 'Edge Function "admin-colaboradores" não publicada (ver docs/SUPABASE_PROMPT.md, seção 3).'
  } else if (data && typeof data === 'object' && 'erro' in data) {
    msg = String((data as { erro: string }).erro)
  }
  if (msg) avisar(msg)
  else agendarRecarga(150)
  return msg
}

// ---------------- Autenticação ----------------

export type ResultadoLogin = { ok: true; usuario: Colaborador } | { ok: false; erro: string }

export async function login(email: string, senha: string): Promise<ResultadoLogin> {
  if (MODO === 'supabase') {
    const cliente = sb()
    const { data, error } = await cliente.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error || !data.user) {
      await evento('LOGIN_FALHOU', `Tentativa de login inválida para ${email}`)
      return { ok: false, erro: error?.message === 'Email not confirmed' ? 'E-mail ainda não confirmado.' : 'E-mail ou senha incorretos.' }
    }
    const { data: linha, error: erroColab } = await cliente.from('colaboradores').select('*').eq('id', data.user.id).maybeSingle()
    if (erroColab || !linha) {
      await cliente.auth.signOut()
      return { ok: false, erro: erroColab ? traduzirErro(erroColab) : 'Usuário sem cadastro de colaborador. Procure o administrador.' }
    }
    if (linha.status !== 'ATIVO') {
      await cliente.auth.signOut()
      return { ok: false, erro: 'Usuário inativo. Procure o administrador.' }
    }
    await evento('LOGIN', `Login realizado (${linha.setor})`, linha.setor)
    ativarSessaoSb(data.user.id, data.session?.expires_at)
    return { ok: true, usuario: colaboradorDoBanco(linha, []) }
  }

  const s = carregar()
  const u = s.colaboradores.find((c) => c.email.toLowerCase() === email.trim().toLowerCase())
  if (!u || u.senha !== senha) {
    mutar((d) => F.auditar(d, { autorId: u?.id ?? '', autorNome: email, autorSetor: u?.setor ?? '' }, 'LOGIN_FALHOU', `Tentativa de login inválida para ${email}`))
    return { ok: false, erro: 'E-mail ou senha incorretos.' }
  }
  if (u.status !== 'ATIVO') return { ok: false, erro: 'Usuário inativo. Procure o administrador.' }
  const inicio = new Date()
  gravarSessaoDemo({ colaboradorId: u.id, inicio: inicio.toISOString(), expira: new Date(inicio.getTime() + DURACAO_SESSAO_H * 3600_000).toISOString() })
  mutar((d, ctx) => F.auditar(d, ctx, 'LOGIN', `Login realizado (${u.setor})`))
  return { ok: true, usuario: u }
}

export async function logout() {
  if (MODO === 'supabase') {
    if (sessaoSb) await evento('LOGOUT', 'Sessão encerrada')
    await sb().auth.signOut()
    return
  }
  if (lerSessao()) mutar((d, ctx) => F.auditar(d, ctx, 'LOGOUT', 'Sessão encerrada'))
  gravarSessaoDemo(null)
}

export async function solicitarRecuperacao(email: string) {
  if (MODO === 'supabase') {
    await sb().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` })
    return
  }
  mutar((d) => F.auditar(d, { autorId: '', autorNome: email, autorSetor: '' }, 'SENHA', `Recuperação de senha solicitada para ${email}`))
}

export async function alterarSenha(atual: string, nova: string): Promise<string | null> {
  if (nova.length < 6) return 'A nova senha precisa ter ao menos 6 caracteres.'
  const s = carregar()
  const u = s.colaboradores.find((c) => c.id === lerSessao()?.colaboradorId)
  if (!u) return 'Sessão expirada.'
  if (MODO === 'supabase') {
    const { error: erroAtual } = await sb().auth.signInWithPassword({ email: u.email, password: atual })
    if (erroAtual) return 'Senha atual incorreta.'
    const { error } = await sb().auth.updateUser({ password: nova })
    if (error) return error.message
    await evento('SENHA', 'Senha alterada pelo próprio usuário')
    return null
  }
  if (u.senha !== atual) return 'Senha atual incorreta.'
  mutar((d, ctx) => {
    const alvo = d.colaboradores.find((c) => c.id === u.id)
    if (alvo) alvo.senha = nova
    F.auditar(d, ctx, 'SENHA', 'Senha alterada pelo próprio usuário')
  })
  return null
}

// Usado pela página /redefinir-senha (link do e-mail de recuperação)
export async function redefinirSenha(nova: string): Promise<string | null> {
  if (MODO !== 'supabase') return 'Disponível apenas com o Supabase configurado.'
  if (nova.length < 6) return 'A nova senha precisa ter ao menos 6 caracteres.'
  const { error } = await sb().auth.updateUser({ password: nova })
  if (error) return error.message
  await evento('SENHA', 'Senha redefinida pelo link de recuperação')
  return null
}

export function registrarAcesso(setor: Setor) {
  if (MODO === 'supabase') void evento('ACESSO', `Acessou a área ${setor}`, setor)
  else mutar((d, ctx) => F.auditar(d, ctx, 'ACESSO', `Acessou a área ${setor}`, setor))
}

// ---------------- Colaboradores (ADM) ----------------

export type DadosColaborador = Omit<Colaborador, 'id' | 'criadoEm' | 'perfil' | 'metas'> & { metas?: Colaborador['metas'] }

export async function salvarColaborador(dados: DadosColaborador, id?: string): Promise<string | null> {
  const s = carregar()
  const email = dados.email.trim().toLowerCase()
  if (s.colaboradores.some((c) => c.email.toLowerCase() === email && c.id !== id)) return 'Já existe um colaborador com este e-mail.'

  if (MODO === 'supabase') {
    if (!id) {
      return funcaoAdmin({
        acao: 'criar',
        nome: dados.nome,
        email,
        senha: dados.senha,
        cpf: dados.cpf,
        telefone: dados.telefone,
        funcao: dados.funcao,
        setor: dados.setor,
        dataAdmissao: dados.dataAdmissao || null,
      })
    }
    const erro = await gravar(() =>
      sb()
        .from('colaboradores')
        .update({
          nome: dados.nome,
          cpf: dados.cpf || null,
          telefone: dados.telefone || null,
          funcao: dados.funcao,
          setor: dados.setor,
          status: dados.status,
          data_admissao: dados.dataAdmissao || null,
        })
        .eq('id', id),
    )
    if (erro) return erro
    const anterior = s.colaboradores.find((c) => c.id === id)
    // E-mail e senha ficam no Supabase Auth → alteração via Edge Function
    if (dados.senha || (anterior && anterior.email !== email)) {
      return funcaoAdmin({ acao: 'atualizar_acesso', id, email: anterior?.email !== email ? email : undefined, senha: dados.senha || undefined })
    }
    return null
  }

  mutar((d, ctx) => {
    if (id) {
      const c = d.colaboradores.find((x) => x.id === id)
      if (!c) return
      Object.assign(c, dados, { email, perfil: perfilDoSetor(dados.setor), metas: dados.metas ?? c.metas })
      F.auditar(d, ctx, 'EDITAR', `Colaborador atualizado: ${c.nome} (${c.setor})`, 'adm')
    } else {
      d.colaboradores.push({ ...dados, email, metas: dados.metas ?? {}, id: uid(), perfil: perfilDoSetor(dados.setor), criadoEm: new Date().toISOString() })
      F.auditar(d, ctx, 'CRIAR', `Colaborador criado: ${dados.nome} → setor ${dados.setor}`, 'adm')
      F.notificar(d, ctx, { setores: [dados.setor, 'adm'], tipo: 'info', titulo: 'Novo colaborador', descricao: `${dados.nome} entrou para a equipe de ${dados.setor}.`, link: '' })
    }
  })
  return null
}

export async function excluirColaborador(id: string): Promise<string | null> {
  if (MODO === 'supabase') return funcaoAdmin({ acao: 'excluir', id })
  mutar((d, ctx) => {
    const c = d.colaboradores.find((x) => x.id === id)
    d.colaboradores = d.colaboradores.filter((x) => x.id !== id)
    if (c) F.auditar(d, ctx, 'EXCLUIR', `Colaborador excluído: ${c.nome}`, 'adm')
  })
  return null
}

// Metas de um MÊS ('YYYY-MM'). Os meses seguintes herdam essa meta até o ADM definir outra.
export async function definirMetas(colaboradorId: string, metas: Record<string, Meta>, mes: string): Promise<string | null> {
  if (MODO === 'supabase') {
    const linhas = Object.entries(metas).map(([indicador_id, m]) => ({ colaborador_id: colaboradorId, indicador_id, mes, diaria: m.diaria, mensal: m.mensal, piso: m.piso ?? 0 }))
    return gravar(() => sb().from('metas').upsert(linhas, { onConflict: 'colaborador_id,indicador_id,mes' }), 'Metas salvas.')
  }
  mutar((d, ctx) => {
    const c = d.colaboradores.find((x) => x.id === colaboradorId)
    if (!c) return
    c.metasMes = { ...(c.metasMes ?? {}), [mes]: { ...(c.metasMes?.[mes] ?? {}), ...metas } }
    F.auditar(d, ctx, 'EDITAR', `Metas de ${mes} atualizadas: ${c.nome}`, c.setor)
  })
  return null
}

// Foto de perfil: o próprio colaborador ou quem pode editar usuários (ADM)
export async function definirFoto(colaboradorId: string, arquivo: File): Promise<string | null> {
  const invalida = validarFoto(arquivo)
  if (invalida) return invalida
  let blob: Blob
  try {
    blob = await prepararFoto(arquivo)
  } catch (e) {
    return e instanceof Error ? e.message : 'Não foi possível processar a imagem.'
  }

  if (MODO === 'supabase') {
    const caminho = `${colaboradorId}.jpg`
    const { error: erroUpload } = await sb().storage.from('avatares').upload(caminho, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
    if (erroUpload) {
      const msg = /bucket not found/i.test(erroUpload.message) ? 'Armazenamento de fotos não criado — rode docs/supabase/003_fotos_perfil.sql.' : traduzirErro(erroUpload)
      avisar(msg)
      return msg
    }
    const url = `${sb().storage.from('avatares').getPublicUrl(caminho).data.publicUrl}?v=${Date.now()}`
    return gravar(() => sb().rpc('definir_foto', { p_colaborador: colaboradorId, p_url: url }), 'Foto atualizada.')
  }

  const dataUrl = await blobParaDataURL(blob)
  mutar((d, ctx) => {
    const c = d.colaboradores.find((x) => x.id === colaboradorId)
    if (!c) return
    c.foto = dataUrl
    F.auditar(d, ctx, 'EDITAR', `Foto de perfil atualizada: ${c.nome}`, c.setor)
  })
  return null
}

// ---------------- Lançamentos (produção / metas) ----------------

export async function registrarLancamento(l: Omit<Lancamento, 'id' | 'criadoEm' | 'autorId' | 'origem'>): Promise<string | null> {
  if (MODO === 'supabase') {
    return gravar(() =>
      sb().from('lancamentos').insert({
        setor: l.setor,
        indicador_id: l.indicador,
        colaborador_id: l.colaboradorId || null,
        quantidade: l.quantidade,
        descricao: l.descricao,
        data: l.data,
        origem: 'manual',
      }),
    )
  }
  mutar((d, ctx) => {
    F.lancar(d, ctx, { ...l, origem: 'manual' })
    F.auditar(d, ctx, 'CRIAR', `Lançamento ${l.indicador}: ${l.quantidade} (${l.descricao || 'sem descrição'})`, l.setor)
  })
  return null
}

export async function excluirLancamento(id: string): Promise<string | null> {
  if (MODO === 'supabase') return gravar(() => sb().from('lancamentos').delete().eq('id', id))
  mutar((d, ctx) => {
    const l = d.lancamentos.find((x) => x.id === id)
    d.lancamentos = d.lancamentos.filter((x) => x.id !== id)
    if (l) F.auditar(d, ctx, 'EXCLUIR', `Lançamento removido: ${l.indicador} ${l.quantidade} em ${l.data}`, l.setor)
  })
  return null
}

// ---------------- Coleções genéricas (CrudPage) ----------------

export async function criarRegistro(nome: string, dados: Omit<Registro, 'id' | 'criadoEm'>, setor: Setor | '' = ''): Promise<string | null> {
  if (MODO === 'supabase') return gravar(() => sb().from(nome).insert(registroParaBanco(nome, dados as Record<string, Valor>)))
  mutar((d, ctx) => {
    const criado = F.inserir(d, nome, dados)
    F.APOS_CRIAR[nome]?.(d, criado, ctx)
    F.auditar(d, ctx, 'CRIAR', `Novo registro em ${nome}`, setor || ctx.autorSetor)
  })
  return null
}

export async function atualizarRegistro(nome: string, id: string, dados: Partial<Registro>, setor: Setor | '' = ''): Promise<string | null> {
  if (MODO === 'supabase') return gravar(() => sb().from(nome).update(registroParaBanco(nome, dados)).eq('id', id))
  mutar((d, ctx) => {
    const r = F.col(d, nome).find((x) => x.id === id)
    if (!r) return
    Object.assign(r, dados)
    F.aposAtualizar(d, nome, r, ctx)
    F.auditar(d, ctx, 'EDITAR', `Registro atualizado em ${nome}`, setor || ctx.autorSetor)
  })
  return null
}

export async function excluirRegistro(nome: string, id: string, setor: Setor | '' = ''): Promise<string | null> {
  if (MODO === 'supabase') return gravar(() => sb().from(nome).delete().eq('id', id))
  mutar((d, ctx) => {
    d.colecoes[nome] = F.col(d, nome).filter((x) => x.id !== id)
    F.auditar(d, ctx, 'EXCLUIR', `Registro excluído em ${nome}`, setor || ctx.autorSetor)
  })
  return null
}

// ---------------- Ações de fluxo (no Supabase, os triggers fazem o resto) ----------------

export function baixarTitulo(id: string) {
  if (MODO === 'supabase') return gravar(() => sb().from('titulos').update({ status: 'Pago' }).eq('id', id), 'Baixa registrada.')
  mutar((d, ctx) => F.baixarTitulo(d, id, ctx))
  return Promise.resolve(null)
}

export function pagarConta(nome: 'contas_pagar' | 'comissoes', id: string) {
  if (MODO === 'supabase') return gravar(() => sb().from(nome).update({ status: 'Pago' }).eq('id', id), 'Pagamento registrado.')
  mutar((d, ctx) => F.pagarConta(d, nome, id, ctx))
  return Promise.resolve(null)
}

export function decidirAprovacao(id: string, aprovado: boolean) {
  if (MODO === 'supabase') return gravar(() => sb().from('aprovacoes').update({ status: aprovado ? 'Aprovado' : 'Rejeitado' }).eq('id', id), aprovado ? 'Aprovado.' : 'Rejeitado.')
  mutar((d, ctx) => F.decidirAprovacao(d, id, aprovado, ctx))
  return Promise.resolve(null)
}

export function avancarOrdem(id: string) {
  if (MODO === 'supabase') {
    const o = F.col(carregar(), 'ordens_producao').find((x) => x.id === id)
    const i = ETAPAS_PRODUCAO.indexOf(String(o?.etapa))
    if (!o || i < 0 || i >= ETAPAS_PRODUCAO.length - 1) return Promise.resolve(null)
    return gravar(() => sb().from('ordens_producao').update({ etapa: ETAPAS_PRODUCAO[i + 1] }).eq('id', id))
  }
  mutar((d, ctx) => F.avancarOrdem(d, id, ctx))
  return Promise.resolve(null)
}

export function negociarTitulo(id: string, parcelas: number) {
  if (MODO === 'supabase') {
    const t = F.col(carregar(), 'titulos').find((x) => x.id === id)
    if (!t) return Promise.resolve(null)
    return gravar(
      () =>
        sb()
          .from('acordos')
          .insert({
            cliente: t.cliente,
            escola: t.escola || null,
            telefone: t.telefone || null,
            titulo_id: t.id,
            valor_original: Number(t.valor) || 0,
            valor_acordo: Number(t.valor) || 0,
            parcelas,
            primeiro_vencimento: addDias(hoje(), 7),
          }),
      'Acordo gerado e enviado para aprovação da Gerência.',
    )
  }
  mutar((d, ctx) => F.negociarTitulo(d, id, parcelas, ctx))
  return Promise.resolve(null)
}

// ---------------- Processo operacional (contratos de escola → agenda → fechamento) ----------------

// Diretora confirmou → contrato vai para a Agenda Fotográfica (e a Produção é avisada)
export async function confirmarContratoEscola(id: string): Promise<string | null> {
  if (MODO === 'supabase') return gravar(() => sb().rpc('confirmar_contrato_escola', { p_id: id }), 'Contrato enviado para a agenda.')
  let erro: string | null = null
  mutar((d, ctx) => {
    erro = F.confirmarContratoEscola(d, id, ctx)
  })
  avisar(erro ?? 'Contrato enviado para a agenda.', erro ? 'erro' : 'ok')
  return erro
}

// Histórico de contatos/fichas. Com `fichas`, atualiza as fichas autorizadas da visita.
export async function registrarHistoricoVisita(visitaId: string, h: { tipo: string; fichas?: number; descricao: string }): Promise<string | null> {
  if (MODO === 'supabase') {
    const v = F.col(carregar(), 'agenda_visitas').find((x) => x.id === visitaId)
    const autor = carregar().colaboradores.find((c) => c.id === lerSessao()?.colaboradorId)?.nome ?? ''
    return gravar(() =>
      sb().from('agenda_historico').insert({
        visita_id: visitaId,
        tipo: h.tipo,
        fichas_antes: h.fichas === undefined ? null : Number(v?.fichasConfirmadas) || 0,
        fichas_depois: h.fichas ?? null,
        descricao: h.descricao,
        autor,
      }),
    )
  }
  mutar((d, ctx) => F.registrarHistoricoVisita(d, visitaId, h, ctx))
  return null
}

// Visita realizada: fichas fotografadas → meta do Operacional + fotos liberadas para a Produção
export async function encerrarVisita(visitaId: string, fichas: number): Promise<string | null> {
  if (fichas <= 0) return 'Informe quantas fichas foram fotografadas.'
  if (MODO === 'supabase') {
    return gravar(() => sb().from('agenda_visitas').update({ fichas_fotografadas: fichas, status: 'Fotografada' }).eq('id', visitaId), 'Visita encerrada.')
  }
  mutar((d, ctx) => F.encerrarVisita(d, visitaId, fichas, ctx))
  avisar('Visita encerrada.', 'ok')
  return null
}

// Fechamento → Financeiro: cada beneficiário vira uma conta a pagar com os dados PIX
export async function enviarFechamento(id: string): Promise<string | null> {
  if (MODO === 'supabase') {
    const f = F.col(carregar(), 'fechamentos').find((x) => x.id === id)
    const benef = lerJSON<{ nome: string; pixChave: string }[]>(f?.beneficiarios, [])
    const semPix = benef.filter((b) => !b.pixChave?.trim()).map((b) => b.nome)
    if (semPix.length) {
      const msg = `Informe a chave PIX de: ${semPix.join(', ')}.`
      avisar(msg)
      return msg
    }
    return gravar(() => sb().from('fechamentos').update({ status: 'Enviado ao financeiro' }).eq('id', id), 'Enviado ao financeiro.')
  }
  let erro: string | null = null
  mutar((d, ctx) => {
    erro = F.enviarFechamento(d, id, ctx)
  })
  avisar(erro ?? 'Enviado ao financeiro.', erro ? 'erro' : 'ok')
  return erro
}

// Arquivo do contrato (foto/PDF). Supabase: bucket privado "contratos". Demo: guarda só o nome.
export async function anexarArquivoContrato(arquivo: File): Promise<{ caminho: string } | { erro: string }> {
  if (arquivo.size > 10 * 1024 * 1024) return { erro: 'O arquivo precisa ter no máximo 10 MB.' }
  if (MODO !== 'supabase') return { caminho: arquivo.name }
  const nome = arquivo.name.normalize('NFD').replace(/[^\w.-]+/g, '_')
  const caminho = `${uid()}-${nome}`
  const { error } = await sb().storage.from('contratos').upload(caminho, arquivo, { contentType: arquivo.type || undefined })
  if (error) return { erro: traduzirErro(error) }
  return { caminho }
}

export async function abrirArquivoContrato(caminho: string) {
  if (MODO !== 'supabase') {
    avisar('No modo demonstração o arquivo não fica guardado — só o nome.', 'erro')
    return
  }
  const { data, error } = await sb().storage.from('contratos').createSignedUrl(caminho, 300)
  if (error || !data) avisar(error ? traduzirErro(error) : 'Arquivo não encontrado.')
  else window.open(data.signedUrl, '_blank')
}

// ---------------- Permissões / Notificações / Sistema ----------------

export function alternarPermissao(perfil: 'GERENTE' | 'COLABORADOR', modulo: Modulo | 'setor_proprio', acao: Acao) {
  if (MODO === 'supabase') {
    const grupo = carregar().permissoes[perfil] as Record<string, Acao[] | undefined>
    const tem = grupo[modulo]?.includes(acao)
    return gravar(() =>
      tem
        ? sb().from('permissoes').delete().match({ perfil, modulo, acao })
        : sb().from('permissoes').insert({ perfil, modulo, acao }),
    )
  }
  mutar((d, ctx) => {
    const grupo = d.permissoes[perfil] as Record<string, Acao[] | undefined>
    const atuais = grupo[modulo] ?? []
    grupo[modulo] = atuais.includes(acao) ? atuais.filter((a) => a !== acao) : [...atuais, acao]
    F.auditar(d, ctx, 'EDITAR', `Permissão ${perfil} • ${modulo} • ${acao}: ${atuais.includes(acao) ? 'removida' : 'concedida'}`, 'adm')
  })
  return Promise.resolve(null)
}

export function marcarLidas(ids: string[]) {
  const eu = lerSessao()?.colaboradorId
  if (!eu || ids.length === 0) return
  if (MODO === 'supabase') {
    // Atualiza a tela na hora e grava em seguida
    if (cache) {
      cache = { ...cache, notificacoes: cache.notificacoes.map((n) => (ids.includes(n.id) && !n.lidaPor.includes(eu) ? { ...n, lidaPor: [...n.lidaPor, eu] } : n)) }
      emitir()
    }
    void sb()
      .from('notificacao_leituras')
      .upsert(
        ids.map((notificacao_id) => ({ notificacao_id, colaborador_id: eu })),
        { onConflict: 'notificacao_id,colaborador_id', ignoreDuplicates: true },
      )
      .then(({ error }) => error && avisar(traduzirErro(error)))
    return
  }
  mutar((d, ctx) => {
    for (const n of d.notificacoes) if (ids.includes(n.id) && !n.lidaPor.includes(ctx.autorId)) n.lidaPor.push(ctx.autorId)
  })
}

// Parâmetros do negócio (bonificação, diárias, alimentação...) — ADM › Configurações
export async function salvarParametros(valores: Record<string, number>): Promise<string | null> {
  if (MODO === 'supabase') {
    if (!empresaId) return 'Cadastre os dados da empresa antes de salvar os parâmetros.'
    return gravar(() => sb().from('empresas').update({ parametros: valores }).eq('id', empresaId!), 'Parâmetros salvos.')
  }
  mutar((d, ctx) => {
    d.empresa = { ...d.empresa, parametros: valores }
    F.auditar(d, ctx, 'EDITAR', 'Parâmetros do negócio atualizados', 'adm')
  })
  return null
}

export async function salvarEmpresa(empresa: ErpState['empresa']): Promise<string | null> {
  if (MODO === 'supabase') {
    const { parametros: _p, ...dados } = empresa // parâmetros têm tela e ação próprias
    void _p
    return gravar(() => (empresaId ? sb().from('empresas').update(dados).eq('id', empresaId) : sb().from('empresas').insert(dados)), 'Dados da empresa salvos.')
  }
  mutar((d, ctx) => {
    d.empresa = empresa
    F.auditar(d, ctx, 'EDITAR', 'Dados da empresa atualizados', 'adm')
  })
  return null
}

export function restaurarDemo() {
  if (MODO === 'supabase') return
  const sessao = lerSessao()
  cache = gerarSeed()
  persistir(cache)
  if (sessao && !cache.colaboradores.some((c) => c.id === sessao.colaboradorId)) gravarSessaoDemo(null)
  mutar((d, ctx) => F.auditar(d, ctx, 'SISTEMA', 'Dados de demonstração restaurados', 'adm'))
}

export function exportarBackup() {
  return JSON.stringify(carregar(), null, 2)
}

export function importarBackup(json: string): string | null {
  if (MODO === 'supabase') return 'Com o Supabase, use os backups do painel do Supabase.'
  try {
    const dados = JSON.parse(json) as ErpState
    if (dados.versao !== VERSAO_DADOS || !Array.isArray(dados.colaboradores)) return 'Arquivo de backup inválido.'
    cache = dados
    persistir(dados)
    mutar((d, ctx) => F.auditar(d, ctx, 'SISTEMA', 'Backup importado', 'adm'))
    return null
  } catch {
    return 'Não foi possível ler o arquivo.'
  }
}

// Sincronização entre abas no modo demo
if (noNavegador && MODO === 'demo') {
  window.addEventListener('storage', (e) => {
    if (e.key === CHAVE_DADOS) {
      cache = null
      emitir()
    }
  })
}
