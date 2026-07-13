import { supabase } from './supabase'

export interface Editado {
  id: string
  nome: string
  descricao: string | null
  secao: 'video' | 'corte'
  thumb: string | null
  postado: boolean
  postado_em: string | null
  nomeArquivo: string
}

// Lista os editados do banco (preenchido pelo worker/cron).
export async function listarEditados(): Promise<Editado[]> {
  const r = await fetch('/api/editados')
  if (!r.ok) return []
  const d = await r.json().catch(() => ({}))
  return Array.isArray(d.videos) ? (d.videos as Editado[]) : []
}

// Marca/desmarca um vídeo como postado.
export async function marcarPostado(id: string, postado: boolean): Promise<void> {
  if (!supabase) return
  await supabase.from('editados').upsert(
    { drive_id: id, postado, postado_em: postado ? new Date().toISOString() : null },
    { onConflict: 'drive_id' },
  )
}

// Força o sync agora (o mesmo que o cron faz de hora em hora). Devolve quantos novos foram identificados.
const SYNC_URL = 'https://central-gravacao-editados.gu-costa-mendes.workers.dev/'
export async function sincronizarEditados(): Promise<{ novos: number; total: number } | null> {
  try {
    const r = await fetch(SYNC_URL, { method: 'POST' })
    const d = await r.json().catch(() => null)
    return d && typeof d.novos === 'number' ? d : null
  } catch {
    return null
  }
}
