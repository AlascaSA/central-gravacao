import { SUPA_URL } from './_util.js'

// Lista os vídeos editados (tabela `editados`, preenchida pelo pipeline) pras abas "Para postar"/"Postados".
export async function onRequest({ env }) {
  try {
    const S = SUPA_URL(env)
    const KEY = env.VITE_SUPABASE_ANON_KEY
    const url = `${S}/rest/v1/editados?select=drive_id,nome_arquivo,nome_ia,descricao,secao,thumb,postado,postado_em,criado&order=criado.desc.nullslast`
    const r = await fetch(url, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
    const rows = await r.json()
    if (!Array.isArray(rows)) return Response.json({ error: (rows && rows.message) || 'erro' }, { status: 500 })
    const videos = rows.map((e) => ({
      id: e.drive_id,
      nome: e.nome_ia || e.nome_arquivo,
      descricao: e.descricao ?? null,
      secao: e.secao || 'video',
      thumb: e.thumb ?? null,
      postado: !!e.postado,
      postado_em: e.postado_em ?? null,
      nomeArquivo: e.nome_arquivo,
    }))
    return Response.json({ videos })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
