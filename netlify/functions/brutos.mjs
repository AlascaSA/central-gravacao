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

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// varredura recursiva por níveis (cada nível em paralelo), ignorando "Editando".
// Carrega o contexto de PASTA (mês/dia) pra o vídeo entrar no mês certo, não pela data de upload.
async function listarVideos(token) {
  const videos = new Map() // id -> file (dedupe)
  const visitadas = new Set()
  let nivel = BRUTOS_ROOTS.map((id) => ({ id, mes: null, dia: null }))
  while (nivel.length) {
    const listas = await Promise.all(
      nivel.map((n) => filhos(token, n.id).then((fs) => ({ ctx: n, fs })).catch(() => ({ ctx: n, fs: [] }))),
    )
    const proximo = []
    for (const { ctx, fs } of listas) {
      for (const f of fs) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          if (visitadas.has(f.id) || IGNORAR_PASTAS.test(f.name || '')) continue
          visitadas.add(f.id)
          const nome = (f.name || '').trim()
          let mes = ctx.mes
          let dia = ctx.dia
          const iMes = MESES.findIndex((m) => new RegExp('^' + m + '\\b', 'i').test(nome))
          if (iMes >= 0) mes = MESES[iMes]
          else if (/^\d{1,2}$/.test(nome) || /^dia\s*\d/i.test(nome)) dia = nome.replace(/^dia\s*/i, '').padStart(2, '0')
          proximo.push({ id: f.id, mes, dia })
        } else if ((f.mimeType || '').includes('video')) {
          videos.set(f.id, { ...f, _mes: ctx.mes, _dia: ctx.dia })
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
      .map((f) => {
        const criado = f.createdTime || f.modifiedTime || null
        const ano = criado ? new Date(criado).getFullYear() : new Date().getFullYear()
        return {
          id: f.id,
          nome: f.name,
          mb: f.size ? Math.round(Number(f.size) / 1048576) : null,
          seg: f.videoMediaMetadata && f.videoMediaMetadata.durationMillis
            ? Math.round(Number(f.videoMediaMetadata.durationMillis) / 1000)
            : null,
          thumb: f.hasThumbnail ? bumpThumb(f.thumbnailLink) : `${SUPA}/storage/v1/object/public/proxies/${f.id}.jpg`,
          criado,
          // mês/dia pela PASTA real (não pela data de upload); null = usa a data no front
          mes: f._mes ? `${f._mes} ${ano}` : null,
          dia: f._dia || null,
        }
      })
      .sort((a, b) => (b.criado || '').localeCompare(a.criado || '')) // mais novos primeiro
    return Response.json({ videos })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
