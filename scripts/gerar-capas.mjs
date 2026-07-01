// Gera 1 capa (jpg 640px) por bruto novo e grava os metadados (mês/dia da pasta, etc.) na tabela `brutos`.
// A capa é extraída pelo ffmpeg lendo a URL do Drive direto (Range/auth) — baixa só o que precisa pro frame.
// Uso: SUPA_SECRET=... GOOGLE_SERVICE_ACCOUNT_KEY=... node scripts/gerar-capas.mjs [--pasta <idDaPasta>]
import { GoogleAuth } from 'google-auth-library'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { listarVideos } from './lib/scan.mjs'

const SUPA = 'https://kkvuioyferqbilfwdkqa.supabase.co'
const SECRET = process.env.SUPA_SECRET
const BUCKET = 'proxies'
const KEY_PATH = '/Users/gcosta/Downloads/baixa-gravacoes-04ae892ee0e9.json'
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'capas-'))
if (!SECRET) { console.error('faltou SUPA_SECRET no env'); process.exit(1) }

const KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
  : JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'))
const auth = new GoogleAuth({ credentials: KEY, scopes: ['https://www.googleapis.com/auth/drive.readonly'] })
const client = await auth.getClient()
const driveToken = async () => (await client.getAccessToken()).token

const sb = (p, opts = {}) => fetch(`${SUPA}/rest/v1/${p}`, { ...opts, headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, ...(opts.headers || {}) } })

// ffmpeg lê a URL do Drive (com header de auth) e extrai 1 frame. Ele range-request só o necessário.
function extrairFrame(url, token, jpg, ss) {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', [
      '-y', '-headers', 'Authorization: Bearer ' + token + '\r\n',
      '-ss', String(ss), '-i', url,
      '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', jpg,
    ], { stdio: ['ignore', 'ignore', 'ignore'] })
    p.on('close', (c) => (c === 0 && fs.existsSync(jpg) ? res() : rej(new Error('ffmpeg ' + c))))
    p.on('error', rej)
  })
}

async function gerarCapa(id) {
  const token = await driveToken()
  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`
  const jpg = path.join(TMP, id + '.jpg')
  try { await extrairFrame(url, token, jpg, 1) } catch { await extrairFrame(url, token, jpg, 0) }
  const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${id}.jpg`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + SECRET, apikey: SECRET, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: fs.readFileSync(jpg),
  })
  fs.rmSync(jpg, { force: true })
  if (!r.ok) throw new Error('upload capa ' + r.status + ' ' + (await r.text()).slice(0, 100))
  return `${SUPA}/storage/v1/object/public/${BUCKET}/${id}.jpg`
}

async function jaComCapa() {
  const r = await sb('brutos?select=drive_id,capa_url')
  const d = await r.json().catch(() => [])
  const s = new Set()
  for (const b of Array.isArray(d) ? d : []) if (b.capa_url) s.add(b.drive_id)
  return s
}

async function upsert(v, capa_url) {
  const r = await sb('brutos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      drive_id: v.id, nome: v.name, mes: v.mes, dia: v.dia, capa_url,
      mb: v.size ? Math.round(v.size / 1048576) : null, duracao: v.seg,
      criado: v.createdTime, pasta_id: v.pastaId,
    }),
  })
  if (!r.ok) throw new Error('upsert ' + r.status + ' ' + (await r.text()).slice(0, 120))
}

// --pasta <id ou link> = varre só aquela subárvore
const iP = process.argv.indexOf('--pasta')
const pastaArg = iP >= 0 ? process.argv[iP + 1] : null
const pastaId = pastaArg ? ((pastaArg.match(/folders\/([\w-]+)/) || [])[1] || (pastaArg.match(/[\w-]{20,}/) || [])[0] || pastaArg) : null
const raizes = pastaId ? [pastaId] : undefined

const token = await driveToken()
const videos = await listarVideos(token, raizes)
const feitos = await jaComCapa()
const alvo = videos.filter((v) => !feitos.has(v.id))
console.log(`${videos.length} vídeos, ${feitos.size} já com capa, ${alvo.length} a processar`)
for (const v of alvo) {
  try {
    process.stdout.write(`• ${v.name} (${v.mes || '?'}/${v.dia || '?'})…`)
    const capa = await gerarCapa(v.id)
    await upsert(v, capa)
    console.log(' OK')
  } catch (e) {
    console.log(' ERRO: ' + e.message)
    try { await upsert(v, null) } catch { /* segue */ }
  }
}
fs.rmSync(TMP, { recursive: true, force: true })
console.log('fim')
