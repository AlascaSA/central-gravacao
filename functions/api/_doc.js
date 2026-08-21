import { googleToken } from './_util.js'

// TEMPORÁRIO — lê um Google Doc como texto usando a conta de serviço (pra casar brutos com roteiros).
// Remover depois de usar.
export async function onRequest({ request, env }) {
  try {
    const u = new URL(request.url)
    const id = u.searchParams.get('id')
    const pasta = u.searchParams.get('pasta')
    const token = await googleToken(env)

    if (pasta) {
      const q = encodeURIComponent(`'${pasta}' in parents and trashed=false`)
      const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size)&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: { Authorization: 'Bearer ' + token } })
      return Response.json(await r.json())
    }
    if (!id) return Response.json({ error: 'falta id' }, { status: 400 })

    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain&supportsAllDrives=true`, { headers: { Authorization: 'Bearer ' + token } })
    if (!r.ok) return new Response(await r.text(), { status: r.status })
    return new Response(await r.text(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
