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
import { chaveCustoVariavel } from './operacoes-financeiro'
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
      }).then(async (erro) => {
        // "Sem meta" é gravado logo depois (a Edge Function só cria o acesso)
        if (erro || !dados.semMeta) return erro
        return gravar(() => sb().from('colaboradores').update({ sem_meta: true }).eq('email', email))
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
          sem_meta: !!dados.semMeta,
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

// Cancelar: contrato fica no histórico (aba Cancelados); a visita sai da agenda
export async function cancelarContratoEscola(id: string, motivo: string): Promise<string | null> {
  if (MODO === 'supabase') return gravar(() => sb().rpc('cancelar_contrato_escola', { p_id: id, p_motivo: motivo }), 'Contrato cancelado.')
  let erro: string | null = null
  mutar((d, ctx) => {
    erro = F.cancelarContratoEscola(d, id, motivo, ctx)
  })
  avisar(erro ?? 'Contrato cancelado.', erro ? 'erro' : 'ok')
  return erro
}

// Excluir: apaga contrato, visita, histórico e ordem "Aguardando fotos" (+ a foto/PDF do contrato)
export async function excluirContratoEscola(id: string): Promise<string | null> {
  if (MODO === 'supabase') {
    const { data, error } = await sb().rpc('excluir_contrato_escola', { p_id: id })
    if (error) {
      const msg = traduzirErro(error)
      avisar(msg)
      return msg
    }
    if (typeof data === 'string' && data) await sb().storage.from('contratos').remove([data]) // melhor esforço
    avisar('Contrato excluído.', 'ok')
    agendarRecarga(150)
    return null
  }
  let erro: string | null = null
  mutar((d, ctx) => {
    erro = F.excluirContratoEscola(d, id, ctx)
  })
  avisar(erro ?? 'Contrato excluído.', erro ? 'erro' : 'ok')
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

// Retorno: as fichas que faltaram viram uma visita nova na agenda (mesma escola), na data informada
export async function agendarRetorno(visitaId: string, fichas: number, data: string): Promise<string | null> {
  if (!(fichas > 0)) return 'Informe quantas fichas ficaram para o retorno.'
  if (!data) return 'Informe a data do retorno.'
  if (MODO === 'supabase') return gravar(() => sb().rpc('agendar_retorno', { p_visita: visitaId, p_fichas: fichas, p_data: data }), 'Retorno agendado na agenda.')
  let erro: string | null = null
  mutar((d, ctx) => {
    erro = F.agendarRetorno(d, visitaId, fichas, data, ctx)
  })
  avisar(erro ?? 'Retorno agendado na agenda.', erro ? 'erro' : 'ok')
  return erro
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

// ---------------- Apps de celular (vendedor externo e produção) ----------------

// Cadastro PJ do vendedor externo logado (null se não for vendedor externo)
export function meuVendedorExterno(s: ErpState, usuarioId: string | undefined) {
  if (!usuarioId) return null
  return F.col(s, 'pj_vendedores').find((v) => v.usuarioId === usuarioId) ?? null
}

// Demo: as fotos ficam nesta aba do navegador (no Supabase vão para o bucket "contratos")
const arquivosDemo = new Map<string, Blob>()
const CHAVE_ARQ_DEMO = 'dlg-erp:arquivo-demo:'
async function guardarArquivoDemo(caminho: string, blob: Blob) {
  arquivosDemo.set(caminho, blob)
  try {
    sessionStorage.setItem(CHAVE_ARQ_DEMO + caminho, await blobParaDataURL(blob))
  } catch {
    // sem espaço: fica só na memória
  }
}
async function lerArquivoDemo(caminho: string): Promise<Blob | null> {
  const mem = arquivosDemo.get(caminho)
  if (mem) return mem
  const dataUrl = sessionStorage.getItem(CHAVE_ARQ_DEMO + caminho)
  if (!dataUrl) return null
  const blob = await (await fetch(dataUrl)).blob()
  arquivosDemo.set(caminho, blob)
  return blob
}

// Foto da câmera → JPEG de até 2400 px (nítido para a leitura, bem menor que a foto original)
async function prepararFotoDocumento(arquivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo)
  const escala = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bitmap.width * escala)
  c.height = Math.round(bitmap.height * escala)
  c.getContext('2d')!.drawImage(bitmap, 0, 0, c.width, c.height)
  bitmap.close()
  return new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error('Falha ao preparar a foto'))), 'image/jpeg', 0.9))
}

// Envia as páginas fotografadas no app. Caminho: contratos/externos/<usuário>/<lote>-pN.jpg
export async function enviarPaginasApp(paginas: File[]): Promise<{ caminhos: string[] } | { erro: string }> {
  const usuarioId = lerSessao()?.colaboradorId
  if (!usuarioId) return { erro: 'Sessão expirada. Entre novamente.' }
  const lote = uid()
  const caminhos: string[] = []
  for (const [i, f] of paginas.entries()) {
    let blob: Blob
    try {
      blob = await prepararFotoDocumento(f)
    } catch {
      return { erro: 'Não consegui abrir a foto. Tire de novo.' }
    }
    const caminho = `externos/${usuarioId}/${lote}-p${i + 1}.jpg`
    if (MODO === 'supabase') {
      const { error } = await sb().storage.from('contratos').upload(caminho, blob, { contentType: 'image/jpeg' })
      if (error) return { erro: traduzirErro(error) }
    } else await guardarArquivoDemo(caminho, blob)
    caminhos.push(caminho)
  }
  return { caminhos }
}

// Arquivo guardado (foto/PDF) → Blob, para mostrar e para a leitura automática
export async function baixarArquivoContrato(caminho: string): Promise<Blob | null> {
  if (MODO !== 'supabase') return lerArquivoDemo(caminho)
  const { data, error } = await sb().storage.from('contratos').download(caminho)
  return error ? null : data
}

export async function urlArquivoContrato(caminho: string): Promise<string | null> {
  if (MODO !== 'supabase') {
    const b = await lerArquivoDemo(caminho)
    return b ? URL.createObjectURL(b) : null
  }
  const { data } = await sb().storage.from('contratos').createSignedUrl(caminho, 600)
  return data?.signedUrl ?? null
}

// Grava um registro do app (contrato, venda, documento, devolução) já ligado ao vendedor logado
async function registrarDoApp(nome: string, dados: Record<string, Valor>, sucesso: string): Promise<string | null> {
  const vend = meuVendedorExterno(carregar(), lerSessao()?.colaboradorId)
  if (!vend) return 'Seu login não está ligado a um cadastro de vendedor. Procure o ADM.'
  const campoVendedor = nome === 'vendas_ebooks' ? 'vendedorExternoId' : 'vendedorId'
  const completo = { ...dados, [campoVendedor]: vend.id }
  if (MODO === 'supabase') return gravar(() => sb().from(nome).insert(registroParaBanco(nome, completo)), sucesso)
  mutar((d, ctx) => {
    const criado = F.inserir(d, nome, completo)
    F.APOS_CRIAR[nome]?.(d, criado, ctx)
    F.auditar(d, ctx, 'CRIAR', `${sucesso} (app do vendedor)`, 'operacional')
  })
  avisar(sucesso, 'ok')
  return null
}

export const enviarContratoApp = (d: { escola: string; cidade: string; observacao: string }, paginas: string[]) =>
  registrarDoApp(
    'contratos_escola',
    {
      escola: d.escola.trim().toUpperCase(),
      cidade: d.cidade.trim(),
      uf: '',
      observacao: d.observacao.trim(),
      status: 'Em conferência',
      origem: 'App',
      arquivo: paginas[0] ?? '',
      paginas: JSON.stringify(paginas),
      fichasPrevistas: 0,
      bonificacaoPorFicha: 0,
    },
    'Contrato enviado para Operações.',
  )

// Venda externa: vai para a conferência do Financeiro (os títulos só nascem quando ele confere)
export const registrarVendaExterna = (d: Record<string, Valor>) =>
  registrarDoApp('vendas_ebooks', { ...d, canal: 'Externo', pacote: 'Book', conferencia: 'Aguardando conferência' }, 'Venda enviada ao Financeiro.')

// O vendedor corrige a venda que o Financeiro devolveu e reenvia
export async function reenviarVendaExterna(id: string, d: Record<string, Valor>): Promise<string | null> {
  const dados = { ...d, conferencia: 'Aguardando conferência', conferenciaMotivo: '' }
  if (MODO === 'supabase') return gravar(() => sb().from('vendas_ebooks').update(registroParaBanco('vendas_ebooks', dados)).eq('id', id), 'Venda reenviada ao Financeiro.')
  mutar((s, ctx) => {
    const v = F.col(s, 'vendas_ebooks').find((x) => x.id === id)
    if (!v || v.conferencia !== 'Devolvida') return
    Object.assign(v, dados)
    F.notificar(s, ctx, { setores: ['financeiro', 'adm'], tipo: 'aprovacao', titulo: 'Venda corrigida para conferir', descricao: `${v.responsavel} (${v.escola}) — o vendedor corrigiu e reenviou.`, link: '/financeiro/conferencia' })
    F.auditar(s, ctx, 'EDITAR', `Venda de book reenviada: ${v.responsavel}`, 'financeiro')
  })
  avisar('Venda reenviada ao Financeiro.', 'ok')
  return null
}

// Financeiro: conferir (gera as parcelas) ou devolver ao vendedor com o motivo
export async function conferirVendaBook(id: string, acao: 'conferir' | 'devolver', motivo = ''): Promise<string | null> {
  const ok = acao === 'conferir' ? 'Venda conferida: parcelas geradas.' : 'Venda devolvida ao vendedor.'
  if (MODO === 'supabase') return gravar(() => sb().rpc('conferir_venda_book', { p_id: id, p_acao: acao, p_motivo: motivo || null }), ok)
  let erro: string | null = null
  mutar((s, ctx) => {
    erro = F.conferirVendaBook(s, id, acao, motivo, ctx)
  })
  avisar(erro ?? ok, erro ? 'erro' : 'ok')
  return erro
}

export const enviarDocumentoApp = (d: { tipo: string; escola: string; descricao: string }, paginas: string[]) =>
  registrarDoApp('documentos_externos', { ...d, paginas: JSON.stringify(paginas), status: 'Recebido' }, 'Documento enviado para Operações.')

export const registrarDevolucaoBooks = (d: { escola: string; quantidade: number; observacao: string }) =>
  registrarDoApp('devolucoes_books', { ...d, data: hoje(), status: 'Devolvido' }, 'Devolução registrada.')

// ---------------- Pendências do dia (Controle operacional) ----------------

// Resolvido / Sem sucesso: sai da lista e volta amanhã se o problema continuar • Excluída: sai de vez.
// Vendedor: registra o contato no histórico dele (Resolvido também atualiza o último contato).
// Tarefa: Resolvido conclui a tarefa.
export async function resolverPendencia(
  p: { id: string; area: string; titulo: string; refId?: string },
  acao: 'Resolvido' | 'Sem sucesso' | 'Excluída',
  observacao: string,
): Promise<string | null> {
  const obs = observacao.trim()
  if (acao !== 'Resolvido' && !obs) return 'Escreva a observação.'
  const autor = carregar().colaboradores.find((c) => c.id === lerSessao()?.colaboradorId)?.nome ?? ''
  const hj = hoje()
  if (p.area === 'Vendedores' && p.refId && acao !== 'Excluída') {
    const assunto = `${acao === 'Resolvido' ? 'Contato feito' : 'Contato sem sucesso'}${obs ? `: ${obs}` : ''}`
    const erro = await criarRegistro('historico_contatos', { pessoaId: p.refId, data: hj, assunto, autor }, 'operacional')
    if (erro) return erro
    if (acao === 'Resolvido') {
      const e2 = await atualizarRegistro('pj_vendedores', p.refId, { ultimoContato: hj }, 'operacional')
      if (e2) return e2
    }
  }
  if (p.area === 'Tarefas' && p.refId && acao === 'Resolvido') {
    const erro = await atualizarRegistro('tarefas_operacionais', p.refId, { status: 'Concluída' }, 'operacional')
    if (erro) return erro
  }
  const erro = await criarRegistro(
    'pendencias_resolucoes',
    { pendenciaId: p.id, area: p.area, titulo: p.titulo, acao, observacao: obs, data: hj, voltaEm: acao === 'Excluída' ? '' : addDias(hj, 1), autor },
    'operacional',
  )
  if (!erro) avisar(acao === 'Excluída' ? 'Pendência excluída.' : acao === 'Resolvido' ? 'Pendência resolvida.' : 'Registrado: tenta de novo amanhã.', 'ok')
  return erro
}

// ---------------- Dinheiro de Operações ----------------

// Gasto fixo por dia de viagem de cada carro, a partir do mês informado (os meses anteriores ficam como estavam)
export async function salvarGastoFixoCarros(valores: Record<string, number>, mes: string): Promise<string | null> {
  const s = carregar()
  for (const [id, valor] of Object.entries(valores)) {
    const v = F.col(s, 'veiculos').find((x) => x.id === id)
    if (!v) continue
    const mapa = { ...lerJSON<Record<string, number>>(v.gastoFixoMes, {}), [mes]: Math.max(0, valor) }
    const erro = await atualizarRegistro('veiculos', id, { gastoFixoMes: JSON.stringify(mapa) }, 'operacional')
    if (erro) return erro
  }
  avisar('Gasto fixo dos carros salvo.', 'ok')
  return null
}

// Custo variável por ficha (escola + vendedor), a partir do mês informado — fica nos parâmetros da empresa (ADM/Gerência)
export async function salvarCustoVariavel(valor: number, mes: string): Promise<string | null> {
  const erro = await salvarParametros({ [chaveCustoVariavel(mes)]: Math.max(0, valor) })
  if (!erro && MODO !== 'supabase') avisar('Custo variável por ficha salvo.', 'ok')
  return erro
}

// ---------------- Vendas Rebolo ----------------
// Supabase: funções do banco (SQL 012) garantem as regras; demo: mesmas regras em fluxos.ts

async function acaoRebolo(rpc: string, params: Record<string, unknown>, demo: (d: ErpState, ctx: F.Contexto) => string | null, ok: string): Promise<string | null> {
  if (MODO === 'supabase') return gravar(() => sb().rpc(rpc, params), ok)
  let erro: string | null = null
  mutar((d, ctx) => {
    erro = demo(d, ctx)
  })
  avisar(erro ?? ok, erro ? 'erro' : 'ok')
  return erro
}

// Nova caixa: Padrão (10 álbuns) ou Avulso (1). Só abre com o pacote anterior finalizado.
export async function abrirPacoteRebolo(tipo: 'Padrão' | 'Avulso'): Promise<string | null> {
  const eu = lerSessao()?.colaboradorId
  if (!eu) return 'Sessão expirada.'
  const s = carregar()
  const meus = F.col(s, 'rebolo_pacotes').filter((p) => p.vendedoraId === eu)
  const aberto = meus.find((p) => {
    const fichas = F.col(s, 'rebolo_fichas').filter((f) => f.pacoteId === p.id)
    return !(fichas.length > 0 && fichas.every((f) => ['Vendida', 'Descarte', 'Cancelada'].includes(String(f.situacao))))
  })
  if (aberto) {
    const msg = `Finalize o pacote P${aberto.numero} (todas as fichas vendidas ou em descarte) antes de abrir outro.`
    avisar(msg)
    return msg
  }
  if (MODO === 'supabase') return gravar(() => sb().from('rebolo_pacotes').insert({ tipo, vendedora_id: eu }), `Pacote ${tipo.toLowerCase()} aberto.`)
  mutar((d, ctx) => {
    const numero = Math.max(245, ...F.col(d, 'rebolo_pacotes').map((p) => Number(p.numero) || 0)) + 1
    F.inserir(d, 'rebolo_pacotes', { numero, tipo, vendedoraId: eu, observacao: '' })
    F.auditar(d, ctx, 'CRIAR', `Pacote P${numero} (${tipo}) aberto`, 'rebolo')
  })
  avisar(`Pacote ${tipo.toLowerCase()} aberto.`, 'ok')
  return null
}

export async function salvarFichaRebolo(dados: Record<string, Valor>, id?: string): Promise<string | null> {
  if (id) return atualizarRegistro('rebolo_fichas', id, dados, 'rebolo')
  const s = carregar()
  const pacote = F.col(s, 'rebolo_pacotes').find((p) => p.id === dados.pacoteId)
  if (!pacote) return 'Pacote não encontrado.'
  const capacidade = pacote.tipo === 'Avulso' ? 1 : 10
  if (F.col(s, 'rebolo_fichas').filter((f) => f.pacoteId === pacote.id).length >= capacidade) return `O pacote P${pacote.numero} já tem ${capacidade} ficha(s).`
  const erro = await criarRegistro('rebolo_fichas', { ...dados, vendedoraId: pacote.vendedoraId, situacao: 'Aguardando contato', tentativas: 0 }, 'rebolo')
  if (!erro) avisar('Ficha cadastrada.', 'ok')
  return erro
}

export const registrarContatoRebolo = (fichaId: string, c: { resultado: F.ResultadoContato; observacao: string; motivo?: string; agendadoPara?: string }) =>
  acaoRebolo(
    'registrar_contato_rebolo',
    { p_ficha: fichaId, p_resultado: c.resultado, p_observacao: c.observacao, p_motivo: c.motivo || null, p_agendado: c.agendadoPara || null },
    (d, ctx) => F.registrarContatoRebolo(d, fichaId, c, ctx),
    'Contato registrado.',
  )

export const reabrirFichaRebolo = (fichaId: string) =>
  acaoRebolo('reabrir_ficha_rebolo', { p_ficha: fichaId }, (d, ctx) => F.reabrirFichaRebolo(d, fichaId, ctx), 'Ficha devolvida para a fila.')

export const pedirDescontoRebolo = (fichaId: string, valor: number, motivo: string) =>
  acaoRebolo('pedir_desconto_rebolo', { p_ficha: fichaId, p_valor: valor, p_motivo: motivo }, (d, ctx) => F.pedirDescontoRebolo(d, fichaId, valor, motivo, ctx), 'Desconto enviado para a Gerência aprovar.')

// Fechou negócio: a venda fica "Aguardando contrato" até a vendedora anexar o contrato assinado
export async function fecharVendaRebolo(fichaId: string, dados: Record<string, Valor>): Promise<string | null> {
  const eu = lerSessao()?.colaboradorId
  if (!eu) return 'Sessão expirada.'
  const erro = await criarRegistro('vendas_ebooks', { ...dados, canal: 'Rebolo', fichaReboloId: fichaId, conferencia: 'Aguardando contrato', cobradorId: eu, entrada: 0, data: hoje() }, 'rebolo')
  if (!erro) avisar('Venda registrada. Gere o contrato, colete a assinatura e anexe o PDF assinado.', 'ok')
  return erro
}

export const enviarVendaRebolo = (vendaId: string, contrato: string) =>
  acaoRebolo(
    'atualizar_venda_rebolo',
    { p_venda: vendaId, p_acao: 'enviar', p_contrato: contrato, p_motivo: null },
    (d, ctx) => F.atualizarVendaRebolo(d, vendaId, 'enviar', { contrato }, ctx),
    'Venda enviada ao Financeiro.',
  )

export const cancelarVendaRebolo = (vendaId: string, motivo: string) =>
  acaoRebolo(
    'atualizar_venda_rebolo',
    { p_venda: vendaId, p_acao: 'cancelar', p_contrato: null, p_motivo: motivo },
    (d, ctx) => F.atualizarVendaRebolo(d, vendaId, 'cancelar', { motivo }, ctx),
    'Venda cancelada.',
  )

export const registrarEnvioRebolo = (fichaId: string, rastreio: string) =>
  acaoRebolo('registrar_envio_rebolo', { p_ficha: fichaId, p_rastreio: rastreio }, (d, ctx) => F.registrarEnvioRebolo(d, fichaId, rastreio, ctx), 'Envio registrado.')

// Contrato assinado (PDF ou foto) enviado pelo computador. Caminho: contratos/rebolo/<usuário>/<id>-nome
export async function anexarContratoRebolo(arquivo: File): Promise<{ caminho: string } | { erro: string }> {
  const usuarioId = lerSessao()?.colaboradorId
  if (!usuarioId) return { erro: 'Sessão expirada. Entre novamente.' }
  if (arquivo.size > 10 * 1024 * 1024) return { erro: 'O arquivo precisa ter no máximo 10 MB.' }
  const nome = arquivo.name.normalize('NFD').replace(/[^\w.-]+/g, '_')
  const caminho = `rebolo/${usuarioId}/${uid()}-${nome}`
  if (MODO === 'supabase') {
    const { error } = await sb().storage.from('contratos').upload(caminho, arquivo, { contentType: arquivo.type || undefined })
    if (error) return { erro: traduzirErro(error) }
  } else await guardarArquivoDemo(caminho, arquivo)
  return { caminho }
}

// ---- GPS (só enquanto o app está aberto) ----
export interface PontoGps {
  vendedorId: string
  lat: number
  lng: number
  precisao: number
  origem: 'abertura' | 'periodico' | 'acao'
  descricao: string
  criadoEm: string
}

export async function registrarLocalizacao(p: { lat: number; lng: number; precisao: number; origem: PontoGps['origem']; descricao?: string }): Promise<void> {
  if (MODO === 'supabase') {
    await sb().rpc('registrar_localizacao', { p_lat: p.lat, p_lng: p.lng, p_precisao: p.precisao, p_origem: p.origem, p_descricao: p.descricao ?? null })
    return
  }
  const vend = meuVendedorExterno(carregar(), lerSessao()?.colaboradorId)
  if (!vend) return
  mutar((d) => {
    const lista = (d.colecoes.localizacoes ??= [])
    lista.push({ id: uid(), criadoEm: new Date().toISOString(), vendedorId: vend.id, lat: p.lat, lng: p.lng, precisao: p.precisao, origem: p.origem, descricao: p.descricao ?? '' })
    const limite = new Date(Date.now() - 90 * 86_400_000).toISOString() // histórico de 90 dias
    d.colecoes.localizacoes = lista.filter((x) => String(x.criadoEm) >= limite)
  })
}

export async function aceitarMonitoramentoGps(): Promise<void> {
  if (MODO === 'supabase') {
    await sb().rpc('aceitar_monitoramento_gps')
    agendarRecarga(150)
    return
  }
  const vend = meuVendedorExterno(carregar(), lerSessao()?.colaboradorId)
  if (!vend) return
  mutar((d) => {
    const alvo = F.col(d, 'pj_vendedores').find((x) => x.id === vend.id)
    if (alvo) alvo.gpsAceiteEm = new Date().toISOString()
  })
}

const pontoDoBanco = (l: Record<string, unknown>): PontoGps => ({
  vendedorId: String(l.vendedor_id ?? l.vendedorId),
  lat: Number(l.lat),
  lng: Number(l.lng),
  precisao: Number(l.precisao ?? 0),
  origem: (l.origem as PontoGps['origem']) ?? 'periodico',
  descricao: String(l.descricao ?? ''),
  criadoEm: String(l.created_at ?? l.criadoEm),
})

// Último ponto de cada vendedor + quantos pontos hoje (cards da aba GPS)
export async function buscarUltimasLocalizacoes(): Promise<(PontoGps & { pontosHoje: number })[]> {
  if (MODO === 'supabase') {
    const { data } = await sb().from('vw_ultima_localizacao').select('*')
    return (data ?? []).map((l) => ({ ...pontoDoBanco(l), pontosHoje: Number(l.pontos_hoje ?? 0) }))
  }
  const porVendedor = new Map<string, Registro[]>()
  for (const p of F.col(carregar(), 'localizacoes')) porVendedor.set(String(p.vendedorId), [...(porVendedor.get(String(p.vendedorId)) ?? []), p])
  return [...porVendedor.values()].map((pts) => {
    const ultimo = [...pts].sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))[0]
    return { ...pontoDoBanco(ultimo), pontosHoje: pts.filter((p) => new Date(String(p.criadoEm)).toDateString() === new Date().toDateString()).length }
  })
}

// Rota de um vendedor em um dia (pontos em ordem de horário)
export async function buscarRotaDoDia(vendedorId: string, dia: string): Promise<PontoGps[]> {
  const inicio = new Date(`${dia}T00:00:00`).toISOString()
  const fim = new Date(`${dia}T23:59:59.999`).toISOString()
  if (MODO === 'supabase') {
    const { data } = await sb().from('localizacoes').select('*').eq('vendedor_id', vendedorId).gte('created_at', inicio).lte('created_at', fim).order('created_at').limit(5000)
    return (data ?? []).map(pontoDoBanco)
  }
  return F.col(carregar(), 'localizacoes')
    .filter((p) => p.vendedorId === vendedorId && String(p.criadoEm) >= inicio && String(p.criadoEm) <= fim)
    .sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)))
    .map(pontoDoBanco)
}

// ---- ADM: login do vendedor externo (ligado ao cadastro PJ) ----
export async function criarAcessoVendedor(pjId: string, email: string, senha: string): Promise<string | null> {
  const s = carregar()
  const pj = F.col(s, 'pj_vendedores').find((v) => v.id === pjId)
  if (!pj) return 'Vendedor não encontrado.'
  if (!email.trim()) return 'Informe o e-mail de acesso.'
  if (senha.length < 6) return 'A senha precisa ter ao menos 6 caracteres.'
  const funcao = pj.tipo === 'Books' ? 'Vendedor de books' : 'Vendedor de contrato'
  if (MODO === 'supabase') {
    const { data, error } = await sb().functions.invoke('admin-colaboradores', {
      body: { acao: 'criar', nome: String(pj.nome), email: email.trim(), senha, telefone: String(pj.telefone || ''), funcao, setor: 'externo' },
    })
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
    }
    const id = (data as { id?: string } | null)?.id
    if (msg || !id) {
      const texto = msg ?? 'Não foi possível criar o acesso.'
      avisar(texto)
      return texto
    }
    return gravar(() => sb().from('pj_vendedores').update({ usuario_id: id, email: email.trim() }).eq('id', pjId), 'Acesso ao app criado.')
  }
  if (s.colaboradores.some((c) => c.email.toLowerCase() === email.trim().toLowerCase())) return 'E-mail já cadastrado.'
  mutar((d, ctx) => {
    const id = uid()
    d.colaboradores.push({
      id,
      nome: String(pj.nome),
      email: email.trim(),
      senha,
      cpf: '',
      telefone: String(pj.telefone || ''),
      funcao,
      setor: 'externo',
      perfil: 'COLABORADOR',
      status: 'ATIVO',
      dataAdmissao: hoje(),
      metas: {},
      criadoEm: new Date().toISOString(),
    })
    const alvo = F.col(d, 'pj_vendedores').find((v) => v.id === pjId)
    if (alvo) Object.assign(alvo, { usuarioId: id, email: email.trim() })
    F.auditar(d, ctx, 'CRIAR', `Acesso ao app criado: ${pj.nome} (${funcao})`, 'adm')
  })
  avisar('Acesso ao app criado.', 'ok')
  return null
}

// ---- Leitura do contrato com IA (Edge Function "ler-contrato" → Gemini, cota gratuita) ----
// Devolve os campos crus da IA; 'indisponivel' = sem Supabase/sem chave/função não publicada (usa a leitura do navegador)
export async function lerContratoComIA(
  paginas: string[],
  vendedores: string[],
  modelo: 'escola' | 'venda' = 'escola',
): Promise<{ campos: Record<string, unknown> } | { erro: string; indisponivel?: boolean }> {
  if (MODO !== 'supabase') return { erro: 'Modo demonstração', indisponivel: true }
  const { data, error } = await sb().functions.invoke('ler-contrato', { body: { paginas, vendedores, modelo } })
  if (error) {
    let msg = error.message
    let codigo = ''
    if (error instanceof FunctionsHttpError) {
      try {
        const corpo = (await error.context.json()) as { erro?: string; codigo?: string }
        msg = corpo.erro ?? msg
        codigo = corpo.codigo ?? ''
      } catch {
        // mantém a mensagem genérica
      }
    }
    const naoPublicada = /Failed to send|not found|404/i.test(msg)
    return { erro: naoPublicada ? 'Leitor com IA ainda não publicado no Supabase.' : msg, indisponivel: naoPublicada || codigo === 'nao_configurado' }
  }
  const campos = (data as { campos?: Record<string, unknown> } | null)?.campos
  return campos ? { campos } : { erro: 'A IA não devolveu os campos.' }
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
export async function salvarParametros(novos: Record<string, number>): Promise<string | null> {
  // junta com os já salvos: Configurações e a Tabela de Preços do rebolo gravam no mesmo lugar
  const valores = { ...(carregar().empresa.parametros ?? {}), ...novos }
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
