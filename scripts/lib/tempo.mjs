// Horário REAL de gravação de um clipe, lido do próprio arquivo (não é a data de upload do Drive).
// ffprobe lê só o cabeçalho: do Drive vai por pedido parcial, sem baixar o vídeo.
import { execFile } from 'node:child_process'

function sondar(entrada, extra = []) {
  return new Promise((res, rej) => {
    execFile('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', ...extra, entrada], { timeout: 60000 }, (e, out) => {
      if (e) return rej(e)
      try { res(JSON.parse(out).format || {}) } catch (x) { rej(x) }
    })
  })
}

// iPhone: "com.apple.quicktime.creationdate" = início da gravação, com fuso ("2026-09-22T10:21:25-0300").
// Câmera (Sony etc.): "creation_time" em UTC.
function inicioDe(f) {
  const t = f.tags || {}
  const apple = t['com.apple.quicktime.creationdate']
  if (apple) return new Date(apple.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).toISOString()
  if (t.creation_time) return new Date(t.creation_time).toISOString()
  return null
}

/** { inicio: ISO | null, dur: segundos | null, camera: modelo | null } — de arquivo local ou do Drive. */
export async function lerTempo({ arquivo, driveId, token }) {
  const f = arquivo
    ? await sondar(arquivo)
    : await sondar(`https://www.googleapis.com/drive/v3/files/${driveId}?alt=media&supportsAllDrives=true`, ['-headers', 'Authorization: Bearer ' + token + '\r\n'])
  const t = f.tags || {}
  return {
    inicio: inicioDe(f),
    dur: f.duration ? Number(f.duration) : null,
    camera: t['com.apple.quicktime.model'] || t['com.android.model'] || t.model || null,
  }
}
