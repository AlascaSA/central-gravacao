/**
 * Acesso ao Drive sem biblioteca — só o que o montador precisa.
 *
 * Dois jeitos de autenticar, nesta ordem: conta de serviço (é o que roda no
 * Cloud Run, mesma chave que a Central já usa) ou token OAuth de usuário
 * (serve pra testar aqui na máquina, com o refresh token de um projeto local).
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

const ESCOPO = 'https://www.googleapis.com/auth/drive'
let cache = { token: null, exp: 0 }

function b64url(x) { return Buffer.from(x).toString('base64url') }

async function porContaDeServico(sa) {
  const agora = Math.floor(Date.now() / 1000)
  const cabeca = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const corpo = b64url(JSON.stringify({
    iss: sa.client_email, scope: ESCOPO,
    aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600,
  }))
  const assinatura = crypto.createSign('RSA-SHA256')
    .update(`${cabeca}.${corpo}`).sign(sa.private_key).toString('base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabeca}.${corpo}.${assinatura}`,
    }),
  })
  const d = await r.json()
  if (!d.access_token) throw new Error('conta de serviço recusada: ' + JSON.stringify(d).slice(0, 200))
  return d
}

async function porOAuth(tok, cliente) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cliente.client_id, client_secret: cliente.client_secret,
      refresh_token: tok.refresh_token, grant_type: 'refresh_token',
    }),
  })
  const d = await r.json()
  if (!d.access_token) throw new Error('refresh token recusado: ' + JSON.stringify(d).slice(0, 200))
  return d
}

export async function token() {
  const agora = Math.floor(Date.now() / 1000)
  if (cache.token && cache.exp - 60 > agora) return cache.token
  let d
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    d = await porContaDeServico(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY))
  } else if (process.env.OAUTH_TOKEN_JSON && process.env.OAUTH_CLIENT_JSON) {
    const tok = JSON.parse(fs.readFileSync(process.env.OAUTH_TOKEN_JSON, 'utf8'))
    const cs = JSON.parse(fs.readFileSync(process.env.OAUTH_CLIENT_JSON, 'utf8'))
    d = await porOAuth(tok, cs.installed || cs.web)
  } else {
    throw new Error('sem credencial: defina GOOGLE_SERVICE_ACCOUNT_KEY')
  }
  cache = { token: d.access_token, exp: agora + (d.expires_in || 3600) }
  return cache.token
}

const COMUM = 'supportsAllDrives=true&includeItemsFromAllDrives=true'

/** Filhos diretos de uma pasta que são vídeo. */
export async function listarVideos(pasta) {
  const q = encodeURIComponent(`'${pasta}' in parents and trashed=false and mimeType contains 'video/'`)
  const campos = encodeURIComponent('files(id,name,size,videoMediaMetadata(durationMillis,width,height))')
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${campos}&pageSize=200&orderBy=name&${COMUM}`,
    { headers: { Authorization: 'Bearer ' + await token() } })
  const d = await r.json()
  if (!r.ok) throw new Error(d?.error?.message || 'erro ao listar')
  return (d.files || []).map(f => ({
    id: f.id, nome: f.name,
    mb: f.size ? Math.round(Number(f.size) / 1e6) : null,
    duracao: f.videoMediaMetadata?.durationMillis ? Number(f.videoMediaMetadata.durationMillis) / 1000 : null,
    largura: f.videoMediaMetadata?.width ?? null,
    altura: f.videoMediaMetadata?.height ?? null,
  }))
}

/** Cria a subpasta de saída, ou reaproveita a que já existe. */
export async function pastaDeSaida(dentroDe, nome) {
  const q = encodeURIComponent(
    `'${dentroDe}' in parents and name='${nome.replace(/'/g, "\\'")}' ` +
    `and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const achou = await (await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&${COMUM}`,
    { headers: { Authorization: 'Bearer ' + await token() } })).json()
  if (achou.files?.length) return achou.files[0].id

  const r = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, parents: [dentroDe], mimeType: 'application/vnd.google-apps.folder' }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d?.error?.message || 'não consegui criar a pasta')
  return d.id
}

/** Baixa direto para o disco: o arquivo não passa pela memória do processo. */
export async function baixar(id, destino) {
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: 'Bearer ' + await token() } })
  if (!r.ok) throw new Error(`falha ao baixar ${id}: HTTP ${r.status}`)
  await pipeline(r.body, createWriteStream(destino))
}

/** Sobe um arquivo do disco para a pasta, por sessão retomável. */
export async function subir(caminho, pasta, nome) {
  const bytes = fs.statSync(caminho).size
  const abre = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + await token(),
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(bytes),
      },
      body: JSON.stringify({ name: nome, parents: [pasta], mimeType: 'video/mp4' }),
    })
  const sessao = abre.headers.get('location')
  if (!abre.ok || !sessao) throw new Error('Drive recusou a sessão: ' + (await abre.text()).slice(0, 200))

  const r = await fetch(sessao, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes) },
    body: fs.createReadStream(caminho),
    duplex: 'half',
  })
  if (!r.ok) throw new Error(`falha ao enviar ${nome}: HTTP ${r.status}`)
  return (await r.json()).id
}
