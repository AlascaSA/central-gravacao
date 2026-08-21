import { SUPA_URL, hmacSha256 } from './_util.js'

// Assina um link de PACOTE (.tar) com vários vídeos e redireciona pro worker.
// Um download só = funciona em qualquer navegador (o Safari só bloqueia disparo múltiplo, não um arquivo).
// Só assina ids que estão cadastrados (senão viraria acesso aberto ao Shared Drive inteiro).
const WORKER = 'https://central-gravacao-download.gu-costa-mendes.workers.dev'
const MAX = 25 // teto de sanidade por pacote

export async function onRequest({ request, env }) {
  const url = new URL(request.url)
  const ids = (url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean)
  const name = url.searchParams.get('name') || 'videos.tar'
  if (ids.length === 0) return new Response('falta ids', { status: 400 })
  if (ids.length > MAX) return new Response('pacote grande demais', { status: 400 })
  const secret = env.DL_SECRET
  if (!secret) return new Response('DL_SECRET ausente', { status: 500 })

  const SUPA = SUPA_URL(env)
  const KEY = env.VITE_SUPABASE_ANON_KEY
  // valida TODOS de uma vez (duas consultas, não N)
  const lista = ids.map((i) => '"' + i + '"').join(',')
  const cadastrados = new Set()
  for (const t of ['brutos', 'editados']) {
    const r = await fetch(`${SUPA}/rest/v1/${t}?select=drive_id&drive_id=in.(${lista})`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
    const rows = await r.json().catch(() => [])
    if (Array.isArray(rows)) for (const x of rows) cadastrados.add(x.drive_id)
  }
  const faltando = ids.filter((i) => !cadastrados.has(i))
  if (faltando.length) return new Response('não encontrado', { status: 404 })

  const exp = Math.floor(Date.now() / 1000) + 3600 // 1h
  const sig = await hmacSha256(secret, ids.join(',') + ':' + exp + ':tar')
  const dest = `${WORKER}/?ids=${encodeURIComponent(ids.join(','))}&name=${encodeURIComponent(name)}&exp=${exp}&sig=${sig}`
  return new Response(null, { status: 302, headers: { Location: dest } })
}
