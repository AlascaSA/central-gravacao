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

// --- TAR (ustar) ---
// Escolhido no lugar de ZIP porque tar NÃO tem checksum do conteúdo: só concatena cabeçalho + bytes.
// Zip exigiria CRC32 de cada byte (GBs) e estouraria o limite de CPU do worker. Mac abre .tar com 2 cliques.
const enc = new TextEncoder()
function nomeTar(nome) {
  let n = (nome || 'video.mp4').replace(/^\/+/, '').replace(/[\r\n\0]/g, '')
  while (enc.encode(n).length > 100) n = n.slice(1) // corta pela frente até caber no campo de 100 bytes
  return n
}
function tarHeader(nome, size, mtime) {
  const buf = new Uint8Array(512)
  const put = (s, off, len) => buf.set(enc.encode(s).subarray(0, len), off)
  const oct = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0'
  put(nomeTar(nome), 0, 100)
  put('0000644\0', 100, 8) // mode
  put('0000000\0', 108, 8) // uid
  put('0000000\0', 116, 8) // gid
  put(oct(size, 12), 124, 12)
  put(oct(mtime, 12), 136, 12)
  put('        ', 148, 8) // checksum em branco pro cálculo
  buf[156] = 0x30 // typeflag '0' = arquivo comum
  put('ustar\0', 257, 6)
  put('00', 263, 2)
  let sum = 0
  for (let i = 0; i < 512; i++) sum += buf[i]
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8)
  return buf
}
const pad512 = (n) => (512 - (n % 512)) % 512

// Empacota N arquivos do Drive num .tar transmitido em fluxo (memória constante, CPU quase zero).
async function servirPacote(env, ctx, ids, nomePacote) {
  const token = await getToken(env)
  // metadados primeiro: valida o Shared Drive e dá o tamanho exato (o header do tar precisa saber antes)
  const arquivos = []
  const pulados = []
  for (const id of ids) {
    const r = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=driveId,name,size&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + token } })
    const m = await r.json()
    // Um vídeo apagado/substituído no Drive (404) não pode derrubar o pacote inteiro: pula e leva o resto.
    // Fora do Shared Drive também é pulado (não baixamos nada de fora dele).
    if (!r.ok || m.driveId !== SHARED_DRIVE_ID) {
      pulados.push(id + (r.ok ? ' (fora do Shared Drive)' : ' (' + r.status + ')'))
      continue
    }
    arquivos.push({ id, nome: m.name || 'video.mp4', size: Number(m.size || 0) })
  }
  if (!arquivos.length) return new Response('nenhum dos vídeos está disponível no Drive: ' + pulados.join(', '), { status: 404 })
  // dá pra saber o tamanho total ANTES de mandar — assim o navegador mostra progresso de verdade
  const total = arquivos.reduce((t, f) => t + 512 + f.size + pad512(f.size), 0) + 1024
  const mtime = Math.floor(Date.now() / 1000)

  // Stream SOB DEMANDA (pull): o worker só lê do Drive quando o cliente consome.
  // A versão anterior empurrava tudo num TransformStream em ctx.waitUntil() e o runtime encerrava a
  // tarefa em poucos segundos — o .tar chegava truncado (KB/MB em vez de GB). Aqui a produção fica
  // atrelada à leitura da resposta, que é como o download de um arquivo só (esse sempre funcionou).
  let iAtual = 0        // arquivo da vez
  let leitor = null     // corpo em leitura no Drive
  let acabou = false    // já escreveu os dois blocos finais?
  const readable = new ReadableStream({
    async pull(controller) {
      for (;;) {
        if (iAtual >= arquivos.length) {
          if (!acabou) { acabou = true; controller.enqueue(new Uint8Array(1024)); return } // fim do tar
          controller.close()
          return
        }
        const f = arquivos[iAtual]
        if (!leitor) {
          const r = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(f.id) + '?alt=media&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + token } })
          if (!r.ok || !r.body) { controller.error(new Error('drive ' + r.status + ' em ' + f.nome)); return }
          leitor = r.body.getReader()
          controller.enqueue(tarHeader(f.nome, f.size, mtime))
          return
        }
        const { done, value } = await leitor.read()
        if (done) {
          leitor = null
          iAtual++
          const p = pad512(f.size)
          if (p) { controller.enqueue(new Uint8Array(p)); return } // completa o bloco de 512
          continue
        }
        controller.enqueue(value)
        return
      }
    },
    cancel() { if (leitor) leitor.cancel().catch(() => {}) }, // usuário cancelou o download
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/x-tar',
      'Content-Disposition': 'attachment; filename="' + nomePacote.replace(/[\r\n"\\]/g, '') + '"',
      // sem Content-Length: com ele o runtime tenta bufferizar a resposta e corta perto de ~80 MB
      'X-Videos-Incluidos': String(arquivos.length),
      'X-Videos-Pulados': String(pulados.length),
    },
  })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    const exp = url.searchParams.get('exp')
    const sig = url.searchParams.get('sig')

    // modo PACOTE: ?ids=a,b,c — um download só, funciona em qualquer navegador (nada pra bloquear)
    const idsParam = url.searchParams.get('ids')
    if (idsParam) {
      const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
      if (!ids.length || !exp || !sig) return new Response('faltam parâmetros', { status: 400 })
      if (Number(exp) < Math.floor(Date.now() / 1000)) return new Response('link expirado', { status: 403 })
      const ok = await hmac(env.DL_SECRET, ids.join(',') + ':' + exp + ':tar')
      if (ok !== sig) return new Response('assinatura inválida', { status: 403 })
      try {
        return await servirPacote(env, ctx, ids, url.searchParams.get('name') || 'videos.tar')
      } catch (e) {
        return new Response('erro: ' + ((e && e.message) || e), { status: 500 })
      }
    }
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
        // diz QUAL das duas coisas falhou — "não permitido" pra tudo escondia problema de acesso da conta de serviço
        const motivo = !metaR.ok
          ? `sem acesso ao arquivo no Drive (${metaR.status}${meta && meta.error ? ': ' + String(meta.error.message).slice(0, 90) : ''})`
          : `arquivo fora do Shared Drive dos brutos (drive ${meta.driveId || 'pessoal/nenhum'})`
        return new Response(motivo, { status: 403 })
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
