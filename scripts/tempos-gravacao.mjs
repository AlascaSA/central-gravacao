// Lê o HORÁRIO REAL de gravação de cada bruto (metadado do arquivo, não a data de upload do Drive).
// Com ele dá pra pôr dois celulares filmando a mesma gravação numa linha do tempo só, achar os
// clipes que são o mesmo momento em dois ângulos e separar os vídeos pelos intervalos entre takes.
// ffprobe lê só o cabeçalho do arquivo direto do Drive (pedido parcial), sem baixar o vídeo.
// Uso: GOOGLE_SERVICE_ACCOUNT_KEY=... SUPA_SECRET=... node scripts/tempos-gravacao.mjs --pastas <id>,<id> --saida tempos.json
//      node scripts/tempos-gravacao.mjs --ids <driveId>,<driveId>   (teste: só imprime)
import { GoogleAuth } from 'google-auth-library'
import { execFile } from 'node:child_process'
import fs from 'node:fs'

const SUPA = 'https://kkvuioyferqbilfwdkqa.supabase.co'
const SECRET = process.env.SUPA_SECRET
const TEAM = process.env.TEAM || 'jaylton'
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null }
const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
const cli = await new GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/drive.readonly'] }).getClient()
const token = async () => (await cli.getAccessToken()).token

function sondar(id, tok) {
  return new Promise((res, rej) => {
    execFile('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-headers', 'Authorization: Bearer ' + tok + '\r\n',
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`], { timeout: 60000 }, (e, out) => {
      if (e) return rej(e)
      try { res(JSON.parse(out).format) } catch (x) { rej(x) }
    })
  })
}
// iPhone grava "com.apple.quicktime.creationdate" = início da gravação, com fuso ("2026-09-01T10:23:45-0300").
// "creation_time" é UTC e, no iPhone, costuma ser o FIM do arquivo — só serve de reserva.
function inicioDe(f) {
  const t = f.tags || {}
  const apple = t['com.apple.quicktime.creationdate']
  if (apple) return { inicio: new Date(apple.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).toISOString(), fonte: 'apple' }
  if (t.creation_time) return { inicio: new Date(t.creation_time).toISOString(), fonte: 'creation_time' }
  return { inicio: null, fonte: null }
}

let alvos
if (arg('--ids')) alvos = arg('--ids').split(',').map((id) => ({ drive_id: id, nome: id }))
else {
  const pastas = (arg('--pastas') || '').split(',').filter(Boolean)
  if (!pastas.length || !SECRET) { console.error('uso: --pastas <id>,<id> com SUPA_SECRET'); process.exit(1) }
  const r = await fetch(`${SUPA}/rest/v1/brutos?select=drive_id,nome,pasta_id,duracao&team=eq.${TEAM}&pasta_id=in.(${pastas.join(',')})`, { headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET } })
  alvos = await r.json()
}
const saida = {}
let i = 0
const tok = await token()
await Promise.all(Array.from({ length: 6 }, async () => {
  for (;;) {
    const b = alvos[i++]
    if (!b) return
    try {
      const f = await sondar(b.drive_id, tok)
      const { inicio, fonte } = inicioDe(f)
      saida[b.drive_id] = { nome: b.nome, pasta: b.pasta_id || null, inicio, fonte, dur: f.duration ? Number(f.duration) : b.duracao ?? null, modelo: (f.tags || {})['com.apple.quicktime.model'] || null }
      if (arg('--ids')) console.log(b.drive_id, JSON.stringify(f.tags))
    } catch (e) { saida[b.drive_id] = { nome: b.nome, pasta: b.pasta_id || null, inicio: null, erro: String(e.message || e).slice(0, 80) } }
  }
}))
if (arg('--saida')) fs.writeFileSync(arg('--saida'), JSON.stringify(saida, null, 1))
const ok = Object.values(saida).filter((x) => x.inicio).length
console.log(`${ok}/${alvos.length} com horário de gravação`)
