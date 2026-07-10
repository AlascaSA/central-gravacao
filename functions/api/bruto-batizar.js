import { googleToken } from './_util.js'

// Renomeia o bruto no Google Drive conforme o card ligado (título do card, ou "SR - {título}" no sem-roteiro),
// preservando o nome original (pra reverter ao desligar) e a extensão. DB via chave anon (RLS de brutos libera).
const SUPA = (env) => env.VITE_SUPABASE_URL || 'https://kkvuioyferqbilfwdkqa.supabase.co'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

function sanitizar(nome) {
  return (nome || '').replace(/[/\\:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

// título curto via Groq (fallback do SR quando o bruto ainda não tem sugestao_titulo)
async function tituloDaTranscricao(env, transc) {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.GROQ_API_KEY },
      body: JSON.stringify({
        model: GROQ_MODEL, temperature: 0.2, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Gere um título curto (3 a 6 palavras) que resuma o assunto do vídeo, pra nomear o arquivo. Responda só JSON {"titulo":"..."}.' },
          { role: 'user', content: String(transc || '').slice(0, 4000) },
        ],
      }),
    })
    if (!r.ok) return ''
    const d = await r.json()
    return JSON.parse(d.choices[0].message.content).titulo || ''
  } catch { return '' }
}

export async function onRequest({ request, env }) {
  try {
    if (request.method !== 'POST') return Response.json({ error: 'método inválido' }, { status: 405 })
    const { drive_id } = await request.json().catch(() => ({}))
    if (!drive_id) return Response.json({ error: 'falta drive_id' }, { status: 400 })
    const S = SUPA(env), KEY = env.VITE_SUPABASE_ANON_KEY
    const hdr = { apikey: KEY, Authorization: 'Bearer ' + KEY }
    const idq = encodeURIComponent(drive_id)

    const b = (await (await fetch(`${S}/rest/v1/brutos?select=drive_id,card_id,nome,nome_original,transcricao,sugestao_titulo&drive_id=eq.${idq}`, { headers: hdr })).json())[0]
    if (!b) return Response.json({ error: 'bruto não encontrado' }, { status: 404 })

    let alvo
    if (!b.card_id) {
      if (!b.nome_original) return Response.json({ ok: true, nome: b.nome }) // nada pra reverter
      alvo = b.nome_original
    } else {
      const card = (await (await fetch(`${S}/rest/v1/cards?select=titulo,sem_roteiro&id=eq.${encodeURIComponent(b.card_id)}`, { headers: hdr })).json())[0]
      if (!card) return Response.json({ error: 'card não encontrado' }, { status: 404 })
      let base
      if (card.sem_roteiro) {
        let t = b.sugestao_titulo || ''
        if (!t && b.transcricao) t = await tituloDaTranscricao(env, b.transcricao)
        base = 'SR - ' + sanitizar(t || card.titulo || 'video')
      } else {
        base = sanitizar(card.titulo || 'video')
      }
      // sufixo: quantas OUTRAS tomadas já estão ligadas a este card (todas compartilham o base)
      const irmaos = await (await fetch(`${S}/rest/v1/brutos?select=drive_id&card_id=eq.${encodeURIComponent(b.card_id)}&drive_id=neq.${idq}`, { headers: hdr })).json()
      const n = Array.isArray(irmaos) ? irmaos.length : 0
      alvo = n > 0 ? `${base} (${n + 1})` : base
    }
    // preserva a extensão original
    const m = b.nome && b.nome.match(/\.[a-z0-9]{2,4}$/i)
    const ext = m ? m[0] : ''
    const nomeFinal = ext && !alvo.toLowerCase().endsWith(ext.toLowerCase()) ? alvo + ext : alvo

    // renomeia no Drive
    const token = await googleToken(env)
    const dr = await fetch(`https://www.googleapis.com/drive/v3/files/${drive_id}?supportsAllDrives=true&fields=id,name`, {
      method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nomeFinal }),
    })
    if (!dr.ok) {
      const msg = dr.status === 403 ? 'Conta de serviço sem permissão de edição no Drive.' : 'Drive ' + dr.status
      return Response.json({ error: msg }, { status: dr.status })
    }

    // atualiza o banco (nome; nome_original só na 1ª renomeação com card)
    const patch = { nome: nomeFinal }
    if (b.card_id && !b.nome_original) patch.nome_original = b.nome
    await fetch(`${S}/rest/v1/brutos?drive_id=eq.${idq}`, {
      method: 'PATCH',
      headers: { ...hdr, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    })
    return Response.json({ ok: true, nome: nomeFinal })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
