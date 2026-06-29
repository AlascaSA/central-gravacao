import crypto from 'node:crypto'

// Gera um link assinado e de curta validade pro worker de download, e redireciona pra ele.
// A chave DL_SECRET fica só aqui (servidor) — nunca vai pro navegador.
const WORKER = 'https://central-gravacao-download.gu-costa-mendes.workers.dev'

export default async (req) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const name = url.searchParams.get('name') || 'video.mp4'
  if (!id) return new Response('falta id', { status: 400 })
  const secret = process.env.DL_SECRET
  if (!secret) return new Response('DL_SECRET ausente', { status: 500 })
  const exp = Math.floor(Date.now() / 1000) + 3600 // 1h
  const sig = crypto.createHmac('sha256', secret).update(id + ':' + exp).digest('base64url')
  const dest = `${WORKER}/?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}&exp=${exp}&sig=${sig}`
  return new Response(null, { status: 302, headers: { Location: dest } })
}
