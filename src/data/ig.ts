import { supabase } from './supabase'
import { getTeam } from './team'

/**
 * Posts do Instagram do especialista (tabela ig_posts).
 * Quem alimenta é o coletor local (viralizador/perfil/coletar.py + subir.py) —
 * aqui só lemos, marcamos "virou anúncio" e cruzamos com os vídeos editados.
 */
export interface PostIG {
  code: string
  postadoEm: string
  tipo: 'foto' | 'video' | 'carrossel'
  legenda: string
  views: number
  viewsIg: number
  viewsFb: number
  curtidas: number
  comentarios: number
  duracao: number | null
  thumb: string | null
  url: string
  audioTipo: 'original' | 'musica' | null
  tema: string | null
  assunto: string | null
  formato: string | null
  venda: boolean
  /** Vídeo editado correspondente na Central (vem do cruzamento por duração). */
  editadoDriveId: string | null
  editadoNome: string | null
  anuncio: boolean
  anuncioCardId: string | null
  atualizadoEm: string | null
}

interface LinhaIG {
  code: string
  postado_em: string
  tipo: string | null
  legenda: string | null
  views: number | null
  views_ig: number | null
  views_fb: number | null
  curtidas: number | null
  comentarios: number | null
  duracao: number | null
  thumb: string | null
  url: string | null
  audio_tipo: string | null
  tema: string | null
  assunto: string | null
  formato: string | null
  venda: boolean | null
  editado_drive_id: string | null
  editado_nome: string | null
  anuncio: boolean | null
  anuncio_card_id: string | null
  atualizado_em: string | null
}

const COLUNAS =
  'code,postado_em,tipo,legenda,views,views_ig,views_fb,curtidas,comentarios,duracao,thumb,url,audio_tipo,tema,assunto,formato,venda,editado_drive_id,editado_nome,anuncio,anuncio_card_id,atualizado_em'

function converter(l: LinhaIG): PostIG {
  return {
    code: l.code,
    postadoEm: l.postado_em,
    tipo: (l.tipo as PostIG['tipo']) || 'video',
    legenda: l.legenda || '',
    views: l.views || 0,
    viewsIg: l.views_ig || 0,
    viewsFb: l.views_fb || 0,
    curtidas: l.curtidas || 0,
    comentarios: l.comentarios || 0,
    duracao: l.duracao,
    thumb: l.thumb,
    url: l.url || `https://www.instagram.com/p/${l.code}/`,
    audioTipo: (l.audio_tipo as 'original' | 'musica' | null) ?? null,
    tema: l.tema,
    assunto: l.assunto,
    formato: l.formato,
    venda: !!l.venda,
    editadoDriveId: l.editado_drive_id,
    editadoNome: l.editado_nome,
    anuncio: !!l.anuncio,
    anuncioCardId: l.anuncio_card_id,
    atualizadoEm: l.atualizado_em,
  }
}

/** Todos os VÍDEOS do perfil (foto e carrossel ficam de fora: o dash é de reels). */
export async function listarPostsIG(): Promise<PostIG[]> {
  if (!supabase || !getTeam()) return []
  const linhas: PostIG[] = []
  // PostgREST devolve no máximo 1000 por vez — pagina até acabar.
  for (let pagina = 0; pagina < 12; pagina++) {
    const { data, error } = await supabase
      .from('ig_posts')
      .select(COLUNAS)
      .eq('team', getTeam())
      .eq('tipo', 'video')
      .order('postado_em', { ascending: false })
      .range(pagina * 1000, pagina * 1000 + 999)
    if (error || !data) break
    linhas.push(...(data as LinhaIG[]).map(converter))
    if (data.length < 1000) break
  }
  return linhas
}

/** Marca (ou desmarca) que o vídeo virou anúncio, guardando o card criado. */
export async function marcarAnuncio(code: string, cardId: string | null): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('ig_posts')
    .update({ anuncio: !!cardId, anuncio_card_id: cardId })
    .eq('code', code)
  return !error
}

/* ---------------------------------------------------------- atualização */

export interface EstadoSync {
  status: 'ocioso' | 'pedido' | 'rodando' | 'erro'
  mensagem: string | null
  rodouEm: string | null
  pedidoEm: string | null
  posts: number | null
}

/** Estado da coleta — quem roda de fato é o agendador na máquina da produção. */
export async function lerSync(): Promise<EstadoSync | null> {
  if (!supabase || !getTeam()) return null
  const { data, error } = await supabase
    .from('ig_sync')
    .select('status,mensagem,rodou_em,pedido_em,posts')
    .eq('team', getTeam())
    .maybeSingle()
  if (error || !data) return null
  const d = data as { status: string; mensagem: string | null; rodou_em: string | null; pedido_em: string | null; posts: number | null }
  return {
    status: (d.status as EstadoSync['status']) || 'ocioso',
    mensagem: d.mensagem,
    rodouEm: d.rodou_em,
    pedidoEm: d.pedido_em,
    posts: d.posts,
  }
}

/** Deixa o pedido registrado; o agendador pega na próxima checagem (a cada 10 min). */
export async function pedirAtualizacao(): Promise<boolean> {
  if (!supabase || !getTeam()) return false
  const { error } = await supabase
    .from('ig_sync')
    .update({ status: 'pedido', pedido_em: new Date().toISOString(), mensagem: 'na fila' })
    .eq('team', getTeam())
  return !error
}
