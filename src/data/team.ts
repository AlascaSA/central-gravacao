import { supabase } from './supabase'

// Time (professor) ativo. Fonte central do escopo: todo listar filtra por getTeam() e todo criar grava getTeam().
export interface Time {
  id: string
  nome: string
  cor: string | null
  brutosFolderId: string | null
  editadosFolderId: string | null
}

const KEY = 'time_ativo'
function daUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('t')
  } catch {
    return null
  }
}

// SEM default: sem time escolhido (''), o app mostra a tela de escolha do especialista antes de entrar.
let ativo = daUrl() || localStorage.getItem(KEY) || ''
const NOME_KEY = 'time_nome'
let nomeAtivo: string | null = (() => { try { return localStorage.getItem(NOME_KEY) } catch { return null } })()

export function getTeam(): string {
  return ativo
}

// true quando um especialista já foi escolhido (senão, App renderiza a tela de escolha).
export function temTime(): boolean {
  return !!ativo
}

// Sai do time ativo e volta pra tela de escolha (limpa a escolha e recarrega).
export function sairDoTime() {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(NOME_KEY)
  } catch {
    /* ignore */
  }
  const u = new URL(window.location.href)
  u.searchParams.delete('t')
  u.pathname = '/'
  window.location.href = u.toString()
}

// Nome de exibição do time ativo (sync). Cai no id capitalizado até o listarTimes() confirmar.
export function getTeamNome(): string {
  if (!ativo) return ''
  return nomeAtivo || ativo.charAt(0).toUpperCase() + ativo.slice(1)
}

// A fase "para Jaylton gravar" é um valor interno compartilhado; na tela mostra o nome do time ativo.
export function labelFase(fase: string): string {
  return fase.replace(/Jaylton/gi, getTeamNome())
}

// Troca o time: persiste e recarrega a página no time novo (toda tela refaz as buscas escopadas).
export function setTeam(id: string) {
  if (id === ativo) return
  ativo = id
  try {
    localStorage.setItem(KEY, id)
    localStorage.removeItem(NOME_KEY) // limpa o nome antigo; getTeamNome cai no id capitalizado até o listarTimes confirmar
  } catch {
    /* ignore */
  }
  const u = new URL(window.location.href)
  u.searchParams.set('t', id)
  window.location.href = u.toString()
}

// Lista os times (pro seletor). Degrada pro Jaylton se o Supabase não estiver configurado.
export async function listarTimes(): Promise<Time[]> {
  if (!supabase) return [{ id: 'jaylton', nome: 'Jaylton', cor: '#14a8f5', brutosFolderId: null, editadosFolderId: null }]
  const { data, error } = await supabase
    .from('teams')
    .select('id,nome,cor,brutos_folder_id,editados_folder_id,ordem,ativo')
    .eq('ativo', true)
    .order('ordem')
  if (error || !data) return [{ id: 'jaylton', nome: 'Jaylton', cor: '#14a8f5', brutosFolderId: null, editadosFolderId: null }]
  const at = data.find((t: { id: string }) => t.id === ativo)
  if (at) { nomeAtivo = at.nome; try { localStorage.setItem(NOME_KEY, at.nome) } catch { /* ignore */ } }
  return data.map((t: { id: string; nome: string; cor: string | null; brutos_folder_id: string | null; editados_folder_id: string | null }) => ({
    id: t.id,
    nome: t.nome,
    cor: t.cor,
    brutosFolderId: t.brutos_folder_id,
    editadosFolderId: t.editados_folder_id,
  }))
}
