import { supabase } from './supabase'
import { getTeam } from './team'

export interface Link {
  id: string
  titulo: string
  url: string
  grupo: string | null
  criado_em?: string
}

export interface NovoLink {
  titulo: string
  url: string
  grupo: string | null
}

export async function listarLinks(): Promise<Link[]> {
  if (!supabase) return []
  const { data } = await supabase.from('links').select('*').eq('team', getTeam()).order('criado_em', { ascending: true })
  return (data as Link[]) || []
}

export async function criarLink(l: NovoLink): Promise<Link | null> {
  if (!supabase) return null
  const { data } = await supabase.from('links').insert({ ...l, team: getTeam() }).select().single()
  return (data as Link) || null
}

export async function editarLink(id: string, l: NovoLink): Promise<void> {
  if (!supabase) return
  await supabase.from('links').update(l).eq('id', id)
}

export async function deletarLink(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('links').delete().eq('id', id)
}
