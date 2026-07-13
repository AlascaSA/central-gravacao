// Sincroniza os vídeos EDITADOS (pasta Editados do Drive): filtra meses >= Julho/2026 + a pasta de Cortes,
// a IA gera nome+descrição dos NOVOS, grava na tabela `editados`. Roda por CRON (de hora em hora) e por
// HTTP (botão "Atualizar" → devolve {novos, total}). NÃO mexe em postado/postado_em (isso é do humano).
// Não usa ffmpeg (só listar + IA de texto + Supabase), então roda de graça na Cloudflare — sem GitHub Actions.

const SUPA = 'https://kkvuioyferqbilfwdkqa.supabase.co'
const EDITADOS_ROOT = '1F_9Qd3yDQI-pnWmrxsyDe5a-Z-LJ8N_C'
const PASTA_CORTES = 'Cortes de caixinha - 2026'
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MIN_ANO = 2026, MIN_MES = 6 // Julho (0-based) de 2026 pra frente

// --- Web Crypto: token do Google (conta de serviço) via JWT RS256 ---
function b64urlBytes(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function b64urlStr(str) { return b64urlBytes(new TextEncoder().encode(str)) }
function pemToDer(pem) { const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''); const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes.buffer }
let _tok = null
async function googleToken(env) {
  const now = Math.floor(Date.now() / 1000)
  if (_tok && _tok.exp - 60 > now) return _tok.token
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY)
  const claims = { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }
  const unsigned = b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64urlStr(JSON.stringify(claims))
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const jwt = unsigned + '.' + b64urlBytes(new Uint8Array(sig))
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt })
  const d = await r.json()
  if (!d.access_token) throw new Error('google token ' + JSON.stringify(d).slice(0, 150))
  _tok = { token: d.access_token, exp: now + (d.expires_in || 3600) }
  return _tok.token
}

// --- Drive ---
const FIELDS = 'nextPageToken,files(id,name,mimeType,hasThumbnail,thumbnailLink,createdTime)'
async function ls(token, fid) {
  const itens = []; let page = null
  do {
    const q = `'${fid}' in parents and trashed=false`
    const url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent(FIELDS) + '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true' + (page ? '&pageToken=' + page : '')
    const d = await (await fetch(url, { headers: { Authorization: 'Bearer ' + token } })).json()
    if (d.error) throw new Error(d.error.message)
    itens.push(...(d.files || [])); page = d.nextPageToken
  } while (page)
  return itens
}
const ehDir = (f) => f.mimeType === 'application/vnd.google-apps.folder'
const ehVid = (f) => (f.mimeType || '').includes('video')
async function vidsDe(token, fid, acc = [], depth = 0) { for (const f of await ls(token, fid)) { if (ehVid(f)) acc.push(f); else if (ehDir(f) && depth < 4) await vidsDe(token, f.id, acc, depth + 1) } return acc }
function mesAno(nome) { const m = (nome || '').match(/^(\p{L}+)\s*\|\s*(\d{4})/u); if (!m) return null; const mi = MESES.findIndex((x) => x.toLowerCase() === m[1].toLowerCase()); return mi >= 0 ? { ano: Number(m[2]), mes: mi } : null }

// --- Groq: nome limpo + descrição a partir do nome do arquivo ---
async function nomeIA(env, nomeArquivo) {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.GROQ_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.2, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'Você recebe o NOME DE ARQUIVO de um vídeo jurídico já editado (Direito Empresarial/Sucessório). Devolva SÓ JSON {nome (título curto e limpo, SEM códigos/prefixos como [SHORT], CONTEÚDO, VÍDEO, números ou ano — só o assunto), descricao (1 frase curta do que o vídeo trata)}.' },
        { role: 'user', content: String(nomeArquivo || '').slice(0, 300) },
      ] }),
    })
    if (!r.ok) return { nome: null, descricao: null }
    const d = await r.json(); const c = JSON.parse(d.choices[0].message.content)
    return { nome: (c.nome && String(c.nome).trim()) || null, descricao: (c.descricao && String(c.descricao).trim()) || null }
  } catch { return { nome: null, descricao: null } }
}

// --- Supabase (service key) ---
async function sbGet(env, q) { const r = await fetch(`${SUPA}/rest/v1/${q}`, { headers: { apikey: env.SUPA_SECRET, Authorization: 'Bearer ' + env.SUPA_SECRET } }); try { return await r.json() } catch { return [] } }
async function sbUpsert(env, row) { const r = await fetch(`${SUPA}/rest/v1/editados`, { method: 'POST', headers: { apikey: env.SUPA_SECRET, Authorization: 'Bearer ' + env.SUPA_SECRET, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([row]) }); if (!r.ok) throw new Error('upsert ' + r.status) }

async function sincronizar(env) {
  const token = await googleToken(env)
  const top = await ls(token, EDITADOS_ROOT)
  const alvos = []
  for (const f of top) {
    if (!ehDir(f)) continue
    if (f.name.trim() === PASTA_CORTES) { alvos.push({ id: f.id, secao: 'corte' }); continue }
    const ma = mesAno(f.name)
    if (ma && (ma.ano > MIN_ANO || (ma.ano === MIN_ANO && ma.mes >= MIN_MES))) alvos.push({ id: f.id, secao: 'video' })
  }
  const todos = []
  for (const a of alvos) { for (const v of await vidsDe(token, a.id)) todos.push({ ...v, secao: a.secao }) }
  const jaTem = await sbGet(env, 'editados?select=drive_id&nome_ia=not.is.null')
  const comNome = new Set((Array.isArray(jaTem) ? jaTem : []).map((e) => e.drive_id))
  let novos = 0
  for (const v of todos) {
    const row = { drive_id: v.id, nome_arquivo: v.name, secao: v.secao, thumb: v.hasThumbnail ? v.thumbnailLink : null, criado: v.createdTime || null, atualizado_em: new Date().toISOString() }
    if (!comNome.has(v.id)) { const ia = await nomeIA(env, v.name); row.nome_ia = ia.nome; row.descricao = ia.descricao; novos++ }
    await sbUpsert(env, row)
  }
  return { novos, total: todos.length }
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(sincronizar(env).catch(() => {})) },
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
    try {
      const r = await sincronizar(env)
      return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json', ...cors } })
    } catch (e) {
      return new Response(JSON.stringify({ error: String((e && e.message) || e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } })
    }
  },
}
