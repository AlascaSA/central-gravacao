import { driveToken, BRUTOS_ROOTS, IGNORAR_PASTAS } from './_google.mjs'

const SUPA = process.env.VITE_SUPABASE_URL || 'https://kkvuioyferqbilfwdkqa.supabase.co'
const bumpThumb = (link) => (link ? (/=s\d+/.test(link) ? link.replace(/=s\d+(-[a-z]+)?/, '=s640') : link + '=s640') : null)
const FIELDS =
  'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,hasThumbnail,thumbnailLink,videoMediaMetadata(durationMillis))'

// filhos diretos de uma pasta (com paginação)
async function filhos(token, fid) {
  const itens = []
  let page = null
  do {
    const q = `'${fid}' in parents and trashed=false`
    const url =
      'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
      '&fields=' + encodeURIComponent(FIELDS) +
      '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true' +
      (page ? '&pageToken=' + page : '')
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
    const d = await r.json()
    if (d.error) throw new Error(d.error.message)
    itens.push(...(d.files || []))
    page = d.nextPageToken
  } while (page)
  return itens
}

// varredura recursiva por níveis (cada nível em paralelo), ignorando "Editando"
async function listarVideos(token) {
  const videos = new Map() // id -> file (dedupe)
  let nivel = BRUTOS_ROOTS.slice()
  const visitadas = new Set()
  while (nivel.length) {
    const listas = await Promise.all(nivel.map((fid) => filhos(token, fid).catch(() => [])))
    const proximo = []
    for (const lista of listas) {
      for (const f of lista) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          if (!visitadas.has(f.id) && !IGNORAR_PASTAS.test(f.name || '')) {
            visitadas.add(f.id)
            proximo.push(f.id)
          }
        } else if ((f.mimeType || '').includes('video')) {
          videos.set(f.id, f)
        }
      }
    }
    nivel = proximo
  }
  return [...videos.values()]
}

export default async () => {
  try {
    const token = await driveToken()
    const files = await listarVideos(token)
    const videos = files
      .map((f) => ({
        id: f.id,
        nome: f.name,
        mb: f.size ? Math.round(Number(f.size) / 1048576) : null,
        seg: f.videoMediaMetadata && f.videoMediaMetadata.durationMillis
          ? Math.round(Number(f.videoMediaMetadata.durationMillis) / 1000)
          : null,
        thumb: f.hasThumbnail ? bumpThumb(f.thumbnailLink) : `${SUPA}/storage/v1/object/public/proxies/${f.id}.jpg`,
        criado: f.createdTime || f.modifiedTime || null,
      }))
      .sort((a, b) => (b.criado || '').localeCompare(a.criado || '')) // mais novos primeiro
    return Response.json({ videos })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
