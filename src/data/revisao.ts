import { supabase } from './supabase'
import { getTeam } from './team'

// Fila de revisão: tudo que foi montado automaticamente (cards criados + tomadas ligadas) fica
// marcado como PENDENTE até uma pessoa aprovar. Recusar desfaz tudo: solta as tomadas, devolve o
// nome original dos arquivos no Drive e apaga o card.
export const MARCA_PENDENTE = 'PENDENTE_REVISAO'

export type TomadaProposta = { drive_id: string; nome: string | null; tipo: string | null; seg: number | null; capa: string | null; fala: string | null }
export type Proposta = {
  card_id: string
  titulo: string
  categoria: string | null
  produto: string | null
  semRoteiro: boolean
  tomadas: TomadaProposta[]
}

export async function listarPropostas(): Promise<Proposta[]> {
  if (!supabase) return []
  const { data: cards } = await supabase
    .from('cards')
    .select('id,titulo,categoria,produto,sem_roteiro')
    .eq('team', getTeam())
    .eq('observacoes', MARCA_PENDENTE)
    .eq('arquivado', false)
  if (!cards || !cards.length) return []
  const ids = cards.map((c: { id: string }) => c.id)
  const { data: brutos } = await supabase
    .from('brutos')
    .select('drive_id,nome,tipo,ia_tipo,duracao,card_id,capa_url,transcricao')
    .in('card_id', ids)
  type BrutoRow = { drive_id: string; nome: string | null; tipo: string | null; ia_tipo: string | null; duracao: number | null; card_id: string; capa_url: string | null; transcricao: string | null }
  const porCard = new Map<string, TomadaProposta[]>()
  for (const b of (brutos || []) as BrutoRow[]) {
    const arr = porCard.get(b.card_id) || []
    arr.push({ drive_id: b.drive_id, nome: b.nome, tipo: b.tipo || b.ia_tipo, seg: b.duracao, capa: b.capa_url, fala: b.transcricao })
    porCard.set(b.card_id, arr)
  }
  return (cards as { id: string; titulo: string; categoria: string | null; produto: string | null; sem_roteiro: boolean }[]).map((c) => ({
    card_id: c.id,
    titulo: c.titulo,
    categoria: c.categoria,
    produto: c.produto,
    semRoteiro: !!c.sem_roteiro,
    tomadas: (porCard.get(c.id) || []).sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
  }))
}

/** Aprovar: só tira a marca — o card e as tomadas continuam como estão. */
export async function aprovar(cardId: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('cards').update({ observacoes: null }).eq('id', cardId)
  return !error
}

/** Recusar: solta as tomadas (o arquivo volta ao nome de câmera) e apaga o card. */
export async function recusar(cardId: string, tomadas: TomadaProposta[]): Promise<boolean> {
  if (!supabase) return false
  for (const t of tomadas) {
    await supabase.from('brutos').update({ card_id: null }).eq('drive_id', t.drive_id)
    // com card_id nulo, o batizar devolve o nome_original no Drive
    await fetch('/api/bruto-batizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drive_id: t.drive_id }),
    }).catch(() => {})
  }
  const { error } = await supabase.from('cards').delete().eq('id', cardId)
  return !error
}
