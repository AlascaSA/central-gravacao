// IA (Groq) que lê o doc de roteiros e destrincha em vários vídeos (cards).
const GROQ_MODEL = 'openai/gpt-oss-120b'

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
      // unpdf = pdfjs empacotado pra serverless (o pdf-parse/pdfjs normal falha no Netlify)
      const { extractText, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(buf))
      const { text } = await extractText(pdf, { mergePages: true })
      return text || ''
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

  const pedir = (limite) =>
    fetch('https://api.groq.com/openai/v1/chat/completions', {
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
          { role: 'user', content: String(texto).slice(0, limite) },
        ],
      }),
    })

  let resp = await pedir(28000)
  if (resp.status === 429) {
    // O gpt-oss-120b tem teto de 8 mil tokens/min no plano gratis (o llama antigo dava
    // 12 mil), entao documento grande passa raspando. Em vez de perder o upload inteiro,
    // espera o pouco que a Groq pedir e refaz a leitura com metade do texto.
    const espera = Math.min(Number(resp.headers.get('retry-after') || 2), 3)
    await new Promise((r) => setTimeout(r, espera * 1000))
    resp = await pedir(14000)
  }

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
