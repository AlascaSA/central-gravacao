import { googleToken } from './_util.js'

// Entrega o conteúdo de um vídeo para o navegador montar a peça.
// Só libera arquivo que esteja DENTRO da pasta informada — sem isso, o
// endpoint viraria acesso aberto ao Shared Drive inteiro.
export async function onRequest({ request, env }) {
  const u = new URL(request.url)
  const id = u.searchParams.get('id')
  const pasta = u.searchParams.get('pasta')
  if (!id || !pasta) return new Response('falta id ou pasta', { status: 400 })
  try {
    const token = await googleToken(env)
    const meta = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?fields=parents,name,size&supportsAllDrives=true`,
      { headers: { Authorization: 'Bearer ' + token } })
    const m = await meta.json()
    if (!meta.ok) return new Response('arquivo não encontrado', { status: 404 })
    if (!(m.parents || []).includes(pasta)) {
      return new Response('esse arquivo não está na pasta informada', { status: 403 })
    }
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: 'Bearer ' + token } })
    if (!r.ok) return new Response('falha ao ler o arquivo', { status: 502 })
    const h = { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, max-age=3600' }
    if (m.size) h['Content-Length'] = String(m.size)
    return new Response(r.body, { headers: h })
  } catch (e) {
    return new Response(String(e?.message || e), { status: 500 })
  }
}
