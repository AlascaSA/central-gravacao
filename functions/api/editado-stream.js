import { SUPA_URL, hmacSha256 } from './_util.js'

// Assina uma URL INLINE (player nativo <video>) do PRÓPRIO editado, servida pelo nosso worker.
// Só assina id CADASTRADO em `editados` (senão viraria acesso aberto ao Shared Drive inteiro).
// O worker (worker/index.js) já toca inline com Range/CORS e confere que o arquivo está no Shared Drive.
const WORKER = 'https://central-gravacao-download.gu-costa-mendes.workers.dev'

export async function onRequest({ request, env }) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return Response.json({ error: 'falta id' }, { status: 400 })
    const secret = env.DL_SECRET
    if (!secret) return Response.json({ error: 'DL_SECRET ausente' }, { status: 500 })

    const SUPA = SUPA_URL(env)
    const KEY = env.VITE_SUPABASE_ANON_KEY
    const r = await fetch(`${SUPA}/rest/v1/editados?select=drive_id&drive_id=eq.${encodeURIComponent(id)}&limit=1`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
    const rows = await r.json().catch(() => [])
    if (!Array.isArray(rows) || rows.length === 0) return Response.json({ error: 'não encontrado' }, { status: 404 })

    const exp = Math.floor(Date.now() / 1000) + 6 * 3600 // 6h
    const sig = await hmacSha256(secret, id + ':' + exp + ':inline')
    const url = `${WORKER}/?id=${encodeURIComponent(id)}&exp=${exp}&sig=${sig}&inline=1`
    return Response.json({ url })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
