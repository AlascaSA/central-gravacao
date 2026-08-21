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
    if (!r.ok) {
      const msg = d?.error?.message || 'erro no Drive'
      // 404 aqui quase sempre é permissão, não pasta inexistente: a conta de
      // serviço só vê pasta que foi compartilhada com ela.
      if (/not found/i.test(msg)) {
        return Response.json({
          error: 'Não tenho acesso a essa pasta. Compartilhe ela (ou o Drive do time) com ' +
                 'brutos-reader@baixa-gravacoes.iam.gserviceaccount.com como Colaborador, e tente de novo.',
        }, { status: 403 })
      }
      return Response.json({ error: msg }, { status: 500 })
    }
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
