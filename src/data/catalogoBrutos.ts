import { supabase } from './supabase'

export type TipoBruto = 'boa' | 'erro' | 'gancho' | 'complemento'

export interface Classificacao {
  drive_id: string
  transcricao: string | null
  ia_tipo: TipoBruto | null
  ia_tema: string | null
  ia_resumo: string | null
  ia_confianca: number | null
  ia_motivo: string | null
  tipo: TipoBruto | null // confirmado pelo humano
  confirmado: boolean
  card_id: string | null // tarefa ligada
}

export interface BrutoLigado {
  drive_id: string
  nome: string | null
  tipo: TipoBruto | null
  ia_tipo: TipoBruto | null
  comentario: string | null
}

// Lê as classificações (proposta da IA + confirmação). Degrada pra {} se a tabela ainda não existe.
export async function listarClassificacoes(): Promise<Record<string, Classificacao>> {
  if (!supabase) return {}
  const { data, error } = await supabase
    .from('brutos')
    .select('drive_id,transcricao,ia_tipo,ia_tema,ia_resumo,ia_confianca,ia_motivo,tipo,confirmado,card_id')
  if (error || !data) return {}
  const map: Record<string, Classificacao> = {}
  for (const r of data) map[(r as Classificacao).drive_id] = r as Classificacao
  return map
}

// Liga (ou desliga, card_id=null) um bruto a uma tarefa do quadro.
export async function ligarBruto(drive_id: string, card_id: string | null, nome?: string): Promise<void> {
  if (!supabase) return
  await supabase.from('brutos').upsert(
    { drive_id, card_id, ...(nome ? { nome } : {}) },
    { onConflict: 'drive_id' },
  )
}

// Brutos ligados a uma tarefa (pra mostrar no card).
export async function listarBrutosDoCard(card_id: string): Promise<BrutoLigado[]> {
  if (!supabase) return []
  const { data } = await supabase.from('brutos').select('drive_id,nome,tipo,ia_tipo,comentario').eq('card_id', card_id)
  return (data as BrutoLigado[]) || []
}

// Comentário numa tomada (bruto).
export async function comentarBruto(drive_id: string, comentario: string): Promise<void> {
  if (!supabase) return
  await supabase.from('brutos').upsert({ drive_id, comentario }, { onConflict: 'drive_id' })
}

// Humano confirma/corrige o tipo. Vira exemplo (few-shot) pras próximas classificações.
export async function confirmarTipo(
  drive_id: string,
  tipo: TipoBruto,
  transcricao: string | null,
  duracao: number | null,
): Promise<void> {
  if (!supabase) return
  await supabase.from('brutos').upsert(
    { drive_id, tipo, confirmado: true, confirmado_em: new Date().toISOString() },
    { onConflict: 'drive_id' },
  )
  await supabase.from('brutos_exemplos').insert({ transcricao, duracao, tipo })
}
