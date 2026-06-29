// IA (Groq) que lê o doc de roteiros e destrincha em vários vídeos (cards).
const GROQ_MODEL = 'llama-3.3-70b-versatile'

// Libs de extração importadas SOB DEMANDA (evita peso no cold-start).
async function extrairTexto(buf, nome) {
  const lower = (nome || '').toLowerCase()
  if (lower.endsWith('.docx')) {
    try {
      const mammoth = (await import('mammoth')).default
      const r = await mammoth.extractRawText({ buffer: buf })
      return r.value || ''
    } catch (_) {
      return ''
    }
  }
  if (lower.endsWith('.pdf')) {
    try {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: new Uint8Array(buf) })
      const r = await parser.getText()
      try { await parser.destroy() } catch (_) { /* ignore */ }
      return r.text || ''
    } catch (_) {
      return ''
    }
  }
  return buf.toString('utf-8')
}

async function chamarGroq(texto, copy) {
  const sys =
    'Voce recebe o texto de um documento de roteiros de uma equipe de producao de video (copy responsavel: ' +
    (copy || 'desconhecida') +
    ').\n' +
    'Extraia CADA video individual presente no documento.\n' +
    'Responda SOMENTE em JSON valido no formato:\n' +
    '{"videos":[{"titulo":"...","campanha":"...","roteiro":"..."}]}\n' +
    'Regras:\n' +
    '- "titulo": titulo curto e claro do video (ate ~8 palavras).\n' +
    '- "campanha": a campanha/categoria se aparecer no documento, senao "".\n' +
    '- "roteiro": o texto do roteiro daquele video, como esta no documento.\n' +
    '- Se o documento for de um unico video, retorne UM item.\n' +
    '- Nao invente videos que nao estao no texto. Nada fora do JSON.'

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.GROQ_API_KEY,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: String(texto).slice(0, 28000) },
      ],
    }),
  })

  if (!resp.ok) {
    const t = await resp.text()
    throw new Error('Groq ' + resp.status + ': ' + t.slice(0, 300))
  }
  const data = await resp.json()
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '{}'
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (_) {
    parsed = { videos: [] }
  }
  const videos = Array.isArray(parsed.videos) ? parsed.videos : []
  return videos
    .map((v) => ({
      titulo: String(v.titulo || '').trim() || 'Sem titulo',
      campanha: String(v.campanha || '').trim(),
      roteiro: String(v.roteiro || '').trim(),
    }))
    .slice(0, 50)
}

export default async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Metodo nao permitido' }, { status: 405 })
  try {
    const body = await req.json().catch(() => ({}))
    const { url, nome, copy } = body
    if (!url) return Response.json({ error: 'Falta a url do arquivo' }, { status: 400 })
    if (!process.env.GROQ_API_KEY) return Response.json({ error: 'GROQ_API_KEY nao configurada' }, { status: 500 })

    const r = await fetch(url)
    if (!r.ok) return Response.json({ error: 'Nao consegui baixar o arquivo' }, { status: 400 })
    const buf = Buffer.from(await r.arrayBuffer())

    const texto = (await extrairTexto(buf, nome)).trim()
    if (!texto) return Response.json({ videos: [], aviso: 'Nao consegui ler texto do arquivo' })

    const videos = await chamarGroq(texto, copy)
    return Response.json({ videos })
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 })
  }
}
