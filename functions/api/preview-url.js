import { SUPA_URL, hmacSha256 } from './_util.js'

// Devolve o link assinado (modo inline) da versão leve (proxy) de um bruto, pro player tocar direto.
const WORKER = 'https://central-gravacao-download.gu-costa-mendes.workers.dev'

export async function onRequest({ request, env }) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return Response.json({ error: 'falta id' }, { status: 400 })
    const secret = env.DL_SECRET
    if (!secret) return Response.json({ error: 'DL_SECRET ausente' }, { status: 500 })

    const SUPA = SUPA_URL(env)
    const KEY = env.VITE_SUPABASE_ANON_KEY
    const r = await fetch(`${SUPA}/rest/v1/brutos?select=proxy_id&drive_id=eq.${encodeURIComponent(id)}`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
    const rows = await r.json().catch(() => [])
    const proxyId = Array.isArray(rows) && rows[0] ? rows[0].proxy_id : null
    if (!proxyId) return Response.json({ error: 'sem proxy' }, { status: 404 })

    const exp = Math.floor(Date.now() / 1000) + 6 * 3600 // 6h
    const sig = await hmacSha256(secret, proxyId + ':' + exp + ':inline')
    const dest = `${WORKER}/?id=${encodeURIComponent(proxyId)}&exp=${exp}&sig=${sig}&inline=1`
    return Response.json({ url: dest })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
