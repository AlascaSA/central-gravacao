import { SUPA_URL, hmacSha256 } from './_util.js'

// Assina um link de download de curta validade e redireciona pro worker.
// Só assina se o id for um bruto CADASTRADO (senão viraria acesso aberto ao Shared Drive inteiro).
const WORKER = 'https://central-gravacao-download.gu-costa-mendes.workers.dev'

export async function onRequest({ request, env }) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const name = url.searchParams.get('name') || 'video.mp4'
  if (!id) return new Response('falta id', { status: 400 })
  const secret = env.DL_SECRET
  if (!secret) return new Response('DL_SECRET ausente', { status: 500 })

  const SUPA = SUPA_URL(env)
  const KEY = env.VITE_SUPABASE_ANON_KEY
  const chk = await fetch(`${SUPA}/rest/v1/brutos?select=drive_id&drive_id=eq.${encodeURIComponent(id)}&limit=1`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
  const rows = await chk.json().catch(() => [])
  if (!Array.isArray(rows) || !rows.length) return new Response('não encontrado', { status: 404 })

  const exp = Math.floor(Date.now() / 1000) + 3600 // 1h
  const sig = await hmacSha256(secret, id + ':' + exp)
  const dest = `${WORKER}/?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}&exp=${exp}&sig=${sig}`
  return new Response(null, { status: 302, headers: { Location: dest } })
}
