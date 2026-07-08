// Helpers compartilhados das Pages Functions (motor de Workers — usa Web Crypto, não libs Node).
// HMAC e JWT do Google são o MESMO esquema do worker de download (worker/index.js), já comprovado.
export const SUPA_URL = (env) => env.VITE_SUPABASE_URL || 'https://kkvuioyferqbilfwdkqa.supabase.co'

function b64urlBytes(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlStr(str) { return b64urlBytes(new TextEncoder().encode(str)) }

// HMAC-SHA256 → base64url (sem padding). Bate exatamente com o worker e com o antigo node:crypto.
export async function hmacSha256(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return b64urlBytes(new Uint8Array(mac))
}

function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

// token de acesso do Google (conta de serviço) via JWT RS256 — cacheado no escopo do módulo
let _tok = null
export async function googleToken(env, scope = 'https://www.googleapis.com/auth/drive') {
  const now = Math.floor(Date.now() / 1000)
  if (_tok && _tok.exp - 60 > now && _tok.scope === scope) return _tok.token
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = { iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }
  const unsigned = b64urlStr(JSON.stringify(header)) + '.' + b64urlStr(JSON.stringify(claims))
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const jwt = unsigned + '.' + b64urlBytes(new Uint8Array(sig))
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
  })
  const d = await r.json()
  if (!d.access_token) throw new Error('google token ' + JSON.stringify(d).slice(0, 150))
  _tok = { token: d.access_token, exp: now + (d.expires_in || 3600), scope }
  return _tok.token
}
