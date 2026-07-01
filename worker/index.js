// Proxy de download dos brutos do Google Drive (Cloudflare Worker).
// SEGURANÇA: só serve arquivos do Shared Drive dos brutos E só com link assinado (HMAC) e válido (exp).
// A chave de assinatura (DL_SECRET) fica no servidor; o link é gerado pela função do app e expira.
// Usa a service account (JWT via Web Crypto) e faz STREAMING via API do Drive:
// sem aviso de vírus, qualquer tamanho, egress grátis. Responde como attachment (baixa direto).

const SHARED_DRIVE_ID = '0ANh1nYBAOuTbUk9PVA' // Shared Drive dos brutos
let _tok = null

function b64urlBytes(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlStr(str) {
  return b64urlBytes(new TextEncoder().encode(str))
}
function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return b64urlBytes(new Uint8Array(mac))
}

async function getToken(env) {
  const now = Math.floor(Date.now() / 1000)
  if (_tok && _tok.exp - 60 > now) return _tok.token
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const unsigned = b64urlStr(JSON.stringify(header)) + '.' + b64urlStr(JSON.stringify(claims))
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const jwt = unsigned + '.' + b64urlBytes(new Uint8Array(sigBuf))
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
  })
  const d = await r.json()
  if (!d.access_token) throw new Error('token ' + JSON.stringify(d).slice(0, 150))
  _tok = { token: d.access_token, exp: now + (d.expires_in || 3600) }
  return _tok.token
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    const exp = url.searchParams.get('exp')
    const sig = url.searchParams.get('sig')
    const inline = url.searchParams.get('inline') === '1' // modo player (<video>): sem attachment
    if (!id || !exp || !sig) return new Response('faltam parâmetros', { status: 400 })

    // 1) link assinado e válido (o payload muda no modo inline pra os links não serem intercambiáveis)
    const now = Math.floor(Date.now() / 1000)
    if (Number(exp) < now) return new Response('link expirado', { status: 403 })
    const esperado = await hmac(env.DL_SECRET, inline ? id + ':' + exp + ':inline' : id + ':' + exp)
    if (esperado !== sig) return new Response('assinatura inválida', { status: 403 })

    const nome = (url.searchParams.get('name') || 'video.mp4').replace(/[\r\n"\\]/g, '')
    try {
      const token = await getToken(env)
      // 2) o arquivo TEM que estar no Shared Drive dos brutos
      const metaR = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=driveId&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + token } })
      const meta = await metaR.json()
      if (!metaR.ok || meta.driveId !== SHARED_DRIVE_ID) {
        return new Response('arquivo não permitido', { status: 403 })
      }
      // 3) stream
      const h = { Authorization: 'Bearer ' + token }
      const range = request.headers.get('Range')
      if (range) h['Range'] = range
      const r = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media&supportsAllDrives=true', { headers: h })
      if (r.status !== 200 && r.status !== 206) {
        return new Response('erro Drive ' + r.status, { status: r.status })
      }
      const out = new Headers()
      out.set('Content-Type', r.headers.get('Content-Type') || 'video/mp4')
      if (inline) {
        // proxy leve pra tocar no player: cacheável (imutável) e liberado por CORS
        out.set('Cache-Control', 'public, max-age=604800')
        out.set('Access-Control-Allow-Origin', '*')
      } else {
        out.set('Content-Disposition', 'attachment; filename="' + nome + '"')
      }
      const cl = r.headers.get('Content-Length'); if (cl) out.set('Content-Length', cl)
      const cr = r.headers.get('Content-Range'); if (cr) out.set('Content-Range', cr)
      out.set('Accept-Ranges', 'bytes')
      return new Response(r.body, { status: r.status, headers: out })
    } catch (e) {
      return new Response('erro: ' + ((e && e.message) || e), { status: 500 })
    }
  },
}
