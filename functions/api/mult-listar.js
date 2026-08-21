import { googleToken } from './_util.js'

// Lista os vídeos de UMA pasta do Drive — a pasta que o editor abriu para
// montar as variações. Só os filhos diretos: subpasta vira ruído aqui.
const SHARED_DRIVE_ID = '0ANh1nYBAOuTbUk9PVA'

export async function onRequest({ request, env }) {
  const pasta = new URL(request.url).searchParams.get('pasta')
  if (!pasta) return Response.json({ error: 'falta pasta' }, { status: 400 })
  try {
    const token = await googleToken(env)
    const q = `'${pasta}' in parents and trashed=false and mimeType contains 'video/'`
    const api = new URL('https://www.googleapis.com/drive/v3/files')
    api.searchParams.set('q', q)
    api.searchParams.set('fields', 'files(id,name,size,mimeType,videoMediaMetadata(durationMillis,width,height))')
    api.searchParams.set('pageSize', '200')
    api.searchParams.set('orderBy', 'name')
    api.searchParams.set('supportsAllDrives', 'true')
    api.searchParams.set('includeItemsFromAllDrives', 'true')
    api.searchParams.set('corpora', 'drive')
    api.searchParams.set('driveId', SHARED_DRIVE_ID)
    const r = await fetch(api, { headers: { Authorization: 'Bearer ' + token } })
    const d = await r.json()
    if (!r.ok) return Response.json({ error: d?.error?.message || 'erro no Drive' }, { status: 500 })
    const videos = (d.files || []).map((f) => ({
      id: f.id,
      nome: f.name,
      mb: f.size ? Math.round(Number(f.size) / 1e6) : null,
      seg: f.videoMediaMetadata?.durationMillis ? Number(f.videoMediaMetadata.durationMillis) / 1000 : null,
      largura: f.videoMediaMetadata?.width ?? null,
      altura: f.videoMediaMetadata?.height ?? null,
    }))
    return Response.json({ pasta, videos })
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
