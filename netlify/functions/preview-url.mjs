import crypto from 'node:crypto'

// Devolve o link assinado (modo inline) da versão leve (proxy) de um bruto, pro player tocar direto.
// Recebe ?id=<drive_id do bruto>, acha o proxy_id no banco e assina ele. A chave DL_SECRET fica só aqui.
const WORKER = 'https://central-gravacao-download.gu-costa-mendes.workers.dev'
const SUPA = process.env.VITE_SUPABASE_URL || 'https://kkvuioyferqbilfwdkqa.supabase.co'
const KEY = process.env.VITE_SUPABASE_ANON_KEY

export default async (req) => {
  try {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return Response.json({ error: 'falta id' }, { status: 400 })
    const secret = process.env.DL_SECRET
    if (!secret) return Response.json({ error: 'DL_SECRET ausente' }, { status: 500 })

    const r = await fetch(`${SUPA}/rest/v1/brutos?select=proxy_id&drive_id=eq.${encodeURIComponent(id)}`, {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
    })
    const rows = await r.json().catch(() => [])
    const proxyId = Array.isArray(rows) && rows[0] ? rows[0].proxy_id : null
    if (!proxyId) return Response.json({ error: 'sem proxy' }, { status: 404 })

    const exp = Math.floor(Date.now() / 1000) + 6 * 3600 // 6h
    const sig = crypto.createHmac('sha256', secret).update(proxyId + ':' + exp + ':inline').digest('base64url')
    const dest = `${WORKER}/?id=${encodeURIComponent(proxyId)}&exp=${exp}&sig=${sig}&inline=1`
    return Response.json({ url: dest })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
