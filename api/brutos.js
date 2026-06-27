import { driveToken, BRUTOS_FOLDER_ID } from './_google.js'

const SUPA = process.env.VITE_SUPABASE_URL || 'https://kkvuioyferqbilfwdkqa.supabase.co'
const bumpThumb = (link) => (link ? (/=s\d+/.test(link) ? link.replace(/=s\d+(-[a-z]+)?/, '=s640') : link + '=s640') : null)

export default async function handler(req, res) {
  try {
    const token = await driveToken()
    const q = `'${BRUTOS_FOLDER_ID}' in parents and trashed=false and mimeType contains 'video'`
    const fields = 'files(id,name,size,createdTime,modifiedTime,hasThumbnail,thumbnailLink,videoMediaMetadata(durationMillis))'
    const url =
      'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
      '&fields=' + encodeURIComponent(fields) +
      '&pageSize=1000&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true'
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
    const data = await r.json()
    if (data.error) return res.status(500).json({ error: data.error.message })
    const videos = (data.files || []).map((f) => ({
      id: f.id,
      nome: f.name,
      mb: f.size ? Math.round(Number(f.size) / 1048576) : null,
      seg: f.videoMediaMetadata && f.videoMediaMetadata.durationMillis
        ? Math.round(Number(f.videoMediaMetadata.durationMillis) / 1000)
        : null,
      // capa: thumbnail do Drive; se o Drive não gerou (raro), usa o jpg derivado do proxy
      thumb: f.hasThumbnail ? bumpThumb(f.thumbnailLink) : `${SUPA}/storage/v1/object/public/proxies/${f.id}.jpg`,
      criado: f.createdTime || f.modifiedTime || null,
    }))
    res.status(200).json({ videos })
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) })
  }
}
