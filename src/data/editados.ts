import { supabase } from './supabase'
import { getTeam } from './team'

export interface Editado {
  id: string
  nome: string
  descricao: string | null
  secao: 'video' | 'corte'
  thumb: string | null
  autorNome: string | null
  autorFoto: string | null
  cardId: string | null
  cardTitulo: string | null
  revisado: boolean
  postado: boolean
  postado_em: string | null
  nomeArquivo: string
}

// Lista os editados do banco (preenchido pelo worker/cron).
export async function listarEditados(): Promise<Editado[]> {
  if (!getTeam()) return [] // permalink sem time escolhido: lista vazia (o vídeo abre por id, ver buscarEditadoPorId)
  const r = await fetch('/api/editados?team=' + encodeURIComponent(getTeam()))
  if (!r.ok) return []
  const d = await r.json().catch(() => ({}))
  return Array.isArray(d.videos) ? (d.videos as Editado[]) : []
}

// Busca UM editado por id (drive_id), independente de time — pro permalink /v/<id> abrir em qualquer contexto.
export async function buscarEditadoPorId(id: string): Promise<Editado | null> {
  try {
    const r = await fetch('/api/editados?id=' + encodeURIComponent(id))
    if (!r.ok) return null
    const d = await r.json().catch(() => ({}))
    return Array.isArray(d.videos) && d.videos[0] ? (d.videos[0] as Editado) : null
  } catch {
    return null
  }
}

// Marca/desmarca como postado. Devolve true SÓ se o banco confirmou (o front reverte em falha).
// UPDATE (a linha sempre existe): sem risco de apagar nome_ia/descrição num upsert parcial.
export async function marcarPostado(id: string, postado: boolean): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('editados')
    .update({ postado, postado_em: postado ? new Date().toISOString() : null })
    .eq('drive_id', id)
  return !error
}

// Marca um vídeo como revisado (sai de "Em revisão" e vai pra Conteúdo/Cortes). true = confirmado.
export async function marcarRevisado(id: string, revisado: boolean): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('editados').update({ revisado }).eq('drive_id', id)
  return !error
}

// Revisa vários de uma vez (botão "Marcar todos revisados"). true = confirmado.
export async function marcarVariosRevisados(ids: string[]): Promise<boolean> {
  if (!supabase || ids.length === 0) return false
  const { error } = await supabase.from('editados').update({ revisado: true }).in('drive_id', ids)
  return !error
}

// Força o sync agora (o mesmo que o cron faz de hora em hora). Devolve quantos novos foram identificados.
const SYNC_URL = 'https://central-gravacao-editados.gu-costa-mendes.workers.dev/'
export async function sincronizarEditados(): Promise<{ novos: number; total: number; removidos?: number } | null> {
  if (!getTeam()) return null
  try {
    const r = await fetch(SYNC_URL + '?team=' + encodeURIComponent(getTeam()), { method: 'POST' }) // sincroniza só o time ativo
    const d = await r.json().catch(() => null)
    return d && typeof d.novos === 'number' ? d : null
  } catch {
    return null
  }
}

// URL assinada (player nativo <video>) do próprio editado — servida pelo nosso worker, sem Drive.
export async function urlStreamEditado(id: string): Promise<string | null> {
  try {
    const r = await fetch(`/api/editado-stream?id=${encodeURIComponent(id)}`)
    if (!r.ok) return null
    const d = await r.json().catch(() => null)
    return d && d.url ? (d.url as string) : null
  } catch {
    return null
  }
}

// Arquiva o card vinculado quando o editado é aprovado (Finalizado + arquivado). Mão única.
// `.eq('arquivado', false)` = idempotente: card já arquivado não é tocado (não reseta finalizado_em).
export async function arquivarCardVinculado(cardId: string): Promise<void> {
  if (!supabase || !cardId) return
  await supabase.from('cards').update({ arquivado: true, fase: 'Finalizado', finalizado_em: new Date().toISOString() }).eq('id', cardId).eq('arquivado', false)
}

// Editados vinculados a um card (pro CardDetail mostrar o vídeo final). [] se a coluna ainda não existir.
export interface EditadoDoCard {
  id: string
  nome: string
  secao: 'video' | 'corte'
  thumb: string | null
  revisado: boolean
  postado: boolean
}
export async function listarEditadosDoCard(cardId: string): Promise<EditadoDoCard[]> {
  if (!supabase || !cardId) return []
  const { data, error } = await supabase
    .from('editados')
    .select('drive_id,nome_ia,nome_arquivo,secao,thumb,revisado,postado')
    .eq('card_id', cardId)
    .eq('team', getTeam())
  if (error || !data) return []
  return data.map((e: { drive_id: string; nome_ia: string | null; nome_arquivo: string; secao: string | null; thumb: string | null; revisado: boolean; postado: boolean }) => ({
    id: e.drive_id,
    // mesma limpeza da API (functions/api/editados.js): sem IA, o nome do arquivo vale — menos o código
    nome: e.nome_ia || e.nome_arquivo.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/\s*[-–]?\s*((\d{4}|PERP)-[A-Z0-9]{2,8}-(CAP|VND|RMK)-AD\d{1,2}[A-Z]?(-[A-Z]{3})?(-(FEED|STORY))?(-V\d+)?|CONT-\d{4}-S\d+(-[A-Z]{3,5})?(-\d+)?)\s*$/i, '').trim() || e.nome_arquivo,
    secao: (e.secao as 'video' | 'corte') || 'video',
    thumb: e.thumb ?? null,
    revisado: !!e.revisado,
    postado: !!e.postado,
  }))
}
