import { Readable } from 'stream'
import { driveToken } from './_google.js'

// Stream do vídeo do Drive (via conta de serviço), em PARTES pra caber nos limites da serverless.
export const config = { maxDuration: 60 }
// Pedaço maior = menos round-trips = menos engasgo no 4K (o material é ~60 Mbps).
// O download completo já passa por aqui via stream, então blocos grandes são seguros.
const CHUNK = 8 * 1024 * 1024 // 8MB por resposta

export default async function handler(req, res) {
  try {
    const id = req.query.id
    if (!id) {
      res.status(400).end('missing id')
      return
    }
    const token = await driveToken()
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`

    // download direto
    if (req.query.download) {
      const r = await fetch(driveUrl, { headers: { Authorization: 'Bearer ' + token } })
      if (!r.ok || !r.body) {
        res.status(r.status || 500).end('erro')
        return
      }
      const nome = String(req.query.nome || 'video.mp4').replace(/[\r\n"]/g, '')
      res.statusCode = 200
      res.setHeader('Content-Type', r.headers.get('content-type') || 'video/mp4')
      const cl = r.headers.get('content-length')
      if (cl) res.setHeader('Content-Length', cl)
      res.setHeader('Content-Disposition', `attachment; filename="${nome}"`)
      Readable.fromWeb(r.body).pipe(res)
      return
    }

    // streaming com Range limitado a CHUNK
    let start = 0
    let endReq = null
    const range = req.headers.range
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range)
      if (m) {
        start = parseInt(m[1], 10)
        if (m[2]) endReq = parseInt(m[2], 10)
      }
    }
    const end = endReq != null ? Math.min(endReq, start + CHUNK - 1) : start + CHUNK - 1

    const r = await fetch(driveUrl, {
      headers: { Authorization: 'Bearer ' + token, Range: `bytes=${start}-${end}` },
    })
    if (!r.body) {
      res.status(r.status || 500).end('sem corpo')
      return
    }
    res.statusCode = r.status // 206 esperado
    res.setHeader('Content-Type', r.headers.get('content-type') || 'video/mp4')
    res.setHeader('Accept-Ranges', 'bytes')
    const cr = r.headers.get('content-range')
    if (cr) res.setHeader('Content-Range', cr)
    const cl = r.headers.get('content-length')
    if (cl) res.setHeader('Content-Length', cl)
    res.setHeader('Cache-Control', 'private, max-age=600')
    Readable.fromWeb(r.body).pipe(res)
  } catch (e) {
    res.status(500).end(String((e && e.message) || e))
  }
}
