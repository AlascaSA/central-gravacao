// Gera uma versão LEVE (720p H.264, faststart) de cada bruto que ainda não tem proxy e sobe pro Drive,
// numa pasta "__proxies__" dentro dos brutos (ignorada pela varredura). Grava proxy_id na tabela `brutos`.
// Isso resolve o "ainda processando" do player do Drive em vídeos 4K não transcodificados: o app toca o proxy.
// Uso: SUPA_SECRET=... GOOGLE_SERVICE_ACCOUNT_KEY=... node scripts/gerar-proxies.mjs [--hw]
//   --hw = usa o encoder de hardware do Mac (h264_videotoolbox) em vez de libx264 (pra rodar local rápido).
import { GoogleAuth } from 'google-auth-library'
import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SUPA = 'https://kkvuioyferqbilfwdkqa.supabase.co'
const SECRET = process.env.SUPA_SECRET
const KEY_PATH = '/Users/gcosta/Downloads/baixa-gravacoes-04ae892ee0e9.json'
const RAIZ_PROXIES = '1teUk4IYAMH3Fd99LvS1NvTyY2FPbeMq-' // raiz "Brutos": a pasta __proxies__ vive aqui dentro
const NOME_PASTA = '__proxies__'
const HW = process.argv.includes('--hw')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'prox-'))
if (!SECRET) { console.error('faltou SUPA_SECRET no env'); process.exit(1) }

const KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
  : JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'))
const auth = new GoogleAuth({ credentials: KEY, scopes: ['https://www.googleapis.com/auth/drive'] })
const client = await auth.getClient()
const driveToken = async () => (await client.getAccessToken()).token

const sb = (p, opts = {}) => fetch(`${SUPA}/rest/v1/${p}`, { ...opts, headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, ...(opts.headers || {}) } })

// acha (ou cria) a pasta __proxies__ dentro da raiz de brutos
async function pastaProxies(token) {
  const q = encodeURIComponent(`name='${NOME_PASTA}' and '${RAIZ_PROXIES}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: { Authorization: 'Bearer ' + token } })
  const d = await r.json()
  if (d.files && d.files[0]) return d.files[0].id
  const cr = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: NOME_PASTA, mimeType: 'application/vnd.google-apps.folder', parents: [RAIZ_PROXIES] }),
  })
  const cd = await cr.json()
  if (!cd.id) throw new Error('criar pasta proxies: ' + JSON.stringify(cd).slice(0, 150))
  return cd.id
}

// mapa nome->id do que já está na pasta (retoma sem duplicar)
async function existentes(token, pastaId) {
  const m = new Map()
  let page = null
  do {
    const q = encodeURIComponent(`'${pastaId}' in parents and trashed=false`)
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true` + (page ? '&pageToken=' + page : ''), { headers: { Authorization: 'Bearer ' + token } })
    const d = await r.json()
    for (const f of d.files || []) m.set(f.name, f.id)
    page = d.nextPageToken
  } while (page)
  return m
}

// baixa o bruto (streaming pro disco, sem carregar tudo em memória)
async function baixar(token, id, dst) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: 'Bearer ' + token } })
  if (!r.ok || !r.body) throw new Error('baixar ' + r.status)
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(dst))
}

// transcodifica pra 720p (cabe em 1280x1280 mantendo proporção; vale pra vertical e horizontal)
function transcode(src, out) {
  const vf = 'scale=w=1280:h=1280:force_original_aspect_ratio=decrease:force_divisible_by=2'
  const args = HW
    ? ['-y', '-i', src, '-vf', vf, '-c:v', 'h264_videotoolbox', '-b:v', '2500k', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]
    : ['-y', '-i', src, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'ignore'] })
    p.on('close', (c) => (c === 0 && fs.existsSync(out) ? res() : rej(new Error('ffmpeg ' + c))))
    p.on('error', rej)
  })
}

// sobe o proxy pro Drive (multipart) e devolve o id do arquivo criado
async function subir(token, pastaId, nome, file) {
  const meta = JSON.stringify({ name: nome, parents: [pastaId] })
  const boundary = '===cg_proxy_boundary_9f2a==='
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
    fs.readFileSync(file),
    Buffer.from(`\r\n--${boundary}--`),
  ])
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  const d = await r.json()
  if (!d.id) throw new Error('subir ' + JSON.stringify(d).slice(0, 150))
  return d.id
}

const token0 = await driveToken()
const pastaId = await pastaProxies(token0)
const jaLa = await existentes(token0, pastaId)

const alvosR = await sb('brutos?select=drive_id,nome&proxy_id=is.null')
const alvos = await alvosR.json()
if (!Array.isArray(alvos)) { console.error('erro lendo brutos:', JSON.stringify(alvos).slice(0, 200)); process.exit(1) }
console.log(`${alvos.length} brutos sem proxy`)

let ok = 0, err = 0
for (const b of alvos) {
  const id = b.drive_id
  const nomeProxy = id + '.mp4'
  const src = path.join(TMP, id + '.src')
  const dst = path.join(TMP, nomeProxy)
  try {
    let pid = jaLa.get(nomeProxy) // já transcodificado antes? só registra
    if (!pid) {
      process.stdout.write(`• proxy ${b.nome}…`)
      await baixar(await driveToken(), id, src)
      await transcode(src, dst)
      pid = await subir(await driveToken(), pastaId, nomeProxy, dst)
      fs.rmSync(src, { force: true }); fs.rmSync(dst, { force: true })
      console.log(' OK')
    }
    const pr = await sb('brutos?drive_id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ proxy_id: pid }),
    })
    if (!pr.ok) throw new Error('PATCH ' + pr.status + ' ' + (await pr.text()).slice(0, 100))
    ok++
  } catch (e) {
    console.log(' ERRO: ' + ((e && e.message) || e))
    fs.rmSync(src, { force: true }); fs.rmSync(dst, { force: true })
    err++
  }
}
fs.rmSync(TMP, { recursive: true, force: true })
console.log(`fim — ${ok} ok, ${err} erros`)
