import crypto from 'node:crypto'

// Gera um link assinado e de curta validade pro worker de download, e redireciona pra ele.
// A chave DL_SECRET fica só aqui (servidor) — nunca vai pro navegador.
const WORKER = 'https://central-gravacao-download.gu-costa-mendes.workers.dev'
const SUPA = process.env.VITE_SUPABASE_URL || 'https://kkvuioyferqbilfwdkqa.supabase.co'
const KEY = process.env.VITE_SUPABASE_ANON_KEY

export default async (req) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const name = url.searchParams.get('name') || 'video.mp4'
  if (!id) return new Response('falta id', { status: 400 })
  const secret = process.env.DL_SECRET
  if (!secret) return new Response('DL_SECRET ausente', { status: 500 })
  // só assina se o id for um bruto CADASTRADO — senão o link viraria acesso aberto a qualquer
  // arquivo do Shared Drive inteiro (a validação de assinatura no worker só prova que passou por aqui).
  const chk = await fetch(`${SUPA}/rest/v1/brutos?select=drive_id&drive_id=eq.${encodeURIComponent(id)}&limit=1`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
  const rows = await chk.json().catch(() => [])
  if (!Array.isArray(rows) || !rows.length) return new Response('não encontrado', { status: 404 })
  const exp = Math.floor(Date.now() / 1000) + 3600 // 1h
  const sig = crypto.createHmac('sha256', secret).update(id + ':' + exp).digest('base64url')
  const dest = `${WORKER}/?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}&exp=${exp}&sig=${sig}`
  return new Response(null, { status: 302, headers: { Location: dest } })
}
