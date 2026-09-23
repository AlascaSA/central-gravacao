import { supabase } from './supabase'
import { getTeam } from './team'

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
  comentario?: string | null // recado da tomada (sobe pro card ligado)
  grupo_id?: string | null // tomadas unidas: andam juntas pro card
  divisao_id?: string | null // vídeo do projeto a que o take pertence (Vídeo 01, Vídeo 02…)
  gravado_em?: string | null // horário real de gravação, lido do arquivo
  produto: string | null // triagem por produto (independente de card)
  sugestao_titulo: string | null // título curto que a IA gerou (pra proposta de card SR)
  sugestao_rejeitada: boolean | null // humano dispensou a proposta
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
    .select('*') // * tolera a coluna `produto` ainda não existir (não zera as classificações antes do SQL)
    .eq('team', getTeam())
  if (error || !data) return {}
  const map: Record<string, Classificacao> = {}
  for (const r of data) map[(r as Classificacao).drive_id] = r as Classificacao
  return map
}

// Liga (ou desliga, card_id=null) um bruto a uma tarefa do quadro.
export async function ligarBruto(drive_id: string, card_id: string | null, nome?: string): Promise<void> {
  if (!supabase) return
  await supabase.from('brutos').upsert(
    { drive_id, card_id, team: getTeam(), ...(nome ? { nome } : {}) },
    { onConflict: 'drive_id' },
  )
  // ao ligar, o produto já triado no bruto vai junto pra tarefa (se ela ainda não tiver um)
  if (card_id) {
    const { data: b } = await supabase.from('brutos').select('produto').eq('drive_id', drive_id).maybeSingle()
    if (b?.produto) {
      const { data: c } = await supabase.from('cards').select('produto').eq('id', card_id).maybeSingle()
      if (!c?.produto) await supabase.from('cards').update({ produto: b.produto }).eq('id', card_id)
    }
  }
}

// Triagem por produto: marca o produto no bruto E na tarefa ligada (é a mesma peça — o produto
// triado no Catálogo precisa aparecer no card do quadro).
export async function definirProdutoBruto(drive_id: string, produto: string | null): Promise<void> {
  if (!supabase) return
  await supabase.from('brutos').upsert({ drive_id, produto, team: getTeam() }, { onConflict: 'drive_id' })
  const { data } = await supabase.from('brutos').select('card_id').eq('drive_id', drive_id).maybeSingle()
  if (data?.card_id) await supabase.from('cards').update({ produto }).eq('id', data.card_id)
}

// Brutos ligados a uma tarefa (pra mostrar no card).
export async function listarBrutosDoCard(card_id: string): Promise<BrutoLigado[]> {
  if (!supabase) return []
  const { data } = await supabase.from('brutos').select('drive_id,nome,tipo,ia_tipo,comentario').eq('card_id', card_id)
  return (data as BrutoLigado[]) || []
}

// Brutos ligados a VÁRIOS cards (pra baixar em lote).
export async function listarBrutosDeCards(cardIds: string[]): Promise<{ drive_id: string; nome: string | null; card_id: string; capa_url: string | null; mb: number | null }[]> {
  if (!supabase || cardIds.length === 0) return []
  const { data } = await supabase.from('brutos').select('drive_id,nome,card_id,capa_url,mb').in('card_id', cardIds)
  return (data as { drive_id: string; nome: string | null; card_id: string; capa_url: string | null; mb: number | null }[]) || []
}

// Comentário numa tomada (bruto). SOBE PRO CARD: o recado escrito na hora de classificar é
// justamente o que o editor precisa ver, e ele trabalha pelo Quadro, não pelo Catálogo.
// Não sobrescreve recado alheio: se o card já tem outro texto, o novo entra numa linha a mais.
export async function comentarBruto(drive_id: string, comentario: string): Promise<void> {
  if (!supabase) return
  const txt = (comentario || '').trim()
  await supabase.from('brutos').upsert({ drive_id, comentario: txt || null, team: getTeam() }, { onConflict: 'drive_id' })
  const { data: b } = await supabase.from('brutos').select('card_id').eq('drive_id', drive_id).maybeSingle()
  if (!b?.card_id || !txt) return
  const { data: c } = await supabase.from('cards').select('comentario').eq('id', b.card_id).maybeSingle()
  const atual = (c?.comentario || '').trim()
  if (atual.includes(txt)) return // já está lá (reeditou e salvou de novo)
  const novo = atual ? atual + '\n' + txt : txt
  await supabase.from('cards').update({ comentario: novo }).eq('id', b.card_id)
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
    { drive_id, tipo, confirmado: true, confirmado_em: new Date().toISOString(), team: getTeam() },
    { onConflict: 'drive_id' },
  )
  await supabase.from('brutos_exemplos').insert({ transcricao, duracao, tipo, team: getTeam() })
}

// Renomeia o bruto no Drive conforme o card ligado (ou reverte ao desligar). Server-side.
// Devolve o novo nome, ou null se falhou.
export async function batizar(drive_id: string): Promise<string | null> {
  try {
    const r = await fetch('/api/bruto-batizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drive_id }),
    })
    const d = await r.json().catch(() => ({}))
    return r.ok ? (d.nome ?? null) : null
  } catch {
    return null
  }
}

// Rejeita a sugestão de card SR da IA (some do Catálogo).
export async function rejeitarSugestao(drive_id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('brutos').upsert({ drive_id, sugestao_rejeitada: true, team: getTeam() }, { onConflict: 'drive_id' })
}

// ---- GRUPOS DE BRUTOS ----------------------------------------------------------------------
// Três tomadas que são a MESMA peça (o professor cortou no meio, refez o final, gravou o gancho à
// parte) viram um grupo. A partir daí elas andam juntas: ligar uma num card liga todas, e o batismo
// numera as irmãs sozinho (BR-apelido, BR-apelido (2), BR-apelido (3)).
// Depende da coluna `grupo_id` na tabela brutos; sem ela, tudo aqui é silenciosamente inofensivo.

/** Une os brutos num grupo. Se algum já estava num grupo, todos entram nesse (funde em vez de criar outro). */
export async function unirBrutos(ids: string[]): Promise<string | null> {
  if (!supabase || ids.length < 2) return null
  const { data } = await supabase.from('brutos').select('drive_id,grupo_id').in('drive_id', ids)
  const existente = (data || []).map((b: { grupo_id: string | null }) => b.grupo_id).find(Boolean) || null
  const grupo = existente || (crypto.randomUUID ? crypto.randomUUID() : 'g' + Date.now())
  const { error } = await supabase.from('brutos').update({ grupo_id: grupo }).in('drive_id', ids)
  return error ? null : grupo
}

/** Desfaz o grupo inteiro (todos voltam a ser avulsos). */
export async function desunirGrupo(grupoId: string): Promise<boolean> {
  if (!supabase || !grupoId) return false
  const { error } = await supabase.from('brutos').update({ grupo_id: null }).eq('grupo_id', grupoId)
  return !error
}

/** drive_ids que andam junto com este (inclui ele). Sem grupo, devolve só ele. */
export async function irmaosDoGrupo(drive_id: string): Promise<string[]> {
  if (!supabase) return [drive_id]
  const { data: eu } = await supabase.from('brutos').select('grupo_id').eq('drive_id', drive_id).maybeSingle()
  const g = eu?.grupo_id
  if (!g) return [drive_id]
  const { data } = await supabase.from('brutos').select('drive_id').eq('grupo_id', g)
  const ids = (data || []).map((b: { drive_id: string }) => b.drive_id)
  return ids.length ? ids : [drive_id]
}

// ---------- divisões: os vídeos do projeto dentro de uma gravação ----------
// A IA divide cada gravação em vídeos (todos os takes de cada um, bons e ruins); o nome é da pessoa.
export interface Divisao {
  id: string
  nome: string
  ordem: number | null
}

/** Divisões do time. [] enquanto a tabela não existir (o Catálogo cai nas subpastas, como antes). */
export async function listarDivisoes(): Promise<Divisao[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('divisoes').select('id,nome,ordem').eq('team', getTeam())
  if (error || !data) return []
  return data as Divisao[]
}

export async function renomearDivisao(id: string, nome: string): Promise<boolean> {
  if (!supabase || !id || !nome.trim()) return false
  const { error } = await supabase.from('divisoes').update({ nome: nome.trim() }).eq('id', id)
  return !error
}

/** Passa o take pra outro vídeo do projeto (a IA dividiu errado). */
export async function moverParaDivisao(driveId: string, divisaoId: string): Promise<boolean> {
  if (!supabase || !driveId || !divisaoId) return false
  const { error } = await supabase.from('brutos').update({ divisao_id: divisaoId }).eq('drive_id', driveId)
  return !error
}

/** Junta dois vídeos do projeto: os takes de `de` passam pra `para` e a divisão `de` some. */
export async function juntarDivisao(de: string, para: string): Promise<boolean> {
  if (!supabase || !de || !para || de === para) return false
  const { error } = await supabase.from('brutos').update({ divisao_id: para }).eq('divisao_id', de)
  if (error) return false
  await supabase.from('divisoes').delete().eq('id', de)
  return true
}

/** Cria um vídeo do projeto vazio (a pessoa arrasta os takes pra ele). */
export async function criarDivisao(nome: string, ordem: number): Promise<Divisao | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('divisoes').insert({ team: getTeam(), nome, ordem }).select('id,nome,ordem').single()
  return error || !data ? null : (data as Divisao)
}

/** Passa vários takes pra um vídeo; vídeo que ficou sem nenhum take é apagado. */
export async function moverVariosParaDivisao(driveIds: string[], para: string, origens: string[]): Promise<boolean> {
  if (!supabase || !driveIds.length || !para) return false
  const { error } = await supabase.from('brutos').update({ divisao_id: para }).in('drive_id', driveIds)
  if (error) return false
  for (const o of origens) {
    if (o === para) continue
    const { count } = await supabase.from('brutos').select('drive_id', { count: 'exact', head: true }).eq('divisao_id', o)
    if (count === 0) await supabase.from('divisoes').delete().eq('id', o)
  }
  return true
}
