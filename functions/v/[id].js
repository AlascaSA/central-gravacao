import { SUPA_URL } from '../api/_util.js'

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// /v/<id>: injeta as OG tags do vídeo (título + descrição + thumb) pra o link virar preview
// no ClickUp/Slack/WhatsApp. Serve o MESMO app pro usuário real — só enriquece o <head>.
export async function onRequest({ params, request, env }) {
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const asset = await env.ASSETS.fetch(new URL('/index.html', request.url))

  let v = null
  try {
    const S = SUPA_URL(env)
    const KEY = env.VITE_SUPABASE_ANON_KEY
    const r = await fetch(
      `${S}/rest/v1/editados?select=nome_ia,nome_arquivo,descricao,thumb&drive_id=eq.${encodeURIComponent(id)}&limit=1`,
      { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } },
    )
    const rows = await r.json()
    if (Array.isArray(rows) && rows[0]) v = rows[0]
  } catch {
    /* sem metadados: serve o app puro */
  }
  if (!v) return asset

  const nome = v.nome_ia || v.nome_arquivo || 'Vídeo'
  const desc = v.descricao || 'Vídeo editado — Central de Gravação'
  // og:image sempre aponta pro nosso proxy (busca a thumb fresca no Drive, mesmo se o banco estiver sem)
  const img = new URL('/api/thumb?id=' + encodeURIComponent(id), request.url).toString()
  const url = request.url

  const tags =
    `<meta property="og:type" content="video.other" />` +
    `<meta property="og:site_name" content="Central de Gravação" />` +
    `<meta property="og:title" content="${esc(nome)}" />` +
    `<meta property="og:description" content="${esc(desc)}" />` +
    `<meta property="og:url" content="${esc(url)}" />` +
    `<meta property="og:image" content="${esc(img)}" />` +
    `<meta property="og:image:alt" content="${esc(nome)}" />` +
    `<meta name="twitter:card" content="summary_large_image" />` +
    `<meta name="twitter:title" content="${esc(nome)}" />` +
    `<meta name="twitter:description" content="${esc(desc)}" />` +
    `<meta name="twitter:image" content="${esc(img)}" />`

  return new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(`${nome} — Central de Gravação`) } })
    .on('head', { element(el) { el.append(tags, { html: true }) } })
    .transform(asset)
}
