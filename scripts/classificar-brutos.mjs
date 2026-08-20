// Duas passadas: (1) transcreve todos os brutos com proxy; (2) classifica cada um vendo o
// clipe ANTERIOR e o PRÓXIMO (pega regravação/erro x complemento). Grava no Supabase (tabela brutos).
// Uso: GROQ_KEY=... SUPA_SECRET=... node scripts/classificar-brutos.mjs [--force]
import { GoogleAuth } from 'google-auth-library'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { spawn } from 'node:child_process'

const GROQ = process.env.GROQ_KEY
const SECRET = process.env.SUPA_SECRET
const SUPA = 'https://kkvuioyferqbilfwdkqa.supabase.co'
const KEY_PATH = '/Users/gcosta/Downloads/baixa-gravacoes-04ae892ee0e9.json'
const FORCE = process.argv.includes('--force')
const SO_TRANSC = process.argv.includes('--so-transcrever') // só transcreve; classificação vai via Claude
const RECLASS = process.argv.includes('--reclassificar') // mantém transcrição, re-classifica tudo
const TEAM = process.env.TEAM || 'jaylton' // time/professor do lote — escopa leitura e grava na coluna team
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'classif-'))
if (!GROQ || !SECRET) { console.error('faltou GROQ_KEY ou SUPA_SECRET'); process.exit(1) }

// conta de serviço pra ler o proxy do DRIVE (antes moravam no Supabase; agora vivem na pasta __proxies__)
const KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
  : JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'))
const auth = new GoogleAuth({ credentials: KEY, scopes: ['https://www.googleapis.com/auth/drive.readonly'] })
const client = await auth.getClient()
const driveToken = async () => (await client.getAccessToken()).token

const sb = (p, opts = {}) => fetch(`${SUPA}/rest/v1/${p}`, { ...opts, headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, ...(opts.headers || {}) } })
const jsonOf = async (r) => { try { return await r.json() } catch { return [] } }

// frases-fantasma que o Whisper inventa em clipe silencioso/música → tratamos como silêncio
const LIXO = [/legenda[s]?\s+por/i, /subtitle[s]?\s+by/i, /amara\.org/i, /transcri(ç|c)[aã]o\s+por/i, /\bobrigado por assistir\b/i]
function limparTransc(t) {
  const s = (t || '').trim()
  if (!s) return ''
  if (/^[\s.,!?…♪\-]*$/.test(s)) return ''
  if (s.length < 70 && LIXO.some((re) => re.test(s))) return ''
  return s
}

// número do clipe da câmera (C0106 → 106) — usado pra ordenar na sequência real de gravação
function numDoNome(nome) {
  const s = (nome || '').trim()
  const m = s.match(/^C0*(\d+)/i) || s.match(/^0*(\d+)/)
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER
}
// brutos que já têm proxy no Drive, EM ORDEM DE GRAVAÇÃO (número do clipe, não a data do upload) —
// a classificação vê o vizinho anterior/próximo pra pegar regravação, então a ordem tem que ser a sequência real.
async function listarBrutos() {
  const rows = await jsonOf(await sb(`brutos?select=drive_id,nome,nome_original,duracao,proxy_id,criado&proxy_id=not.is.null&team=eq.${TEAM}`))
  const arr = (Array.isArray(rows) ? rows : []).map((b) => ({
    id: b.drive_id, nome: b.nome, seg: b.duracao, proxyId: b.proxy_id,
    num: numDoNome(b.nome_original || b.nome), criado: b.criado || '',
  }))
  arr.sort((a, b) => (a.num - b.num) || a.criado.localeCompare(b.criado))
  return arr
}
// baixa o PROXY do Drive (alt=media com a conta de serviço)
async function baixarProxy(proxyId, dest) {
  let ultErro
  for (let tent = 0; tent < 3; tent++) {
    try {
      const token = await driveToken()
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${proxyId}?alt=media&supportsAllDrives=true`, { headers: { Authorization: 'Bearer ' + token } })
      if (!r.ok || !r.body) throw new Error('proxy ' + r.status)
      await new Promise((res, rej) => { const ws = fs.createWriteStream(dest); Readable.fromWeb(r.body).pipe(ws).on('finish', res).on('error', rej) })
      return
    } catch (e) { ultErro = e; await new Promise((r) => setTimeout(r, 800 * (tent + 1))) }
  }
  throw ultErro
}
async function transcrever(file) {
  // extrai SÓ o áudio (16kHz mono, ~1MB) — proxy de vídeo grande passa do limite de 25MB do Whisper
  const audio = file + '.m4a'
  await new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', '64k', audio], { stdio: ['ignore', 'ignore', 'ignore'] })
    p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg audio ' + c))))
    p.on('error', rej)
  })
  try {
    const form = new FormData()
    form.append('file', new Blob([fs.readFileSync(audio)], { type: 'audio/mp4' }), 'a.m4a')
    form.append('model', 'whisper-large-v3-turbo')
    form.append('language', 'pt')
    form.append('response_format', 'json')
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + GROQ }, body: form })
    const d = await r.json()
    if (!r.ok) throw new Error('whisper ' + r.status + ' ' + JSON.stringify(d).slice(0, 120))
    return limparTransc(d.text)
  } finally {
    fs.rmSync(audio, { force: true })
  }
}

const REGRAS = 'Categorias: "boa" (tomada limpa e usável de conteúdo), "erro" (errou/gaguejou/repetiu/recomeçou/teste de som/ajuste de câmera/silêncio/frase incompleta — qualquer coisa não-usável), "gancho" (só a frase de abertura curta pra prender atenção), "complemento" (continua o assunto/fala do clipe anterior). ' +
  'REGRA-CHAVE: compare o ATUAL com o PRÓXIMO — se o próximo refaz a MESMA fala, o ATUAL foi o erro (descarte) e o próximo é o bom; se o próximo traz conteúdo NOVO continuando o assunto, o ATUAL pode ser boa/gancho e o próximo é complemento. ' +
  'Transcrição vazia = clipe silencioso = "erro". Duração 4-6s costuma ser gancho ou erro; 30s+ tomada cheia.'

// Apelido = o gancho/ideia central do clipe pra nomear o arquivo (o Renomeador anexa CAMPANHA-OBJETIVO-... depois).
// O bruto batizado vira "BR-<apelido>"; estas regras deixam o apelido no padrão desde a sugestão da IA.
const APELIDO = 'O "titulo" é o APELIDO do clipe: o gancho/ideia central em 2 a 4 palavras (máx 5), concreto e específico — NÃO um resumo. ' +
  'Minúsculas, só letras e espaços (acentos ok); sem pontuação, números, símbolos, nome de produto/campanha nem as palavras "vídeo"/"anúncio"/"reel". ' +
  'Se for depoimento/entrevista, use o nome da pessoa (ex.: "depoimento julia"). Exemplos: "professora cansada", "herdeiro menor", "migrar de área".'

async function classificar(atual, dur, prev, next, exemplos) {
  const fewshot = exemplos.length ? '\n\nExemplos confirmados por humano (aprenda):\n' + exemplos.map((e) => `dur ${e.duracao ?? '?'}s "${(e.transcricao || '(silêncio)').slice(0, 80)}" => ${e.tipo}`).join('\n') : ''
  const sys = `Você classifica brutos de vídeo de um criador jurídico (Direito Empresarial), na ordem de gravação. ${REGRAS} Responda SÓ JSON: {tipo, tema, tags (array curto), resumo (1 frase), confianca (0-1), motivo (curto), titulo}. ${APELIDO}`
  const user = `Clipe ANTERIOR: ${prev ? `"${prev.slice(0, 220)}"` : '(nenhum)'}\n` +
    `Clipe PRÓXIMO: ${next ? `"${next.slice(0, 220)}"` : '(nenhum)'}\n` +
    `Clipe ATUAL — duração ${dur ?? '?'}s, transcrição: ${atual ? `"${atual}"` : '(silêncio / sem fala)'}${fewshot}`
  const payload = JSON.stringify({ model: 'openai/gpt-oss-120b', temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] })
  for (let tent = 0; ; tent++) {
    let r
    try {
      r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' }, body: payload })
    } catch (e) {
      if (tent < 8) { await new Promise((res) => setTimeout(res, 3000 * (tent + 1))); continue }
      throw e
    }
    if (r.status === 429 && tent < 8) {
      const ra = parseFloat(r.headers.get('retry-after') || '0')
      const espera = ra > 0 ? ra * 1000 + 500 : 4000 * (tent + 1)
      process.stdout.write(`(429, espero ${Math.round(espera / 1000)}s) `)
      await new Promise((res) => setTimeout(res, espera))
      continue
    }
    const d = await r.json()
    if (!r.ok) throw new Error('classify ' + r.status + ' ' + JSON.stringify(d).slice(0, 120))
    return JSON.parse(d.choices[0].message.content)
  }
}

// apelido curto só pra nomear — usado no backfill de sugestao_titulo dos "boa"
async function tituloCurto(transc) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b', temperature: 0.2, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `Gere o apelido do vídeo pra nomear o arquivo. Responda só JSON {"titulo":"..."}. ${APELIDO}` },
        { role: 'user', content: String(transc || '').slice(0, 4000) },
      ],
    }),
  })
  if (!r.ok) return ''
  const d = await r.json()
  try { return (JSON.parse(d.choices[0].message.content).titulo || '').trim() } catch { return '' }
}

async function upsert(row) {
  const r = await sb('brutos', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([row]) })
  if (!r.ok) throw new Error('upsert ' + r.status + ' ' + (await r.text()).slice(0, 150))
}

// ---- run ----
const fila = await listarBrutos() // já vem só quem tem proxy, em ordem de gravação
const existentes = await jsonOf(await sb(`brutos?select=drive_id,transcricao,ia_tipo&team=eq.${TEAM}`))
const exMap = new Map((Array.isArray(existentes) ? existentes : []).map((e) => [e.drive_id, e]))
const exemplos = await jsonOf(await sb(`brutos_exemplos?select=transcricao,duracao,tipo&team=eq.${TEAM}&order=criado_em.desc&limit=12`))
const fewshot = Array.isArray(exemplos) ? exemplos : []

console.log(`${fila.length} brutos com proxy na fila, ${exMap.size} já no banco`)

// PASSA 1: transcrição
const itens = []
for (const b of fila) {
  const ja = exMap.get(b.id)
  // re-transcreve se vazio (clipe grande que falhou o download fica '' e precisa refazer)
  let transc = ja && ja.transcricao && !FORCE ? ja.transcricao : null
  if (transc === null) {
    const tmp = path.join(TMP, b.id + '.mp4')
    try {
      process.stdout.write(`• ${b.nome} transcrevendo… `)
      await baixarProxy(b.proxyId, tmp)
      transc = await transcrever(tmp)
      await upsert({ drive_id: b.id, nome: b.nome, duracao: b.seg, transcricao: transc, team: TEAM, atualizado_em: new Date().toISOString() })
      console.log(transc ? `"${transc.slice(0, 50)}${transc.length > 50 ? '…' : ''}"` : '(silêncio)')
    } catch (e) { console.log('ERRO transc: ' + e.message); transc = '' } finally { fs.rmSync(tmp, { force: true }) }
  }
  itens.push({ b, transc: transc || '' })
}

// PASSA 2: classificação com anterior + próximo (pulada com --so-transcrever)
if (!SO_TRANSC) {
console.log('--- classificando (vendo vizinhos) ---')
for (let i = 0; i < itens.length; i++) {
  const { b, transc } = itens[i]
  const ja = exMap.get(b.id)
  if (ja && ja.ia_tipo && !FORCE && !RECLASS) { console.log(`· ${b.nome} já classificado (${ja.ia_tipo})`); continue }
  const prev = itens[i - 1]?.transc || null
  const next = itens[i + 1]?.transc || null
  try {
    const c = await classificar(transc, b.seg, prev, next, fewshot)
    const tipos = ['boa', 'erro', 'gancho', 'complemento']
    await upsert({
      drive_id: b.id, nome: b.nome, duracao: b.seg, transcricao: transc, team: TEAM,
      ia_tipo: tipos.includes(c.tipo) ? c.tipo : 'erro', ia_tema: c.tema || null,
      ia_tags: Array.isArray(c.tags) ? c.tags : null, ia_resumo: c.resumo || null,
      ia_confianca: typeof c.confianca === 'number' ? c.confianca : null, ia_motivo: c.motivo || null,
      sugestao_titulo: (c.titulo && String(c.titulo).trim()) || null,
      atualizado_em: new Date().toISOString(),
    })
    console.log(`✓ ${b.nome} → ${c.tipo} (${c.confianca})`)
  } catch (e) { console.log(`✗ ${b.nome} ERRO: ${e.message}`) }
}
}
// backfill: "boa" (proposto ou confirmado) com transcrição mas sem sugestao_titulo
// (classificados antes do campo existir) — 1 chamada Groq "só título", sem re-classificar
if (!SO_TRANSC) {
  const semTit = await jsonOf(await sb(`brutos?select=drive_id,nome,transcricao&or=(ia_tipo.eq.boa,tipo.eq.boa)&sugestao_titulo.is.null&team=eq.${TEAM}`))
  const alvoTit = (Array.isArray(semTit) ? semTit : []).filter((x) => x.transcricao && x.transcricao.trim())
  if (alvoTit.length) {
    console.log(`--- backfill de título em ${alvoTit.length} "boa" ---`)
    for (const x of alvoTit) {
      try {
        const t = await tituloCurto(x.transcricao)
        if (t) { await upsert({ drive_id: x.drive_id, team: TEAM, sugestao_titulo: t }); console.log(`  ${x.nome} → ${t}`) }
      } catch (e) { console.log(`  ${x.nome} erro: ${e.message}`) }
    }
  }
}
fs.rmSync(TMP, { recursive: true, force: true })
console.log('fim')
