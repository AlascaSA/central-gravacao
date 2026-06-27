// Gera proxies leves (1080p H.264 + AAC, faststart) dos brutos do Drive e sobe pro Supabase Storage.
// Uso: node scripts/gerar-proxies.mjs [idDoArquivo]   (sem arg = processa todos os que faltam)
import { GoogleAuth } from 'google-auth-library'
import { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const KEY_PATH = '/Users/gcosta/Downloads/baixa-gravacoes-04ae892ee0e9.json'
const FOLDER = '1Fkdt2hYQQ6K8DJyvDy1tliCpYDhS1Qil'
const SUPA = 'https://kkvuioyferqbilfwdkqa.supabase.co'
const SECRET = process.env.SUPA_SECRET
const BUCKET = 'proxies'
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'proxies-'))

if (!SECRET) { console.error('faltou SUPA_SECRET no env'); process.exit(1) }

// chave da conta de serviço: ENV (nuvem) ou arquivo local
const KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
  : JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'))
const auth = new GoogleAuth({ credentials: KEY, scopes: ['https://www.googleapis.com/auth/drive.readonly'] })
const client = await auth.getClient()
const driveToken = async () => (await client.getAccessToken()).token

async function listarBrutos() {
  const token = await driveToken()
  const q = `'${FOLDER}' in parents and trashed=false and mimeType contains 'video'`
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,name,size)')}&pageSize=1000&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true`
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
  const d = await r.json()
  return d.files || []
}

async function jaExistentes() {
  const r = await fetch(`${SUPA}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + SECRET, apikey: SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 1000 }),
  })
  const d = await r.json()
  return new Set(Array.isArray(d) ? d.map((o) => o.name) : [])
}

function baixar(id, dest) {
  return driveToken().then(async (token) => {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: 'Bearer ' + token } })
    if (!r.ok || !r.body) throw new Error('download ' + r.status)
    await new Promise((res, rej) => {
      const ws = fs.createWriteStream(dest)
      Readable.fromWeb(r.body).pipe(ws).on('finish', res).on('error', rej)
    })
  })
}

// encoder de vídeo: hardware no Mac (rápido), libx264 no Linux (nuvem do GitHub)
const ENC = process.platform === 'darwin'
  ? ['-c:v', 'h264_videotoolbox', '-b:v', '2500k', '-maxrate', '3500k', '-bufsize', '7000k']
  : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-maxrate', '3500k', '-bufsize', '7000k']

function transcodificar(src, out) {
  const args = [
    '-y', '-i', src,
    '-vf', "scale='min(1920,iw)':-2",
    ...ENC,
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    out,
  ]
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] })
    p.on('close', (code) => (code === 0 ? res() : rej(new Error('ffmpeg saiu ' + code))))
    p.on('error', rej)
  })
}

async function subir(id, file) {
  const buf = fs.readFileSync(file)
  const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${id}.mp4`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + SECRET, apikey: SECRET, 'Content-Type': 'video/mp4', 'x-upsert': 'true' },
    body: buf,
  })
  if (!r.ok) throw new Error('upload ' + r.status + ' ' + (await r.text()).slice(0, 120))
  return buf.length
}

const mb = (n) => (n / 1048576).toFixed(1) + 'MB'

async function processar(f) {
  const src = path.join(TMP, f.id + '.src')
  const out = path.join(TMP, f.id + '.mp4')
  try {
    process.stdout.write(`• ${f.name} (${f.size ? mb(Number(f.size)) : '?'}) baixando…`)
    await baixar(f.id, src)
    process.stdout.write(' transcodificando…')
    await transcodificar(src, out)
    process.stdout.write(' subindo…')
    const tam = await subir(f.id, out)
    console.log(` OK ${mb(tam)}`)
  } catch (e) {
    console.log(` ERRO: ${e.message}`)
  } finally {
    fs.rmSync(src, { force: true })
    fs.rmSync(out, { force: true })
  }
}

const soId = process.argv[2]
const todos = await listarBrutos()
const feitos = await jaExistentes()
let alvo = todos
if (soId) alvo = todos.filter((f) => f.id === soId)
else alvo = todos.filter((f) => !feitos.has(f.id + '.mp4'))

console.log(`${todos.length} brutos, ${feitos.size} já feitos, ${alvo.length} a processar`)
for (const f of alvo) await processar(f)
fs.rmSync(TMP, { recursive: true, force: true })
console.log('fim')
