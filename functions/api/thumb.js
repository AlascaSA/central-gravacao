import { googleToken } from './_util.js'

// Proxy da thumb do editado: og:image estável no NOSSO domínio e sempre fresca
// (busca o thumbnailLink atual no Drive via conta de serviço e devolve a imagem).
export async function onRequest({ request, env }) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return new Response('falta id', { status: 400 })
    const token = await googleToken(env)
    const metaR = await fetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=thumbnailLink&supportsAllDrives=true',
      { headers: { Authorization: 'Bearer ' + token } },
    )
    const meta = await metaR.json().catch(() => ({}))
    let link = meta.thumbnailLink
    if (!link) return new Response('sem thumb', { status: 404 })
    link = link.replace(/=s\d+(-c)?$/, '=s720').replace(/=w\d+-h\d+(-[a-z]+)?$/, '=s720')
    const img = await fetch(link)
    if (!img.ok) return new Response('erro thumb ' + img.status, { status: 502 })
    const h = new Headers()
    h.set('Content-Type', img.headers.get('Content-Type') || 'image/jpeg')
    h.set('Cache-Control', 'public, max-age=86400')
    h.set('Access-Control-Allow-Origin', '*')
    return new Response(img.body, { status: 200, headers: h })
  } catch (e) {
    return new Response('erro: ' + ((e && e.message) || e), { status: 500 })
  }
}
