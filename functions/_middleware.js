import { hmacSha256 } from './api/_util.js'

// LOGIN DA CENTRAL — "Entrar com Slack" (OpenID Connect), só pra quem está no Slack da ALASCA.
// Roda antes de TODA rota (páginas, arquivos e /api). Fica desligado enquanto as credenciais não
// estiverem cadastradas no projeto (SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_TEAM_ID,
// SESSAO_SEGREDO) — publicar o código não tranca ninguém do lado de fora antes do teste.
// Sessão: cookie assinado (HMAC) de 30 dias. Sem banco, sem Zero Trust, sem custo.

const SITE = 'https://audiovisual.alascasa.com.br'
const VOLTA_SLACK = SITE + '/entrar/slack'
const COOKIE = 'central_sessao'
const COOKIE_ESTADO = 'central_estado'
const DIAS = 30

// arquivos que a própria tela de login usa
const LIVRES = new Set(['/alasca-logo.png', '/alasca-icon.png', '/favicon.ico', '/apple-touch-icon.png'])
// robôs de prévia de link (Slack, ClickUp, WhatsApp…): enxergam SÓ a página do vídeo e a miniatura,
// pra o link /v/<id> continuar virando cartão com título e imagem
const ROBOS = /(slackbot|slack-imgproxy|clickup|facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|discordbot|linkedinbot|skypeuripreview|iframely|embedly|applebot)/i

const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const deB64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))))
const agora = () => Math.floor(Date.now() / 1000)

function lerCookie(request, nome) {
  const c = request.headers.get('cookie') || ''
  const m = c.match(new RegExp('(?:^|;\\s*)' + nome + '=([^;]+)'))
  return m ? m[1] : null
}
async function assinar(env, dados) {
  const corpo = b64url(JSON.stringify(dados))
  return corpo + '.' + (await hmacSha256(env.SESSAO_SEGREDO, corpo))
}
async function conferir(env, valor) {
  if (!valor || !valor.includes('.')) return null
  const [corpo, assinatura] = valor.split('.')
  const certo = await hmacSha256(env.SESSAO_SEGREDO, corpo)
  if (certo.length !== assinatura.length) return null
  let dif = 0
  for (let i = 0; i < certo.length; i++) dif |= certo.charCodeAt(i) ^ assinatura.charCodeAt(i)
  if (dif) return null
  try {
    const d = JSON.parse(deB64url(corpo))
    return d.exp && d.exp > agora() ? d : null
  } catch {
    return null
  }
}

function pagina(titulo, texto, { botao = true, status = 200 } = {}) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo} · Central de Audiovisual</title><link rel="icon" type="image/png" href="/alasca-icon.png">
<link href="https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:#0a0c11;color:#f4f6fa;font-family:Satoshi,-apple-system,BlinkMacSystemFont,sans-serif;-webkit-font-smoothing:antialiased;display:grid;place-items:center;padding:24px}
main{width:100%;max-width:380px;background:#0f131a;border:1px solid #262e3a;border-radius:24px;padding:32px 28px;box-shadow:0 30px 80px -30px rgba(0,0,0,.8)}
img{height:26px;display:block;margin-bottom:28px}
h1{font-size:22px;font-weight:900;letter-spacing:-.02em;margin:0 0 8px}
p{font-size:14px;line-height:1.5;color:#9aa7ba;margin:0 0 24px}
a.b{display:flex;align-items:center;justify-content:center;gap:10px;height:48px;border-radius:14px;background:#14a8f5;color:#fff;font-weight:700;font-size:15px;text-decoration:none;box-shadow:0 10px 30px -8px rgba(20,168,245,.55)}
a.b:active{transform:scale(.98)}
</style></head><body><main>
<img src="/alasca-logo.png" alt="Alasca">
<h1>${titulo}</h1><p>${texto}</p>
${botao ? `<a class="b" href="/entrar/slack"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M5.04 15.17a2.53 2.53 0 1 1-2.52-2.53h2.52v2.53Zm1.27 0a2.53 2.53 0 0 1 5.05 0v6.3a2.53 2.53 0 1 1-5.05 0v-6.3ZM8.84 5.04a2.53 2.53 0 1 1 2.52-2.52v2.52H8.84Zm0 1.27a2.53 2.53 0 0 1 0 5.05H2.52a2.53 2.53 0 0 1 0-5.05h6.32Zm10.12 2.53a2.53 2.53 0 1 1 2.52 2.52h-2.52V8.84Zm-1.27 0a2.53 2.53 0 0 1-5.05 0V2.52a2.53 2.53 0 1 1 5.05 0v6.32Zm-2.53 10.12a2.53 2.53 0 1 1-2.52 2.52v-2.52h2.52Zm0-1.27a2.53 2.53 0 0 1 0-5.05h6.32a2.53 2.53 0 0 1 0 5.05h-6.32Z"/></svg>Entrar com Slack</a>` : ''}
</main></body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

// manda pro Slack; o "estado" assinado num cookie curto evita que alguém injete um login alheio
async function iniciarLogin(env, volta) {
  const estado = crypto.randomUUID()
  const nonce = crypto.randomUUID()
  const selo = await assinar(env, { estado, nonce, volta, exp: agora() + 600 })
  const u = new URL('https://slack.com/openid/connect/authorize')
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', 'openid email profile')
  u.searchParams.set('client_id', env.SLACK_CLIENT_ID)
  u.searchParams.set('redirect_uri', VOLTA_SLACK)
  u.searchParams.set('state', estado)
  u.searchParams.set('nonce', nonce)
  u.searchParams.set('team', env.SLACK_TEAM_ID)
  return new Response(null, {
    status: 302,
    headers: { Location: u.toString(), 'Set-Cookie': `${COOKIE_ESTADO}=${selo}; Path=/entrar; Max-Age=600; HttpOnly; Secure; SameSite=Lax`, 'Cache-Control': 'no-store' },
  })
}

// volta do Slack: troca o código pelo id_token e confere se a pessoa é do espaço da ALASCA
async function voltaDoSlack(request, env, url) {
  if (url.searchParams.get('error')) return pagina('Login cancelado', 'O Slack não confirmou o acesso. Tente de novo.')
  const code = url.searchParams.get('code')
  if (!code) return iniciarLogin(env, url.searchParams.get('volta') || '/')
  const selo = await conferir(env, lerCookie(request, COOKIE_ESTADO))
  if (!selo || selo.estado !== url.searchParams.get('state')) return pagina('Login expirado', 'Demorou demais ou foi aberto em outra aba. Entre de novo.')

  const r = await fetch('https://slack.com/api/openid.connect.token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.SLACK_CLIENT_ID, client_secret: env.SLACK_CLIENT_SECRET, code, redirect_uri: VOLTA_SLACK }),
  })
  const d = await r.json().catch(() => ({}))
  if (!d.ok || !d.id_token) return pagina('Não deu certo', 'O Slack recusou o login (' + String(d.error || r.status) + '). Tente de novo.')
  // o id_token veio direto do Slack por TLS, na troca com o segredo do app: dá pra ler sem reconferir a assinatura
  let quem
  try { quem = JSON.parse(deB64url(d.id_token.split('.')[1])) } catch { return pagina('Não deu certo', 'Resposta do Slack ilegível. Tente de novo.') }
  if (quem.nonce && quem.nonce !== selo.nonce) return pagina('Login expirado', 'Entre de novo.')
  if (quem['https://slack.com/team_id'] !== env.SLACK_TEAM_ID) {
    return pagina('Só para a equipe ALASCA', 'Essa conta do Slack não é do espaço da ALASCA. Entre com a conta da equipe.')
  }
  const sessao = await assinar(env, { sub: quem.sub, nome: quem.name || '', email: quem.email || '', exp: agora() + DIAS * 86400 })
  const volta = typeof selo.volta === 'string' && selo.volta.startsWith('/') && !selo.volta.startsWith('//') ? selo.volta : '/'
  const h = new Headers({ Location: volta, 'Cache-Control': 'no-store' })
  h.append('Set-Cookie', `${COOKIE}=${sessao}; Path=/; Max-Age=${DIAS * 86400}; HttpOnly; Secure; SameSite=Lax`)
  h.append('Set-Cookie', `${COOKIE_ESTADO}=; Path=/entrar; Max-Age=0; HttpOnly; Secure; SameSite=Lax`)
  return new Response(null, { status: 302, headers: h })
}

export async function onRequest(context) {
  const { request, env, next } = context
  const url = new URL(request.url)

  // o endereço *.pages.dev vai pro domínio oficial: é lá que o login e o cookie moram
  if (url.hostname.endsWith('.pages.dev')) return Response.redirect(SITE + url.pathname + url.search, 301)

  // login desligado até as credenciais do Slack estarem cadastradas
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET || !env.SLACK_TEAM_ID || !env.SESSAO_SEGREDO) return next()

  const p = url.pathname
  if (p === '/entrar/slack') return voltaDoSlack(request, env, url)
  if (p === '/sair') {
    const res = pagina('Você saiu', 'Para voltar, entre de novo com o Slack da ALASCA.')
    res.headers.append('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`)
    return res
  }
  if (LIVRES.has(p)) return next()

  // scripts da equipe (ex.: Virais no Mac) entram com a chave de serviço no cabeçalho
  const chave = request.headers.get('x-central-chave')
  if (chave && env.CHAVE_SERVICO && chave === env.CHAVE_SERVICO) return next()

  const ua = request.headers.get('user-agent') || ''
  if (ROBOS.test(ua) && (p.startsWith('/v/') || p === '/api/thumb')) return next()

  if (await conferir(env, lerCookie(request, COOKIE))) return next()

  if (p.startsWith('/api/')) return Response.json({ error: 'Entre com o Slack da ALASCA para usar a Central.' }, { status: 401 })
  if (request.method === 'GET') return iniciarLogin(env, p + url.search)
  return new Response('Entre com o Slack da ALASCA.', { status: 401 })
}
