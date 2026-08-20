// Lista os vídeos editados (tabela `editados`, preenchida pelo pipeline) pras abas "Para postar"/"Postados".
const SUPA = process.env.VITE_SUPABASE_URL || 'https://kkvuioyferqbilfwdkqa.supabase.co'
const KEY = process.env.VITE_SUPABASE_ANON_KEY

// O Renomeador já escreve o apelido de gente na frente do arquivo e o código de campanha no fim
// ("poderes do inventariante CONT-2608-S3-REEL.mp4"). Quando a IA não nomeia — cota da Groq estourada,
// por exemplo — o card mostrava o nome cru com o código junto. Aqui o código sai e sobra o apelido,
// sem depender de IA nenhuma. Mesmo padrão que o Renomeador usa pra reconhecer os nomes dele.
const RE_CODIGO = /\s*[-–]?\s*((\d{4}|PERP)-[A-Z0-9]{2,8}-(CAP|VND|RMK)-AD\d{1,2}[A-Z]?(-[A-Z]{3})?(-(FEED|STORY))?(-V\d+)?|CONT-\d{4}-S\d+(-[A-Z]{3,5})?(-\d+)?)\s*$/i
export function limparNome(arq) {
  const semExt = String(arq || '').replace(/\.[a-z0-9]{2,4}$/i, '')
  const limpo = semExt.replace(RE_CODIGO, '').replace(/\s+/g, ' ').trim()
  return limpo || semExt // se o nome era SÓ o código, melhor mostrar o original que nada
}

export default async (req) => {
  try {
    const params = new URL(req.url).searchParams
    const id = params.get('id')
    const team = params.get('team') || 'jaylton'
    // ?id=<drive_id>: permalink /v/<id> — por chave única, independe de time (abre o vídeo em qualquer contexto).
    // senão, lista escopada por time. select=* pra tolerar colunas novas ainda não existirem.
    const filtro = id ? `drive_id=eq.${encodeURIComponent(id)}` : `team=eq.${encodeURIComponent(team)}`
    const url = `${SUPA}/rest/v1/editados?select=*&${filtro}&order=criado.desc.nullslast`
    const r = await fetch(url, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
    const rows = await r.json()
    if (!Array.isArray(rows)) return Response.json({ error: (rows && rows.message) || 'erro' }, { status: 500 })
    const videos = rows.map((e) => ({
      id: e.drive_id,
      nome: e.nome_ia || limparNome(e.nome_arquivo),
      descricao: e.descricao ?? null,
      secao: e.secao || 'video',
      thumb: e.thumb ?? null,
      autorNome: e.autor_nome ?? null,
      autorFoto: e.autor_foto ?? null,
      cardId: e.card_id ?? null,
      cardTitulo: e.card_titulo ?? null,
      revisado: !!e.revisado,
      postado: !!e.postado,
      postado_em: e.postado_em ?? null,
      nomeArquivo: e.nome_arquivo,
    }))
    return Response.json({ videos })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
